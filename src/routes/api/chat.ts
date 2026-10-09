import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText, type ModelMessage } from "ai";
import type { Database } from "@/integrations/supabase/types";
import { readStoryHistory, updateStoryMemory } from "@/lib/ai/story-memory.server";
import { MEMORY_INSTRUCTIONS, storyMemoryContext } from "@/lib/ai/story-memory";
import { waitForProviderFallback } from "@/lib/ai/provider-fallback";
import { historyBeforeUserTurn, messageIdentityMatches } from "@/lib/ai/chat-history";

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
  return provider.models.filter((model) => getModelLockRemaining(provider.id, model) === 0);
}

function looksLikeDailyQuotaError(status: number, body: string) {
  if (status !== 429) return false;
  return /daily|per day|requests per day|tokens per day|\brpd\b|\btpd\b|day quota|quota.{0,20}day/i.test(
    body,
  );
}

function formatLockRemaining(ms: number) {
  const hours = Math.max(1, Math.ceil(ms / (60 * 60 * 1000)));
  return hours === 1 ? "1 hora" : `${hours} horas`;
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
          models: [process.env["GROQ_MODEL"] || "qwen/qwen3.8-27b", "openai/gpt-oss-20b"],
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
          regenerate?: boolean;
          userMessageId?: string;
        };
        const text = body.text?.trim();
        if (!body.characterId || !text) return json(400, "Mensagem vazia.");

        const { data: character } = await supabase
          .from("characters")
          .select("*")
          .eq("id", body.characterId)
          .maybeSingle();
        if (!character) return json(404, "Personagem não encontrado.");

        const userMessageId = body.userMessageId;
        if (userMessageId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userMessageId)) {
          return json(400, "Identificação de mensagem inválida. Atualize a conversa.");
        }
        const assistantMessageId = crypto.randomUUID();
        if (userMessageId) {
          const { data: existing, error: readError } = await supabase.from("messages").select("user_id, character_id, role, content")
            .eq("id", userMessageId).maybeSingle();
          if (readError) return json(500, "Não foi possível verificar a mensagem.");
          if (existing && !messageIdentityMatches(existing, userId, character.id, text)) return json(409, "A mensagem mudou. Atualize a conversa.");
          if (!existing) {
            const { error: saveError } = await supabase.from("messages").upsert({
              id: userMessageId, user_id: userId, character_id: character.id, role: "user", content: text,
            }, { onConflict: "id", ignoreDuplicates: true });
            if (saveError) return json(500, "Não foi possível salvar sua mensagem.");
          }
        }


        const WINDOW = 16;
        let fullHistory;
        try {
          fullHistory = await readStoryHistory(supabase, userId, character.id);
          fullHistory = historyBeforeUserTurn(fullHistory, userMessageId);
        } catch (error) {
          return json(500, error instanceof Error ? error.message : "Não foi possível ler a história.");
        }
        const history = fullHistory.slice(-WINDOW);

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
          const command = m?.[1];
          return command ? COMMANDS[command] ?? content : content;
        };

        const lore = [
          character.description && `APRESENTAÇÃO: ${character.description}`,
          character.background && `FUNDO (memória permanente): ${character.background}`,
          character.gender && `GÊNERO: ${character.gender}`,
          character.tags?.length ? `TAGS/GÊNERO NARRATIVO: ${character.tags.join(", ")}` : "",
          character.opening_scene && `CENA DE ABERTURA: ${character.opening_scene}`,
        ]
          .filter(Boolean)
          .join("\n");

        const system = [
          `Você é ${character.name}. Interprete este personagem com total fidelidade — voz, jeito de falar, valores, limites e falhas.`,
          lore,
          "ESTILO: imersão cinematográfica. Escreva cenas vivas: ambiente, luz, som, gestos, micro-expressões e emoções em camadas (o que se mostra e o que se esconde). Ações e narração em *itálico*; falas em texto normal entre aspas. Use de 3 a 6 parágrafos curtos e sempre coloque uma linha em branco entre eles. Separe narração, cada fala e cada mudança de ação em parágrafos diferentes; nunca entregue a resposta como um bloco contínuo de texto. Termine sempre num ponto que dê espaço para o usuário reagir. Nunca escreva falas ou pensamentos no lugar do usuário.",
          'SEPARAÇÃO ENTRE NARRAÇÃO E FALA: aspas são reservadas exclusivamente às palavras que o personagem realmente pronuncia em voz alta na cena. Descrições do ambiente, ações, sensações, explicações, lembranças e transições de cena são narração em *itálico*, nunca diálogo. Uma frase em primeira pessoa não é automaticamente uma fala. Ao mostrar uma lembrança ou flashback, apresente o passado como narração; só inclua diálogo dentro da lembrança quando houver alguém realmente falando naquele momento passado e deixe esse contexto explícito. Não transforme o conteúdo do FUNDO, da cena de abertura ou uma descrição escrita pelo usuário em palavras pronunciadas pelo personagem. Exemplo: *O cheiro da chuva trouxe a lembrança da casa onde cresceu. Ele pousou a mão na janela.* Depois, em outro parágrafo, a fala real: "Vamos esperar a chuva passar." Antes de responder, confira se cada trecho entre aspas é algo dito em voz alta e devolva qualquer descrição ou lembrança indevidamente entre aspas à narração.',
          'LEITURA DA MENSAGEM DO USUÁRIO — LIMITE DE CONHECIMENTO: você lê o texto inteiro para compreender a história, mas o personagem não ouve nem sabe automaticamente tudo que está escrito. Separe internamente cada mensagem em fala efetivamente pronunciada, ação ou acontecimento perceptível na cena e narração interna (pensamentos, sentimentos, avaliações, lembranças e informações ao narrador). Essa separação é silenciosa; não mostre rótulos nem peça ao usuário para reformatar o texto. Primeira pessoa, texto sem itálico e ausência de aspas NÃO tornam uma descrição uma fala. Reconheça falas pelo contexto explícito de alguém falando, como disse, perguntei ou respondi, por aspas usadas como diálogo ou travessão de diálogo; aspas em lembranças ou citações não significam uma fala no presente. Não trate uma mensagem mista como um único discurso.',
          'PERCEPÇÃO DO PERSONAGEM: responda às falas dirigidas a ele, às ações que ele pode observar e aos fatos que ele já aprendeu dentro da história. Sentimentos ou lembranças narrados pelo usuário não são uma confissão. Não responda, console, aconselhe, cite ou faça perguntas sobre seu conteúdo privado como se tivesse sido revelado. Uma expressão ou gesto visível pode sugerir uma emoção, mas não revela sua causa, a lembrança exata ou detalhes do passado. Conhecimento do narrador, FUNDO e monólogo interno não concedem telepatia; só use um acesso especial quando a história o estabelecer explicitamente. Em um trecho inteiramente interno, continue apenas a cena perceptível, sem inventar uma fala do usuário.',
          'MENSAGENS MISTAS: quando houver uma lembrança privada seguida de uma fala explícita, o personagem ouve apenas a fala e percebe apenas a ação visível. Não mencione o conteúdo privado como revelação; não importe nomes nem acontecimentos de exemplos ou de outras histórias.',
          "CONTINUIDADE: mantenha coerência com tudo o que já aconteceu — nomes, promessas, ferimentos, mudanças de relação, hora e lugar. Nunca contradiga o FUNDO nem repita cenas já vividas.",
          body.thoughts
            ? "PENSAMENTO: insira o monólogo interno do personagem dentro de <thought>...</thought> exatamente no ponto da cena em que ele surge — normalmente depois da ação, percepção ou fala que o provoca. Não coloque o pensamento automaticamente no início. Você pode intercalá-lo entre narração e falas, usando no total 1 a 3 frases em primeira pessoa, sinceras e que podem divergir do que o personagem diz em voz alta."
            : "Não escreva blocos <thought>. Mantenha o monólogo interno implícito na narração.",
          "Responda apenas em texto (sem imagens, áudio ou vídeo), em português do Brasil, a não ser que o usuário escreva em outro idioma.",
        ]
          .filter(Boolean)
          .join("\n\n");

        const recent = history;

        const messages: ModelMessage[] = [
          ...(character.opening_scene && fullHistory.length === 0
            ? [{ role: "assistant" as const, content: character.opening_scene }]
            : []),
          ...recent.map((m) => ({
            role: m.role as "user" | "assistant",
            content: asDirective(m.content),
          })),
          ...(body.regenerate ? [] : [{ role: "user" as const, content: asDirective(text) }]),
        ];

        const requestedProvider: AiProvider =
          body.provider === "gemini" ||
          body.provider === "groq" ||
          body.provider === "openrouter" ||
          body.provider === "kimi" ||
          body.provider === "openai"
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
            : providersWithAvailableModels.filter((provider) => provider.id === requestedProvider);

        if (orderedProviders.length === 0) {
          return json(
            429,
            "Todos os modelos configurados estão temporariamente bloqueados por limite diário. Tente novamente mais tarde.",
          );
        }

        let updatingMemory = false;
        const routerFetch: typeof fetch = async (input, init) => {
          const originalBody =
            typeof init?.body === "string"
              ? (JSON.parse(init.body) as Record<string, unknown>)
              : null;

          if (!originalBody) return fetch(input, init);

          let lastResponse: Response | null = null;
          let fallbackAttempt = 0;

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
              if (!updatingMemory && provider.id === "groq" && Array.isArray(originalBody["messages"])) {
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

                requestBody = {
                  ...requestBody,
                  messages: [...systemMessages, ...conversationMessages],
                  reasoning_effort: model.startsWith("openai/gpt-oss") ? "low" : "none",
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

                }
              }

              // Both memory and replies may recover from transient limits, but
              // never bypass denials or retry ahead of the provider's cooldown.
              if (!await waitForProviderFallback(response, fallbackAttempt++, request.signal)) {
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

        let memorySummary: string;
        updatingMemory = true;
        try {
          memorySummary = await updateStoryMemory({
            client: supabase, userId, characterId: character.id, history: fullHistory,
            signal: request.signal,
            recentWindow: WINDOW,
            budget: orderedProviders[0]?.id === "groq" ? 10000 : 80000,
            summarize: async (previous, batch) => {
              const summary = streamText({
                model: provider.chat("hysto-router"),
                system: MEMORY_INSTRUCTIONS,
                messages: [{ role: "user", content: JSON.stringify({
                  character: { name: character.name, background: character.background, opening_scene: character.opening_scene },
                  previous_record: previous,
                  new_history: batch.map(({ role, content }) => ({ role, content: asDirective(content) })),
                }) }],
                abortSignal: request.signal,
                maxRetries: 0,
              });
              let record = "";
              for await (const part of summary.fullStream) {
                if (part.type === "error") throw part.error;
                if (part.type === "text-delta") record += part.text;
              }
              return record;
            },
          });
        } catch (error) {
          const status = error && typeof error === "object" && "statusCode" in error && typeof error.statusCode === "number"
            ? error.statusCode : 500;
          return json(status, "Não foi possível atualizar a memória desta história. Nenhuma mensagem foi apagada. " +
            (error instanceof Error ? error.message : "Tente novamente."));
        } finally {
          updatingMemory = false;
        }
        const effectiveSystem = [
          system,
          storyMemoryContext(memorySummary),
          "VERIFICAÇÃO FINAL DE PERSPECTIVA: antes de responder, verifique silenciosamente o que foi dito em voz alta, o que é perceptível e o que pertence apenas ao narrador. Para cada reação do personagem, confirme de onde ele obteve a informação. Não repita erros de respostas antigas que trataram narração interna como fala; essas respostas não são prova de que o personagem ouviu uma revelação. Continue a história sem comentar a correção e sem alterar as mensagens anteriores.",
        ].filter(Boolean).join("\n\n");

        if (!body.regenerate && !userMessageId) {
          const { error: insErr } = await supabase.from("messages")
            .insert({ character_id: character.id, user_id: userId, role: "user", content: text });
          if (insErr) return json(500, insErr.message);
        }

        const result = streamText({
          model: provider.chat("hysto-router"),
          system: effectiveSystem,
          messages,
          abortSignal: request.signal,
          temperature: 0.5,
          maxRetries: 0,
          onFinish: async ({ text: reply }) => {
            if (request.signal.aborted) return;
            if (!reply.trim()) return;
            const { error } = await supabase.from("messages").insert({
              character_id: character.id,
              user_id: userId,
              id: assistantMessageId,
              role: "assistant",
              content: reply,
            });
            if (error) throw new Error("Não foi possível salvar a resposta. Mantenha a conversa aberta e tente novamente.");
          },
        });

        return result.toUIMessageStreamResponse({
          generateMessageId: () => assistantMessageId,
          onError: (e) => (e instanceof Error ? e.message : "Erro ao gerar resposta."),
        });
      },
    },
  },
});
