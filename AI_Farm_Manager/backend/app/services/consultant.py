"""Proactive farm analysis: heuristics + LLM over dashboard snapshot JSON."""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Any
from urllib.parse import unquote

logger = logging.getLogger(__name__)

from pydantic import ValidationError

from app.config import get_settings, has_gemini_credentials
from app.schemas.insights import FarmInsight, InsightCategory, InsightPriority
from app.services.log_buffer import log_event
from app.services.llm_service import gemini_consultant_post_with_quota_fallback
from app.services.snapshot_pruner import (
    cap_field_rows_in_snapshot,
    prune_dashboard_snapshot_for_llm,
)


def normalize_incoming_api_key(header_val: str | None) -> str:
    """
    Strip BOM / ZWSP; optional URI-decode (matches X-FarmDash-Key handling for Unicode-safe clients).
    """
    if header_val is None:
        return ""
    s = str(header_val).strip().replace("\ufeff", "").replace("\u200b", "")
    if not s:
        return ""
    try:
        dec = unquote(s).strip()
        return dec if dec else s
    except Exception:
        return s


# Oversized dashboard JSON often yields Gemini 400 (INVALID_ARGUMENT / token limits).
_CONSULTANT_SNAPSHOT_CHARS_GEMINI = 65000
# FIELD MAP (?context=fields): smaller prompt so Gemini 2.5 has room for JSON output (thinking + text).
_CONSULTANT_SNAPSHOT_CHARS_GEMINI_FIELD_MAP = 42000
# Section views (?view=vehicles|…): payload already slimmed.
_CONSULTANT_SNAPSHOT_CHARS_GEMINI_VIEW = 48000
_CONSULTANT_SNAPSHOT_CHARS_OPENAI = 118000
# After prune_dashboard_snapshot_for_llm, cap rows so huge farms do not blow prompt size (field-map mode).
_FIELD_MAP_MAX_FIELD_ROWS = 100

CONSULTANT_SYSTEM = """You are an expert Farming Simulator 25 field and logistics consultant. Analyze the provided game state JSON.

Focus especially on **fields** (arable parcels):
- Current crop, growth stage, harvest readiness, withered state, soil work (plow/cultivate), lime/pH, nitrogen/Precision Farming.
- Suggest a **smart next crop or rotation** where relevant (e.g. after harvest or for empty fields), using the current and previous crop context in the JSON.

Also mention when relevant: production bottlenecks, animals, and market/stored crop opportunities — but **prioritize actionable field advice**.

You MUST respond with ONLY valid JSON (no markdown, no prose before or after) in this exact shape:
{"insights":[{"category":"Field|Animal|Production|Finance","priority":"Low|Medium|High","message":"...","reasoning":"...","field_ref":"..."},...]}

JSON rules: escape double quotes inside **message** and **reasoning** as \\" — do not break the JSON with raw " characters inside strings.

CRITICAL — field-specific insights:
- When an insight applies to **one** parcel, **category MUST be exactly** `Field` (capital F, rest lowercase).
- **field_ref MUST be the exact numeric identifier** copied from the source JSON for that parcel: use the value of **farmlandId** if present, otherwise **id**. Use the raw number or its string form only (e.g. `42` or `"42"` in JSON).
- Do **NOT** prefix with the word "Field", "Parcel", or "#". Do **NOT** use the field display name. Do **NOT** add units or extra text. **Only** the id so clients can match rows.

For farm-wide or non-parcel field advice, omit **field_ref** or set it to null.

Use at least one Field insight when the snapshot lists fields; use an empty array only if there is no usable data.

Output limits (so the JSON always completes):
- Return **at most 4** insights.
- **priority** must be exactly **Low**, **Medium**, or **High** (spell **Medium** in full — not Med).
- Keep **message** and **reasoning** **brief** (aim under 180 characters each). Do not write long paragraphs."""

CONSULTANT_SYSTEM_SINGLE_FIELD = """You are an expert Farming Simulator 25 **single-field** consultant.

You receive JSON for **one field parcel only** (plus minimal farm context). You MUST NOT invent or assume data for other fields.

Respond with ONLY valid JSON (no markdown) in this exact shape:
{"insights":[{"category":"Field","priority":"Low|Medium|High","message":"...","reasoning":"...","field_ref":"..."}]}

Rules:
- Return **at most 2** insights; **category** must always be **Field**.
- **field_ref** must be the parcel's **farmlandId** or **id** from the JSON (numeric string or number), matching CONSULTANT_SYSTEM rules for field_ref.
- Keep **message** and **reasoning** brief (under 180 characters each).
- If the JSON has no usable field data, return {"insights":[]}."""

# Appended when Farm Dashboard calls GET …/insights?context=fields (per-parcel field map).
# The default CONSULTANT_SYSTEM allows mixed categories; models often fill all slots with
# Production/Finance — those never map to field rows in the dashboard UI.
CONSULTANT_SYSTEM_FIELDS_FOCUS = (
    CONSULTANT_SYSTEM
    + """

FIELD MAP MODE (this HTTP request only — clients match rows by field_ref):

CRITICAL — COVERAGE (overrides any earlier "at most 4" / summary instructions in this prompt):
- You MUST generate exactly ONE insight for EVERY SINGLE field row provided in the JSON (under `fields` and/or `allFields` as present for this request).
- Count those field objects; ensure your `insights` array length matches that count exactly. Do not summarize, merge, or skip fields.
- **Every** insight MUST use "category":"Field" and a non-null **field_ref** copied from that parcel's **farmlandId** or **id** in the JSON (number or string, no name, no # prefix).
- Do **not** return Animal, Production, or Finance categories here — the UI ignores them for per-field lines.
- Keep **message** and **reasoning** brief (aim under 180 characters each) so the full JSON still completes."""
)

# Smart suggestions panel on Fields tab (?view=fields, context=full) — not the field-map row API (context=fields).
CONSULTANT_SYSTEM_VIEW_FIELDS_SMART = """VIEW MODE — fields:
You are an expert Farming Simulator 25 **field** consultant. The JSON is **cropland only** for the active farm (no vehicles/animals).

Focus: crops, growth, harvest readiness, withered, soil (plow/cultivate/lime/PF nitrogen), rotation hints.

Respond with ONLY valid JSON (no markdown):
{"insights":[{"category":"Field|Production|Finance","priority":"Low|Medium|High","message":"...","reasoning":"...","field_ref":"..." or null},...]}

- Prefer **Field** category with **field_ref** = that parcel's **farmlandId** or **id** when the tip targets one parcel.
- At most **4** insights; keep **message** and **reasoning** brief (under 180 characters each)."""

CONSULTANT_SYSTEM_VIEW_VEHICLES = """VIEW MODE — vehicles:
You are an FS25 **fleet / vehicle** consultant. The JSON is **vehicles only** for the active farm.

Focus: low fuel, damage / repair need, maintenance, attachments, operating hours, machines that should be refuelled or repaired soon.

Respond with ONLY valid JSON:
{"insights":[{"category":"Production|Finance","priority":"Low|Medium|High","message":"...","reasoning":"...","field_ref":null},...]}

- Use **Production** for operational equipment advice (fuel, repair, use). Use **Finance** only for buy/sell/cost tips.
- **field_ref** must be **null** (not applicable to vehicles).
- At most **4** insights; brief **message** and **reasoning** (under 180 characters each)."""

CONSULTANT_SYSTEM_VIEW_PASTURES = """VIEW MODE — pastures:
You are an FS25 **pasture / grazing** consultant. Data includes **pastures** and may include **animals** for context.

Focus: pasture food levels, grass / grazing quality, manure or slurry storage needing emptying, herd health on pasture, overcrowding.

Respond with ONLY valid JSON:
{"insights":[{"category":"Animal|Production|Finance","priority":"Low|Medium|High","message":"...","reasoning":"...","field_ref":null},...]}

- **Animal** for herd / grazing tips; **Production** for storage / manure / outputs; **Finance** if about selling.
- **field_ref** usually null unless a specific **farmland** is clearly implicated.
- At most **4** insights; brief lines."""

CONSULTANT_SYSTEM_VIEW_LIVESTOCK = """VIEW MODE — livestock:
You are an FS25 **barn / husbandry** consultant. The JSON is **animals / buildings** for the active farm.

Focus: animals needing food or water, low health, reproduction, production outputs (milk, wool), overcrowding, animals worth selling.

Respond with ONLY valid JSON:
{"insights":[{"category":"Animal|Production|Finance","priority":"Low|Medium|High","message":"...","reasoning":"...","field_ref":null},...]}

- Prefer **Animal** for herd tips; **Production** for facility throughput; **Finance** for cull/sell/value.
- **field_ref** null unless a **field/parcel** is clearly relevant.
- At most **4** insights; brief lines."""

CONSULTANT_SYSTEM_VIEW_PRODUCTIONS = """VIEW MODE — productions:
You are an FS25 **production chain** consultant. The JSON emphasizes **production** and **productionPoints**.

Focus: bottlenecks, missing inputs, full outputs, stalled chains, which plant to clear or feed next.

Respond with ONLY valid JSON:
{"insights":[{"category":"Production|Finance","priority":"Low|Medium|High","message":"...","reasoning":"...","field_ref":null},...]}

- **Production** for operational tips; **Finance** for selling/stored value.
- At most **4** insights; brief lines."""

CONSULTANT_SYSTEM_VIEW_ECONOMY = """VIEW MODE — economy:
You are an FS25 **finance and market** consultant. The JSON emphasizes **economy**, **farms** / **farmInfo**, and related stats.

Focus: loan pressure, cash flow, crop/stock prices, best times to sell, storage vs market opportunity.

Respond with ONLY valid JSON:
{"insights":[{"category":"Finance|Production","priority":"Low|Medium|High","message":"...","reasoning":"...","field_ref":null},...]}

- **Finance** for money/market tips; **Production** only if tied to selling processed goods.
- At most **4** insights; brief lines."""


def consultant_system_instruction_for_view(view: str | None) -> str | None:
    """System prompt for ``?view=`` (Smart suggestions panel). Returns None to use default CONSULTANT_SYSTEM."""
    v = (view or "").strip().lower()
    m = {
        "fields": CONSULTANT_SYSTEM_VIEW_FIELDS_SMART,
        "vehicles": CONSULTANT_SYSTEM_VIEW_VEHICLES,
        "pastures": CONSULTANT_SYSTEM_VIEW_PASTURES,
        "livestock": CONSULTANT_SYSTEM_VIEW_LIVESTOCK,
        "productions": CONSULTANT_SYSTEM_VIEW_PRODUCTIONS,
        "economy": CONSULTANT_SYSTEM_VIEW_ECONOMY,
    }
    return m.get(v)


def _consultant_view_scope_mode(system_instruction: str | None) -> bool:
    """Section-scoped dashboard view (smaller prompts than full farm JSON)."""
    s = system_instruction or ""
    return "VIEW MODE —" in s


def _consultant_skip_production_heuristics(system_instruction: str | None) -> bool:
    """Skip generic production-fill heuristics when the LLM snapshot is intentionally not production-focused."""
    s = system_instruction or ""
    return any(
        tag in s
        for tag in (
            "VIEW MODE — fields",
            "VIEW MODE — vehicles",
            "VIEW MODE — pastures",
            "VIEW MODE — livestock",
        )
    )


def _consultant_field_map_mode(system_instruction: str | None) -> bool:
    s = system_instruction or ""
    return "FIELD MAP MODE" in s


def _coerce_pct(value: Any) -> float | None:
    if value is None:
        return None
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    if 0 <= v <= 1.0:
        return v * 100.0
    if 0 <= v <= 100:
        return v
    return None


def _heuristic_production_output_space(snapshot: Any, _path: str = "") -> list[FarmInsight]:
    """
    Detect production / storage outputs at or above ~90% fill — High priority.
    Works across varying data.json shapes by scanning nested dict/list trees.
    """
    found: list[FarmInsight] = []
    seen: set[str] = set()

    def add_if_new(msg: str, reasoning: str) -> None:
        key = msg[:120]
        if key in seen:
            return
        seen.add(key)
        found.append(
            FarmInsight(
                category=InsightCategory.PRODUCTION,
                priority=InsightPriority.HIGH,
                message=msg,
                reasoning=reasoning,
            )
        )

    def walk(obj: Any, path: str) -> None:
        if isinstance(obj, dict):
            # Common patterns: outputFill, fillLevel, fillPercent, fillRatio paired with capacity
            for k, v in obj.items():
                kl = str(k).lower()
                child_path = f"{path}.{k}" if path else k

                if isinstance(v, (int, float)):
                    pct = _coerce_pct(v)
                    if pct is not None and pct >= 90:
                        if any(
                            x in kl
                            for x in (
                                "output",
                                "fill",
                                "storage",
                                "tank",
                                "silo",
                                "buffer",
                                "capacity",
                            )
                        ):
                            add_if_new(
                                f"Production or storage output is critically full (~{pct:.0f}%): check {child_path}.",
                                "Output or fill level is at or above 90%; clear product or expand capacity to avoid stoppages.",
                            )

                elif isinstance(v, (dict, list)):
                    walk(v, child_path)

            # Pair: current + max / amount + capacity
            if "capacity" in obj and any(x in obj for x in ("current", "amount", "fill", "stored", "level")):
                cap = obj.get("capacity")
                cur = obj.get("current") or obj.get("amount") or obj.get("fill") or obj.get("stored") or obj.get("level")
                try:
                    cap_f = float(cap) if cap is not None else None
                    cur_f = float(cur) if cur is not None else None
                except (TypeError, ValueError):
                    cap_f = cur_f = None
                if cap_f and cap_f > 0 and cur_f is not None:
                    ratio = (cur_f / cap_f) * 100.0
                    if ratio >= 90:
                        add_if_new(
                            f"Storage or production fill is ~{ratio:.0f}% of capacity (near full).",
                            "Running out of space for output; sell, move, or process goods before production stops.",
                        )

        elif isinstance(obj, list):
            for i, item in enumerate(obj):
                walk(item, f"{path}[{i}]")

    walk(snapshot, "")
    return found


def _parse_category(raw: Any) -> InsightCategory:
    s = str(raw or "").strip().title()
    for c in InsightCategory:
        if c.value == s:
            return c
    original = str(raw).strip() if raw is not None else ""
    logger.warning(
        "Consultant: unknown LLM category %r — defaulting to Production",
        (original[:200] + "…") if len(original) > 200 else original,
    )
    return InsightCategory.PRODUCTION


def _parse_priority(raw: Any) -> InsightPriority:
    s = str(raw or "").strip().title()
    if s in ("Med", "Mid"):
        s = "Medium"
    for p in InsightPriority:
        if p.value == s:
            return p
    return InsightPriority.MEDIUM


def _normalize_field_ref(raw: Any) -> str | None:
    """Strip LLM fluff; return a short id string for matching farmlandId/id, or None."""
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    s = re.sub(r"^field\s*#?\s*", "", s, flags=re.I)
    s = re.sub(r"^parcel\s*#?\s*", "", s, flags=re.I)
    s = re.sub(r"^farmland\s*#?\s*", "", s, flags=re.I)
    s = s.lstrip("#").strip()
    if not s:
        return None
    # First token only if model appended noise (e.g. "42 note")
    part = s.split()[0] if s.split() else s
    if len(part) > 64:
        part = part[:64]
    return part or None


async def _llm_insights_from_snapshot(
    snapshot_json: str,
    settings: dict[str, Any],
    *,
    system_instruction: str = CONSULTANT_SYSTEM,
) -> tuple[list[FarmInsight], bool]:
    """Call OpenAI or Gemini with consultant system prompt; parse JSON insights."""
    provider = (settings.get("llm_provider") or "openai").strip().lower()

    if provider == "gemini":
        if _consultant_field_map_mode(system_instruction):
            max_chars = _CONSULTANT_SNAPSHOT_CHARS_GEMINI_FIELD_MAP
        elif _consultant_view_scope_mode(system_instruction):
            max_chars = _CONSULTANT_SNAPSHOT_CHARS_GEMINI_VIEW
        else:
            max_chars = _CONSULTANT_SNAPSHOT_CHARS_GEMINI
    else:
        max_chars = _CONSULTANT_SNAPSHOT_CHARS_OPENAI
    snap = snapshot_json if len(snapshot_json) <= max_chars else snapshot_json[:max_chars]
    trunc_note = (
        "\n\n(JSON above was truncated for API input limits — infer from visible data.)\n"
        if len(snapshot_json) > max_chars
        else ""
    )
    user_payload = (
        "Analyze this game state JSON and return ONLY the JSON object as specified.\n\n"
        f"```json\n{snap}\n```{trunc_note}"
    )

    try:
        if provider == "gemini" and has_gemini_credentials(settings):
            text = await _gemini_consultant(settings, user_payload, system_instruction=system_instruction)
        else:
            text = await _openai_consultant(settings, user_payload, system_instruction=system_instruction)
    except Exception as e:
        # Invalid API key, quota, network, or provider HTTP errors — fall back to heuristics only.
        log_event("WARN", f"Consultant LLM request failed (auth/network/provider): {e}")
        logger.warning("Consultant fallback: LLM request failed — %s", e)
        return [], False

    text = (text or "").strip()
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.I)
    text = re.sub(r"\s*```\s*$", "", text)

    data, parse_err = _parse_consultant_llm_json_text(text)
    if data is None:
        log_event(
            "WARN",
            "Consultant LLM returned unparsable JSON (try shorter snapshot or different model)",
            parse_detail=parse_err,
            preview=(text[:500] + "…") if len(text) > 500 else text,
        )
        logger.warning(
            "Consultant fallback: unparsable LLM JSON (%s) — preview_chars=%s",
            parse_err or "unknown",
            len(text or ""),
        )
        return [], False

    if not isinstance(data, dict):
        log_event("WARN", "Consultant LLM JSON root is not an object")
        logger.warning("Consultant fallback: LLM JSON root is not an object")
        return [], False

    raw_list = data.get("insights")
    if not isinstance(raw_list, list):
        log_event("WARN", "Consultant LLM JSON missing insights array")
        logger.warning("Consultant fallback: LLM JSON missing 'insights' array")
        return [], False

    out: list[FarmInsight] = []
    dropped_validation = 0
    for item in raw_list:
        if not isinstance(item, dict):
            dropped_validation += 1
            continue
        try:
            cat = _parse_category(item.get("category"))
            field_ref = (
                _normalize_field_ref(item.get("field_ref"))
                if cat == InsightCategory.FIELD
                else None
            )
            out.append(
                FarmInsight(
                    category=cat,
                    priority=_parse_priority(item.get("priority")),
                    message=str(item.get("message", ""))[:2000],
                    reasoning=str(item.get("reasoning", ""))[:4000],
                    field_ref=field_ref,
                )
            )
        except ValidationError as e:
            dropped_validation += 1
            logger.warning("Consultant: dropped insight row (Pydantic validation): %s", e)
        except Exception as e:
            dropped_validation += 1
            logger.warning("Consultant: dropped insight row: %s", e)
    if dropped_validation:
        logger.warning(
            "Consultant: dropped %s insight(s) due to validation or parse errors",
            dropped_validation,
        )
    return out, True


async def _openai_consultant(
    settings: dict,
    user_message: str,
    *,
    system_instruction: str = CONSULTANT_SYSTEM,
) -> str:
    from openai import AsyncOpenAI
    from openai import BadRequestError

    key = settings.get("llm_api_key") or ""
    if not key:
        raise RuntimeError("LLM_API_KEY not set")
    client = AsyncOpenAI(api_key=key)
    model = settings["llm_model"]
    messages = [
        {"role": "system", "content": system_instruction},
        {"role": "user", "content": user_message},
    ]
    kwargs = {
        "model": model,
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": 4096,
    }
    try:
        resp = await client.chat.completions.create(
            **kwargs,
            response_format={"type": "json_object"},
        )
    except BadRequestError as e:
        # Many models return 400 if json_object / response_format is not supported.
        detail = str(getattr(e, "message", None) or getattr(e, "body", None) or e)
        if "json" in detail.lower() or "response_format" in detail.lower():
            log_event(
                "WARN",
                "OpenAI rejected json_object for this model; retrying without response_format",
                model=model,
                detail=detail[:500],
            )
            resp = await client.chat.completions.create(**kwargs)
        else:
            log_event("WARN", f"OpenAI BadRequest (consultant): {detail[:800]}")
            raise
    return (resp.choices[0].message.content or "").strip()


async def _gemini_consultant(
    settings: dict,
    user_message: str,
    *,
    system_instruction: str = CONSULTANT_SYSTEM,
) -> str:
    """
    Gemini REST generateContent for consultant JSON.

    ``responseMimeType: application/json`` is **not** sent by default: many
    ``generativelanguage.googleapis.com`` v1 + model combinations return 400.
    Set ``GEMINI_CONSULTANT_RESPONSE_JSON=1`` to opt in (e.g. v1beta); if the API
    still returns 400, we retry once without JSON MIME and log a single warning.
    """
    if not has_gemini_credentials(settings):
        raise RuntimeError("GEMINI_API_KEY not set")
    prompt = f"{system_instruction}\n\n{user_message}"
    # Gemini 2.5 may allocate internal tokens toward maxOutputTokens; 8k can truncate JSON.
    _default_out = 16384
    _raw_out = (os.getenv("GEMINI_CONSULTANT_MAX_OUTPUT_TOKENS") or "").strip()
    if _raw_out:
        try:
            max_out = max(1024, min(65536, int(_raw_out)))
        except ValueError:
            max_out = _default_out
    else:
        max_out = _default_out
    if _consultant_field_map_mode(system_instruction):
        max_out = min(65536, max(max_out * 2, _default_out))
    # Single-turn text; omit "role" for widest compatibility with generativelanguage v1 / v1beta.
    base_cfg: dict[str, Any] = {"temperature": 0.3, "maxOutputTokens": max_out}
    want_json_mime = (os.getenv("GEMINI_CONSULTANT_RESPONSE_JSON") or "").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )
    gen_cfg: dict[str, Any] = (
        {**base_cfg, "responseMimeType": "application/json"} if want_json_mime else base_cfg
    )
    payload: dict[str, Any] = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": gen_cfg,
    }
    r = await gemini_consultant_post_with_quota_fallback(
        settings,
        payload=payload,
        want_json_mime=want_json_mime,
        base_generation_config=base_cfg,
        timeout=90.0,
    )
    try:
        data = r.json()
    except json.JSONDecodeError as e:
        raise RuntimeError("Gemini response body is not JSON") from e

    cands = data.get("candidates") or []
    cand0 = cands[0] if cands else {}
    finish = (cand0.get("finishReason") or "").strip().upper()
    um = data.get("usageMetadata") if isinstance(data.get("usageMetadata"), dict) else {}
    if finish == "MAX_TOKENS":
        log_event(
            "WARN",
            "Gemini consultant hit MAX_TOKENS — output JSON may be cut mid-string; "
            "prompt asks for ≤4 brief insights; check snapshot size",
            finishReason=finish,
            candidates_tokens=um.get("candidatesTokenCount"),
            prompt_tokens=um.get("promptTokenCount"),
        )
    elif finish in ("SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII"):
        log_event("WARN", "Gemini consultant stopped early", finishReason=finish)

    parts = cand0.get("content", {}).get("parts", [])
    return "".join(p.get("text", "") for p in parts).strip()


def _consultant_llm_settings_for_byok(
    user_api_key: str,
    user_provider: str | None,
) -> dict[str, Any]:
    """Build settings dict for one consultant LLM call (BYOK key or server env key)."""
    base = get_settings()
    merged: dict[str, Any] = dict(base)
    key = normalize_incoming_api_key(user_api_key)
    prov = (user_provider or "").strip().lower()
    if prov not in ("openai", "gemini"):
        prov = "gemini" if key.startswith("AIza") else "openai"
    merged["llm_provider"] = prov
    if prov == "gemini":
        merged["gemini_api_key"] = key
        merged["gemini_api_keys"] = [key]
    else:
        merged["llm_api_key"] = key
    return merged


def resolve_consultant_llm_settings(
    user_api_key: str | None,
    user_provider: str | None,
) -> dict[str, Any] | None:
    """
    Same API key routing as :func:`generate_farm_insights` (BYOK or server env).
    Returns ``None`` if no LLM key is available.
    """
    key = normalize_incoming_api_key(user_api_key)
    prov = (user_provider or "").strip().lower() or None
    if prov not in ("openai", "gemini", "", None):
        prov = None

    if not key:
        base = get_settings()
        prov_base = (base.get("llm_provider") or "openai").strip().lower()
        if prov_base == "gemini":
            if not has_gemini_credentials(base):
                return None
            # Do not route through _consultant_llm_settings_for_byok — that would replace
            # gemini_api_keys with a one-element list and drop GEMINI_API_KEYS rotation / quota pool.
            return dict(base)
        key = normalize_incoming_api_key(base.get("llm_api_key"))
        if not key:
            return None
        prov = prov_base if prov_base in ("openai", "gemini") else None

    return _consultant_llm_settings_for_byok(key, prov)


def _parse_consultant_llm_json_text(text: str) -> tuple[dict[str, Any] | None, str | None]:
    """
    Parse consultant JSON; tolerate trailing prose after the first JSON object (``raw_decode``).
    Returns (dict, None) on success, or (None, short error detail) on failure.
    """
    t = (text or "").strip()
    t = re.sub(r"^```(?:json)?\s*", "", t, flags=re.I)
    t = re.sub(r"\s*```\s*$", "", t)
    decoder = json.JSONDecoder()
    errs: list[str] = []
    try:
        obj, _end = decoder.raw_decode(t)
        if isinstance(obj, dict):
            return obj, None
        errs.append("raw_decode: root JSON value is not an object")
    except json.JSONDecodeError as e:
        errs.append(f"raw_decode: {e.msg} at col {e.colno} (char {e.pos})")

    try:
        obj = json.loads(t)
        if isinstance(obj, dict):
            return obj, None
        errs.append("loads: root JSON value is not an object")
    except json.JSONDecodeError as e:
        errs.append(f"loads: {e.msg} at col {e.colno} (char {e.pos})")
    except (TypeError, ValueError, RecursionError) as e:
        errs.append(str(e)[:200])

    return None, errs[-1] if errs else "empty or non-JSON text"


async def generate_farm_insights(
    snapshot_data: dict[str, Any],
    *,
    user_api_key: str | None = None,
    user_provider: str | None = None,
    system_instruction: str | None = None,
) -> tuple[list[FarmInsight], bool]:
    """
    Combine heuristic rules (e.g. output fill >= 90%) with LLM analysis.

    API key resolution:
    1. Non-empty ``X-AI-API-Key`` (BYOK) after normalize/decode.
    2. Else server ``GEMINI_API_KEY`` or ``LLM_API_KEY`` per ``LLM_PROVIDER`` (same as admin / ``!bot``).
    """
    if _consultant_skip_production_heuristics(system_instruction):
        heuristics = []
    else:
        heuristics = _heuristic_production_output_space(snapshot_data)
    settings = resolve_consultant_llm_settings(user_api_key, user_provider)
    if settings is None:
        logger.warning(
            "Consultant fallback: llm_used=false — no LLM API key (empty BYOK and server env missing "
            "GEMINI_API_KEY / LLM_API_KEY for configured LLM_PROVIDER)"
        )
        return heuristics, False

    try:
        if isinstance(snapshot_data, dict):
            pruned = prune_dashboard_snapshot_for_llm(snapshot_data)
            if _consultant_field_map_mode(system_instruction):
                pruned = cap_field_rows_in_snapshot(pruned, _FIELD_MAP_MAX_FIELD_ROWS)
        else:
            pruned = snapshot_data
        snap_str = json.dumps(pruned, ensure_ascii=False, default=str)
    except Exception as e:
        logger.error("Failed to serialize snapshot: %s", e)
        return heuristics, False

    sys_inst = system_instruction or CONSULTANT_SYSTEM
    try:
        llm_list, llm_ok = await _llm_insights_from_snapshot(
            snap_str,
            settings,
            system_instruction=sys_inst,
        )
    except Exception as e:
        log_event("WARN", f"Consultant pipeline unexpected error: {e}")
        logger.warning("Consultant fallback: pipeline error before/around LLM merge — %s", e)
        return heuristics, False

    if not llm_ok:
        logger.warning(
            "Consultant: llm_used=false after LLM path — using heuristics only (see prior WARNING lines for parse/auth errors)"
        )

    # Merge: heuristics first (deterministic), then LLM; dedupe similar messages
    seen_msg: set[str] = {h.message[:80] for h in heuristics}
    merged = list(heuristics)
    for ins in llm_list:
        msg_key = ins.message[:80]
        if msg_key not in seen_msg:
            seen_msg.add(msg_key)
            merged.append(ins)

    return merged, llm_ok
