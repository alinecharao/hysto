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

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = process.env["SUPABASE_URL"]!;
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
        const apiKey = process.env["GEMINI_API_KEY"];
        if (!apiKey) return json(500, "Chave do Gemini não configurada.");

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
          "CONTINUIDADE: mantenha coerência com tudo o que já aconteceu — nomes, promessas, ferimentos, mudanças de relação, hora e lugar. Nunca contradiga o FUNDO nem repita cenas já vividas.",
          body.thoughts
            ? "PENSAMENTO: insira o monólogo interno do personagem dentro de <thought>...</thought> exatamente no ponto da cena em que ele surge — normalmente depois da ação, percepção ou fala que o provoca. Não coloque o pensamento automaticamente no início. Você pode intercalá-lo entre narração e falas, usando no total 1 a 3 frases em primeira pessoa, sinceras e que podem divergir do que o personagem diz em voz alta."
            : "Não escreva blocos <thought>. Mantenha o monólogo interno implícito na narração.",
          "Responda apenas em texto (sem imagens, áudio ou vídeo), em português do Brasil, a não ser que o usuário escreva em outro idioma.",
        ]
          .filter(Boolean)
          .join("\n\n");

        const full = history ?? [];
        const WINDOW = 24;
        const recent = full.slice(-WINDOW);
        const trimmed = full.length > WINDOW;

        const messages: ModelMessage[] = [
          ...(character.opening_scene
            ? [{ role: "assistant" as const, content: character.opening_scene }]
            : []),
          ...(trimmed
            ? [
                {
                  role: "system" as const,
                  content: `(${full.length - recent.length} mensagens anteriores não foram reenviadas para economizar contexto. Preserve a continuidade usando o FUNDO permanente, a cena de abertura e as mensagens recentes.)`,
                },
              ]
            : []),
          ...recent.map((m) => ({
            role: m.role as "user" | "assistant",
            content: asDirective(m.content),
          })),
          { role: "user", content: asDirective(text) },
        ];


        const provider = createOpenAI({
          baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
          apiKey,
        });

        const result = streamText({
          model: provider.chat("gemini-3.6-flash"),
          system,
          messages,
          abortSignal: request.signal,
          maxOutputTokens: 1400,
          temperature: 0.9,
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
