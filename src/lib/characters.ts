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

export function splitThought(text: string) {
  const open = text.indexOf("<thought>");
  if (open === -1) return { thought: "", body: text };
  const close = text.indexOf("</thought>");
  const thought = (close === -1 ? text.slice(open + 9) : text.slice(open + 9, close)).trim();
  const body = (close === -1 ? "" : text.slice(0, open) + text.slice(close + 10)).trim();
  return { thought, body };
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
      const { data, error } = await supabase
        .from("messages")
        .select("id, role, content")
        .eq("character_id", characterId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
    staleTime: 0,
  });
