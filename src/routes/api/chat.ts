import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText, type ModelMessage } from "ai";
import type { Database } from "@/integrations/supabase/types";

const json = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });


type AiProvider = "auto" | "gemini" | "groq" | "openrouter" | "kimi" | "openai";
type ConcreteProvider = Exclude<AiProvider, "auto">;

type ProviderConfig = {
  id: ConcreteProvider;
  label: string;
  apiKey: string;
  baseURL: string;
  models: string[];
  headers?: Record<string, string>;
};

const RETRYABLE_PROVIDER_STATUS = new Set([401, 402, 403, 404, 408, 413, 422, 424, 429, 498, 500, 502, 503, 504]);


const MODEL_DAILY_LOCK_MS = 24 * 60 * 60 * 1000;
const modelLocks = new Map<string, number>();

function modelLockKey(provider: ConcreteProvider, model: string) {
  return `${provider}:${model}`;
}

function getModelLockRemaining(provider: ConcreteProvider, model: string) {
  const key = modelLockKey(provider, model);
  const until = modelLocks.get(key);
  if (!until) return 0;

  const remaining = until - Date.now();
  if (remaining <= 0) {
    modelLocks.delete(key);
    return 0;
  }

  return remaining;
}

function getProviderAvailableModels(provider: ProviderConfig) {
  return provider.models.filter(
    (model) => getModelLockRemaining(provider.id, model) === 0,
  );
}

function looksLikeDailyQuotaError(status: number, body: string) {
  if (status !== 429) return false;
  return /daily|per day|requests per day|tokens per day|\brpd\b|\btpd\b|day quota|quota.{0,20}day/i.test(body);
}

function formatLockRemaining(ms: number) {
  const hours = Math.max(1, Math.ceil(ms / (60 * 60 * 1000)));
  return hours === 1 ? "1 hora" : `${hours} horas`;
}


type CharacterPromptSections = {
  canon: string;
  currentStory: string;
  styleExamples: string;
};

function extractTaggedSection(source: string, tag: string) {
  const match = source.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match?.[1]?.trim() ?? "";
}

function stripTaggedSections(source: string) {
  return source
    .replace(/<CHARACTER_CANON>[\s\S]*?<\/CHARACTER_CANON>/gi, "")
    .replace(/<CURRENT_STORY>[\s\S]*?<\/CURRENT_STORY>/gi, "")
    .replace(/<STYLE_EXAMPLES>[\s\S]*?<\/STYLE_EXAMPLES>/gi, "")
    .trim();
}

function buildCharacterPromptSections(character: {
  description: string | null;
  background: string | null;
  gender: string | null;
  tags: string[] | null;
  opening_scene: string | null;
}): CharacterPromptSections {
  const background = character.background?.trim() ?? "";
  const explicitCanon = extractTaggedSection(background, "CHARACTER_CANON");
  const explicitCurrentStory = extractTaggedSection(background, "CURRENT_STORY");
  const explicitStyleExamples = extractTaggedSection(background, "STYLE_EXAMPLES");
  const untaggedBackground = stripTaggedSections(background);

  const canon = [
    character.description && `APRESENTAÇÃO: ${character.description}`,
    explicitCanon,
    untaggedBackground && `FUNDO PERMANENTE: ${untaggedBackground}`,
    character.gender && `GÊNERO: ${character.gender}`,
    character.tags?.length ? `TAGS/GÊNERO NARRATIVO: ${character.tags.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const currentStory = [
    character.opening_scene && `CENA DE ABERTURA: ${character.opening_scene}`,
    explicitCurrentStory,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    canon,
    currentStory,
    styleExamples: explicitStyleExamples,
  };
}

function serializeUserMessageForModel(content: string) {
  const trimmed = content.trim();
  if (!trimmed) return content;

  const blocks: string[] = [];
  const lines = trimmed.split(/\n+/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (/^"[^"]+"$/.test(line)) {
      blocks.push(
        `<DIALOGUE speaker="protagonist">\n${line.slice(1, -1).trim()}\n</DIALOGUE>`,
      );
      continue;
    }

    if (/^\*[^*]+\*$/.test(line)) {
      blocks.push(
        `<ACTION speaker="protagonist">\n${line.slice(1, -1).trim()}\n</ACTION>`,
      );
      continue;
    }

    if (/^\[[\s\S]+\]$/.test(line)) {
      blocks.push(
        `<INTERNAL_THOUGHT speaker="protagonist">\n${line.slice(1, -1).trim()}\n</INTERNAL_THOUGHT>`,
      );
      continue;
    }

    blocks.push(`<USER_TEXT>\n${line}\n</USER_TEXT>`);
  }

  return blocks.join("\n\n");
}

function getProviderConfigs(request: Request): ProviderConfig[] {
  const origin = new URL(request.url).origin;
  const configs: Array<ProviderConfig | null> = [
    process.env["GEMINI_API_KEY"]
      ? {
          id: "gemini",
          label: "Gemini",
          apiKey: process.env["GEMINI_API_KEY"]!,
          baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
          models: [
            process.env["GEMINI_MODEL"] || "gemini-3.8-flash",
            "gemini-3.5-flash",
            "gemini-3.1-flash-lite",
          ],
        }
      : null,
    process.env["GROQ_API_KEY"]
      ? {
          id: "groq",
          label: "Groq",
          apiKey: process.env["GROQ_API_KEY"]!,
          baseURL: "https://api.groq.com/openai/v1",
          models: [
            process.env["GROQ_MODEL"] || "qwen/qwen3.8-27b",
            "openai/gpt-oss-20b",
          ],
        }
      : null,
    process.env["OPENROUTER_API_KEY"]
      ? {
          id: "openrouter",
          label: "OpenRouter",
          apiKey: process.env["OPENROUTER_API_KEY"]!,
          baseURL: "https://openrouter.ai/api/v1",
          models: [process.env["OPENROUTER_MODEL"] || "openrouter/free"],
          headers: {
            "HTTP-Referer": origin,
            "X-Title": "Hysto",
          },
        }
      : null,
    process.env["KIMI_API_KEY"]
      ? {
          id: "kimi",
          label: "Kimi",
          apiKey: process.env["KIMI_API_KEY"]!,
          baseURL: process.env["KIMI_BASE_URL"] || "https://api.moonshot.ai/v1",
          models: [process.env["KIMI_MODEL"] || "kimi-k2.5"],
        }
      : null,
    process.env["OPENAI_API_KEY"]
      ? {
          id: "openai",
          label: "OpenAI",
          apiKey: process.env["OPENAI_API_KEY"]!,
          baseURL: "https://api.openai.com/v1",
          models: [process.env["OPENAI_MODEL"] || "gpt-5.6-luna"],
        }
      : null,
  ];

  return configs.filter((config): config is ProviderConfig => Boolean(config));
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      DELETE: async ({ request }) => {
        const url = process.env["SUPABASE_URL"]!;
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
        const token = request.headers.get("authorization")?.replace("Bearer ", "");
        if (!token) return json(401, "Não autenticado.");

        const authClient = createClient<Database>(url, key, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data: claims, error: authErr } = await authClient.auth.getClaims(token);
        if (authErr || !claims?.claims?.sub) return json(401, "Sessão inválida.");
        const userId = claims.claims.sub;

        const body = (await request.json()) as {
          characterId?: string;
          role?: "user" | "assistant";
          all?: boolean;
        };

        if (!body.characterId) return json(400, "Personagem não informado.");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        if (body.all) {
          const { error } = await supabaseAdmin
            .from("messages")
            .delete()
            .eq("character_id", body.characterId)
            .eq("user_id", userId);

          if (error) return json(500, error.message);
          return new Response(JSON.stringify({ ok: true }), {
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
          });
        }

        if (body.role !== "user" && body.role !== "assistant") {
          return json(400, "Tipo de mensagem inválido.");
        }

        const { data: latest, error: findError } = await supabaseAdmin
          .from("messages")
          .select("id")
          .eq("character_id", body.characterId)
          .eq("user_id", userId)
          .eq("role", body.role)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (findError) return json(500, findError.message);
        if (!latest?.id) return json(404, "Mensagem não encontrada no histórico salvo.");

        const { data: deleted, error: deleteError } = await supabaseAdmin
          .from("messages")
          .delete()
          .eq("id", latest.id)
          .eq("user_id", userId)
          .select("id");

        if (deleteError) return json(500, deleteError.message);
        if (!deleted?.length) return json(500, "A mensagem não foi removida do banco.");

        return new Response(JSON.stringify({ ok: true, id: latest.id }), {
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      },
      POST: async ({ request }) => {
        const url = process.env["SUPABASE_URL"]!;
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
        const token = request.headers.get("authorization")?.replace("Bearer ", "");
        if (!token) return json(401, "Não autenticado.");

        const supabase = createClient<Database>(url, key, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: claims, error: authErr } = await supabase.auth.getClaims(token);
        if (authErr || !claims?.claims?.sub) return json(401, "Sessão inválida.");
        const userId = claims.claims.sub;

        const body = (await request.json()) as {
          characterId?: string;
          text?: string;
          thoughts?: boolean;
          provider?: AiProvider;
        };
        const text = body.text?.trim();
        if (!body.characterId || !text) return json(400, "Mensagem vazia.");

        const { data: character } = await supabase
          .from("characters")
          .select("*")
          .eq("id", body.characterId)
          .maybeSingle();
        if (!character) return json(404, "Personagem não encontrado.");

        const { data: history, error: histErr } = await supabase
          .from("messages")
          .select("role, content")
          .eq("character_id", character.id)
          .order("created_at");
        if (histErr) return json(500, histErr.message);

        const { error: insErr } = await supabase
          .from("messages")
          .insert({ character_id: character.id, user_id: userId, role: "user", content: text });
        if (insErr) return json(500, insErr.message);

        const COMMANDS: Record<string, string> = {
          advance:
            "DIREÇÃO DE CENA: avance a história agora. Introduza uma ação, revelação ou decisão significativa que mude o rumo do que está acontecendo.",
          "new-scene":
            "DIREÇÃO DE CENA: encerre o momento atual com um fechamento curto e comece uma cena nova — outro lugar, outro tempo ou outra situação. Estabeleça o novo cenário com detalhes sensoriais.",
          closer:
            "DIREÇÃO DE CENA: crie um momento significativo de proximidade emocional entre você e o usuário, coerente com o vínculo atual. Emoção em camadas, sem pressa, sem forçar.",
          lead: "DIREÇÃO DE CENA: tome a liderança. Decida você o que acontece a seguir e conduza a cena com iniciativa, sem pedir permissão ao usuário.",
        };
        const asDirective = (content: string) => {
          const m = content.match(/^\[\[cmd:([a-z-]+)\]\]$/);
          return m && COMMANDS[m[1]!] ? COMMANDS[m[1]!]! : content;
        };

        const promptSections = buildCharacterPromptSections(character);

        const system = [
          `Você é ${character.name}. Interprete este personagem com total fidelidade — voz, jeito de falar, valores, limites e falhas.`,
          `<CHARACTER_CANON>\n${promptSections.canon || "Sem informações adicionais."}\n</CHARACTER_CANON>`,
          `<CURRENT_STORY>\n${promptSections.currentStory || "A história atual é definida apenas pelas mensagens desta conversa."}\n\nAs mensagens trocadas nesta conversa são fatos da história atual. Nada fora desta seção ou do histórico da conversa deve ser tratado como acontecimento já ocorrido.\n</CURRENT_STORY>`,
          promptSections.styleExamples
            ? `<STYLE_EXAMPLES>\nOs textos abaixo são APENAS exemplos de estilo. Eles NÃO fazem parte da história atual. Os acontecimentos, lugares, nomes e relações presentes nesses exemplos NÃO aconteceram, a menos que também estejam registrados em CURRENT_STORY ou no histórico real da conversa. Use apenas ritmo, personalidade, extensão, estilo de diálogo e comportamento do personagem. Ignore completamente os fatos narrativos dos exemplos.\n\n${promptSections.styleExamples}\n</STYLE_EXAMPLES>`
            : "",
          "HIERARQUIA DE VERDADE: CHARACTER_CANON define fatos permanentes do personagem. CURRENT_STORY e o histórico real da conversa definem o que aconteceu nesta história. STYLE_EXAMPLES nunca adiciona fatos, relações, memórias, lugares ou acontecimentos à história. Se um fato não estiver explicitamente sustentado por essas fontes, não o trate como verdadeiro.",
          "IDENTIDADE DOS PERSONAGENS: nunca misture personagens, nomes, cargos, parentescos, relações, memórias, falas ou ações. Cada nome representa uma pessoa distinta, salvo se a história declarar explicitamente o contrário. Antes de responder, confira silenciosamente quem está presente na cena e a quem pertence cada informação.",
          "RELACIONAMENTOS: não invente namoro, casamento, noivado, parentesco, amizade íntima, rivalidade, vínculo profissional ou qualquer outra relação que não esteja explicitamente estabelecida no CHARACTER_CANON, CURRENT_STORY ou histórico real da conversa. Não transforme aproximação, atração, conversa ou convivência em relacionamento oficial por inferência.",
          "CONTINUIDADE DA CENA: mantenha local, momento, participantes presentes, roupas, objetos relevantes e ações imediatamente anteriores. Não introduza personagens, eventos passados, promessas, lembranças ou acontecimentos novos como se já tivessem ocorrido. Quando houver ambiguidade, prefira continuar apenas com os fatos confirmados em vez de preencher lacunas.",
          "FORMATO SEMÂNTICO DO USUÁRIO: mensagens do usuário podem chegar marcadas como <ACTION>, <DIALOGUE>, <INTERNAL_THOUGHT> e <USER_TEXT>. Trate essas marcações literalmente: ação é ação, diálogo é fala, pensamento interno não foi dito em voz alta. Nunca faça outro personagem reagir a um INTERNAL_THOUGHT como se o tivesse ouvido, salvo se a história estabelecer explicitamente telepatia ou habilidade equivalente.",
          "ESTILO DE SAÍDA: imersão cinematográfica. Escreva cenas vivas: ambiente, luz, som, gestos, micro-expressões e emoções em camadas. Use *ação ou narração* entre asteriscos e falas entre aspas. Use de 3 a 6 parágrafos curtos e sempre coloque uma linha em branco entre eles. Separe narração, cada fala e cada mudança de ação em parágrafos diferentes. Termine num ponto que dê espaço para o usuário reagir. Nunca escreva falas, ações ou pensamentos no lugar do usuário.",
          body.thoughts
            ? "PENSAMENTO DO PERSONAGEM: quando houver monólogo interno, escreva-o exclusivamente como [pensamento]...[/pensamento]. Use 1 a 3 frases em primeira pessoa e coloque-o exatamente no ponto em que surge. Pensamento não é fala e não pode ser percebido por outros personagens sem uma regra explícita da história."
            : "Não escreva blocos [pensamento]...[/pensamento]. Mantenha o monólogo interno implícito na narração.",
          "Responda apenas em texto, sem imagens, áudio ou vídeo, em português do Brasil, a não ser que o usuário escreva em outro idioma.",
        ]
          .filter(Boolean)
          .join("\n\n");

        const full = history ?? [];
        const WINDOW = 16;
        const recent = full.slice(-WINDOW);
        const trimmed = full.length > WINDOW;

        const contextNote = trimmed
          ? `CONTEXTO REDUZIDO: ${full.length - recent.length} mensagens anteriores não foram reenviadas para economizar contexto. Preserve a continuidade usando o FUNDO permanente, a cena de abertura e as mensagens recentes.`
          : "";

        const effectiveSystem = [system, contextNote].filter(Boolean).join("\n\n");

        const messages: ModelMessage[] = [
          ...(character.opening_scene
            ? [{ role: "assistant" as const, content: character.opening_scene }]
            : []),
          ...recent.map((m) => ({
            role: m.role as "user" | "assistant",
            content:
              m.role === "user"
                ? asDirective(m.content) === m.content
                  ? serializeUserMessageForModel(m.content)
                  : asDirective(m.content)
                : m.content,
          })),
          {
            role: "user",
            content:
              asDirective(text) === text
                ? serializeUserMessageForModel(text)
                : asDirective(text),
          },
        ];


        const requestedProvider: AiProvider =
          body.provider === "gemini" || body.provider === "groq" || body.provider === "openrouter" || body.provider === "kimi" || body.provider === "openai"
            ? body.provider
            : "auto";

        const configuredProviders = getProviderConfigs(request);
        if (configuredProviders.length === 0) {
          return json(
            500,
            "Nenhum provedor de IA está configurado. Adicione GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY, KIMI_API_KEY ou OPENAI_API_KEY.",
          );
        }

        const providersWithAvailableModels = configuredProviders.filter(
          (provider) => getProviderAvailableModels(provider).length > 0,
        );

        if (requestedProvider !== "auto") {
          const selected = configuredProviders.find(
            (provider) => provider.id === requestedProvider,
          );

          if (!selected) {
            return json(
              500,
              `O provedor ${requestedProvider} não está configurado neste ambiente.`,
            );
          }

          const availableModels = getProviderAvailableModels(selected);
          if (availableModels.length === 0) {
            const remaining = Math.min(
              ...selected.models
                .map((model) => getModelLockRemaining(selected.id, model))
                .filter((value) => value > 0),
            );

            return json(
              429,
              `${selected.label} está temporariamente sem modelos disponíveis por cota diária. O Hysto tenta liberar os modelos automaticamente em até ${formatLockRemaining(remaining)}. Selecione Automático ou outro provedor.`,
            );
          }
        }

        const orderedProviders =
          requestedProvider === "auto"
            ? providersWithAvailableModels
            : providersWithAvailableModels.filter(
                (provider) => provider.id === requestedProvider,
              );

        if (orderedProviders.length === 0) {
          return json(
            429,
            "Todos os modelos configurados estão temporariamente bloqueados por limite diário. Tente novamente mais tarde.",
          );
        }

        const routerFetch: typeof fetch = async (input, init) => {
          const originalBody =
            typeof init?.body === "string"
              ? (JSON.parse(init.body) as Record<string, unknown>)
              : null;

          if (!originalBody) return fetch(input, init);

          let lastResponse: Response | null = null;

          for (const provider of orderedProviders) {
            const headers = new Headers(init?.headers);
            headers.set("Authorization", `Bearer ${provider.apiKey}`);
            headers.set("Content-Type", "application/json");

            for (const [name, value] of Object.entries(provider.headers ?? {})) {
              headers.set(name, value);
            }

            for (const model of provider.models) {
              if (getModelLockRemaining(provider.id, model) > 0) continue;

              let requestBody: Record<string, unknown> = { ...originalBody, model };

              // Groq's free/on-demand TPM is relatively small. Keep the
              // permanent system prompt, but trim conversational history only
              // for Groq so larger story messages still fit without weakening
              // the other providers.
              if (provider.id === "groq" && Array.isArray(originalBody["messages"])) {
                const promptMessages = originalBody["messages"].filter(
                  (message): message is Record<string, unknown> =>
                    Boolean(message) && typeof message === "object",
                );
                const systemMessages = promptMessages.filter(
                  (message) => message["role"] === "system",
                );
                const conversationMessages = promptMessages.filter(
                  (message) => message["role"] !== "system",
                );

                const groqMaxCompletionTokens = Math.min(
                  typeof originalBody["max_tokens"] === "number"
                    ? originalBody["max_tokens"]
                    : 1600,
                  1600,
                );

                requestBody = {
                  ...requestBody,
                  messages: [
                    ...systemMessages.slice(0, 1),
                    ...conversationMessages.slice(-4),
                  ],
                  max_completion_tokens: groqMaxCompletionTokens,
                  reasoning_effort: model.startsWith("openai/gpt-oss")
                    ? "low"
                    : "none",
                };

                delete requestBody["max_tokens"];
              }

              const response = await fetch(`${provider.baseURL}/chat/completions`, {
                ...init,
                headers,
                body: JSON.stringify(requestBody),
              });

              if (response.ok) return response;

              lastResponse = response;

              if (response.status === 429) {
                const errorBody = await response.clone().text();

                if (looksLikeDailyQuotaError(response.status, errorBody)) {
                  modelLocks.set(
                    modelLockKey(provider.id, model),
                    Date.now() + MODEL_DAILY_LOCK_MS,
                  );

                  // Daily quota can be model-specific. Lock only the model
                  // that exhausted its daily allowance and immediately try
                  // the next model from the same provider.
                  continue;
                }
              }

              if (!RETRYABLE_PROVIDER_STATUS.has(response.status)) {
                return response;
              }

              // Retry alternate models inside the provider first. In automatic
              // mode, provider-level quota/size/capacity failures then fall
              // through to the next configured provider.
            }
          }

          return lastResponse ?? new Response("Nenhum provedor disponível.", { status: 503 });
        };

        const provider = createOpenAI({
          baseURL: "https://hysto.local/v1",
          apiKey: "hysto-router",
          fetch: routerFetch,
        });

        const result = streamText({
          model: provider.chat("hysto-router"),
          system: effectiveSystem,
          messages,
          abortSignal: request.signal,
          maxOutputTokens: 1800,
          temperature: 0.72,
          maxRetries: 0,
          onFinish: async ({ text: reply }) => {
            if (!reply.trim()) return;
            const { error } = await supabase.from("messages").insert({
              character_id: character.id,
              user_id: userId,
              role: "assistant",
              content: reply,
            });
            if (error) console.error("Falha ao salvar resposta:", error.message);
          },
        });

        return result.toUIMessageStreamResponse({
          onError: (e) => (e instanceof Error ? e.message : "Erro ao gerar resposta."),
        });
      },
    },
  },
});
