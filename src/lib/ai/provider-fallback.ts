/** One bounded recovery layer shared by memory extraction and chat generation. */
export async function waitForProviderFallback(
  response: Response,
  attempt: number,
  signal?: AbortSignal,
): Promise<boolean> {
  if (attempt >= 3 || (response.status !== 429 && response.status < 500) || response.status > 599) return false;
  const retryAfter = response.headers.get("Retry-After");
  const seconds = retryAfter === null ? NaN : Number(retryAfter);
  const date = retryAfter === null ? NaN : Date.parse(retryAfter);
  const requestedDelay = Number.isFinite(seconds)
    ? Math.max(0, seconds * 1000)
    : Number.isFinite(date) ? Math.max(0, date - Date.now()) : NaN;
  const delay = Number.isFinite(requestedDelay)
    ? Math.max(1000, requestedDelay)
    : 1000 * 2 ** attempt + Math.floor(Math.random() * 500);
  // Long quota windows must be surfaced, not retried before the service permits it.
  if (delay > 30000) return false;
  signal?.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error("Request aborted"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delay);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
  return true;
}