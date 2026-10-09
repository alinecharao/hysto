import { describe, expect, it } from "vitest";
import { historyBeforeUserTurn, messageIdentityMatches } from "./chat-history";

describe("safe retries", () => {
  const history = ["older", "retry", "answer"].map((id) => ({ id, role: id === "answer" ? "assistant" : "user", content: "Repeated text", created_at: id }));
  it("excludes a persisted retried turn from the prompt without deleting it", () => {
    expect(historyBeforeUserTurn(history, "retry").map((m) => m.id)).toEqual(["older"]);
    expect(history.map((m) => m.id)).toEqual(["older", "retry", "answer"]);
  });
  it("keeps all existing messages for a new turn", () => {
    expect(historyBeforeUserTurn(history, "new")).toHaveLength(3);
  });
  it("rejects reused identities with another owner, story, role or text", () => {
    const row = { user_id: "aline", character_id: "alden", role: "user", content: "Hello" };
    expect(messageIdentityMatches(row, "aline", "alden", "Hello")).toBe(true);
    for (const change of [{ user_id: "other" }, { character_id: "other" }, { role: "assistant" }, { content: "Different" }]) {
      expect(messageIdentityMatches({ ...row, ...change }, "aline", "alden", "Hello")).toBe(false);
    }
  });
});