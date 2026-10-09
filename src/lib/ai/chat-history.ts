import type { MemoryMessage } from "./story-memory";

export function historyBeforeUserTurn(history: MemoryMessage[], userMessageId?: string) {
  const index = history.findIndex((message) => message.id === userMessageId);
  return index < 0 ? history : history.slice(0, index);
}

export function messageIdentityMatches(
  row: { user_id: string; character_id: string; role: string; content: string },
  userId: string, characterId: string, text: string,
) {
  return row.user_id === userId && row.character_id === characterId && row.role === "user" && row.content === text;
}