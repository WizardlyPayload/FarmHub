"""Proactive farm analysis: heuristics + LLM over dashboard snapshot JSON."""
from __future__ import annotations

import json
import re
from typing import Any

from app.config import get_settings
from app.schemas.insights import FarmInsight, InsightCategory, InsightPriority
from app.services.log_buffer import log_event

CONSULTANT_SYSTEM = """You are an expert Farming Simulator logistics consultant. Analyze the provided game state JSON. Identify:

Immediate production bottlenecks (inputs low/outputs full).

Critical field tasks (harvesting/planting/withering).

Animal welfare (low food/water or space for new purchases).

Market opportunities (best prices for stored crops).

Provide your reasoning as a series of brief, actionable bullet points.

You MUST respond with ONLY valid JSON (no markdown, no prose before or after) in this exact shape:
{"insights":[{"category":"Field|Animal|Production|Finance","priority":"Low|Medium|High","message":"...","reasoning":"..."},...]}
Use at least one insight per relevant area; use an empty array if the snapshot has no usable data."""


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
    return InsightCategory.PRODUCTION


def _parse_priority(raw: Any) -> InsightPriority:
    s = str(raw or "").strip().title()
    for p in InsightPriority:
        if p.value == s:
            return p
    return InsightPriority.MEDIUM


async def _llm_insights_from_snapshot(snapshot_json: str) -> tuple[list[FarmInsight], bool]:
    """Call OpenAI or Gemini with consultant system prompt; parse JSON insights."""
    settings = get_settings()
    provider = settings["llm_provider"]

    user_payload = (
        "Analyze this game state JSON and return ONLY the JSON object as specified.\n\n"
        f"```json\n{snapshot_json[:118000]}\n```"
    )

    try:
        if provider == "gemini" and settings.get("gemini_api_key"):
            text = await _gemini_consultant(settings, user_payload)
        else:
            text = await _openai_consultant(settings, user_payload)
    except Exception as e:
        log_event("WARN", f"Consultant LLM failed: {e}")
        return [], False

    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.I)
    text = re.sub(r"\s*```\s*$", "", text)

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        log_event("WARN", "Consultant LLM returned non-JSON")
        return [], False

    raw_list = data.get("insights") if isinstance(data, dict) else None
    if not isinstance(raw_list, list):
        return [], False

    out: list[FarmInsight] = []
    for item in raw_list:
        if not isinstance(item, dict):
            continue
        try:
            out.append(
                FarmInsight(
                    category=_parse_category(item.get("category")),
                    priority=_parse_priority(item.get("priority")),
                    message=str(item.get("message", ""))[:2000],
                    reasoning=str(item.get("reasoning", ""))[:4000],
                )
            )
        except Exception:
            continue
    return out, True


async def _openai_consultant(settings: dict, user_message: str) -> str:
    from openai import AsyncOpenAI

    key = settings.get("llm_api_key") or ""
    if not key:
        raise RuntimeError("LLM_API_KEY not set")
    client = AsyncOpenAI(api_key=key)
    model = settings["llm_model"]
    resp = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": CONSULTANT_SYSTEM},
            {"role": "user", "content": user_message},
        ],
        temperature=0.3,
        max_tokens=4096,
        response_format={"type": "json_object"},
    )
    return (resp.choices[0].message.content or "").strip()


async def _gemini_consultant(settings: dict, user_message: str) -> str:
    """Gemini: JSON reply when supported; parse in caller."""
    import httpx

    from app.services.llm_service import _gemini_generate_url

    if not settings.get("gemini_api_key"):
        raise RuntimeError("GEMINI_API_KEY not set")
    url = _gemini_generate_url(settings)
    prompt = f"{CONSULTANT_SYSTEM}\n\n{user_message}"
    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.3, "maxOutputTokens": 4096},
    }
    async with httpx.AsyncClient(timeout=90.0) as client:
        r = await client.post(url, json=payload)
        r.raise_for_status()
        data = r.json()
    parts = (
        data.get("candidates", [{}])[0]
        .get("content", {})
        .get("parts", [])
    )
    return "".join(p.get("text", "") for p in parts).strip()


def _llm_api_available(settings: dict[str, Any]) -> bool:
    """Consultant may use LLM whenever provider keys are set (independent of ENABLE_AI_BOT)."""
    if settings.get("llm_provider") == "gemini":
        return bool((settings.get("gemini_api_key") or "").strip())
    return bool((settings.get("llm_api_key") or "").strip())


async def generate_farm_insights(snapshot_data: dict[str, Any]) -> tuple[list[FarmInsight], bool]:
    """
    Combine heuristic rules (e.g. output fill >= 90%) with LLM analysis.
    Returns (insights, llm_used).
    """
    heuristics = _heuristic_production_output_space(snapshot_data)
    settings = get_settings()

    if not _llm_api_available(settings):
        return heuristics, False

    try:
        snap_str = json.dumps(snapshot_data, ensure_ascii=False, default=str)
    except Exception:
        snap_str = "{}"

    llm_list, llm_ok = await _llm_insights_from_snapshot(snap_str)

    # Merge: heuristics first (deterministic), then LLM; dedupe similar messages
    seen_msg: set[str] = {h.message[:80] for h in heuristics}
    merged = list(heuristics)
    for ins in llm_list:
        key = ins.message[:80]
        if key not in seen_msg:
            seen_msg.add(key)
            merged.append(ins)

    return merged, llm_ok
