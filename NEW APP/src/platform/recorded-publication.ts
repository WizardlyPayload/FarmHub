/**
 * Immutable payload/manifest/commit files are PREPARED, not admitted.
 * One atomic pointers/<demo>.json replacement admits history and advances latest.
 * A crash before it leaves unreachable orphans; a crash after it is a successful
 * publication. Historical entries never leave this bounded, append-only authority.
 * The HTTP compatibility pointer is derived; admissions/<demo>.json exposes the
 * full authority to clients. Never infer admission from commit-file existence.
 */
import { DEMO_IDS, FEATURE_ROUTES, emptyDemoLibrary, featureKeyForSection,
  publishDemoGeneration, safeGenerationId, sectionHasFeature, selectRecordedDemo,
  setDemoWritesLocked } from "./demo-source.ts";
import type { DemoGeneration, DemoId, DemoLibrary, DemoPayload, DemoVisitors } from "./demo-source.ts";
import { publicationSha256, utf8Bytes } from "./recorded-integrity.ts";
export { publicationSha256, utf8Bytes } from "./recorded-integrity.ts";
export type { DemoGeneration, DemoId, DemoLibrary, DemoPayload } from "./demo-source.ts";

export const MAX_GENERATION_BYTES = 512 * 1024;
export const MAX_ASSET_BYTES = 2 * 1024 * 1024;
export const MAX_MANIFEST_BYTES = 16 * 1024;
export const MAX_ADMISSION_BYTES = 512 * 1024;
export const MAX_ADMITTED_GENERATIONS = 1024;
const MAX_ASSETS = 32;
export const FEATURE_SECTIONS: ReadonlySet<string> = new Set(Object.keys(FEATURE_ROUTES));
export type AssetDigest = { bytes: number; sha256: string };
export type PublicationIo = {
  read(rel: string): string | null;
  writeAtomic(rel: string, body: string): void;
  exists(rel: string): boolean;
  list(prefix: string): string[];
  createOnce?(rel: string, body: string): void;
  digest?(rel: string): AssetDigest | null;
  /** Returns a digest only after the format/content/privacy policy passes. */
  validateAsset?(rel: string): AssetDigest | null;
  /** Filesystem implementations serialize read/prepare/admit under one root lock. */
  withLock?<T>(operation: () => T): T;
};
export type ManifestAsset = AssetDigest & { name: string };
export type RecordedManifest = { generationId: string; demoId: DemoId; exportGeneration: number; assets: ManifestAsset[] };
export type CommitRecord = { generationId: string; demoId: DemoId; exportGeneration: number };
export type AdmissionEntry = { generationId: string; exportGeneration: number; generationSha256: string; manifestSha256: string };
export type RecordedAdmission = { version: 2; demoId: DemoId; generationId: string; history: AdmissionEntry[] };
export type SwitchTicket = { visitorId: string; token: number; demoId: DemoId; generationId: string; snapshot: DemoGeneration };
export type VisitorBook = { visitors: DemoVisitors; tokens: Record<string, number> };
export type RecordedViewState = {
  payload: { dataSource?: string; lastUpdated?: string; recordedCapturedAt?: string } | null;
  lastUpdated: string | null; connection: "connecting" | "ws" | "http" | "error";
  servers: unknown; activeServerId: unknown;
};
export function emptyVisitorBook(): VisitorBook { return { visitors: {}, tokens: {} }; }
function isKnownDemo(value: string): value is DemoId { return (DEMO_IDS as readonly string[]).includes(value); }
export function safeVisitorId(value: unknown): value is string { return typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,64}$/.test(value); }
/** Only PNG is needed by the recorded renderer today. No arbitrary JSON/text. */
export function safeAssetName(value: unknown): value is string {
  return typeof value === "string" && value.length <= 96
    && /^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)*\.png$/.test(value)
    && !value.split("/").some(part => /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part));
}
function parseJson(body: string | null, max: number): unknown {
  if (body == null || body.length > max || utf8Bytes(body) > max) return null;
  try { return JSON.parse(body); } catch { return null; }
}
function exact(value: unknown, keys: string): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join(",") === keys;
}
function positive(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 2147483647; }
function digest(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value); }
export function parseCommit(body: string | null, id: string): CommitRecord | null {
  const row = parseJson(body, 1024);
  if (!safeGenerationId(id) || !exact(row, "demoId,exportGeneration,generationId") || row.generationId !== id
    || typeof row.demoId !== "string" || !isKnownDemo(row.demoId) || !positive(row.exportGeneration)) return null;
  return { generationId: id, demoId: row.demoId, exportGeneration: row.exportGeneration };
}
export function parseManifest(body: string | null, id: string, demoId: DemoId): RecordedManifest | null {
  const row = parseJson(body, MAX_MANIFEST_BYTES);
  if (!exact(row, "assets,demoId,exportGeneration,generationId") || row.generationId !== id || row.demoId !== demoId
    || !positive(row.exportGeneration) || !Array.isArray(row.assets) || row.assets.length > MAX_ASSETS) return null;
  const assets: ManifestAsset[] = [], names = new Set<string>();
  for (const item of row.assets) {
    if (!exact(item, "bytes,name,sha256") || !safeAssetName(item.name) || names.has(item.name)
      || typeof item.bytes !== "number" || !Number.isInteger(item.bytes) || item.bytes < 1 || item.bytes > MAX_ASSET_BYTES || !digest(item.sha256)) return null;
    names.add(item.name); assets.push({ name: item.name, bytes: item.bytes, sha256: item.sha256 });
  }
  return { generationId: id, demoId, exportGeneration: row.exportGeneration, assets };
}
export function parseGeneration(body: string | null, id: string): DemoGeneration | null {
  if (!safeGenerationId(id)) return null;
  const parsed = parseJson(body, MAX_GENERATION_BYTES) as DemoGeneration | null;
  if (!parsed || typeof parsed !== "object" || parsed.id !== id) return null;
  const check = publishDemoGeneration(emptyDemoLibrary(), parsed, { strict: true });
  if (!check.ok) return null;
  const generation = check.library.generations[id];
  return generation && JSON.stringify(generation) === JSON.stringify(parsed) ? generation : null;
}
export function parseAdmission(body: string | null, demoId: DemoId): RecordedAdmission | null {
  const row = parseJson(body, MAX_ADMISSION_BYTES);
  if (!exact(row, "demoId,generationId,history,version") || row.version !== 2 || row.demoId !== demoId || !isKnownDemo(demoId)
    || !safeGenerationId(row.generationId) || !Array.isArray(row.history) || !row.history.length || row.history.length > MAX_ADMITTED_GENERATIONS) return null;
  const history: AdmissionEntry[] = [], seen = new Set<string>();
  for (const item of row.history) {
    if (!exact(item, "exportGeneration,generationId,generationSha256,manifestSha256") || !safeGenerationId(item.generationId)
      || !positive(item.exportGeneration) || !digest(item.generationSha256) || !digest(item.manifestSha256) || seen.has(item.generationId.toLowerCase())) return null;
    seen.add(item.generationId.toLowerCase());
    history.push({ generationId: item.generationId, exportGeneration: item.exportGeneration, generationSha256: item.generationSha256, manifestSha256: item.manifestSha256 });
  }
  if (!history.some(item => item.generationId === row.generationId)) return null;
  return { version: 2, demoId, generationId: row.generationId, history };
}
/** Small derived HTTP pointers stay compatible; disk authorities use the same parser. */
export function parsePointer(body: string | null): string | null {
  const row = parseJson(body, MAX_ADMISSION_BYTES);
  if (exact(row, "generationId") && body != null && utf8Bytes(body) <= 256) return safeGenerationId(row.generationId) ? row.generationId : null;
  if (!row || typeof row !== "object") return null;
  const demoId = (row as { demoId?: unknown }).demoId;
  return typeof demoId === "string" && isKnownDemo(demoId) ? parseAdmission(body, demoId)?.generationId ?? null : null;
}
/** Shared admission and exact-byte identity check for Node and browser loader. */
export function validateCommittedTexts(admissionText: string | null, demoId: DemoId, id: string,
  texts: { commit: string | null; generation: string | null; manifest: string | null }): { generation: DemoGeneration; manifest: RecordedManifest } | null {
  const authority = parseAdmission(admissionText, demoId);
  const entry = authority?.history.find(row => row.generationId === id);
  if (!entry || texts.generation == null || texts.manifest == null) return null;
  const commit = parseCommit(texts.commit, id), generation = parseGeneration(texts.generation, id), manifest = parseManifest(texts.manifest, id, demoId);
  if (!commit || !generation || !manifest || commit.demoId !== demoId || generation.demoId !== demoId
    || commit.exportGeneration !== entry.exportGeneration || generation.exportGeneration !== entry.exportGeneration || manifest.exportGeneration !== entry.exportGeneration
    || publicationSha256(texts.generation) !== entry.generationSha256 || publicationSha256(texts.manifest) !== entry.manifestSha256) return null;
  return { generation, manifest };
}
export function readCommittedTexts(io: PublicationIo, id: string): { generation: DemoGeneration; manifest: RecordedManifest; texts: { commit: string; generation: string; manifest: string }; admission: string } | null {
  if (!safeGenerationId(id)) return null;
  for (const demoId of DEMO_IDS) {
    const admission = io.read(`pointers/${demoId}.json`);
    if (!parseAdmission(admission, demoId)?.history.some(row => row.generationId === id)) continue;
    const texts = { commit: io.read(`commits/${id}.json`), generation: io.read(`generations/${id}.json`), manifest: io.read(`manifests/${id}.json`) };
    const checked = validateCommittedTexts(admission, demoId, id, texts);
    if (!checked) return null;
    for (const asset of checked.manifest.assets) {
      const actual = io.validateAsset?.(`assets/${asset.name}`);
      if (!actual || actual.bytes !== asset.bytes || actual.sha256 !== asset.sha256) return null;
    }
    return { ...checked, texts: texts as { commit: string; generation: string; manifest: string }, admission: admission! };
  }
  return null;
}
export function readCommittedGeneration(io: PublicationIo, id: string): DemoGeneration | null { return readCommittedTexts(io, id)?.generation ?? null; }
export function readLatestGeneration(io: PublicationIo, demoId: DemoId): DemoGeneration | null {
  const admission = parseAdmission(io.read(`pointers/${demoId}.json`), demoId);
  const generation = admission ? readCommittedGeneration(io, admission.generationId) : null;
  return generation?.demoId === demoId ? generation : null;
}
export function readPersistedLibrary(io: PublicationIo): DemoLibrary {
  const generations: Record<string, DemoGeneration> = Object.create(null), pointers: Partial<Record<DemoId, string>> = {};
  for (const demoId of DEMO_IDS) {
    const admission = parseAdmission(io.read(`pointers/${demoId}.json`), demoId);
    if (!admission) continue;
    for (const entry of admission.history) {
      const generation = readCommittedGeneration(io, entry.generationId);
      if (generation?.demoId === demoId) generations[generation.id] = generation;
    }
    if (generations[admission.generationId]?.demoId === demoId) pointers[demoId] = admission.generationId;
  }
  return { pointer: null, pointers, generations };
}
function createOnce(io: PublicationIo, rel: string, body: string): void {
  if (io.createOnce) return io.createOnce(rel, body);
  if (io.exists(rel)) throw new Error("exists " + rel);
  io.writeAtomic(rel, body);
}
type PublishResult = { ok: true; library: DemoLibrary } | { ok: false; library: DemoLibrary; error: string };
export function publishPersisted(io: PublicationIo, candidate: DemoGeneration): PublishResult {
  const run = (): PublishResult => {
    let before: DemoLibrary;
    try { before = readPersistedLibrary(io); } catch { return { ok: false, library: emptyDemoLibrary(), error: "publication-unreadable" }; }
    const fail = (error: string): PublishResult => ({ ok: false, library: before, error });
    if (!safeGenerationId(candidate?.id)) return fail("unsafe-id");
    try {
      if (["generations", "manifests", "commits"].some(store => io.exists(`${store}/${candidate.id}.json`)) || before.generations[candidate.id]) return fail("duplicate-generation");
      const result = publishDemoGeneration(before, candidate);
      if (!result.ok) return fail(result.error);
      const stored = result.library.generations[candidate.id], body = JSON.stringify(stored);
      if (utf8Bytes(body) > MAX_GENERATION_BYTES) return fail("payload-too-large");
      const previousText = io.read(`pointers/${stored.demoId}.json`);
      const previous = previousText == null ? null : parseAdmission(previousText, stored.demoId);
      // Old pointer+commit stores cannot distinguish historical successes from failed
      // first publishes. Preserve bytes and require an explicit reviewed migration.
      if (previousText != null && !previous) return fail("admission-invalid-or-legacy");
      if (previous && previous.history.some(row => !before.generations[row.generationId])) return fail("admission-closure-invalid");
      if ((previous?.history.length ?? 0) >= MAX_ADMITTED_GENERATIONS) return fail("history-full");
      const raw = (candidate as DemoGeneration & { assets?: unknown }).assets ?? [];
      if (!Array.isArray(raw) || raw.length > MAX_ASSETS) return fail("unsafe-asset");
      const assets: ManifestAsset[] = [], seen = new Set<string>();
      for (const name of raw) {
        if (!safeAssetName(name) || seen.has(name)) return fail("unsafe-asset");
        seen.add(name);
        const info = io.validateAsset?.(`assets/${name}`);
        if (!info || !positive(info.bytes) || info.bytes > MAX_ASSET_BYTES || !digest(info.sha256)) return fail("invalid-public-asset");
        assets.push({ name, bytes: info.bytes, sha256: info.sha256 });
      }
      const manifest = JSON.stringify({ generationId: stored.id, demoId: stored.demoId, exportGeneration: stored.exportGeneration, assets });
      if (utf8Bytes(manifest) > MAX_MANIFEST_BYTES) return fail("manifest-too-large");
      const commit = JSON.stringify({ generationId: stored.id, demoId: stored.demoId, exportGeneration: stored.exportGeneration });
      const authority: RecordedAdmission = { version: 2, demoId: stored.demoId, generationId: stored.id, history: [...(previous?.history ?? []), {
        generationId: stored.id, exportGeneration: stored.exportGeneration, generationSha256: publicationSha256(body), manifestSha256: publicationSha256(manifest),
      }] };
      const authorityText = JSON.stringify(authority);
      if (!parseAdmission(authorityText, stored.demoId)) return fail("history-full");
      try {
        createOnce(io, `generations/${stored.id}.json`, body);
        createOnce(io, `manifests/${stored.id}.json`, manifest);
        createOnce(io, `commits/${stored.id}.json`, commit);
      } catch { return fail("generation-write-failed"); }
      try { io.writeAtomic(`pointers/${stored.demoId}.json`, authorityText); }
      catch {
        // A transport may lose acknowledgement after the atomic replacement.
        // Resolve that uncertainty against the same durable authority.
        try { if (io.read(`pointers/${stored.demoId}.json`) !== authorityText) return fail("pointer-failed"); }
        catch { return fail("admission-outcome-unknown"); }
      }
      // No fallible post-commit read can misreport a successful admission as failed.
      return { ok: true, library: result.library };
    } catch { return fail("publication-unreadable"); }
  };
  try { return io.withLock ? io.withLock(run) : run(); }
  catch { return { ok: false, library: emptyDemoLibrary(), error: "publication-busy-or-unsafe" }; }
}

function cloneGeneration(generation: DemoGeneration): DemoGeneration {
  return JSON.parse(JSON.stringify(generation)) as DemoGeneration;
}

export function beginVisitorSwitch(
  book: VisitorBook,
  visitorId: string,
  demoId: string,
  library: DemoLibrary,
): { ok: true; book: VisitorBook; ticket: SwitchTicket } | { ok: false; book: VisitorBook; error: string } {
  if (!safeVisitorId(visitorId)) return { ok: false, book, error: "unknown-visitor" };
  const selected = selectRecordedDemo(book.visitors, visitorId, demoId, library);
  if (!selected.ok) return { ok: false, book, error: selected.error };
  const token = (book.tokens[visitorId] || 0) + 1;
  return {
    ok: true,
    book: {
      visitors: book.visitors,
      tokens: { ...book.tokens, [visitorId]: token },
    },
    ticket: {
      visitorId,
      token,
      demoId: selected.generation.demoId,
      generationId: selected.generation.id,
      snapshot: cloneGeneration(selected.generation),
    },
  };
}

export function commitVisitorSwitch(
  book: VisitorBook,
  ticket: SwitchTicket,
  library: DemoLibrary,
  apply: (payload: DemoPayload, section: string, capturedAt: string) => void,
  io?: PublicationIo,
): { ok: true; book: VisitorBook; applied: true; capturedAt: string; section: string } | { ok: false; book: VisitorBook; applied: false; error: string } {
  if (!ticket || book.tokens[ticket.visitorId] !== ticket.token) {
    return { ok: false, book, applied: false, error: "stale" };
  }
  let generation: DemoGeneration | null = null;
  if (io) {
    generation = readCommittedGeneration(io, ticket.generationId);
  } else if (ticket.snapshot && ticket.snapshot.id === ticket.generationId && ticket.snapshot.demoId === ticket.demoId) {
    generation = cloneGeneration(ticket.snapshot);
  } else if (library.generations[ticket.generationId]?.demoId === ticket.demoId) {
    generation = cloneGeneration(library.generations[ticket.generationId]);
  }
  if (!generation || generation.demoId !== ticket.demoId || generation.id !== ticket.generationId) {
    return { ok: false, book, applied: false, error: "missing-generation" };
  }
  if (io) {
    try {
      io.writeAtomic(`visitors/${ticket.visitorId}.json`, JSON.stringify({
        demoId: generation.demoId,
        generationId: generation.id,
        capturedAt: generation.capturedAt,
        section: generation.section,
      }));
    } catch {
      return { ok: false, book, applied: false, error: "pin-failed" };
    }
  }
  apply(generation.payload, generation.section, generation.capturedAt);
  return {
    ok: true,
    applied: true,
    capturedAt: generation.capturedAt,
    section: generation.section,
    book: {
      visitors: {
        ...book.visitors,
        [ticket.visitorId]: {
          id: ticket.visitorId,
          demoId: generation.demoId,
          generationId: generation.id,
        },
      },
      tokens: book.tokens,
    },
  };
}

export function reloadVisitor(
  io: PublicationIo,
  visitorId: string,
): { ok: true; demoId: DemoId; generationId: string; capturedAt: string; section: string; payload: DemoPayload } | { ok: false; error: string } {
  if (!safeVisitorId(visitorId)) return { ok: false, error: "unknown-visitor" };
  const pin = parseJson(io.read(`visitors/${visitorId}.json`), 1024) as { generationId?: unknown } | null;
  if (!pin || !safeGenerationId(pin.generationId)) return { ok: false, error: "missing-generation" };
  const generation = readCommittedGeneration(io, pin.generationId);
  if (!generation) return { ok: false, error: "missing-generation" };
  return {
    ok: true,
    demoId: generation.demoId,
    generationId: generation.id,
    capturedAt: generation.capturedAt,
    section: generation.section,
    payload: generation.payload,
  };
}

export function recordedLastUpdated(
  payload: { dataSource?: unknown; lastUpdated?: unknown; recordedCapturedAt?: unknown } | null | undefined,
  previous: string | null,
): string | null {
  if (!payload || payload.dataSource !== "recorded-demo") return null;
  const stamped = typeof payload.recordedCapturedAt === "string" ? payload.recordedCapturedAt : "";
  const updated = typeof payload.lastUpdated === "string" ? payload.lastUpdated : "";
  const captured = stamped || updated;
  if (!captured || Number.isNaN(Date.parse(captured))) return previous;
  return captured;
}

export function applyRecordedToState<T extends RecordedViewState>(
  state: T,
  generation: { capturedAt: string; payload: { dataSource?: string } },
): T {
  if (generation.payload?.dataSource !== "recorded-demo") return state;
  if (!generation.capturedAt || Number.isNaN(Date.parse(generation.capturedAt))) return state;
  return {
    ...state,
    payload: {
      ...generation.payload,
      dataSource: "recorded-demo",
      lastUpdated: generation.capturedAt,
      recordedCapturedAt: generation.capturedAt,
    },
    lastUpdated: generation.capturedAt,
    connection: "http",
    servers: state.servers,
    activeServerId: state.activeServerId,
  } as T;
}

export function recordedSectionFromHash(hash: string): string | null {
  const raw = String(hash || "").replace(/^#\/?/, "").trim();
  if (!raw) return null;
  const segment = raw.split("?")[0].split("/").filter(Boolean)[0];
  if (!segment) return null;
  try {
    const decoded = decodeURIComponent(segment);
    if (decoded === "livestock") return "pastures";
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Resolve the section a recorded snapshot may open. Only allowlisted feature
 * sections that carry readings in this snapshot pass; anything else falls back
 * to the published default and reports why.
 */
export function recordedFeatureSection(
  payload: DemoPayload,
  publishedSection: string,
  requested: string | null,
): { ok: true; section: string } | { ok: false; error: "empty-section" | "unknown-section"; section: string } {
  const fallback = featureKeyForSection(publishedSection) && sectionHasFeature(payload, publishedSection) ? publishedSection : "";
  if (!requested) {
    if (!fallback) return { ok: false, error: "empty-section", section: publishedSection };
    return { ok: true, section: publishedSection };
  }
  if (!FEATURE_SECTIONS.has(requested)) {
    return { ok: false, error: "unknown-section", section: fallback || publishedSection };
  }
  if (!sectionHasFeature(payload, requested)) {
    return { ok: false, error: "empty-section", section: fallback || publishedSection };
  }
  return { ok: true, section: requested };
}

export function recordedRoute(search: string): { kind: "live" } | { kind: "recorded"; demoId: DemoId } | { kind: "denied" } {
  const query = String(search || "").replace(/^\?/, "");
  if (!query) return { kind: "live" };
  const params = new URLSearchParams(query);
  if (!params.has("demo")) return { kind: "live" };
  const demoId = params.get("demo") || "";
  if (!isKnownDemo(demoId)) return { kind: "denied" };
  return { kind: "recorded", demoId };
}

export function recordedBannerModel(capturedAt: string): {
  strongKey: "viewer.recordedStrong";
  bodyKey: "viewer.recordedBody";
  capturedKey: "viewer.recordedCaptured";
  capturedAt: string;
} {
  return {
    strongKey: "viewer.recordedStrong",
    bodyKey: "viewer.recordedBody",
    capturedKey: "viewer.recordedCaptured",
    capturedAt,
  };
}

export function bootRecordedRenderer(input: {
  search: string;
  hash: string;
  visitorId: string;
  library: DemoLibrary;
  book: VisitorBook;
  apply: (payload: DemoPayload, section: string, capturedAt: string) => void;
  liveBootstrap: () => void;
  io?: PublicationIo;
}): { ok: true; mode: "live"; book: VisitorBook } | { ok: true; mode: "recorded"; book: VisitorBook; capturedAt: string; section: string; deepLink: { ok: true; section: string } | { ok: false; error: string; section: string } } | { ok: false; error: string; book: VisitorBook } {
  const route = recordedRoute(input.search);
  if (route.kind === "live") {
    input.liveBootstrap();
    return { ok: true, mode: "live", book: input.book };
  }
  setDemoWritesLocked(true);
  if (route.kind === "denied") return { ok: false, error: "unknown-demo", book: input.book };
  const begun = beginVisitorSwitch(input.book, input.visitorId, route.demoId, input.library);
  if (!begun.ok) return { ok: false, error: begun.error, book: input.book };
  let appliedSection = begun.ticket.snapshot.section;
  let appliedAt = begun.ticket.snapshot.capturedAt;
  let deepLink: { ok: true; section: string } | { ok: false; error: "empty-section" | "unknown-section"; section: string } = {
    ok: false,
    error: "empty-section",
    section: begun.ticket.snapshot.section,
  };
  const committed = commitVisitorSwitch(begun.book, begun.ticket, input.library, (payload, section, capturedAt) => {
    deepLink = recordedFeatureSection(payload, section, recordedSectionFromHash(input.hash));
    appliedSection = deepLink.section;
    appliedAt = capturedAt;
    input.apply(payload, deepLink.section, capturedAt);
  }, input.io);
  if (!committed.ok) return { ok: false, error: committed.error, book: begun.book };
  return {
    ok: true,
    mode: "recorded",
    book: committed.book,
    capturedAt: appliedAt,
    section: appliedSection,
    deepLink,
  };
}
