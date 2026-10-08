import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { memoryPrefixIsValid, memoryTarget, nextMemoryBatch, type MemoryMessage } from "./story-memory";
import { readStoryHistory, updateStoryMemory } from "./story-memory.server";

function message(index: number): MemoryMessage {
  return { id: String(index), role: index % 2 ? "assistant" : "user", content: `Alden encontrou Elara no evento ${index}.`, created_at: String(index) };
}

function fakeDatabase(history: MemoryMessage[]) {
  let memory = { summary: "", source_ids: [] as string[], revision: 0 };
  const writes: string[] = [];
  const filters: Array<[string, unknown]> = [];
  let race = false;
  const client = { from(table: string) {
    let update: typeof memory | undefined;
    const query = {
      select() { return query; },
      eq(key: string, value: unknown) { filters.push([key, value]); return query; },
      order() { return query; },
      async range(start: number, end: number) { return { data: history.slice(start, end + 1), error: null }; },
      async upsert() { writes.push(table); return { error: null }; },
      update(value: typeof memory) { update = value; writes.push(table); return query; },
      async single() { return { data: { ...memory }, error: null }; },
      async maybeSingle() {
        if (race) return { data: null, error: null };
        if (update) memory = update;
        return { data: { ...memory }, error: null };
      },
    };
    return query;
  } } as unknown as SupabaseClient<Database>;
  return { client, writes, filters, getMemory: () => memory, setRace: () => { race = true; } };
}

describe("automatic story continuity", () => {
  it("keeps recent turns verbatim and covers all earlier facts", () => {
    const history = Array.from({ length: 20 }, (_, i) => message(i));
    expect(memoryTarget(history).map((m) => m.id)).toEqual(history.slice(0, 16).map((m) => m.id));
    expect(history.slice(memoryTarget(history).length).map((m) => m.id)).toEqual(["16", "17", "18", "19"]);
  });

  it("loads beyond 1000 messages and explicitly scopes reads to user and character", async () => {
    const db = fakeDatabase(Array.from({ length: 1004 }, (_, i) => message(i)));
    const history = await readStoryHistory(db.client, "aline", "alden");
    expect(history).toHaveLength(1004);
    expect(history[1003]?.id).toBe("1003");
    expect(db.filters).toContainEqual(["user_id", "aline"]);
    expect(db.filters).toContainEqual(["character_id", "alden"]);
  });

  it("automatically updates memory without writing messages or character background", async () => {
    const history = Array.from({ length: 6 }, (_, i) => message(i));
    const db = fakeDatabase(history);
    const summarize = async (previous: string, batch: MemoryMessage[]) => [previous, ...batch.map((m) => m.content)].filter(Boolean).join("\n");
    const first = await updateStoryMemory({ client: db.client, userId: "aline", characterId: "alden", history, summarize });
    expect(first).toContain("Alden encontrou Elara no evento 0.");
    const second = await updateStoryMemory({ client: db.client, userId: "aline", characterId: "alden", history: [...history, message(6), message(7)], summarize });
    expect(second).toContain("Alden encontrou Elara no evento 0.");
    expect(second).toContain("Alden encontrou Elara no evento 3.");
    expect(db.getMemory().source_ids).toEqual(["0", "1", "2", "3"]);
    expect(db.writes.every((table) => table === "story_memories")).toBe(true);
  });

  it("does not re-summarize facts already saved", async () => {
    const history = Array.from({ length: 6 }, (_, i) => message(i));
    const db = fakeDatabase(history);
    let calls = 0;
    const summarize = async () => { calls++; return "Elara é irmã de Kaelen."; };
    await updateStoryMemory({ client: db.client, userId: "aline", characterId: "alden", history, summarize });
    await updateStoryMemory({ client: db.client, userId: "aline", characterId: "alden", history, summarize });
    expect(calls).toBe(1);
  });

  it("rejects a derived memory when a manually deleted source no longer exists", () => {
    const memory = { summary: "Alden encontrou Elara", source_ids: ["0", "1"], revision: 1 };
    expect(memoryPrefixIsValid(memory, [message(0), message(1)])).toBe(true);
    expect(memoryPrefixIsValid(memory, [message(1)])).toBe(false);
  });

  it("does not overwrite memory invalidated during an AI request", async () => {
    const db = fakeDatabase([]);
    db.setRace();
    await expect(updateStoryMemory({ client: db.client, userId: "aline", characterId: "alden", history: Array.from({ length: 6 }, (_, i) => message(i)), summarize: async () => "Memória antiga" })).rejects.toThrow("A história mudou");
    expect(db.getMemory().summary).toBe("");
  });

  it("chunks long histories without dropping or truncating a message", () => {
    const history = [message(0), message(1), message(2)];
    const batch = nextMemoryBatch(history, history[0]?.content.length ?? 0);
    expect(batch).toEqual([message(0)]);
    expect(nextMemoryBatch(history.slice(batch.length), 10000)).toEqual([message(1), message(2)]);
  });
});