import { describe, expect, it } from "vitest";
import { collectMemoryOutput, MemoryOutputError, prepareProviderRequest } from "./memory-output";

async function* parts(items: Array<{ type: string; text?: string; error?: unknown; finishReason?: string }>) {
  yield* items;
}

describe("memory output safety", () => {
  it("collects text after reasoning and metadata without treating thoughts as memory", async () => {
    expect(await collectMemoryOutput(parts([
      { type: "start" }, { type: "reasoning-delta", text: "private reasoning" },
      { type: "text-delta", text: "Elara é " }, { type: "text-delta", text: "irmã de Kaelen." },
      { type: "finish", finishReason: "stop" },
    ]))).toBe("Elara é irmã de Kaelen.");
  });

  it("does not accept or retry an empty refusal", async () => {
    await expect(collectMemoryOutput(parts([{ type: "finish", finishReason: "content-filter" }]))).rejects.toMatchObject({ finishReason: "content-filter" });
  });

  it("does not overwrite memory with a truncated record", async () => {
    await expect(collectMemoryOutput(parts([{ type: "text-delta", text: "incomplete" }, { type: "finish", finishReason: "length" }]))).rejects.toBeInstanceOf(MemoryOutputError);
  });

  it("reports reasoning-only output instead of silently saving an empty record", async () => {
    await expect(collectMemoryOutput(parts([{ type: "reasoning-delta", text: "thought" }, { type: "finish", finishReason: "stop" }]))).rejects.toMatchObject({ finishReason: "stop" });
  });

  it("prepares Groq reasoning identically for memory and replies without adding output caps", () => {
    expect(prepareProviderRequest({ stream: true }, "groq", "openai/gpt-oss-20b")).toEqual({ stream: true, model: "openai/gpt-oss-20b", reasoning_effort: "low" });
    expect(prepareProviderRequest({ stream: true }, "groq", "qwen/qwen3.8-27b")).toEqual({ stream: true, model: "qwen/qwen3.8-27b", reasoning_effort: "none" });
    expect(prepareProviderRequest({ stream: true }, "gemini", "existing-model")).toEqual({ stream: true, model: "existing-model" });
  });
});