import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { memoryPrefixIsValid, memoryTarget, nextMemoryBatch, type MemoryMessage, type MemorySnapshot } from "./story-memory";

type Client = SupabaseClient<Database>;

export async function readStoryHistory(client: Client, userId: string, characterId: string) {
  const history: MemoryMessage[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client.from("messages")
      .select("id, role, content, created_at")
      .eq("user_id", userId).eq("character_id", characterId)
      .order("created_at").order("id").range(offset, offset + 999);
    if (error) throw new Error("Não foi possível ler a história para atualizar sua memória.");
    history.push(...(data ?? []));
    if (!data || data.length < 1000) return history;
  }
}

export async function updateStoryMemory({ client, userId, characterId, history, summarize, budget = 80000 }: {
  client: Client; userId: string; characterId: string; history: MemoryMessage[]; budget?: number;
  summarize: (previous: string, batch: MemoryMessage[]) => Promise<string>;
}) {
  const { error: initError } = await client.from("story_memories").upsert(
    { user_id: userId, character_id: characterId },
    { onConflict: "user_id,character_id", ignoreDuplicates: true },
  );
  if (initError) throw new Error("Não foi possível iniciar a memória desta história.");
  const read = async () => {
    const { data, error } = await client.from("story_memories").select("summary, source_ids, revision")
      .eq("user_id", userId).eq("character_id", characterId).single();
    if (error || !data) throw new Error("Não foi possível ler a memória desta história.");
    return data;
  };
  let memory: MemorySnapshot = await read();
  // The delete trigger invalidates summaries; exact source IDs also detect races/stale history.
  if (!memoryPrefixIsValid(memory, history)) {
    throw new Error("A história mudou enquanto sua memória era organizada. Envie novamente.");
  }
  const target = memoryTarget(history);
  for (let step = 0; memory.source_ids.length < target.length && step < 4; step++) {
    const batch = nextMemoryBatch(target.slice(memory.source_ids.length), budget);
    const summary = (await summarize(memory.summary, batch)).trim();
    if (!summary) throw new Error("A IA não conseguiu atualizar a memória. Nenhuma mensagem foi apagada.");
    const sourceIds = [...memory.source_ids, ...batch.map((message) => message.id)];
    const { data, error } = await client.from("story_memories").update({
      summary, source_ids: sourceIds, revision: memory.revision + 1, updated_at: new Date().toISOString(),
    }).eq("user_id", userId).eq("character_id", characterId).eq("revision", memory.revision)
      .select("summary, source_ids, revision").maybeSingle();
    if (error) throw new Error("Não foi possível salvar a memória desta história.");
    if (!data) throw new Error("A história mudou durante a atualização da memória. Envie novamente.");
    memory = data;
  }
  if (memory.source_ids.length < target.length) {
    throw new Error("Parte da memória já foi organizada. Esta história é longa; envie novamente para concluir sem perder acontecimentos.");
  }
  const current = await read();
  if (current.revision !== memory.revision) throw new Error("A história mudou. Envie novamente para usar a memória atualizada.");
  return current.summary;
}