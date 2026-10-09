type MemoryStreamPart = { type: string; text?: string; error?: unknown; finishReason?: string };

export class MemoryOutputError extends Error {
  constructor(public readonly finishReason: string) {
    super(finishReason === "content-filter"
      ? "O serviço de IA recusou a atualização da memória. A memória anterior e suas mensagens foram preservadas."
      : finishReason === "length"
        ? "O serviço de IA encerrou a atualização antes de entregar o registro. A memória anterior foi preservada."
        : "O serviço de IA terminou sem entregar o registro da história. A memória anterior foi preservada.");
    this.name = "MemoryOutputError";
  }
}

// Reasoning is not a continuity record. Never retry an empty/refused success.
export async function collectMemoryOutput(stream: AsyncIterable<MemoryStreamPart>) {
  let record = "";
  let finishReason = "unknown";
  for await (const part of stream) {
    if (part.type === "error") throw part.error;
    if (part.type === "text-delta") record += part.text ?? "";
    if (part.type === "finish") finishReason = part.finishReason ?? "unknown";
  }
  if (finishReason === "content-filter" || finishReason === "length" || !record.trim()) {
    throw new MemoryOutputError(finishReason);
  }
  return record.trim();
}

export function prepareProviderRequest(body: Record<string, unknown>, provider: string, model: string) {
  const prepared: Record<string, unknown> = { ...body, model };
  if (provider === "groq") {
    prepared["reasoning_effort"] = model.startsWith("openai/gpt-oss") ? "low" : "none";
  }
  return prepared;
}