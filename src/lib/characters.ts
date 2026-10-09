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
  const segments: NarrativeSegment[] = [];
  const thoughtPattern = /<thought>([\s\S]*?)(?:<\/thought>|$)/g;
  let cursor = 0;

  for (const match of text.matchAll(thoughtPattern)) {
    const start = match.index ?? 0;
    const body = text.slice(cursor, start).trim();
    const thought = (match[1] ?? "").trim();
    if (body) segments.push({ type: "body", text: body });
    if (thought) segments.push({ type: "thought", text: thought });
    cursor = start + match[0].length;
  }

  const remaining = text.slice(cursor).trim();
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
      const pageSize = 1000;
      const messages: Array<{
        id: string;
        role: string;
        content: string;
        created_at: string;
      }> = [];

      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("messages")
          .select("id, role, content, created_at")
          .eq("character_id", characterId)
          .order("created_at")
          .order("id")
          .range(from, from + pageSize - 1);
        if (error) throw error;

        messages.push(...(data ?? []));
        if (!data || data.length < pageSize) break;
      }

      return messages;
    },
    staleTime: 0,
  });
