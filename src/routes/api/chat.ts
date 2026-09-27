import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText, type ModelMessage } from "ai";
import type { Database } from "@/integrations/supabase/types";
import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
  withLovableAiGatewayRunIdHeader,
} from "@/lib/ai/run-id.server";

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
        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return json(500, "Chave de IA não configurada.");

        const token = request.headers.get("authorization")?.replace("Bearer ", "");
        if (!token) return json(401, "Não autenticado.");

        const supabase = createClient<Database>(url, key, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: claims, error: authErr } = await supabase.auth.getClaims(token);
        if (authErr || !claims?.claims?.sub) return json(401, "Sessão inválida.");
        const userId = claims.claims.sub;

        const body = (await request.json()) as { characterId?: string; text?: string };
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

        const system = [
          `Você é ${character.name}${character.tagline ? `, ${character.tagline}` : ""}.`,
          character.personality && `Personalidade: ${character.personality}`,
          character.instructions && `Instruções: ${character.instructions}`,
          "Permaneça sempre no personagem. Responda apenas em texto, no idioma do usuário (padrão: português do Brasil). Seja natural e conciso, como numa conversa.",
        ]
          .filter(Boolean)
          .join("\n");

        const messages: ModelMessage[] = [
          ...(character.greeting
            ? [{ role: "assistant" as const, content: character.greeting }]
            : []),
          ...(history ?? []).map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
          { role: "user", content: text },
        ];

        const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
        const provider = createOpenAI({
          baseURL: "https://ai.gateway.lovable.dev/v1",
          apiKey,
          headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
          fetch: runIdFetch.fetch,
        });

        const result = streamText({
          model: provider.responses("openai/gpt-6-astra"),
          system,
          messages,
          abortSignal: request.signal,
          providerOptions: {
            openai: {
              forceReasoning: true,
              reasoningEffort: "low",
              reasoningSummary: "auto",
              store: false,
              include: ["reasoning.encrypted_content"],
            },
          },
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

        return withLovableAiGatewayRunIdHeader(
          result.toUIMessageStreamResponse({
            onError: (e) => (e instanceof Error ? e.message : "Erro ao gerar resposta."),
          }),
          runIdFetch,
        );
      },
    },
  },
});
