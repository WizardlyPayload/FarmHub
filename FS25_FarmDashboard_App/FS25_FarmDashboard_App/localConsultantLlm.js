/**
 * FS25 FarmDashboard — Smart suggestions via BYOK (OpenAI / Gemini) on this PC only.
 * Does not call a hosted AI Farm Manager server; keys never leave except to the chosen provider.
 * Shared domain reference: FarmHub/shared/consultant_playbook.md (same as hosted consultant).
 *
 * Gemini: we do not fall back to `gemini-1.5-flash` — Google has retired that model family for new
 * projects; use `gemini-2.0-flash` (default) or set FARMDASH_BYOK_GEMINI_MODEL to a current model id
 * from the Gemini API docs.
 */

const fs = require('fs');
const path = require('path');

const {
    slimFieldForConsultantLlm,
    slimVehicleForConsultantLlm,
    slimAnimalForConsultantLlm,
    slimPastureForConsultantLlm,
    slimProductionForConsultantLlm,
    applyLocalConsultantPayloadDiet,
} = require('./consultantSnapshotPrune');

const OPENAI_MODEL = process.env.FARMDASH_BYOK_OPENAI_MODEL || 'gpt-4o-mini';
/** Default; override if Google renames — do not use deprecated 1.5 Flash. */
const GEMINI_MODEL = process.env.FARMDASH_BYOK_GEMINI_MODEL || 'gemini-2.0-flash';
/**
 * When provider is OpenAI-compatible (Ollama, LM Studio, vLLM…) and no model is saved, use this id.
 * Override with env e.g. `llama3.2:latest` or `mistral` if your server has no tagless name.
 */
const LOCAL_OPENAI_COMPAT_DEFAULT_MODEL =
    process.env.FARMDASH_BYOK_LOCAL_MODEL || 'llama3.2';

/** Full cloud OpenAI chat (large context models). */
const MAX_SNAPSHOT_CHARS_OPENAI = 118000;
const MAX_SNAPSHOT_CHARS_GEMINI = 65000;
/**
 * Ollama / LM Studio / vLLM often use num_ctx 4096. The **chat template + system + user JSON** must fit;
 * large JSON (e.g. 14k chars) can still tokenize to 8k+ tokens and trigger truncation + slow runs.
 * Defaults assume num_ctx=4096; raise FARMDASH_* caps only after increasing OLLAMA_CONTEXT_LENGTH on the server.
 */
const MAX_SNAPSHOT_CHARS_OPENAI_COMPAT =
    Number(process.env.FARMDASH_BYOK_OPENAI_COMPAT_MAX_CHARS) || 7200;
/** Parallel Ollama shard calls — default 1 so a single-GPU box does not pile up long generations. */
const OLLAMA_SHARD_CONCURRENCY = Math.min(
    4,
    Math.max(1, Number(process.env.FARMDASH_OLLAMA_SHARD_CONCURRENCY) || 1)
);
/** Serialized JSON length per shard request (chars). Keep low so prompt tokens stay under num_ctx. */
const OLLAMA_SHARD_MAX_JSON_CHARS =
    Number(process.env.FARMDASH_OLLAMA_SHARD_MAX_JSON_CHARS) || 7200;
/** Field-map mode: fields per Ollama shard (each insight = one field). Smaller = fewer prompt tokens. */
const OLLAMA_FIELD_MAP_BATCH = Math.max(1, Number(process.env.FARMDASH_OLLAMA_FIELD_MAP_BATCH) || 3);
/** Non-map fields view: fields per shard. */
const OLLAMA_FIELDS_VIEW_BATCH = Math.max(1, Number(process.env.FARMDASH_OLLAMA_FIELDS_VIEW_BATCH) || 3);
const MAX_FIELD_MAP_ROWS = 80;

/** OpenAI-compat + Gemini BYOK fetch timeout (ms). Override e.g. slow local models. */
const LOCAL_BYOK_FETCH_TIMEOUT_MS = Math.max(
    1000,
    Number(process.env.FARMDASH_LOCAL_BYOK_FETCH_TIMEOUT_MS) || 300000
);

function byokError(message, code) {
    const e = new Error(message);
    e.farmdash_ai_error = code;
    return e;
}

function isAbortError(err) {
    return (
        !!err &&
        (err.name === 'AbortError' ||
            err.code === 20 ||
            (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError'))
    );
}

const BYOK_ACTIONABILITY_RULES = `
Actionability:
- **message** = one clear **next in-game action** (imperative: verb + what + where). Name **farmlandId** / crop / machine from JSON when you can. Avoid analyst filler: no "review usage", "could indicate", "may suggest", "consider monitoring" without a concrete job.
- **reasoning** = one **fact from the JSON** that backs the message (fruitType, growthState vs maxGrowthState or growthStatePercentage, tank %, vehicle name). No hedge stacks. Never quote raw engine tokens like **GROWTH_01** or snake_case growth enums — plain English only.
- **category** must be **exactly one** of: Field, Animal, Production, Finance — never "Field|Animal|..." or pipe-separated schema text.
- **Sprayer / full tank:** do not claim "overuse" from a full tank; say which spray job or field is next using snapshot rows.
- **Match machines to jobs:** for herbicide/spray/liquid fert, name a **vehicles** row only if its name/type clearly fits a **sprayer**. Do not assign spraying to trucks, flatbeds, bale/pallet trailers, or tippers unless JSON clearly marks sprayer gear.
- **No tank busywork:** do not tell the player to check or verify a tank that JSON shows as **full** or **>85%**. Do not invent water-tank checks on bale/pallet trailers.
- **No field irrigation / soil moisture:** FS25 vanilla has **no** parcel **soil moisture** HUD and **no** player **field irrigation** from moisture readings. Never advise **irrigation**, **soil moisture checks**, or confuse **growthStatePercentage** (crop growth) with moisture. Do not use barn water on cropland — barn feed/water is **Animal** / husbandry only.
- **Hay windrows:** **DRYGRASS_WINDROW** is **dried grass hay (hay windrow)** — use **bale / pickup / loading wagon / forage harvester / ted**, not **combine grain harvest** language. Never paste raw ALLCAPS fill-type enums in text.
- **Category honesty:** vehicle-only tips (refuel, repair, wrong rig) → **Production** with **field_ref** null, not **Field**.
`;

function isFieldMapView(view, context) {
    return String(context || '').toLowerCase() === 'fields' && String(view || '').toLowerCase() === 'fields';
}

const BASE_JSON_RULES = `You MUST respond with ONLY valid JSON (no markdown fences). Use **one literal category per row** (not alternatives joined with |):
{"insights":[{"category":"Field","priority":"High","message":"...","reasoning":"...","field_ref":"27"},{"category":"Production","priority":"Medium","message":"...","reasoning":"...","field_ref":null}]}

Rules:
- **category** = exactly Field, Animal, Production, or Finance. **field_ref** = that parcel's farmlandId or id only when category is Field; otherwise null.
- priority must be exactly Low, Medium, or High (spell Medium in full).
- **message** must be plain English: one short imperative sentence. No fictional character names, no roleplay, no "Name:/" or "Name: /" prefixes.
- **Ground truth:** Every tip must follow the JSON snapshot for that parcel. If growthState / harvestReady / fruitType / nitrogenLevel vs targetNitrogen / pH or lime hints contradict an action, do not recommend that action.
- Harvested, mulched stubble, empty, or growthState 0 with no active crop: do not advise mid-season spray, herbicide on a standing crop, or sowing as if the crop is already growing.
- Late growth (high growthState or growth stage): do not advise sowing or planting that same crop.
- Large nitrogen shortfall vs target (when JSON shows it): prioritize fertilizing (solid/slurry/liquid N) before generic mowing or cosmetic maintenance.
- Never write "weed level" or numeric weed severity — say weeds / needs spraying.
- Never write internal growth codes (**GROWTH_01**, etc.) or snake_case **growthLabel** values — say **early growth**, **young crop**, or **stage X of Y** from **growthState** / **maxGrowthState** or **growthStatePercentage**.
- Do **not** advise **watering farmland**, **irrigating fields**, or **low soil moisture** on parcels; barn **Available Food** / water fills are **husbandry**, not field irrigation. **growthStatePercentage** is crop growth progress, not soil water.
- **DRYGRASS_WINDROW** is **hay (dried grass windrow)** — prefer **bale, ted, or pick up with wagon/forage harvester**, not cereal **combine harvest** wording. Do not echo raw fill-type enum strings.
- Grass/meadow forage: never assign a grain combine; use mower/baler/forage harvester language.
- Late growth + weeds: herbicide/sprayer not mechanical weeder.
- Use vehicles from JSON only for this farm (ownerFarmId matches activeFarmId); do not tell players to buy a machine when a suitable one is listed.
- **Animal feed & water:** only advise refilling barn food, TMR, silage/hay, troughs, or water when JSON shows that fill **below 75%** of capacity (values **0–1** are fractions — compare to **0.75**; values **0–100** are percent — compare to **75**). Barn fillLevels in JSON are usually **liters** (e.g. 4500), not a 0–100 percent; use **pastures._consultant_feed_water_pct** (**foodPctOfCapacity** / **waterPctOfCapacity**, 0–100) when present. If every channel is **≥ 75%** or you cannot prove **below 75%**, do not suggest filling food or water — pick another animal or farm topic.
- **Never** output tips about JSON, APIs, or data quality: do **not** say that **farmlandId**, **id**, **field_ref**, or **activeFarmId** are "missing" or "not set", and do not complain that farm data is unavailable — players cannot fix those. If a section of the snapshot is thin, give **general, cautious FS25 advice** (e.g. check contracts, review growth stages) instead.
- Keep message and reasoning useful (under ~280 characters each when possible so parcel ids and crop names fit).

${BYOK_ACTIONABILITY_RULES}`;

/** Field map (context=fields & view=fields): mentor voice on cards; no JSON-debug wording. */
const BASE_JSON_RULES_FIELD_MAP = `You MUST respond with ONLY valid JSON (no markdown fences). One row per field object, same order as "fields" in the user JSON.
{"insights":[{"category":"Field","priority":"High","message":"Walter: Field 21's soil is sour — spread lime before you drill.","reasoning":"","field_ref":"21"}]}

Rules:
- **category** must be **Field** every row. **field_ref** = that parcel's farmlandId or id. **reasoning** must be **""** (empty string) on every row — the UI shows **message** only.
- **message** = **one** warm, spoken line as if a local mentor is talking (**Ben:** / **Walter:** / **David:** / **Katie:** / **Noah:** / **Hank:** then the advice). Pick the voice by topic (lime/pH/rotation → Walter; machines → Ben; risk → David; grass/forage → Katie; wood → Noah; quick cab nudge → Hank).
- Write like a **farmer**, not a debugger: **forbidden** phrases include "needsLime is true", "phValue of", "growthLabel '", "targetNitrogen of", "isHarvested is true", "needsWork is false", bare "21 with pH", **farmlandId:**, **field_ref:**, or **(farmlandId: N)** — use **field_ref** in JSON only. Instead: "Field 21 could use lime — pH is low." / "Field 22 is cleared after harvest — plan your next pass." / "Nitrogen on field 20 looks fine for now."
- Never paste raw **GROWTH_xx** or snake_case **growthLabel** tokens; use human growth wording.
- Grass/forage: no grain combines for grass hay; spray/herbicide only with a real **sprayer** from **vehicles** when you name kit.

${BYOK_ACTIONABILITY_RULES}`;

function viewInstruction(view, context) {
    const v = String(view || 'home').toLowerCase();
    const ctx = String(context || '').toLowerCase();

    if (ctx === 'fields' && v === 'fields') {
        return `FIELD MAP MODE: Output exactly ONE insight per object in "fields" (insights.length MUST equal fields.length). Order insights in the same order as the "fields" array.
Each item: category "Field"; field_ref = that field's farmlandId or id; reasoning "" (always empty — cards show **message** only).
For EACH field, read that row's keys (fruitType, growthState, growthStatePercentage, harvestReady, growthLabel, nitrogenLevel, targetNitrogen, needsLime, phValue, needsWork, etc.). The **message** must be **one short line in a mentor's voice** (starts with **Ben:** / **Walter:** / **David:** / **Katie:** / **Noah:** or **Hank:**) giving the **next job** in plain farmer English — never JSON-style dumps ("needsLime is true", "phValue of 5.644", "growthLabel 'harvested'", "targetNitrogen of 0", "isHarvested is true"). Say **field 21** / **parcel 22** naturally, not naked numbers with "with pH".
Hard rules: (1) If harvested / mulched / no standing crop, do not recommend spraying or weeding a standing crop, or sowing as if the crop were not yet planted. (2) If the crop is already well along (late growthState), never recommend sowing that crop. (3) If nitrogen is far below target, mention fertilizing before routine mowing; if N is fine, say so in plain words — do not invent urgency. (4) Never output **GROWTH_xx** or raw **growthLabel** enum strings in text. (5) For spray/herbicide, only name a **vehicles** row that is plausibly a sprayer — not trucks or bale/pallet trailers. At most ${MAX_FIELD_MAP_ROWS} fields if the farm is huge.`;
    }

    const map = {
        home: `VIEW home: Return exactly 3 insights — the **most urgent next actions** for this farm (field + fleet + animals/production/money when JSON supports). Each **message** must be a concrete imperative (what to do next), not vague analysis. Each **reasoning** cites one JSON fact (parcel id, crop, fill %, machine name). For animals: only suggest refilling feed or water when JSON **proves** a level **below 75%** of capacity — prefer **pastures._consultant_feed_water_pct**; barn **fillLevels** are often **liters**, not percent; never nag when **foodPctOfCapacity** / **waterPctOfCapacity** is **≥ 75** or unknown.`,
        fields: `VIEW fields: Focus on crops, growth, soil, harvest readiness; prefer Field category with field_ref when one parcel is meant. Ground every tip in the JSON (growth, harvest state, N, pH). Say the **job** (spray, harvest, lime, spread N) and **which parcel** when data allows — not generic "levels are low". At most 4 insights.`,
        vehicles: `VIEW vehicles: **Fleet only** — refuel, repair, damage, attachments, operating hours, parking. **Do not** advise field or cropland work (harvest, sow, spray, cultivate, lime, N on parcels, weeds on fields, bales on land, growth stages). Never use category **Field** or a non-null **field_ref**. Use **Production** (machines) or **Finance** (buy/sell equipment). If the fleet looks fine, one reassuring insight. At most 3 insights.`,
        pastures: `VIEW pastures: Grazing, pasture levels, manure, herd on pasture. **DRYGRASS_WINDROW** on pasture is **hay windrow** (dried grass) — advise **bale / ted / pickup**, not **combine grain harvest**; do not echo raw fill-type enums. Only suggest topping pasture feed or water when JSON shows **below 75%** of capacity — use **_consultant_feed_water_pct** on pasture rows when present; **fillLevels** numbers are usually **liters**, not %. At most 4 insights.`,
        livestock: `VIEW livestock: Barn animals — health, reproduction, milk/wool, cleanliness, overcrowding. Feed/water: **only** if JSON shows **below 75%** of capacity (0–1 vs 0.75 or percent vs 75); use **pastures._consultant_feed_water_pct** when present; raw **fillLevels** are typically **liters** (do not treat 4500 as 45%). If all **≥ 75%** or unproven, do not suggest filling food or water. At most 4 insights.`,
        productions: `VIEW productions: Chains, fill levels, bottlenecks. At most 4 insights.`,
        economy: `VIEW economy — **inventory-backed only**. The JSON includes **_consultant_held_fill_types** (liters + source) and **_consultant_finance_facts** — treat these as ground truth. **Only** name a fill type for sell/haul tips if it appears in **_consultant_held_fill_types** (or is clearly the same stock from **production** / **fields**). The **economy** price section is already filtered to those types; do **not** infer crops from memory or from removed sell-point tables. No equipment shopping, no "invest spare cash" unless **_consultant_finance_facts** shows a comfortable positive balance and you tie it to moving listed stock. At most 4 insights; **field_ref** when one parcel is meant.`,
    };
    return map[v] || map.home;
}

/** @type {string|undefined} */
let _consultantPlaybookCache;

function loadConsultantDataPlaybook() {
    if (_consultantPlaybookCache !== undefined) return _consultantPlaybookCache;
    const candidates = [
        path.join(__dirname, '..', '..', 'shared', 'consultant_playbook.md'),
        path.join(__dirname, 'consultant_playbook.md'),
    ];
    for (const p of candidates) {
        try {
            if (fs.existsSync(p)) {
                const raw = fs.readFileSync(p, 'utf8').trim();
                if (raw) {
                    _consultantPlaybookCache = `\n**FarmDash data playbook (always apply):**\n${raw}\n\n`;
                    return _consultantPlaybookCache;
                }
            }
        } catch {
            /* try next */
        }
    }
    _consultantPlaybookCache = '';
    return _consultantPlaybookCache;
}

function buildSystemPrompt(view, context) {
    const rules = isFieldMapView(view, context) ? BASE_JSON_RULES_FIELD_MAP : BASE_JSON_RULES;
    const playbook = loadConsultantDataPlaybook();
    return `You are an expert Farming Simulator 25 farm consultant. Analyze the JSON snapshot for the active farm only.
${playbook}${viewInstruction(view, context)}

${rules}`;
}

/** Legacy prompts asked for "Ben:/" style prefixes; strip so cards stay readable if the model still emits them. */
function stripLeadingMentorPrefix(text) {
    if (typeof text !== 'string') return text;
    const t = text.trim();
    const stripped = t.replace(/^[A-Za-z][A-Za-z0-9\s]{0,28}:\s*\/?\s*/, '').trim();
    return stripped || t;
}

/** Strip internal FS tokens and weed-level noise from consultant strings (matches Python _sanitize_consultant_user_copy). */
function sanitizeConsultantUserCopy(text) {
    if (typeof text !== 'string' || !text) return text;
    let s = text;
    s = s.replace(/\bweeds?\s*\(\s*level\s*\d+\s*\)/gi, 'weeds');
    s = s.replace(/\bweed\s*level\s*[:]?\s*\d+/gi, 'weeds');
    s = s.replace(/\bweeds?\s+at\s+level\s+\d+/gi, 'weeds');
    s = s.replace(/\bgrowth\s+label\s+['']?GROWTH_\d+/gi, 'growth stage');
    s = s.replace(/\bGROWTH_\d+\b/gi, 'early growth stage');
    s = s.replace(/\bmulched_fallow\b/gi, 'mulched stubble');
    s = s.replace(/\bneedsLime\s+is\s+true\b/gi, 'needs lime');
    s = s.replace(/\bneedsLime\s+is\s+false\b/gi, 'lime not flagged');
    s = s.replace(/\bisHarvested\s+is\s+true\b/gi, 'crop is harvested');
    s = s.replace(/\bneedsWork\s+is\s+false\b/gi, 'no urgent tillage pass flagged');
    s = s.replace(/\bneedsWork\s+is\s+true\b/gi, 'soil still wants work');
    const fillPlain = [
        [/DRYGRASS_WINDROW/gi, 'dried grass hay windrow'],
        [/WETGRASS_WINDROW/gi, 'wet grass windrow'],
        [/GRASS_WINDROW/gi, 'grass windrow'],
        [/DRYGRASS\b/gi, 'dried grass'],
        [/TOTAL_MIXED_RATION/gi, 'TMR'],
        [/PIGFOOD/gi, 'pig feed'],
    ];
    for (const [re, nice] of fillPlain) {
        s = s.replace(re, nice);
    }
    s = s.replace(/\bavailable\s+food\s+filllevel\b/gi, 'animal feed fill level');
    s = s.replace(/\bfilllevel\b/gi, 'fill level');
    s = s.replace(/\(\s*farmlandId\s*:\s*\d{1,7}\s*\)/gi, '');
    s = s.replace(/\bfarmlandId\s*:\s*\d{1,7}\b/gi, '');
    s = s.replace(/\bfield_?ref\s*:\s*\d{1,7}\b/gi, '');
    s = s.replace(/\b(\d+\.\d+)\b/g, (m, num) => {
        const v = parseFloat(num);
        if (!Number.isFinite(v)) return m;
        const r = Math.round(v * 10) / 10;
        if (Math.abs(r - Math.round(r)) < 1e-6) return String(Math.round(r));
        return r.toFixed(1);
    });
    s = s.replace(/\s{2,}/g, ' ').trim();
    return s;
}

function isLowQualityInsightBlob(message, reasoning) {
    const blob = `${String(message || '')}\n${String(reasoning || '')}`.toLowerCase();
    if (/full water tank/.test(blob) && /\b(check|verify|ensure|monitor)\b/.test(blob)) return true;
    if (/bale/.test(blob) && /pallet/.test(blob) && /trailer/.test(blob) && /water/.test(blob)) {
        if (/\b(check|verify|ensure|tank level)\b/.test(blob)) return true;
    }
    if (/\bwater(ing)?\b/.test(blob) && /\b(farmland|parcel)\b/.test(blob)) {
        if (blob.includes('available food') || blob.includes('sheep barn') || (blob.includes('barn') && blob.includes('fill')))
            return true;
    }
    if (blob.includes('available food') && blob.includes('farmland')) return true;
    if (/\b(soil\s+moisture|irrigation\s+needs?)\b/.test(blob)) return true;
    if (/\birrigate\b/.test(blob) && /\b(farmland|parcel|field)\b/.test(blob)) return true;
    return false;
}

/** LLMs sometimes echo schema/debug lines instead of gameplay tips — drop them. */
function isSchemaMetaInsight(text) {
    if (typeof text !== 'string' || text.length < 10) return false;
    const t = text.toLowerCase();
    if (/farmlandid\s+and\s+id\s+are\s+not\s+set/i.test(t)) return true;
    if (/not\s+set\s+for\s+all\s+fields/.test(t)) return true;
    if (/missing\s+field_ref/.test(t)) return true;
    if (/no\s+corresponding\s+farm\s+data/.test(t)) return true;
    if (t.includes('activefarmid') && (t.includes('field_ref') || t.includes('no corresponding'))) return true;
    return false;
}

const _ALLOWED_INSIGHT_CATEGORIES = new Set(['Field', 'Animal', 'Production', 'Finance']);

function normalizeInsightCategory(raw) {
    const s0 = String(raw == null ? '' : raw).trim();
    if (!s0) return 'Production';
    if (_ALLOWED_INSIGHT_CATEGORIES.has(s0)) return s0;
    if (s0.includes('|')) {
        const parts = s0
            .split('|')
            .map((p) => p.trim())
            .filter(Boolean);
        for (const p of parts) {
            const t = p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
            if (_ALLOWED_INSIGHT_CATEGORIES.has(t)) return t;
        }
    }
    const t = s0.charAt(0).toUpperCase() + s0.slice(1).toLowerCase();
    if (_ALLOWED_INSIGHT_CATEGORIES.has(t)) return t;
    return 'Production';
}

function barnFeedInsightBlobIsGarbage(ins) {
    const blob = `${String(ins && ins.message ? ins.message : '')}\n${String(ins && ins.reasoning ? ins.reasoning : '')}`.toLowerCase();
    if (!blob.trim()) return false;
    if (/\bfill\s+level\s+is\s+at\s+\d{4,}\b/.test(blob) && /\b(low\s+(supply|hay|feed)|indicates\s+low|needs?\s+(more\s+)?feed)\b/.test(blob))
        return true;
    if (/\bdried\s+grass\s+hay\s+windrow\b/.test(blob) && /\b\d{4,}\b/.test(blob) && /\b(low\s+supply|indicates\s+low|check\s+food)\b/.test(blob))
        return true;
    return false;
}

function vehiclesTabInsightBlobIsGarbage(ins) {
    const blob = `${String(ins && ins.message ? ins.message : '')}\n${String(ins && ins.reasoning ? ins.reasoning : '')}`.toLowerCase();
    if (!blob.trim()) return false;
    if (/\brefuel\b/.test(blob) && /\bunknown\b/.test(blob)) return true;
    if (/\brefuel\b/.test(blob) && /\bnon-zero\b/.test(blob) && /\bdiesel\b/.test(blob) && /\bpartially\s+fuel/i.test(blob))
        return true;
    if (/\bfill\s*level\b/.test(blob) && /\bindicating\b/.test(blob)) return true;
    if (/\bnon-empty\b/.test(blob) && /\bunknown\b/.test(blob) && /\bfill\b/.test(blob)) return true;
    if (/\b(load|stack|move)\b/.test(blob) && /\b(hay|straw|bales?|silage)\b/.test(blob) && /\b(trailer|wagon|truck|transport)\b/.test(blob))
        return true;
    if (/\btransport\s+the\s+bales\b/.test(blob)) return true;
    return false;
}

/** Vehicles tab Smart suggestions: fleet care only (no field rows, parcel refs, hay logistics, bogus refuel). */
function filterInsightsForVehiclesView(insights) {
    if (!Array.isArray(insights)) return [];
    return insights.filter((ins) => {
        if (!ins || typeof ins !== 'object') return false;
        const cat = String(ins.category || '')
            .trim()
            .toLowerCase();
        if (cat === 'field') return false;
        const frRaw = ins.field_ref != null ? ins.field_ref : ins.fieldRef;
        const fr = frRaw != null ? String(frRaw).trim() : '';
        if (fr) return false;
        if (vehiclesTabInsightBlobIsGarbage(ins)) return false;
        return true;
    });
}

function sanitizeConsultantInsights(insights, view, context) {
    if (!Array.isArray(insights)) return [];
    const skipLowQualityDrop = isFieldMapView(view, context);
    return insights
        .filter((ins) => {
            if (!ins || typeof ins !== 'object') return false;
            const m = typeof ins.message === 'string' ? ins.message : '';
            const r = typeof ins.reasoning === 'string' ? ins.reasoning : '';
            return !isSchemaMetaInsight(m) && !isSchemaMetaInsight(r);
        })
        .map((ins) => {
            const next = { ...ins };
            next.category = normalizeInsightCategory(next.category);
            const preserveMentor = isFieldMapView(view, context);
            if (typeof next.message === 'string') {
                const m0 = preserveMentor ? next.message : stripLeadingMentorPrefix(next.message);
                next.message = sanitizeConsultantUserCopy(m0);
            }
            if (typeof next.reasoning === 'string') {
                const r0 = preserveMentor ? next.reasoning : stripLeadingMentorPrefix(next.reasoning);
                next.reasoning = sanitizeConsultantUserCopy(r0);
            }
            return next;
        })
        .filter((ins) => {
            const m = typeof ins.message === 'string' ? ins.message : '';
            const r = typeof ins.reasoning === 'string' ? ins.reasoning : '';
            if (barnFeedInsightBlobIsGarbage(ins)) return false;
            if (skipLowQualityDrop) return true;
            if (!String(m).trim()) return false;
            if (isLowQualityInsightBlob(m, r)) return false;
            return true;
        });
}

function consultantLlmTemperature(view, context) {
    return isFieldMapView(view, context) ? 0.22 : 0.35;
}

/** Drop heavy field keys before Ollama; keeps prompts within num_ctx. */
function slimFieldsList(fields) {
    if (!Array.isArray(fields)) return [];
    const out = [];
    for (const row of fields) {
        const s = slimFieldForConsultantLlm(row);
        if (s) out.push(s);
    }
    return out;
}

function slimVehiclesList(vehicles) {
    if (!Array.isArray(vehicles)) return [];
    const out = [];
    for (const row of vehicles) {
        const s = slimVehicleForConsultantLlm(row);
        if (s) out.push(s);
    }
    return out;
}

function slimAnimalsList(animals) {
    if (!Array.isArray(animals)) return [];
    const out = [];
    for (const row of animals) {
        const s = slimAnimalForConsultantLlm(row);
        if (s) out.push(s);
    }
    return out;
}

function slimPasturesList(pastures) {
    if (!Array.isArray(pastures)) return [];
    const out = [];
    for (const row of pastures) {
        const s = slimPastureForConsultantLlm(row);
        if (s) out.push(s);
    }
    return out;
}

function slimSnapshotForOllama(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return snapshot;
    const o = JSON.parse(JSON.stringify(snapshot));
    if (Array.isArray(o.fields)) {
        o.fields = slimFieldsList(o.fields);
    }
    if (Array.isArray(o.vehicles)) {
        o.vehicles = slimVehiclesList(o.vehicles);
    }
    if (Array.isArray(o.animals)) {
        o.animals = slimAnimalsList(o.animals);
    }
    if (Array.isArray(o.pastures)) {
        o.pastures = slimPasturesList(o.pastures);
    }
    if (o.production && typeof o.production === 'object') {
        o.production = slimProductionForConsultantLlm(o.production, 8);
    }
    if (Array.isArray(o.productionPoints)) {
        o.productionPoints = o.productionPoints.slice(0, 12);
    }
    return o;
}

function truncateSnapshotString(s, max) {
    if (s.length <= max) return s;
    return `${s.slice(0, max)}\n…truncated (${s.length} chars)`;
}

/** @param {object} payload */
function prepareSnapshotPayload(payload, view, context) {
    const o = JSON.parse(JSON.stringify(payload));
    const ctx = String(context || '').toLowerCase();
    const v = String(view || '').toLowerCase();
    if (o._single_field_mode) {
        return o;
    }
    if (ctx === 'fields' && v === 'fields' && Array.isArray(o.fields) && o.fields.length > MAX_FIELD_MAP_ROWS) {
        o.fields = o.fields.slice(0, MAX_FIELD_MAP_ROWS);
        o._consultant_truncated_fields = true;
    }
    return o;
}

/**
 * Strip markdown fences and extract the first balanced `{ ... }` object.
 * Greedy `/\{[\s\S]*\}/` breaks on nested objects; trailing prose after valid JSON breaks `JSON.parse(full)`.
 */
function extractJsonObject(text) {
    let t = String(text || '').trim();
    t = t.replace(/^```(?:json)?\s*/i, '');
    t = t.replace(/\s*```\s*$/s, '');
    t = t.trim();

    try {
        return JSON.parse(t);
    } catch (_) {
        /* continue */
    }

    const start = t.indexOf('{');
    if (start < 0) {
        throw new Error('Model did not return valid JSON (no object)');
    }

    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < t.length; i++) {
        const c = t[i];
        if (inStr) {
            if (esc) {
                esc = false;
            } else if (c === '\\') {
                esc = true;
            } else if (c === '"') {
                inStr = false;
            }
        } else {
            if (c === '"') {
                inStr = true;
            } else if (c === '{') {
                depth += 1;
            } else if (c === '}') {
                depth -= 1;
                if (depth === 0) {
                    const slice = t.slice(start, i + 1);
                    try {
                        return JSON.parse(slice);
                    } catch (e2) {
                        throw new Error(`Model JSON parse failed: ${e2 && e2.message ? e2.message : e2}`);
                    }
                }
            }
        }
    }
    throw new Error('Model did not return valid JSON (unclosed object)');
}

function normalizeOpenAiCompatBase(raw) {
    let s = String(raw || '')
        .trim()
        .replace(/\/$/, '');
    if (!s) return '';
    if (!/^https?:\/\//i.test(s)) {
        s = `http://${s}`;
    }
    return s.toLowerCase().includes('/v1') ? s : `${s}/v1`;
}

/** Use smaller snapshot for self-hosted OpenAI-compatible APIs; full MAX_SNAPSHOT_CHARS_OPENAI for api.openai.com only. */
function openAiCompatSnapshotCharCap(openaiBaseUrl) {
    try {
        const b = normalizeOpenAiCompatBase(openaiBaseUrl);
        if (!b) return MAX_SNAPSHOT_CHARS_OPENAI;
        const origin = b.replace(/\/v1\/?$/i, '');
        const host = new URL(origin).hostname.toLowerCase();
        if (host === 'api.openai.com') return MAX_SNAPSHOT_CHARS_OPENAI;
    } catch {
        /* fall through */
    }
    return Math.min(MAX_SNAPSHOT_CHARS_OPENAI, MAX_SNAPSHOT_CHARS_OPENAI_COMPAT);
}

/**
 * @param {{ preferJsonObjectFormat?: boolean }} [options]
 */
async function callOpenAiChat(system, userText, apiKey, modelId, openaiBaseUrl, maxTokensOpt, temperatureOpt, options) {
    const preferJsonObjectFormat = !options || options.preferJsonObjectFormat !== false;
    const model = (modelId && String(modelId).trim()) || OPENAI_MODEL;
    const base = normalizeOpenAiCompatBase(openaiBaseUrl);
    const url = base ? `${base}/chat/completions` : 'https://api.openai.com/v1/chat/completions';
    const authKey = (apiKey && String(apiKey).trim()) || 'ollama';
    const maxTok =
        maxTokensOpt != null && Number.isFinite(Number(maxTokensOpt)) ? Math.max(256, Number(maxTokensOpt)) : 4096;
    const temp =
        temperatureOpt != null && Number.isFinite(Number(temperatureOpt))
            ? Math.min(1, Math.max(0, Number(temperatureOpt)))
            : 0.35;
    const messages = [
        { role: 'system', content: system },
        { role: 'user', content: `Farm snapshot JSON:\n${userText}` },
    ];
    const payloadWithFormat = {
        model,
        temperature: temp,
        max_tokens: maxTok,
        response_format: { type: 'json_object' },
        messages,
    };
    const payloadPlain = {
        model,
        temperature: temp,
        max_tokens: maxTok,
        messages,
    };
    const fetchInitBase = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authKey}`,
        },
    };
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
        fetchInitBase.signal = AbortSignal.timeout(LOCAL_BYOK_FETCH_TIMEOUT_MS);
    }

    const post = async (payload) => {
        try {
            const r = await fetch(url, {
                ...fetchInitBase,
                body: JSON.stringify(payload),
            });
            const txt = await r.text();
            return { r, txt };
        } catch (err) {
            if (isAbortError(err)) {
                throw byokError('OpenAI-compatible: request timed out', 'timeout');
            }
            if (err && err.farmdash_ai_error) throw err;
            throw byokError(`OpenAI-compatible: ${err && err.message ? err.message : err}`, 'network_error');
        }
    };

    let isCloudOpenAiHost = false;
    if (base) {
        try {
            const origin = base.replace(/\/v1\/?$/i, '');
            isCloudOpenAiHost = new URL(origin).hostname.toLowerCase() === 'api.openai.com';
        } catch {
            /* self-hosted / odd URL — not cloud */
        }
    }

    let payloadFirst = preferJsonObjectFormat ? payloadWithFormat : payloadPlain;
    let { r, txt } = await post(payloadFirst);
    /** Ollama/LM Studio/vLLM may reject `response_format` with 404/500/etc.; cloud OpenAI uses 400/422. */
    const retryWithoutJsonObjectFormat =
        !r.ok &&
        preferJsonObjectFormat &&
        base &&
        (isCloudOpenAiHost ? r.status === 400 || r.status === 422 : r.status >= 400);
    if (retryWithoutJsonObjectFormat) {
        const second = await post(payloadPlain);
        r = second.r;
        txt = second.txt;
    }
    if (!r.ok) {
        throw byokError(`OpenAI HTTP ${r.status}: ${txt.slice(0, 400)}`, `http_${r.status}`);
    }
    let data;
    try {
        data = JSON.parse(txt);
    } catch (pe) {
        throw byokError(`OpenAI: invalid JSON in response body: ${pe && pe.message ? pe.message : pe}`, 'protocol_error');
    }
    const out = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!out) throw byokError('OpenAI: empty response', 'empty_response');
    return String(out);
}

/**
 * JSON mode first; on parse failure, one completion without `response_format` (mirrors Python retry).
 */
async function completeOpenAiConsultantJson(
    system,
    userText,
    apiKey,
    modelId,
    openaiBaseUrl,
    maxTokensOpt,
    temperatureOpt
) {
    let raw = await callOpenAiChat(system, userText, apiKey, modelId, openaiBaseUrl, maxTokensOpt, temperatureOpt, {
        preferJsonObjectFormat: true,
    });
    try {
        return extractJsonObject(raw);
    } catch {
        raw = await callOpenAiChat(system, userText, apiKey, modelId, openaiBaseUrl, maxTokensOpt, temperatureOpt, {
            preferJsonObjectFormat: false,
        });
        try {
            return extractJsonObject(raw);
        } catch (e2) {
            throw byokError(
                `Model did not return valid JSON after retry: ${e2 && e2.message ? e2.message : e2}`,
                'parse_failed'
            );
        }
    }
}

/**
 * @param {{ preferJsonMime?: boolean }} [options]
 */
async function callGeminiGenerate(system, userText, apiKey, modelId, temperatureOpt, options) {
    const preferJsonMime = !options || options.preferJsonMime !== false;
    const mid = modelId != null ? modelId : GEMINI_MODEL;
    const temp =
        temperatureOpt != null && Number.isFinite(Number(temperatureOpt))
            ? Math.min(1, Math.max(0, Number(temperatureOpt)))
            : 0.35;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        mid
    )}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const generationConfig = {
        temperature: temp,
        maxOutputTokens: 8192,
    };
    if (preferJsonMime) {
        generationConfig.responseMimeType = 'application/json';
    }
    const fetchInit = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ parts: [{ text: `Farm snapshot JSON:\n${userText}` }] }],
            generationConfig,
        }),
    };
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
        fetchInit.signal = AbortSignal.timeout(LOCAL_BYOK_FETCH_TIMEOUT_MS);
    }
    let r;
    let txt;
    try {
        r = await fetch(url, fetchInit);
        txt = await r.text();
    } catch (err) {
        if (isAbortError(err)) {
            throw byokError('Gemini: request timed out', 'timeout');
        }
        if (err && err.farmdash_ai_error) throw err;
        throw byokError(`Gemini: ${err && err.message ? err.message : err}`, 'network_error');
    }
    if (!r.ok) {
        throw byokError(`Gemini HTTP ${r.status}: ${txt.slice(0, 400)}`, `http_${r.status}`);
    }
    let data;
    try {
        data = JSON.parse(txt);
    } catch (pe) {
        throw byokError(`Gemini: invalid JSON in response body: ${pe && pe.message ? pe.message : pe}`, 'protocol_error');
    }
    const parts = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
    const out = parts && parts[0] && parts[0].text;
    if (!out) throw byokError('Gemini: empty response', 'empty_response');
    return String(out);
}

async function completeGeminiConsultantJson(system, userText, apiKey, modelId, temperatureOpt) {
    let raw = await callGeminiGenerate(system, userText, apiKey, modelId, temperatureOpt, { preferJsonMime: true });
    try {
        return extractJsonObject(raw);
    } catch {
        raw = await callGeminiGenerate(system, userText, apiKey, modelId, temperatureOpt, { preferJsonMime: false });
        try {
            return extractJsonObject(raw);
        } catch (e2) {
            throw byokError(
                `Model did not return valid JSON after retry: ${e2 && e2.message ? e2.message : e2}`,
                'parse_failed'
            );
        }
    }
}

/**
 * @param {{ snapshot: object, view: string, context: string, provider: 'openai'|'gemini', apiKey: string, modelId?: string, openaiBaseUrl?: string }} opts
 * @returns {Promise<{ insights: object[], llm_used: boolean, detail?: string }>}
 */
async function runByokConsultantLlm(opts) {
    const { snapshot, view, context, provider, apiKey, modelId, openaiBaseUrl } = opts;
    const hasBase = !!(openaiBaseUrl && String(openaiBaseUrl).trim());
    if ((!apiKey || !String(apiKey).trim()) && !hasBase) {
        throw new Error('Missing API key or OpenAI-compatible base URL');
    }
    const snapForPrompt =
        snapshot && typeof snapshot === 'object'
            ? applyLocalConsultantPayloadDiet(snapshot, {
                  localCompatHeavyStrip: !!opts.localCompatHeavyStrip,
                  maxJsonChars: opts.localMaxJsonChars,
              })
            : snapshot;
    const prep = prepareSnapshotPayload(snapForPrompt, view, context);
    const max =
        provider === 'gemini'
            ? MAX_SNAPSHOT_CHARS_GEMINI
            : openaiBaseUrl && String(openaiBaseUrl).trim()
              ? openAiCompatSnapshotCharCap(openaiBaseUrl)
              : MAX_SNAPSHOT_CHARS_OPENAI;
    const userJson = truncateSnapshotString(JSON.stringify(prep), max);
    const system = buildSystemPrompt(view, context);
    const temp = consultantLlmTemperature(view, context);

    const mid = modelId && String(modelId).trim() ? String(modelId).trim() : '';
    /** Cloud OpenAI: default gpt-4o-mini inside callOpenAiChat. Local /v1 servers: must not use that default. */
    let openaiChatModel = mid;
    if (!openaiChatModel && provider !== 'gemini') {
        const base = openaiBaseUrl && String(openaiBaseUrl).trim();
        if (base) {
            openaiChatModel = LOCAL_OPENAI_COMPAT_DEFAULT_MODEL;
        }
    }
    const parsed =
        provider === 'gemini'
            ? await completeGeminiConsultantJson(system, userJson, apiKey, mid || null, temp)
            : await completeOpenAiConsultantJson(
                  system,
                  userJson,
                  apiKey,
                  openaiChatModel || null,
                  openaiBaseUrl || null,
                  undefined,
                  temp
              );
    let insights = sanitizeConsultantInsights(
        Array.isArray(parsed.insights) ? parsed.insights : [],
        view,
        context
    );
    if (String(view || '').toLowerCase() === 'vehicles') {
        insights = filterInsightsForVehiclesView(insights);
    }
    return {
        insights,
        llm_used: true,
        detail: parsed.detail,
    };
}

const SHARD_JSON_RULES_DEFAULT = `Reply with ONLY JSON. One literal **category** per row (Field, Animal, Production, or Finance — never pipe-separated):
{"insights":[{"category":"Field","priority":"High","message":"...","reasoning":"...","field_ref":"12"}]}
category Field → set field_ref to farmlandId or id. Plain English messages; no "Name:/" prefixes.
Never complain about missing JSON keys, farmlandId, field_ref, or activeFarmId in the message text — only gameplay advice.
${BYOK_ACTIONABILITY_RULES}`;

const SHARD_JSON_RULES_FIELD_MAP = `Reply with ONLY JSON. **Field map:** one insight per object in this shard's **fields[]**, same order and count. category Field; field_ref = farmlandId or id; reasoning "" every row.
Each **message** starts with **Ben:** / **Walter:** / **David:** / **Katie:** / **Noah:** or **Hank:** then one farmer sentence — **never** JSON-debug style ("needsLime is true", "phValue of", "growthLabel '", "isHarvested is true", bare "21 with pH").
Never complain about missing JSON keys in the message text — only gameplay advice.
${BYOK_ACTIONABILITY_RULES}`;

function ollamaShardViewBlurb(view, context) {
    const v = String(view || 'home').toLowerCase();
    const ctx = String(context || '').toLowerCase();
    if (ctx === 'fields' && v === 'fields') {
        return 'FIELD MAP: One insight per field row, mentor voice (Name: …), plain farmer English — no JSON key dumps.';
    }
    const map = {
        home: 'Pick the most urgent actionable items visible in this shard.',
        fields: 'Crops/soil/harvest; use field_ref for a specific parcel.',
        vehicles: 'Fleet only — no field harvest/spray/plant jobs.',
        pastures: 'Pastures and grazing.',
        livestock: 'Barn animals.',
        productions: 'Production chains.',
        economy: 'Only use inventory/finance shown in JSON.',
    };
    return map[v] || map.home;
}

function chunkArray(arr, size) {
    if (!Array.isArray(arr) || size < 1) return [];
    const out = [];
    for (let i = 0; i < arr.length; i += size) {
        out.push(arr.slice(i, i + size));
    }
    return out;
}

function baseShardMeta(snap) {
    const o = snap && typeof snap === 'object' ? snap : {};
    return {
        activeFarmId: o.activeFarmId,
        _consultant_farm_scope: o._consultant_farm_scope,
        _prunedView: o._prunedView,
        gameTime: o.gameTime,
        timestamp: o.timestamp,
        _field_map_mode: o._field_map_mode,
    };
}

function buildOllamaShardSystemPrompt(view, context, shardLabel, shardIndex, shardTotal) {
    const v = String(view || 'home').toLowerCase();
    const ctx = String(context || '').toLowerCase();
    const fieldMap = ctx === 'fields' && v === 'fields';
    const blurb = ollamaShardViewBlurb(view, context);
    const tail = fieldMap
        ? `Insights count must equal fields.length in this JSON.`
        : `At most 3 insights for this response.`;
    const shardRules = fieldMap ? SHARD_JSON_RULES_FIELD_MAP : SHARD_JSON_RULES_DEFAULT;
    return `FS25 farm consultant — shard "${shardLabel}" (${shardIndex + 1}/${shardTotal}). User message is JSON only.

${blurb}

${shardRules}
${tail}`;
}

/**
 * Split pruned snapshot into several small payloads so each Ollama request stays under num_ctx.
 */
function buildOllamaShards(pruned, view, context) {
    const v = String(view || 'home').toLowerCase();
    const ctx = String(context || '').toLowerCase();
    const meta = baseShardMeta(pruned);
    const shards = [];

    if (ctx === 'fields' && v === 'fields') {
        const fields = slimFieldsList(Array.isArray(pruned.fields) ? pruned.fields : []);
        const batches = chunkArray(fields, OLLAMA_FIELD_MAP_BATCH);
        const vehSlim = slimVehiclesList(
            Array.isArray(pruned.vehicles) ? pruned.vehicles.slice(0, 12) : []
        );
        for (let b = 0; b < batches.length; b++) {
            shards.push({
                label: `field map ${b + 1}/${batches.length}`,
                snapshot: {
                    ...meta,
                    fields: batches[b],
                    vehicles: vehSlim,
                    _field_map_mode: true,
                },
            });
        }
        return shards.length ? shards : [{ label: 'field map', snapshot: slimSnapshotForOllama(pruned) }];
    }

    if (v === 'fields') {
        const fields = slimFieldsList(Array.isArray(pruned.fields) ? pruned.fields : []);
        const batches = chunkArray(fields, OLLAMA_FIELDS_VIEW_BATCH);
        const vehSlim = slimVehiclesList(
            Array.isArray(pruned.vehicles) ? pruned.vehicles.slice(0, 16) : []
        );
        for (let b = 0; b < batches.length; b++) {
            shards.push({
                label: `fields ${b + 1}/${batches.length}`,
                snapshot: { ...meta, fields: batches[b], vehicles: vehSlim },
            });
        }
        return shards.length ? shards : [{ label: 'fields', snapshot: slimSnapshotForOllama(pruned) }];
    }

    if (v === 'vehicles') {
        const veh = Array.isArray(pruned.vehicles) ? pruned.vehicles : [];
        if (veh.length === 0) {
            return [{ label: 'fleet', snapshot: slimSnapshotForOllama(pruned) }];
        }
        if (veh.length <= 16) {
            return [{ label: 'fleet', snapshot: slimSnapshotForOllama(pruned) }];
        }
        const batches = chunkArray(veh, 12);
        for (let b = 0; b < batches.length; b++) {
            shards.push({
                label: `vehicles ${b + 1}/${batches.length}`,
                snapshot: { ...meta, vehicles: slimVehiclesList(batches[b]) },
            });
        }
        return shards;
    }

    if (v === 'livestock') {
        const animals = Array.isArray(pruned.animals) ? pruned.animals : [];
        if (animals.length === 0) {
            return [{ label: 'livestock', snapshot: slimSnapshotForOllama(pruned) }];
        }
        if (animals.length <= 10) {
            return [{ label: 'livestock', snapshot: slimSnapshotForOllama(pruned) }];
        }
        const batches = chunkArray(animals, 8);
        for (let b = 0; b < batches.length; b++) {
            shards.push({
                label: `animals ${b + 1}/${batches.length}`,
                snapshot: { ...meta, animals: slimAnimalsList(batches[b]) },
            });
        }
        return shards;
    }

    if (v === 'pastures') {
        const past = Array.isArray(pruned.pastures) ? pruned.pastures : [];
        const anim = Array.isArray(pruned.animals) ? pruned.animals : [];
        if (past.length === 0) {
            return [{ label: 'pastures', snapshot: slimSnapshotForOllama(pruned) }];
        }
        if (past.length <= 5) {
            return [{ label: 'pastures', snapshot: slimSnapshotForOllama(pruned) }];
        }
        const batches = chunkArray(past, 4);
        for (let b = 0; b < batches.length; b++) {
            shards.push({
                label: `pastures ${b + 1}/${batches.length}`,
                snapshot: {
                    ...meta,
                    pastures: slimPasturesList(batches[b]),
                    animals: slimAnimalsList(anim.slice(0, 16)),
                },
            });
        }
        return shards;
    }

    if (v === 'productions') {
        const prod = pruned.production && typeof pruned.production === 'object' ? pruned.production : {};
        const chains = Array.isArray(prod.chains) ? prod.chains : [];
        if (chains.length === 0) {
            return [{ label: 'production', snapshot: slimSnapshotForOllama(pruned) }];
        }
        if (chains.length <= 5) {
            return [{ label: 'production', snapshot: slimSnapshotForOllama(pruned) }];
        }
        const batches = chunkArray(chains, 4);
        for (let b = 0; b < batches.length; b++) {
            shards.push({
                label: `chains ${b + 1}/${batches.length}`,
                snapshot: {
                    ...meta,
                    production: slimProductionForConsultantLlm({ ...prod, chains: batches[b] }, batches[b].length),
                },
            });
        }
        return shards;
    }

    if (v === 'economy') {
        return [
            {
                label: 'economy-held-prices',
                snapshot: {
                    ...meta,
                    _consultant_held_fill_types: pruned._consultant_held_fill_types,
                    _consultant_finance_facts: pruned._consultant_finance_facts,
                    _consultant_economy_inventory_scope: pruned._consultant_economy_inventory_scope,
                    economy: pruned.economy,
                    money: pruned.money,
                    finance: pruned.finance,
                },
            },
            {
                label: 'economy-fields-production',
                snapshot: {
                    ...meta,
                    fields: slimFieldsList(Array.isArray(pruned.fields) ? pruned.fields.slice(0, 28) : []),
                    production: slimProductionForConsultantLlm(pruned.production, 6),
                    productionPoints: Array.isArray(pruned.productionPoints)
                        ? pruned.productionPoints.slice(0, 12)
                        : pruned.productionPoints,
                },
            },
        ];
    }

    const fields = slimFieldsList(Array.isArray(pruned.fields) ? pruned.fields : []);
    const vehicles = slimVehiclesList((pruned.vehicles || []).slice(0, 16));
    const animals = slimAnimalsList((pruned.animals || []).slice(0, 12));
    const pastures = slimPasturesList((pruned.pastures || []).slice(0, 8));
    const prod = pruned.production;
    const slimProd =
        prod && typeof prod === 'object' ? slimProductionForConsultantLlm(prod, 6) : prod;

    shards.push({ label: 'crops', snapshot: { ...meta, fields: fields.slice(0, 10) } });
    shards.push({ label: 'fleet', snapshot: { ...meta, vehicles } });
    shards.push({ label: 'herd', snapshot: { ...meta, animals } });
    shards.push({
        label: 'pastures-weather',
        snapshot: { ...meta, pastures, weather: pruned.weather },
    });
    shards.push({ label: 'production', snapshot: { ...meta, production: slimProd } });
    return shards;
}

function priorityRank(p) {
    const s = String(p || '')
        .toLowerCase()
        .trim();
    if (s === 'high') return 0;
    if (s === 'medium') return 1;
    if (s === 'low') return 2;
    return 3;
}

function mergeShardInsights(insights, view, context) {
    const v = String(view || 'home').toLowerCase();
    const ctx = String(context || '').toLowerCase();
    let list = Array.isArray(insights) ? insights.filter((x) => x && typeof x === 'object') : [];
    if (v === 'vehicles') {
        list = filterInsightsForVehiclesView(list);
    }
    list.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));

    let cap = 6;
    if (ctx === 'fields' && v === 'fields') {
        cap = 80;
    } else if (v === 'home') {
        cap = 3;
    } else if (v === 'vehicles') {
        cap = 3;
    } else if (v === 'fields' || v === 'pastures' || v === 'livestock' || v === 'productions') {
        cap = 4;
    } else if (v === 'economy') {
        cap = 4;
    }

    return list.slice(0, cap);
}

/**
 * Single Ollama request using the same compact system prompt + JSON cap as multi-shard calls,
 * so we never send BASE_JSON_RULES + huge user JSON (which exceeded num_ctx and caused truncation).
 */
async function runByokConsultantLlmOllamaCompact(opts) {
    const { snapshot, view, context, apiKey, modelId, openaiBaseUrl } = opts;
    const mid =
        modelId && String(modelId).trim()
            ? String(modelId).trim()
            : LOCAL_OPENAI_COMPAT_DEFAULT_MODEL;
    const snapForPrompt =
        snapshot && typeof snapshot === 'object'
            ? applyLocalConsultantPayloadDiet(snapshot, {
                  localCompatHeavyStrip: !!opts.localCompatHeavyStrip,
                  maxJsonChars: opts.localMaxJsonChars,
              })
            : snapshot;
    const prep = prepareSnapshotPayload(snapForPrompt, view, context);
    const userJson = truncateSnapshotString(JSON.stringify(prep), OLLAMA_SHARD_MAX_JSON_CHARS);
    const system = buildOllamaShardSystemPrompt(view, context, 'full', 0, 1);
    const v = String(view || 'home').toLowerCase();
    const ctx = String(context || '').toLowerCase();
    const nFields = Array.isArray(prep.fields) ? prep.fields.length : 0;
    let maxTok = 768;
    if (ctx === 'fields' && v === 'fields' && prep._field_map_mode) {
        maxTok = Math.min(1536, 128 + nFields * 140);
    } else if (v === 'home') {
        maxTok = 512;
    }
    const shardTemp =
        ctx === 'fields' && v === 'fields' && prep._field_map_mode
            ? consultantLlmTemperature(view, context)
            : 0.35;
    const parsed = await completeOpenAiConsultantJson(
        system,
        userJson,
        apiKey,
        mid,
        openaiBaseUrl,
        maxTok,
        shardTemp
    );
    let insights = sanitizeConsultantInsights(
        Array.isArray(parsed.insights) ? parsed.insights : [],
        view,
        context
    );
    if (v === 'vehicles') {
        insights = filterInsightsForVehiclesView(insights);
    }
    return {
        insights,
        llm_used: true,
        detail: parsed.detail,
    };
}

/**
 * Several small /v1/chat/completions calls (Ollama on LAN) — fits default num_ctx; merge insights.
 */
async function runByokConsultantLlmOllamaSharded(opts) {
    const { snapshot, view, context, apiKey, modelId, openaiBaseUrl } = opts;
    const hasBase = !!(openaiBaseUrl && String(openaiBaseUrl).trim());
    if (!hasBase) {
        return runByokConsultantLlm(opts);
    }

    const mid =
        modelId && String(modelId).trim()
            ? String(modelId).trim()
            : LOCAL_OPENAI_COMPAT_DEFAULT_MODEL;

    const snapForShards =
        snapshot && typeof snapshot === 'object'
            ? applyLocalConsultantPayloadDiet(snapshot, {
                  localCompatHeavyStrip: !!opts.localCompatHeavyStrip,
                  maxJsonChars: opts.localMaxJsonChars,
              })
            : snapshot;

    const shards = buildOllamaShards(snapForShards, view, context);
    if (shards.length <= 1) {
        const snap = shards[0]?.snapshot
            ? shards[0].snapshot
            : slimSnapshotForOllama(snapForShards);
        return runByokConsultantLlmOllamaCompact({ ...opts, snapshot: snap });
    }

    const v = String(view || 'home').toLowerCase();
    const ctx = String(context || '').toLowerCase();

    const all = [];
    for (let i = 0; i < shards.length; i += OLLAMA_SHARD_CONCURRENCY) {
        const wave = shards.slice(i, i + OLLAMA_SHARD_CONCURRENCY);
        const waveResults = await Promise.all(
            wave.map(async (sh, j) => {
                const idx = i + j;
                let prep = prepareSnapshotPayload(sh.snapshot, view, context);
                if (opts.localCompatHeavyStrip) {
                    prep = applyLocalConsultantPayloadDiet(prep, {
                        localCompatHeavyStrip: true,
                        maxJsonChars: opts.localMaxJsonChars,
                    });
                }
                const userJson = truncateSnapshotString(JSON.stringify(prep), OLLAMA_SHARD_MAX_JSON_CHARS);
                const system = buildOllamaShardSystemPrompt(view, context, sh.label, idx, shards.length);
                const shardTemp =
                    sh.snapshot && sh.snapshot._field_map_mode === true
                        ? consultantLlmTemperature(view, context)
                        : 0.35;
                const nFields = sh.snapshot && Array.isArray(sh.snapshot.fields) ? sh.snapshot.fields.length : 0;
                let maxTok = 768;
                if (ctx === 'fields' && v === 'fields' && sh.snapshot && sh.snapshot._field_map_mode) {
                    maxTok = Math.min(1536, 128 + nFields * 140);
                } else if (v === 'home') {
                    maxTok = 512;
                }
                const parsed = await completeOpenAiConsultantJson(
                    system,
                    userJson,
                    apiKey,
                    mid,
                    openaiBaseUrl,
                    maxTok,
                    shardTemp
                );
                return sanitizeConsultantInsights(
                    Array.isArray(parsed.insights) ? parsed.insights : [],
                    view,
                    context
                );
            })
        );
        for (const part of waveResults) {
            all.push(...part);
        }
    }

    return {
        insights: sanitizeConsultantInsights(mergeShardInsights(all, view, context), view, context),
        llm_used: true,
    };
}

module.exports = {
    runByokConsultantLlm,
    runByokConsultantLlmOllamaSharded,
    OPENAI_MODEL,
    GEMINI_MODEL,
    LOCAL_OPENAI_COMPAT_DEFAULT_MODEL,
    MAX_SNAPSHOT_CHARS_OPENAI_COMPAT,
};
