import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Character = Database["public"]["Tables"]["characters"]["Row"];

export const SCENE_COMMANDS = [
  { id: "advance", label: "Avançar a história", icon: "🎬" },
  { id: "new-scene", label: "Mover para uma nova cena", icon: "🚪" },
  { id: "closer", label: "Aproximação", icon: "💫" },
  { id: "lead", label: "Tome a liderança", icon: "👑" },
] as const;

export type SceneCommandId = (typeof SCENE_COMMANDS)[number]["id"];

export const commandMarker = (id: SceneCommandId) => `[[cmd:${id}]]`;

export function parseCommand(text: string) {
  const m = text.match(/^\[\[cmd:([a-z-]+)\]\]$/);
  if (!m) return null;
  return SCENE_COMMANDS.find((c) => c.id === m[1]) ?? null;
}

export type NarrativeSegment = { type: "body" | "thought"; text: string };

export function parseNarrativeSegments(text: string): NarrativeSegment[] {
  const normalized = text.replace(
    /\[pensamento\]([\s\S]*?)(?:\[\/pensamento\]|$)/gi,
    "<thought>$1</thought>",
  );

  const segments: NarrativeSegment[] = [];
  const thoughtPattern = /<thought>([\s\S]*?)(?:<\/thought>|$)/g;
  let cursor = 0;

  for (const match of normalized.matchAll(thoughtPattern)) {
    const start = match.index ?? 0;
    const body = normalized.slice(cursor, start).trim();
    const thought = (match[1] ?? "").trim();
    if (body) segments.push({ type: "body", text: body });
    if (thought) segments.push({ type: "thought", text: thought });
    cursor = start + match[0].length;
  }

  const remaining = normalized.slice(cursor).trim();
  if (remaining) segments.push({ type: "body", text: remaining });
  return segments.length ? segments : [{ type: "body", text }];
}

export const charactersQuery = queryOptions({
  queryKey: ["characters"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("characters")
      .select("*")
      .order("user_id", { nullsFirst: false })
      .order("created_at");
    if (error) throw error;
    return data;
  },
});

export const characterQuery = (id: string) =>
  queryOptions({
    queryKey: ["character", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("characters").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

export const messagesQuery = (characterId: string) =>
  queryOptions({
    queryKey: ["messages", characterId],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sessão não encontrada.");

      const response = await fetch(
        `/api/chat?characterId=${encodeURIComponent(characterId)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        },
      );

      const payload = (await response.json()) as {
        messages?: { id: string; role: string; content: string }[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Não foi possível carregar a conversa.");
      }

      return payload.messages ?? [];
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  });
