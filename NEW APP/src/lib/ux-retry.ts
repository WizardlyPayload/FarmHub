/** Central HTTP retry — modules must not add their own loops. */

export const UX_RETRY = {
  maxAttempts: 3,
  baseDelayMs: 400,
  maxDelayMs: 2500,
  jitterRatio: 0.25,
} as const;

export function classifyHttpStatus(status: number): string {
  const n = Number(status);
  if (n === 401 || n === 403) return "E_AUTH_MISSING";
  if (n === 404 || n >= 500) return "E_SERVER_OFFLINE";
  if (n === 0 || !Number.isFinite(n)) return "E_NETWORK";
  return "E_NETWORK";
}

export function shouldAutoRetry(code: string | null | undefined): boolean {
  return code === "E_SERVER_OFFLINE" || code === "E_NETWORK";
}

export function nextRetryDelayMs(attempt: number, random = Math.random): number {
  const n = Math.max(0, Number(attempt) || 0);
  const exp = Math.min(UX_RETRY.maxDelayMs, UX_RETRY.baseDelayMs * 2 ** n);
  const jitter = exp * UX_RETRY.jitterRatio * Number(random());
  return Math.round(exp + jitter);
}

export async function fetchWithRetry(
  run: () => Promise<Response>,
  options: { retry?: boolean } = {},
): Promise<Response> {
  const allow = options.retry !== false;
  let last: Response | null = null;
  let lastErr: unknown = null;
  const attempts = allow ? UX_RETRY.maxAttempts : 1;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await run();
      last = res;
      if (res.ok) return res;
      const code = classifyHttpStatus(res.status);
      if (!allow || !shouldAutoRetry(code) || i === attempts - 1) return res;
      await delay(nextRetryDelayMs(i));
    } catch (e) {
      lastErr = e;
      if (!allow || i === attempts - 1) throw e;
      await delay(nextRetryDelayMs(i));
    }
  }
  if (last) return last;
  throw lastErr instanceof Error ? lastErr : new Error("network");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
