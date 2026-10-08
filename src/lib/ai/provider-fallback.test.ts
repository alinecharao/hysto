import { afterEach, describe, expect, it, vi } from "vitest";
import { waitForProviderFallback } from "./provider-fallback";

afterEach(() => vi.useRealTimers());

describe("memory and chat provider fallback", () => {
  it("allows another model after a 429 only after Retry-After expires", async () => {
    vi.useFakeTimers();
    let completed = false;
    const result = waitForProviderFallback(new Response(null, { status: 429, headers: { "Retry-After": "2" } }), 0)
      .then((value) => { completed = true; return value; });
    await vi.advanceTimersByTimeAsync(1999);
    expect(completed).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toBe(true);
  });

  it("never tries another model for denials, credits, invalid requests or missing models", async () => {
    for (const status of [400, 401, 402, 403, 404, 422]) {
      expect(await waitForProviderFallback(new Response(null, { status }), 0)).toBe(false);
    }
  });

  it("stops after three fallback attempts", async () => {
    expect(await waitForProviderFallback(new Response(null, { status: 429 }), 3)).toBe(false);
  });

  it("does not bypass a long quota window", async () => {
    expect(await waitForProviderFallback(new Response(null, { status: 429, headers: { "Retry-After": "3600" } }), 0)).toBe(false);
  });

  it("permits transient server failures with backoff", async () => {
    vi.useFakeTimers();
    const result = waitForProviderFallback(new Response(null, { status: 503 }), 0);
    await vi.advanceTimersByTimeAsync(1500);
    expect(await result).toBe(true);
  });
});