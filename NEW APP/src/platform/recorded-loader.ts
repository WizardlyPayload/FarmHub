/**
 * V5 recorded publication loader. Reads the committed publication under
 * /recorded on the app origin, keeps per-visitor pins in session storage and
 * blocks every live network capability while a recorded route is open.
 * Imports stay relative so Node tests can load this file directly.
 */

import { DEMO_IDS, demoWritesAreLocked, safeGenerationId } from "./demo-source.ts";
import type { DemoGeneration, DemoId } from "./demo-source.ts";
import {
  MAX_ASSET_BYTES,
  MAX_ADMISSION_BYTES,
  MAX_GENERATION_BYTES,
  MAX_MANIFEST_BYTES,
  parseAdmission,
  parseCommit,
  parseManifest,
  parsePointer,
  safeAssetName,
  validateCommittedTexts,
} from "./recorded-publication.ts";

export const RECORDED_PUBLIC_BASE = "/recorded";

export type RecordedLoadStatus = "ready" | "missing" | "invalid" | "empty" | "error";

export type RecordedTexts = { admission: string; commit: string; generation: string; manifest: string };

// JSON-string wrapping can double the bytes of valid JSON texts. Include all
// four bounded texts and framing, rather than budgeting only the generation.
export const MAX_RECORDED_CACHE_BYTES = 2 * (MAX_ADMISSION_BYTES + MAX_GENERATION_BYTES + MAX_MANIFEST_BYTES + 1024) + 2048;

export type RecordedLoad =
  | { status: "ready"; demoId: DemoId; generation: DemoGeneration; texts: RecordedTexts; source: "latest" | "pinned" | "offline" }
  | { status: Exclude<RecordedLoadStatus, "ready">; demoId: string | null };

export type RecordedBytes = {
  read(rel: string): Promise<string | null>;
  readBytes?(rel: string): Promise<Uint8Array | null>;
};

const TEXT_LIMITS: Record<string, number> = {
  pointers: 256,
  admissions: MAX_ADMISSION_BYTES,
  commits: 1024,
  manifests: MAX_MANIFEST_BYTES,
  generations: MAX_GENERATION_BYTES,
};

const visitorLocales = new Map<string, string>();

function isDemoId(value: string): value is DemoId {
  return (DEMO_IDS as readonly string[]).includes(value);
}

/** Only bounded publication stores and manifest-listed assets are readable. */
export function recordedRelLimit(rel: string): number | null {
  if (typeof rel !== "string") return null;
  const store = /^(pointers|admissions|commits|generations|manifests)\/([A-Za-z0-9][A-Za-z0-9_-]{0,63})\.json$/.exec(rel);
  if (store) {
    if ((store[1] === "pointers" || store[1] === "admissions") && !isDemoId(store[2])) return null;
    return TEXT_LIMITS[store[1]];
  }
  if (rel.startsWith("assets/") && safeAssetName(rel.slice(7))) return MAX_ASSET_BYTES;
  return null;
}

export function safeRecordedBase(base: string): boolean {
  return typeof base === "string" && /^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/.test(base);
}

function recordedUrl(root: string, rel: string): string {
  return `${root}/${rel.split("/").map((part) => encodeURIComponent(part)).join("/")}`;
}

async function boundedResponse(response: Response, limit: number, signal?: AbortSignal): Promise<Uint8Array | null> {
  const cancelBody = async () => { try { await response.body?.cancel(); } catch { /* already closed */ } };
  if (response.status === 404) { await cancelBody(); return null; }
  if (!response.ok) { await cancelBody(); throw new Error("recorded-read-failed"); }
  const declared = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(declared) && declared > limit) { await cancelBody(); throw new Error("recorded-too-large"); }
  if (signal?.aborted) { await cancelBody(); throw new Error("recorded-aborted"); }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener("abort", abort, { once: true });
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (signal?.aborted) throw new Error("recorded-aborted");
      if (done) break;
      if (value.byteLength > limit - total) throw new Error("recorded-too-large");
      total += value.byteLength;
      chunks.push(value);
    }
    const buffer = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
    return buffer;
  } catch (error) {
    try { await reader.cancel(); } catch { /* preserve the read failure */ }
    throw error;
  } finally {
    signal?.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}

/** Same-origin reader rooted at an app route such as /recorded. No hosts, schemes or traversal. */
export function createFetchRecordedBytes(base = RECORDED_PUBLIC_BASE, options?: { signal?: AbortSignal }): RecordedBytes {
  if (!safeRecordedBase(base)) throw new Error("unsafe-recorded-base");
  const root = base;
  const get = async (rel: string): Promise<Uint8Array | null> => {
    const limit = recordedRelLimit(rel);
    if (limit == null) return null;
    const response = await fetch(recordedUrl(root, rel), { cache: "no-store", credentials: "omit", signal: options?.signal });
    return boundedResponse(response, limit, options?.signal);
  };
  return {
    async read(rel) {
      const bytes = await get(rel);
      return bytes == null ? null : new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    },
    readBytes: get,
  };
}

export function recordedAssetUrl(name: string, base = RECORDED_PUBLIC_BASE): string | null {
  if (!safeRecordedBase(base) || !safeAssetName(name)) return null;
  return recordedUrl(base, `assets/${name}`);
}

async function sha256Hex(bytes: Uint8Array): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = new Uint8Array(await subtle.digest("SHA-256", copy.buffer));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

function classifyTexts(
  demoId: DemoId,
  id: string,
  texts: { admission: string | null; commit: string | null; generation: string | null; manifest: string | null },
): { status: "ready"; generation: DemoGeneration; manifest: NonNullable<ReturnType<typeof parseManifest>> } | { status: "missing" | "invalid" | "empty" } {
  if (texts.admission == null || texts.commit == null || texts.generation == null || texts.manifest == null) return { status: "missing" };
  if (!withinTextLimit(texts.admission, TEXT_LIMITS.admissions)
    || !withinTextLimit(texts.commit, TEXT_LIMITS.commits)
    || !withinTextLimit(texts.generation, TEXT_LIMITS.generations)
    || !withinTextLimit(texts.manifest, TEXT_LIMITS.manifests)) return { status: "invalid" };
  const checked = validateCommittedTexts(texts.admission, demoId, id, {
    commit: texts.commit, generation: texts.generation, manifest: texts.manifest,
  });
  return checked ? { status: "ready", ...checked } : { status: "invalid" };
}

/** Preloaded texts need durable admission too; legacy commit-only calls fail closed. */
export function classifyRecordedTexts(
  demoId: string,
  pointerText: string | null,
  commitText: string | null,
  generationText: string | null,
  manifestText: string | null,
  admissionText: string | null = null,
): RecordedLoad {
  if (!isDemoId(demoId)) return { status: "invalid", demoId };
  if (pointerText == null) return { status: "missing", demoId };
  if (!withinTextLimit(pointerText, TEXT_LIMITS.pointers)) return { status: "invalid", demoId };
  const id = parsePointer(pointerText);
  if (!id) return { status: "invalid", demoId };
  const admission = admissionText == null ? null : parseAdmission(admissionText, demoId);
  if (!admission || admission.generationId !== id) return { status: "invalid", demoId };
  const result = classifyTexts(demoId, id, { admission: admissionText, commit: commitText, generation: generationText, manifest: manifestText });
  if (result.status !== "ready") return { status: result.status, demoId };
  return {
    status: "ready",
    demoId,
    generation: result.generation,
    texts: { admission: admissionText!, commit: commitText!, generation: generationText!, manifest: manifestText! },
    source: "latest",
  };
}

/**
 * Load only generations in the durable admission history, including pins.
 * An injected reader must implement admissions/<demo>.json (filesystem readers
 * alias it to the physical version2 pointer). Prepared commit files are not proof.
 * Exact text digests are verified before every asset's size and SHA-256.
 */
export async function loadRecordedDemo(
  bytes: RecordedBytes,
  demoId: string,
  options?: { generationId?: string },
): Promise<RecordedLoad> {
  if (!isDemoId(demoId)) return { status: "invalid", demoId };
  try {
    if (options?.generationId != null && !safeGenerationId(options.generationId)) return { status: "invalid", demoId };
    const admissionText = await bytes.read(`admissions/${demoId}.json`);
    if (admissionText == null) return { status: "missing", demoId };
    if (!withinTextLimit(admissionText, TEXT_LIMITS.admissions)) return { status: "invalid", demoId };
    const admission = parseAdmission(admissionText, demoId);
    if (!admission) return { status: "invalid", demoId };
    const id = options?.generationId ?? admission.generationId;
    if (!admission.history.some((entry) => entry.generationId === id)) return { status: "invalid", demoId };
    const commit = await bytes.read(`commits/${id}.json`);
    if (commit == null) return { status: "missing", demoId };
    if (!withinTextLimit(commit, TEXT_LIMITS.commits)) return { status: "invalid", demoId };
    if (!parseCommit(commit, id)) return { status: "invalid", demoId };
    const generation = await bytes.read(`generations/${id}.json`);
    const manifest = generation == null ? null : await bytes.read(`manifests/${id}.json`);
    const result = classifyTexts(demoId, id, { admission: admissionText, commit, generation, manifest });
    if (result.status !== "ready") return { status: result.status, demoId };
    for (const asset of result.manifest.assets) {
      const body = bytes.readBytes ? await bytes.readBytes(`assets/${asset.name}`) : null;
      if (body == null) return { status: "missing", demoId };
      if (body.byteLength !== asset.bytes) return { status: "invalid", demoId };
      const digest = await sha256Hex(body);
      if (digest !== asset.sha256) return { status: "invalid", demoId };
    }
    return {
      status: "ready",
      demoId,
      generation: result.generation,
      texts: { admission: admissionText, commit, generation: generation!, manifest: manifest! },
      source: options?.generationId != null ? "pinned" : "latest",
    };
  } catch {
    return { status: "error", demoId };
  }
}

type SessionStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function withinTextLimit(text: string, limit: number): boolean {
  return text.length <= limit && new TextEncoder().encode(text).byteLength <= limit;
}

const VISITOR_KEY = "farmdash_recorded_visitor";
const PIN_PREFIX = "farmdash_recorded_pin_";
const CACHE_PREFIX = "farmdash_recorded_cache_";
const LOCALE_KEY = "farmdash_recorded_locale";

export type RecordedSession = {
  visitorId: string;
  pinFor(demoId: DemoId): string | null;
  remember(demoId: DemoId, loaded: Extract<RecordedLoad, { status: "ready" }>): void;
  cached(demoId: DemoId): Extract<RecordedLoad, { status: "ready" }> | null;
};

function randomVisitorId(): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return "v-" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function safeGet(store: SessionStore | null, key: string): string | null {
  try {
    return store ? store.getItem(key) : null;
  } catch {
    return null;
  }
}

function safeSet(store: SessionStore | null, key: string, value: string): void {
  try {
    store?.setItem(key, value);
  } catch {
    /* quota or privacy mode: pin stays in memory only */
  }
}

/** Visitor-scoped pins in this browser context's session storage. No host settings are read or written. */
export function openRecordedSession(store: SessionStore | null): RecordedSession {
  let visitorId = safeGet(store, VISITOR_KEY);
  if (!visitorId || !/^v-[0-9a-f]{16}$/.test(visitorId)) {
    visitorId = randomVisitorId();
    safeSet(store, VISITOR_KEY, visitorId);
  }
  const memory = new Map<string, string>();
  return {
    visitorId,
    pinFor(demoId) {
      const raw = memory.get(PIN_PREFIX + demoId) ?? safeGet(store, PIN_PREFIX + demoId);
      return safeGenerationId(raw) ? raw : null;
    },
    remember(demoId, loaded) {
      if (loaded.demoId !== demoId || classifyTexts(demoId, loaded.generation.id, loaded.texts).status !== "ready") return;
      memory.set(PIN_PREFIX + demoId, loaded.generation.id);
      safeSet(store, PIN_PREFIX + demoId, loaded.generation.id);
      const body = JSON.stringify({ id: loaded.generation.id, ...loaded.texts });
      if (withinTextLimit(body, MAX_RECORDED_CACHE_BYTES)) {
        memory.set(CACHE_PREFIX + demoId, body);
        safeSet(store, CACHE_PREFIX + demoId, body);
      }
    },
    cached(demoId) {
      const raw = memory.get(CACHE_PREFIX + demoId) ?? safeGet(store, CACHE_PREFIX + demoId);
      if (!raw || !withinTextLimit(raw, MAX_RECORDED_CACHE_BYTES)) return null;
      try {
        const row = JSON.parse(raw) as { id?: unknown; admission?: unknown; commit?: unknown; generation?: unknown; manifest?: unknown };
        if (!safeGenerationId(row.id) || row.id !== this.pinFor(demoId)) return null;
        if (typeof row.admission !== "string" || typeof row.commit !== "string" || typeof row.generation !== "string" || typeof row.manifest !== "string") return null;
        const result = classifyTexts(demoId, row.id, { admission: row.admission, commit: row.commit, generation: row.generation, manifest: row.manifest });
        if (result.status !== "ready") return null;
        return {
          status: "ready",
          demoId,
          generation: result.generation,
          texts: { admission: row.admission, commit: row.commit, generation: row.generation, manifest: row.manifest },
          source: "offline",
        };
      } catch {
        return null;
      }
    },
  };
}

/**
 * A visitor keeps its pinned generation across reloads and later publishes.
 * Without a pin, or when the pinned generation is no longer published, the
 * latest committed generation is used. When the network fails the last
 * validated copy for this visitor is shown and marked offline.
 */
export async function loadRecordedForVisitor(
  bytes: RecordedBytes,
  demoId: DemoId,
  session: RecordedSession,
): Promise<RecordedLoad> {
  const pinned = session.pinFor(demoId);
  if (pinned) {
    const held = await loadRecordedDemo(bytes, demoId, { generationId: pinned });
    if (held.status === "ready") return held;
    if (held.status === "error") return session.cached(demoId) ?? held;
  }
  const latest = await loadRecordedDemo(bytes, demoId);
  if (latest.status === "error") return session.cached(demoId) ?? latest;
  return latest;
}

type GuardedWindow = {
  fetch?: typeof fetch;
  location: { href: string; origin: string };
  WebSocket?: unknown;
  EventSource?: unknown;
  __farmdashRecordedGuard?: { blocked: string[] };
};

/**
 * Deny every live capability in a recorded route: only GET reads of the
 * recorded publication and the locale catalog on this origin pass. Sockets
 * and event streams cannot be opened.
 */
export function installRecordedNetworkGuard(win: GuardedWindow): { blocked: string[] } {
  if (win.__farmdashRecordedGuard) return win.__farmdashRecordedGuard;
  const state = { blocked: [] as string[] };
  win.__farmdashRecordedGuard = state;
  const original = typeof win.fetch === "function" ? win.fetch.bind(win) : null;
  win.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    let url: URL | null = null;
    try {
      const raw = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
      url = new URL(raw, win.location.href);
    } catch {
      url = null;
    }
    const method = String(init?.method || (typeof input === "object" && "method" in input ? input.method : "GET")).toUpperCase();
    const allowed = url != null
      && original != null
      && url.origin === win.location.origin
      && method === "GET"
      && (url.pathname.startsWith(RECORDED_PUBLIC_BASE + "/") || url.pathname === "/locales/translations.json");
    if (allowed) return original!(input, init);
    state.blocked.push(url ? url.pathname : "unparsed");
    return Promise.reject(new Error("recorded-network-denied"));
  }) as typeof fetch;
  const denied = function RecordedDenied() {
    state.blocked.push("socket");
    throw new Error("recorded-network-denied");
  };
  win.WebSocket = denied;
  win.EventSource = denied;
  return state;
}

export function setRecordedVisitorLocale(visitorId: string, code: string, store?: SessionStore | null): boolean {
  if (!demoWritesAreLocked()) return false;
  if (!/^[a-z0-9][a-z0-9-]{0,64}$/.test(visitorId)) return false;
  if (!/^[a-z]{2}(?:-[A-Z]{2})?$/.test(code)) return false;
  visitorLocales.set(visitorId, code);
  if (store) safeSet(store, LOCALE_KEY, code);
  return true;
}

export function recordedVisitorLocale(visitorId: string, store?: SessionStore | null): string | null {
  const stored = store ? safeGet(store, LOCALE_KEY) : null;
  return visitorLocales.get(visitorId) ?? (stored && /^[a-z]{2}(?:-[A-Z]{2})?$/.test(stored) ? stored : null);
}
