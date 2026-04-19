/**
 * FS25 FarmDashboard — Smart suggestions via BYOK (OpenAI / Gemini) on this PC only.
 * Does not call a hosted AI Farm Manager server; keys never leave except to the chosen provider.
 *
 * Gemini: we do not fall back to `gemini-1.5-flash` — Google has retired that model family for new
 * projects; use `gemini-2.0-flash` (default) or set FARMDASH_BYOK_GEMINI_MODEL to a current model id
 * from the Gemini API docs.
 */

const OPENAI_MODEL = process.env.FARMDASH_BYOK_OPENAI_MODEL || 'gpt-4o-mini';
/** Default; override if Google renames — do not use deprecated 1.5 Flash. */
const GEMINI_MODEL = process.env.FARMDASH_BYOK_GEMINI_MODEL || 'gemini-2.0-flash';
/**
 * When provider is OpenAI-compatible (Ollama, LM Studio, vLLM…) and no model is saved, use this id.
 * Override with env e.g. `llama3.2:latest` or `mistral` if your server has no tagless name.
 */
const LOCAL_OPENAI_COMPAT_DEFAULT_MODEL =
    process.env.FARMDASH_BYOK_LOCAL_MODEL || 'llama3.2';

const MAX_SNAPSHOT_CHARS_OPENAI = 118000;
const MAX_SNAPSHOT_CHARS_GEMINI = 65000;
const MAX_FIELD_MAP_ROWS = 80;

const BASE_JSON_RULES = `You MUST respond with ONLY valid JSON (no markdown fences) in this exact shape:
{"insights":[{"category":"Field|Animal|Production|Finance","priority":"Low|Medium|High","message":"...","reasoning":"...","field_ref":null}]}

Rules:
- category Field — only for parcel-specific tips; set field_ref to that parcel's farmlandId or id (number or string). Omit or null for general tips.
- priority must be exactly Low, Medium, or High (spell Medium in full).
- Never write "weed level" or numeric weed severity — say weeds / needs spraying.
- Grass/meadow forage: never assign a grain combine; use mower/baler/forage harvester language.
- Late growth + weeds: herbicide/sprayer not mechanical weeder.
- Use vehicles from JSON only for this farm (ownerFarmId matches activeFarmId); do not tell players to buy a machine when a suitable one is listed.
- Keep message and reasoning brief.`;

function viewInstruction(view, context) {
    const v = String(view || 'home').toLowerCase();
    const ctx = String(context || '').toLowerCase();

    if (ctx === 'fields' && v === 'fields') {
        return `FIELD MAP MODE: You MUST output exactly ONE insight per field object in the JSON "fields" array (same length as fields.length). Each insight: category "Field", field_ref set to that field's farmlandId or id, reasoning "". Put the full tip in message with a mentor prefix (Ben:/Walter:/Katie:/etc.). At most ${MAX_FIELD_MAP_ROWS} fields are included if the farm is huge.`;
    }

    const map = {
        home: `VIEW home: Return exactly 3 insights — the top priorities for this farm next (different angles if possible: field work, fleet/logistics, animals/money/production).`,
        fields: `VIEW fields: Focus on crops, growth, soil, harvest readiness; prefer Field category with field_ref when one parcel is meant. At most 4 insights.`,
        vehicles: `VIEW vehicles: Fleet only — maintenance, fuel, damage, hours. Use Production category. If fleet looks fine, one reassuring insight. At most 3 insights.`,
        pastures: `VIEW pastures: Grazing, pasture levels, manure, herd on pasture. At most 4 insights.`,
        livestock: `VIEW livestock: Barn animals, feed, water, health, production. At most 4 insights.`,
        productions: `VIEW productions: Chains, fill levels, bottlenecks. At most 4 insights.`,
        economy: `VIEW economy — **inventory-backed only**. The JSON includes **_consultant_held_fill_types** (liters + source) and **_consultant_finance_facts** — treat these as ground truth. **Only** name a fill type for sell/haul tips if it appears in **_consultant_held_fill_types** (or is clearly the same stock from **production** / **fields**). The **economy** price section is already filtered to those types; do **not** infer crops from memory or from removed sell-point tables. No equipment shopping, no "invest spare cash" unless **_consultant_finance_facts** shows a comfortable positive balance and you tie it to moving listed stock. At most 4 insights; **field_ref** when one parcel is meant.`,
    };
    return map[v] || map.home;
}

function buildSystemPrompt(view, context) {
    return `You are an expert Farming Simulator 25 farm consultant. Analyze the JSON snapshot for the active farm only.

${viewInstruction(view, context)}

${BASE_JSON_RULES}`;
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

async function callOpenAiChat(system, userText, apiKey, modelId, openaiBaseUrl) {
    const model = (modelId && String(modelId).trim()) || OPENAI_MODEL;
    const base = normalizeOpenAiCompatBase(openaiBaseUrl);
    const url = base ? `${base}/chat/completions` : 'https://api.openai.com/v1/chat/completions';
    const authKey = (apiKey && String(apiKey).trim()) || 'ollama';
    const messages = [
        { role: 'system', content: system },
        { role: 'user', content: `Farm snapshot JSON:\n${userText}` },
    ];
    const payloadWithFormat = {
        model,
        temperature: 0.35,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
        messages,
    };
    const payloadPlain = {
        model,
        temperature: 0.35,
        max_tokens: 4096,
        messages,
    };
    let r = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authKey}`,
        },
        body: JSON.stringify(payloadWithFormat),
    });
    let txt = await r.text();
    if (!r.ok && base && (r.status === 400 || r.status === 422)) {
        const retry = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${authKey}`,
            },
            body: JSON.stringify(payloadPlain),
        });
        txt = await retry.text();
        r = retry;
    }
    if (!r.ok) {
        throw new Error(`OpenAI HTTP ${r.status}: ${txt.slice(0, 400)}`);
    }
    const data = JSON.parse(txt);
    const out = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!out) throw new Error('OpenAI: empty response');
    return String(out);
}

async function callGeminiGenerate(system, userText, apiKey, modelId) {
    const mid = modelId != null ? modelId : GEMINI_MODEL;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        mid
    )}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ parts: [{ text: `Farm snapshot JSON:\n${userText}` }] }],
            generationConfig: {
                temperature: 0.35,
                maxOutputTokens: 8192,
                responseMimeType: 'application/json',
            },
        }),
    });
    const txt = await r.text();
    if (!r.ok) {
        throw new Error(`Gemini HTTP ${r.status}: ${txt.slice(0, 400)}`);
    }
    const data = JSON.parse(txt);
    const parts = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
    const out = parts && parts[0] && parts[0].text;
    if (!out) throw new Error('Gemini: empty response');
    return String(out);
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
    const prep = prepareSnapshotPayload(snapshot, view, context);
    const max = provider === 'gemini' ? MAX_SNAPSHOT_CHARS_GEMINI : MAX_SNAPSHOT_CHARS_OPENAI;
    const userJson = truncateSnapshotString(JSON.stringify(prep), max);
    const system = buildSystemPrompt(view, context);

    const mid = modelId && String(modelId).trim() ? String(modelId).trim() : '';
    /** Cloud OpenAI: default gpt-4o-mini inside callOpenAiChat. Local /v1 servers: must not use that default. */
    let openaiChatModel = mid;
    if (!openaiChatModel && provider !== 'gemini') {
        const base = openaiBaseUrl && String(openaiBaseUrl).trim();
        if (base) {
            openaiChatModel = LOCAL_OPENAI_COMPAT_DEFAULT_MODEL;
        }
    }
    const raw =
        provider === 'gemini'
            ? await callGeminiGenerate(system, userJson, apiKey, mid || null)
            : await callOpenAiChat(
                  system,
                  userJson,
                  apiKey,
                  openaiChatModel || null,
                  openaiBaseUrl || null
              );

    const parsed = extractJsonObject(raw);
    const insights = Array.isArray(parsed.insights) ? parsed.insights : [];
    return {
        insights,
        llm_used: true,
        detail: parsed.detail,
    };
}

module.exports = {
    runByokConsultantLlm,
    OPENAI_MODEL,
    GEMINI_MODEL,
    LOCAL_OPENAI_COMPAT_DEFAULT_MODEL,
};
