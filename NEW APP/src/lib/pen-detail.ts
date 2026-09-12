import type { PenDetailEnvelope } from "./livestock-types";

const LRU_MAX = 64;
const REQUEST_DEBOUNCE_SEC = 5;
export const STALE_AFTER_SEC = 60;

const lruCache = new Map<string, { value: PenDetailEnvelope; ts: number }>();
const requestDebounce = new Map<string, number>();

function lruGet(key: string): PenDetailEnvelope | null {
  if (!lruCache.has(key)) return null;
  const v = lruCache.get(key)!;
  lruCache.delete(key);
  lruCache.set(key, v);
  return v.value;
}

function lruSet(key: string, value: PenDetailEnvelope): void {
  if (lruCache.has(key)) lruCache.delete(key);
  lruCache.set(key, { value, ts: Date.now() });
  while (lruCache.size > LRU_MAX) {
    const firstKey = lruCache.keys().next().value;
    if (firstKey != null) lruCache.delete(firstKey);
  }
}

function withServerId(url: string, serverId: string | null): string {
  if (!serverId) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}serverId=${encodeURIComponent(serverId)}`;
}

export async function loadPenDetail(
  penId: string | number,
  opts: { serverId?: string | null; idScheme?: string; dirtyAt?: number } = {}
): Promise<PenDetailEnvelope | null> {
  const id = String(penId);
  const sid = opts.serverId || "";
  const cacheKey = `${sid}|${opts.idScheme || "?"}|${id}|${opts.dirtyAt || 0}`;
  const cached = lruGet(cacheKey);
  if (cached) return cached;

  let res: Response;
  try {
    res = await fetch(withServerId(`/api/livestock/${encodeURIComponent(id)}`, sid || null), {
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (!res.ok) {
    if (res.status === 404) return null;
    return null;
  }

  let body: PenDetailEnvelope | null = null;
  try {
    body = (await res.json()) as PenDetailEnvelope;
  } catch {
    return null;
  }
  if (!body?.detail) return null;

  const finalKey = `${sid}|${body.idScheme || opts.idScheme || "?"}|${id}|${body.dirtyAt || 0}`;
  lruSet(finalKey, body);
  return body;
}

export async function requestPenRefresh(
  penId: string | number,
  opts: { serverId?: string | null; token?: string | null } = {}
): Promise<boolean> {
  const id = String(penId);
  const nowSec = Date.now() / 1000;
  const last = requestDebounce.get(id) || 0;
  if (nowSec - last < REQUEST_DEBOUNCE_SEC) return false;
  requestDebounce.set(id, nowSec);

  const sid = opts.serverId || "";
  try {
    const res = await fetch(
      withServerId(`/api/livestock/${encodeURIComponent(id)}/request`, sid || null),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(opts.token ? { "X-FarmDash-Token": opts.token } : {}),
        },
        body: JSON.stringify({ id: Number(id) }),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

export function bustPenDetailCache(penId: string | number): void {
  const id = String(penId);
  for (const k of Array.from(lruCache.keys())) {
    if (k.includes(`|${id}|`)) lruCache.delete(k);
  }
}

export function isPenDetailStale(envelope: PenDetailEnvelope | null | undefined): boolean {
  const cachedAt = Number(envelope?.cachedAt) || 0;
  if (cachedAt <= 0) return false;
  return Date.now() / 1000 - cachedAt > STALE_AFTER_SEC;
}

export function formatUnixTime(unixSec: number | undefined | null): string {
  if (!unixSec) return "";
  try {
    return new Date(unixSec * 1000).toLocaleTimeString();
  } catch {
    return String(unixSec);
  }
}
