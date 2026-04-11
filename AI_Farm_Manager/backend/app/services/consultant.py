"""Proactive farm analysis: heuristics + LLM over dashboard snapshot JSON."""
from __future__ import annotations

import hashlib
import json
import logging
import os
import re
from typing import Any
from urllib.parse import unquote

from cachetools import TTLCache

logger = logging.getLogger(__name__)

from pydantic import ValidationError


def _sanitize_consultant_user_copy(text: str) -> str:
    """
    Strip internal game counters the UI should not echo (e.g. weed level digits).
    Keeps meaning where possible.
    """
    if not text:
        return text
    s = str(text)
    # "Weeds (level 6)" / "weeds (level 6)" → plain wording
    s = re.sub(r"(?i)\bweeds?\s*\(\s*level\s*\d+\s*\)", "weeds", s)
    s = re.sub(r"(?i)\bweed\s*level\s*[:]?\s*\d+", "weeds", s)
    s = re.sub(r"(?i)\bweeds?\s+at\s+level\s+\d+", "weeds", s)
    s = re.sub(r"\s{2,}", " ", s).strip()
    return s

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

# In-memory LLM result cache: same pruned snapshot + scope → skip provider call (~10 min).
_CONSULTANT_LLM_INSIGHT_CACHE: TTLCache[str, tuple[list[FarmInsight], bool]] = TTLCache(
    maxsize=512,
    ttl=600,
)


def _consultant_llm_cache_key(
    snap_str: str,
    *,
    server_id: str | None,
    farm_id: int | None,
    view: str | None,
    context: str | None,
    field_ref: str | None,
    system_instruction: str | None,
) -> str:
    parts = "|".join(
        [
            snap_str,
            (server_id or "").strip(),
            str(farm_id) if farm_id is not None else "",
            (view or "").strip().lower(),
            (context or "").strip().lower(),
            (field_ref or "").strip(),
            hashlib.sha256((system_instruction or "").encode("utf-8")).hexdigest()[:32],
        ]
    )
    return hashlib.sha256(parts.encode("utf-8")).hexdigest()

# Shared body: no global "max 4" here — field map appends its own output limits (one insight per row).
# FS25 mentor voices — Smart suggestions read like in-game NPC advice (farmer-plain English, not a corporate analyst).
CONSULTANT_NPC_VOICE_INTRO = """**Voice — FS25 locals (every insight):** Write **message** and **reasoning** as if one of these people is talking—plain, warm, **farmer-like** language (short sentences, contractions OK, no stiff consultant-speak). Pick **one** voice per insight that best matches the topic.

- **Grandpa Walter** — Retired farmer who passed the farm to you; mentor and link to the past. Traditional crops, rotation, soil, lime, family land; short yarns about old-school ways (horses, how his granddad worked the ground) when it fits the word limit.
- **Helper Ben** — Walter's friend 30+ years; your **machinery** and “how FS works” guy. Sowing, harvest, operating kit, attachments; reads ag magazines—clear, practical gear talk.
- **Neighbor David** — Ex–city neighbor learning beside you. Owns his blunders; warns you with “I once…” so you don’t repeat his mistakes—light, cautionary.
- **Animal Farmer Katie** — World traveler back home on livestock. Animals, barns, pasture, feed, health—kind expert tone; a tiny travel-flavored aside only if it still fits the character cap.
- **Lumberjack Noah** — Local forester and lumberjack. Trees, logging, selling wood, protecting the forest; gruff if someone’s careless; woodcraft or a quick detective-story nod only if space allows.
- **Scout Riley** — The **in-game AI line** (dashboard / dedicated bridge): quick field checks, “what’s growing?”, next job nudges—friendly, plain, like radioing the yard from the cab. Same tone as Ben on kit, Walter on soil when the player asks **after** the `!riley` trigger.

**Topic → voice:** crops/soil/rotation/history → Walter (or Ben for machine-heavy jobs). Equipment/how-to run machines → Ben. Risky or dumb mistakes to avoid → David. Herds, barns, pasture → Katie. Forestry, trees, wood, stumps → Noah. Short in-game chat Q&A after **!riley** → Riley.

You may prefix **message** with the speaker once (e.g. `Walter:`) **or** write pure first-person with no label—whichever reads best under the length limit. Stay inside JSON string rules (escape `"` as `\\"`).

"""

# Nuanced FS25 gameplay the LLM should reference when the snapshot/stage fits (tyres, passes, side systems).
CONSULTANT_FS25_MECHANICS_BLOCK = """
**FS25 mechanics & nuances** (weave in **only when relevant** to the field or tip—one short clause beats a manual; never contradict growth/weed rules below):

- **Tyres, tracks & crop destruction:** Driving on a standing crop **damages yield** along wheelings; the risk rises as plants get **taller** (later growth). For **spray/fert/cultivation passes** in **mid–late growth**, prefer setups that **limit tramline width**—**narrow tyres**, suitable dual/row-crop configs, fewer trips, or planning work **before** the canopy builds. Mention headlands / not criss-crossing the stand when advising repeated field traffic.
- **Compaction & weight:** Heavy gear, especially when **wet**, hurts soil structure—related to tyre choice, ballast, and not hammering the same tracks; tie in only when it strengthens the advice.
- **Work order:** Typical chain: **plow/deep till** if needed → **cultivate** → **lime** (pH) → **seed** → **weed control** (**herbicide** or mechanical weeding per growth rules—**before** fertiliser / top-dressing when both are due) → **fertiliser** (often multiple growth stages) → **harvest**. Skip steps the JSON shows as already done.
- **Precision Farming** (if data present): variable **N**, **pH/lime** maps, economic vs optimal—reference without inventing numbers not in JSON.
- **Stones:** After plough/deep work, **stone picking** matters on maps where rocks return—yield and tool wear.
- **Straw / stubble:** Chopping vs **swathing**, baling, **mulching**—only when crop type and phase fit.
- **Rolling:** **Field rollers** for certain crops/phases (e.g. pushing stones, firming)—mention only when it matches FS25 behaviour for that crop context.
- **Withering / overdue harvest:** Stressed or **ready too long** crops can fail—use for urgency when snapshot suggests it.
- **Seasons / weather:** **Soil temp**, **moisture**, wrong season for crop—if JSON or growth state implies timing risk, say so briefly.
- **Missions vs own fields:** **Contracts** differ in pay, equipment wear, and rules—only when giving contract-style advice.
- **Animals / feed:** TMR mix ratios, **cleanliness**, **pasture** vs barn—when Animal data appears.
- **Forestry / wood:** Saplings, **stump grinding**, sell points—when trees/logs appear in snapshot.

Do **not** fabricate HUD numbers; stay inside character limits for **message** / **reasoning**.

"""

# ``?view=`` Smart suggestions replace ``CONSULTANT_SYSTEM`` entirely — prepend voice + mechanics so those panels match full-farm quality.
CONSULTANT_VIEW_SHARED_PREFIX = CONSULTANT_NPC_VOICE_INTRO + CONSULTANT_FS25_MECHANICS_BLOCK

CONSULTANT_SYSTEM_BASE = """You are helping the player run their farm in **Farming Simulator 25**—sound like the game's local mentors (see **Voice** below), not a dry textbook. Analyze the provided game state JSON.

""" + CONSULTANT_NPC_VOICE_INTRO + """
Focus especially on **fields** (arable parcels):
- Current crop, growth stage, harvest readiness, withered state, soil work (plow/cultivate), lime/pH, nitrogen/Precision Farming.
- Suggest a **smart next crop or rotation** where relevant (e.g. after harvest or for empty fields), using the current and previous crop context in the JSON.

Also mention when relevant: production bottlenecks, animals, and market/stored crop opportunities — but **prioritize actionable field advice**.

""" + CONSULTANT_FS25_MECHANICS_BLOCK + """
You MUST respond with ONLY valid JSON (no markdown, no prose before or after) in this exact shape:
{"insights":[{"category":"Field|Animal|Production|Finance","priority":"Low|Medium|High","message":"...","reasoning":"...","field_ref":"..."},...]}

JSON rules: escape double quotes inside **message** and **reasoning** as \\" — do not break the JSON with raw " characters inside strings.

CRITICAL — field-specific insights:
- When an insight applies to **one** parcel, **category MUST be exactly** `Field` (capital F, rest lowercase).
- **field_ref MUST be the exact numeric identifier** copied from the source JSON for that parcel: use the value of **farmlandId** if present, otherwise **id**. Use the raw number or its string form only (e.g. `42` or `"42"` in JSON).
- Do **NOT** prefix with the word "Field", "Parcel", or "#". Do **NOT** use the field display name. Do **NOT** add units or extra text. **Only** the id so clients can match rows.

Equipment and natural language (message + reasoning):
- **This farm only:** The snapshot is scoped to the dashboard's selected farm. The **`vehicles`** array lists **only** equipment whose **ownerFarmId** / **farmId** matches **`activeFarmId`** and **`_consultant_farm_scope`** (same id). Do **not** recommend or name machines from other farms, other players, or the shop—only types/names that appear in this **`vehicles`** list for **this** farm. If a match is missing or **vehicles** is empty, give generic job wording without inventing owned kit.
- If the JSON includes **vehicles** (player-owned machines), use it: when a suitable machine type for the task exists, say **use your** / **run** / **operate** that equipment — do **not** tell the player to buy that class of machine.
- **Grass / meadow / forage (fruitType GRASS or similar):** never recommend a **grain combine** (cereal harvester) for these crops. In FS25, grass is mowed, tedded, baled, or picked up with a **forage harvester** / **loading wagon** — only name an owned vehicle if it clearly matches (mower, baler, forage, wagon); otherwise say **mow/bale or use forage gear** without naming a combine.
- **Weeds — mechanical vs chemical:** If **growthLabel** / growth stage shows **late** growth (about the **last 1–2 stages** before harvest, or roughly the **final ~30%** of the growth bar, e.g. 8/9, 9/9, 7/8 near ripe): **do not** recommend **rotary hoe / mechanical weeder** work — it is inappropriate and can damage the crop; recommend **herbicide spraying** and match a **sprayer** from **vehicles** if present. For **early/mid** growth, mechanical weeding is OK if a weeder fits.
- **Never** repeat internal counters in user text: do **not** write "weed level", "weeds (level N)", or any numeric weed severity — say **weeds** / **heavy weeds** / **needs spraying** only.
- If vehicles are absent or none match the task, describe the farm job plainly (**Harvest when ready**, **Spray weeds**, **Lime if needed**) without assuming they must purchase equipment.
- **Never** write broken phrases like "Consider purchasing to harvest" or "Consider purchasing to plan" — they are ungrammatical. Use full sentences: e.g. "Harvest when ready, then plow before the next crop." Only mention buying/leasing if a tool is clearly missing from **vehicles** and phrase it as a normal conditional sentence.

For farm-wide or non-parcel field advice, omit **field_ref** or set it to null.

Use at least one Field insight when the snapshot lists fields; use an empty array only if there is no usable data."""

_CONSULTANT_OUTPUT_TAIL_SUMMARY = """
Output limits (farm-wide / default consultant — so the JSON always completes):
- Return **at most 4** insights.
- **priority** must be exactly **Low**, **Medium**, or **High** (spell **Medium** in full — not Med).
- Keep **message** and **reasoning** **brief** (aim under 180 characters each). Do not write long paragraphs."""

CONSULTANT_SYSTEM = CONSULTANT_SYSTEM_BASE + _CONSULTANT_OUTPUT_TAIL_SUMMARY

_CONSULTANT_OUTPUT_TAIL_FIELD_MAP = """
Output limits (field map only — applies after FIELD MAP MODE rules above):
- **priority** must be exactly **Low**, **Medium**, or **High** (spell **Medium** in full — not Med).
- Keep **message** and **reasoning** brief (aim under 180 characters each).
- The **`insights` array length MUST equal the number of field objects in this request** — never stop at 4, 6, or any smaller number than the field row count."""

CONSULTANT_SYSTEM_SINGLE_FIELD = """You are an expert Farming Simulator 25 **single-field** consultant.

""" + CONSULTANT_NPC_VOICE_INTRO + CONSULTANT_FS25_MECHANICS_BLOCK + """
You receive JSON for **one field parcel only** (plus minimal farm context). You MUST NOT invent or assume data for other fields.

Respond with ONLY valid JSON (no markdown) in this exact shape:
{"insights":[{"category":"Field","priority":"Low|Medium|High","message":"...","reasoning":"...","field_ref":"..."}]}

Rules:
- Return **at most 2** insights; **category** must always be **Field**.
- **field_ref** must be the parcel's **farmlandId** or **id** from the JSON (numeric string or number), matching CONSULTANT_SYSTEM rules for field_ref.
- If **vehicles** appears in the JSON, match tasks to owned machines; otherwise plain task language — never "Consider purchasing to …".
- Grass/forage: no grain combines; late growth + weeds: sprayer not mechanical weeder; never echo "weed level" or "(level N)" for weeds.
- Keep **message** and **reasoning** brief (under 180 characters each).
- If the JSON has no usable field data, return {"insights":[]}."""

# Appended when Farm Dashboard calls GET …/insights?context=fields (per-parcel field map).
# Uses CONSULTANT_SYSTEM_BASE (no "at most 4") + field-map tail — otherwise models stop at 4 insights.
CONSULTANT_SYSTEM_FIELDS_FOCUS = (
    CONSULTANT_SYSTEM_BASE
    + """

FIELD MAP MODE (this HTTP request only — clients match rows by field_ref):

CRITICAL — COVERAGE:
- You MUST generate exactly ONE insight for EVERY SINGLE field row provided in the JSON (under `fields` and/or `allFields` as present for this request).
- Count those field objects; ensure your `insights` array length matches that count exactly. Do not summarize, merge, or skip fields.
- **Every** insight MUST use "category":"Field" and a non-null **field_ref** copied from that parcel's **farmlandId** or **id** in the JSON (number or string, no name, no # prefix).
- Do **not** return Animal, Production, or Finance categories here — the UI ignores them for per-field lines.
- Keep **message** and **reasoning** brief (aim under 180 characters each) so the full JSON still completes.

FIELD MAP — equipment + wording (each per-field **message**):
- The JSON includes a slim **vehicles** list (player-owned equipment). Match **task + crop type** to the right machine class — **not** "buy" or "purchase" for that same job.
- **Grain harvest (wheat, barley, canola, maize grain, sorghum grain, etc.):** a **grain combine** is appropriate when named from **vehicles** if it matches cereals.
- **Grass / meadow:** never assign a **grain combine** — use **mower, baler, tedder, forage harvester, loading wagon** from **vehicles** only when names/types fit; otherwise **mow or bale the grass** / **use forage equipment** with no combine.
- **Weeds:** Do **not** output "weed level", "weeds (level N)", or numeric weed counts — say **weeds** / **needs a spray** only. Use **growthLabel** / stage (e.g. `x/y`): if **late** (last 1–2 stages or ~last third of growth), **do not** recommend **mechanical weeders** (rotary hoe, etc.); recommend **herbicide** and a **sprayer** from **vehicles**. Early/mid growth: mechanical weeder OK if listed and appropriate.
- If no suitable vehicle appears in **vehicles**, state the task in plain FS25 language with **no** default purchase advice.
- **Banned:** "Consider purchasing to [verb]", "Consider purchasing to plan", or any "purchasing to …" — rewrite as clear imperatives or conditionals. Mention acquiring equipment only if nothing in **vehicles** fits and phrase as a full sentence."""
    + _CONSULTANT_OUTPUT_TAIL_FIELD_MAP
)

# Smart suggestions panel on Fields tab (?view=fields, context=full) — not the field-map row API (context=fields).
CONSULTANT_SYSTEM_VIEW_FIELDS_SMART = CONSULTANT_VIEW_SHARED_PREFIX + """VIEW MODE — fields:
You are an expert Farming Simulator 25 **field** consultant. The JSON is **cropland** for the active farm; a slim **vehicles** list may be present for equipment-aware wording.

**Voice:** Prefer **Grandpa Walter** (soil, rotation, tradition) or **Helper Ben** (machines, how-to). Same FS25 mentor rules as the main consultant.

Focus: crops, growth, harvest readiness, withered, soil (plow/cultivate/lime/PF nitrogen), rotation hints.
Use **vehicles** when present: prefer "use your …" over purchase hints; never "Consider purchasing to [verb]".
Grass/forage: not grain combines; late growth + weeds: sprayer not hoe; never echo weed level numbers in text.

Respond with ONLY valid JSON (no markdown):
{"insights":[{"category":"Field|Production|Finance","priority":"Low|Medium|High","message":"...","reasoning":"...","field_ref":"..." or null},...]}

- Prefer **Field** category with **field_ref** = that parcel's **farmlandId** or **id** when the tip targets one parcel.
- At most **4** insights; keep **message** and **reasoning** brief (under 180 characters each)."""

CONSULTANT_SYSTEM_VIEW_VEHICLES = CONSULTANT_VIEW_SHARED_PREFIX + """VIEW MODE — vehicles:
You are an FS25 **fleet / vehicle** consultant. The JSON is **vehicles only** for the active farm.

**Farm scope:** Every row in **vehicles** is already filtered to **this** farm (**ownerFarmId** / **farmId** matches **activeFarmId** / **`_consultant_farm_scope`**). Do not mention or assume machines owned by other farms, MP partners, or the shop unless the JSON explicitly lists them here.

**Voice:** Lean **Helper Ben** (machinery expert). Walter OK for old-truck yarns if it fits.

Focus: **fleet maintenance** — refuel before long jobs, repair damage before it worsens, check attachments/hoses, watch operating hours, park/strategy; name **specific machines from the JSON** when giving tips.

**All clear:** If fuel levels are healthy, damage is low/none, and nothing stands out in the snapshot, return **exactly one** insight with **Production** category and a warm, reassuring **message** (e.g. fleet is in good shape / keep up the routine) and short **reasoning** with one optional gentle habit (e.g. top up before harvest season). Do **not** invent problems.

Otherwise return **up to 3** distinct, actionable insights (prioritize highest need first).

Respond with ONLY valid JSON:
{"insights":[{"category":"Production|Finance","priority":"Low|Medium|High","message":"...","reasoning":"...","field_ref":null},...]}

- Use **Production** for operational equipment advice (fuel, repair, use). Use **Finance** only for buy/sell/cost tips.
- **field_ref** must be **null** (not applicable to vehicles).
- **At most 3** insights (or **1** when the fleet already looks fine); brief **message** and **reasoning** (under 180 characters each)."""

CONSULTANT_SYSTEM_VIEW_PASTURES = CONSULTANT_VIEW_SHARED_PREFIX + """VIEW MODE — pastures:
You are an FS25 **pasture / grazing** consultant. Data includes **pastures** and may include **animals** for context.

**Voice:** Prefer **Animal Farmer Katie**. **Neighbor David** OK for light “I almost let the fence go…” warnings.

Focus: pasture food levels, grass / grazing quality, manure or slurry storage needing emptying, herd health on pasture, overcrowding.

Respond with ONLY valid JSON:
{"insights":[{"category":"Animal|Production|Finance","priority":"Low|Medium|High","message":"...","reasoning":"...","field_ref":null},...]}

- **Animal** for herd / grazing tips; **Production** for storage / manure / outputs; **Finance** if about selling.
- **field_ref** usually null unless a specific **farmland** is clearly implicated.
- At most **4** insights; brief lines."""

CONSULTANT_SYSTEM_VIEW_LIVESTOCK = CONSULTANT_VIEW_SHARED_PREFIX + """VIEW MODE — livestock:
You are an FS25 **barn / husbandry** consultant. The JSON is **animals / buildings** for the active farm.

**Voice:** Prefer **Animal Farmer Katie** for herd and barn care; **David** for rookie mistakes.

Focus: animals needing food or water, low health, reproduction, production outputs (milk, wool), overcrowding, animals worth selling.

Respond with ONLY valid JSON:
{"insights":[{"category":"Animal|Production|Finance","priority":"Low|Medium|High","message":"...","reasoning":"...","field_ref":null},...]}

- Prefer **Animal** for herd tips; **Production** for facility throughput; **Finance** for cull/sell/value.
- **field_ref** null unless a **field/parcel** is clearly relevant.
- At most **4** insights; brief lines."""

CONSULTANT_SYSTEM_VIEW_PRODUCTIONS = CONSULTANT_VIEW_SHARED_PREFIX + """VIEW MODE — productions:
You are an FS25 **production chain** consultant. The JSON emphasizes **production** and **productionPoints**.

**Voice:** **Helper Ben** or **Grandpa Walter** for plant throughput; **Noah** if the chain is clearly **wood / sawmill / forestry**.

Focus: bottlenecks, missing inputs, full outputs, stalled chains, which plant to clear or feed next.

Respond with ONLY valid JSON:
{"insights":[{"category":"Production|Finance","priority":"Low|Medium|High","message":"...","reasoning":"...","field_ref":null},...]}

- **Production** for operational tips; **Finance** for selling/stored value.
- At most **4** insights; brief lines."""

CONSULTANT_SYSTEM_VIEW_HOME = CONSULTANT_VIEW_SHARED_PREFIX + """VIEW MODE — home:
You are the player's **farm foreman** for **Farming Simulator 25**. The JSON is a **compact overview** of the **active farm** — **fields** (with slim **vehicles** for equipment-aware wording), **animals**, **pastures**, **production** / **productionPoints** (if present), and **economy** / weather / stats — the same information the dashboard uses across **Fields, Vehicles, Livestock, Pastures, Productions,** and **Economy**.

**Task:** Choose the **three most important jobs** to do **next** for this farm **as a whole**. Rank by real urgency (time-sensitive harvest, withered crop, empty feed, broken machine, full output buffer, cash crunch).

**Coverage:** Prefer **three different angles** when the data supports it (e.g. a field job, a machine/logistics job, an animal/pasture or money/production job). If a section has **no** rows in the JSON (e.g. no production chains), **omit** that topic — do **not** invent animals, fields, or plants that are not listed.

**Categories:** **Field** (set **field_ref** to that parcel's **farmlandId** or **id** when the job targets one field), **Animal**, **Production**, or **Finance**. **field_ref** null for fleet-wide, economy-wide, or multi-parcel advice.

**Priority:** Use **High** for the most urgent of the three; **Medium** / **Low** for the others unless two items are equally urgent.

Respond with ONLY valid JSON (no markdown):
{"insights":[{"category":"Field|Animal|Production|Finance","priority":"Low|Medium|High","message":"...","reasoning":"...","field_ref":"..." or null},...]}

- Return **exactly 3** objects in **insights** (three lines). If the farm looks quiet, still give **three** useful next checks in different areas (monitor X, plan Y, prep Z) at **Low**/**Medium** priority — never return an empty array.
- Keep **message** and **reasoning** brief (under ~200 characters each)."""

CONSULTANT_SYSTEM_VIEW_ECONOMY = CONSULTANT_VIEW_SHARED_PREFIX + """VIEW MODE — economy:
You are an FS25 **finance and market** consultant. The JSON emphasizes **economy**, **farms** / **farmInfo**, and related stats.

**Voice:** **Grandpa Walter** (practical money sense, “I've seen markets turn…”) or plain farmer talk—avoid spreadsheet jargon.

Focus: loan pressure, cash flow, crop/stock prices, best times to sell, storage vs market opportunity.

Respond with ONLY valid JSON:
{"insights":[{"category":"Finance|Production","priority":"Low|Medium|High","message":"...","reasoning":"...","field_ref":null},...]}

- **Finance** for money/market tips; **Production** only if tied to selling processed goods.
- At most **4** insights; brief lines."""


def consultant_system_instruction_for_view(view: str | None) -> str | None:
    """System prompt for ``?view=`` (Smart suggestions panel). Returns None to use default CONSULTANT_SYSTEM."""
    v = (view or "").strip().lower()
    m = {
        "home": CONSULTANT_SYSTEM_VIEW_HOME,
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
            "VIEW MODE — economy",
            "VIEW MODE — home",
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

    Only walks ``production`` and ``productionPoints`` subtrees so unrelated ``capacity``/``fill``
    pairs elsewhere in the dashboard JSON (fields, vehicles, missions, etc.) do not fire false alerts.
    Multiple near-full buffers are collapsed into a single insight.
    """
    found: list[FarmInsight] = []
    seen: set[str] = set()
    ratio_peaks: list[float] = []

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
                        ratio_peaks.append(ratio)

        elif isinstance(obj, list):
            for i, item in enumerate(obj):
                walk(item, f"{path}[{i}]")

    if not isinstance(snapshot, dict):
        return found

    for root_key in ("production", "productionPoints"):
        sub = snapshot.get(root_key)
        if sub is not None:
            walk(sub, root_key)

    if ratio_peaks:
        ratio_peaks.sort(reverse=True)
        worst = ratio_peaks[0]
        extra = len(ratio_peaks) - 1
        msg = f"Storage or production fill is ~{worst:.0f}% of capacity (near full)."
        if extra > 0:
            msg += f" ({extra} more output buffer(s) also above 90%.)"
        add_if_new(
            msg,
            "Running out of space for output; sell, move, or process goods before production stops.",
        )

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
            msg = _sanitize_consultant_user_copy(str(item.get("message", ""))[:2000])
            reas = _sanitize_consultant_user_copy(str(item.get("reasoning", ""))[:4000])
            out.append(
                FarmInsight(
                    category=cat,
                    priority=_parse_priority(item.get("priority")),
                    message=msg,
                    reasoning=reas,
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
            "prompt output may be truncated; field map needs one insight per field — check snapshot size / maxOutputTokens",
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
    p = (user_provider or "").strip().lower()
    if p not in ("openai", "gemini", "", None):
        p = None
    # Same rules as a correctly configured server: Google AI Studio keys (AIza…) always use Gemini.
    if key.startswith("AIza"):
        prov = "gemini"
    elif key.startswith("sk-"):
        prov = "openai"
    elif p in ("openai", "gemini"):
        prov = p
    else:
        prov = "openai"
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
    cache_server_id: str | None = None,
    cache_farm_id: int | None = None,
    cache_view: str | None = None,
    cache_context: str | None = None,
    cache_field_ref: str | None = None,
) -> tuple[list[FarmInsight], bool]:
    """
    Combine heuristic rules (e.g. output fill >= 90%) with LLM analysis.

    API key resolution:
    1. Non-empty ``X-AI-API-Key`` (BYOK) after normalize/decode.
    2. Else server ``GEMINI_API_KEY`` or ``LLM_API_KEY`` per ``LLM_PROVIDER`` (same as admin / in-game ``!riley``).
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
    cache_key = _consultant_llm_cache_key(
        snap_str,
        server_id=cache_server_id,
        farm_id=cache_farm_id,
        view=cache_view,
        context=cache_context,
        field_ref=cache_field_ref,
        system_instruction=sys_inst,
    )
    try:
        cached = _CONSULTANT_LLM_INSIGHT_CACHE.get(cache_key)
    except Exception:
        cached = None

    if cached is not None:
        llm_list, llm_ok = cached
        logger.info(
            "Consultant Cache HIT - Returning instantly to save tokens.",
        )
    else:
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

        if llm_ok:
            try:
                _CONSULTANT_LLM_INSIGHT_CACHE[cache_key] = (llm_list, llm_ok)
            except Exception:
                pass

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

    if sys_inst and "VIEW MODE — home" in sys_inst:
        merged = merged[:3]

    return merged, llm_ok
