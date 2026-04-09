"""Reduce Farm Dashboard snapshot size before LLM calls (token / cost control)."""
from __future__ import annotations

import copy
from typing import Any

# Keys removed entirely (physics / pose / dense geometry).
_DROP_KEYS: frozenset[str] = frozenset(
    {
        "worldPosition",
        "localPosition",
        "worldTransform",
        "translation",
        "rotation",
        "quaternion",
        "linearVelocity",
        "velocity",
        "speedXYZ",
        "motionVector",
        "boundingBox",
        "vertices",
        "pathPoints",
        "waypoints",
        "aiPath",
        "debugInfo",
        "physicsNodes",
        "terrainDeformation",
        "collisionMask",
        "raycastHit",
        "lastPosition",
        "targetPosition",
        "homePosition",
        "spawnPosition",
    }
)

# Drop if key matches (substring, case-insensitive) — catches worldPositionSmoothed etc.
_DROP_KEY_SUBSTR: tuple[str, ...] = (
    "worldposition",
    "localtransform",
    "nodeposition",
    "wheelphysics",
    "suspensionlength",
)


def _is_pure_pose_vector(obj: Any) -> bool:
    """True for {x,y,z} / {x,y,z,w} numeric dicts (coordinates / orientation)."""
    if not isinstance(obj, dict) or not obj:
        return False
    keys = {str(k).lower() for k in obj.keys()}
    if not keys <= {"x", "y", "z", "w"}:
        return False
    try:
        return all(isinstance(obj.get(k), (int, float)) for k in obj)
    except Exception:
        return False


def _should_drop_key(name: str) -> bool:
    kl = name.lower()
    if kl in _DROP_KEYS:
        return True
    for sub in _DROP_KEY_SUBSTR:
        if sub in kl:
            return True
    return False


def _prune_value(obj: Any, depth: int) -> Any:
    if depth > 32:
        return None
    if obj is None or isinstance(obj, (bool, int, float, str)):
        if isinstance(obj, str) and len(obj) > 800:
            return obj[:800] + "…"
        return obj
    if isinstance(obj, list):
        out: list[Any] = []
        for i, item in enumerate(obj):
            if i >= 400:
                break
            v = _prune_value(item, depth + 1)
            if v is not None:
                out.append(v)
        return out
    if isinstance(obj, dict):
        out_d: dict[str, Any] = {}
        for k, v in obj.items():
            if not isinstance(k, str):
                continue
            if _should_drop_key(k):
                continue
            if _is_pure_pose_vector(v):
                continue
            if isinstance(v, dict) and _is_pure_pose_vector(v):
                continue
            pv = _prune_value(v, depth + 1)
            if pv is not None:
                out_d[k] = pv
        return out_d
    return str(obj)[:400]


def prune_field_entry(field: dict[str, Any]) -> dict[str, Any] | None:
    """Keep agronomic / id fields; drop pose / noise."""
    if not field:
        return None
    keep_keys = (
        "id",
        "farmlandId",
        "name",
        "fruitType",
        "growthState",
        "growthLabel",
        "harvestReady",
        "isWithered",
        "groundType",
        "area",
        "needsLime",
        "needsPlowing",
        "needsCultivation",
        "nitrogenLevel",
        "phValue",
        "moisture",
        "weedLevel",
        "stoneLevel",
        "isOwned",
        "playerFarmIndex",
        "needsWork",
        "suggestedNextStep",
        "isHarvested",
        "isMulched",
        "mulchLevel",
        "stubbleShredLevel",
        "plowLevel",
        "limeLevel",
        "fertilizerLevel",
    )
    out: dict[str, Any] = {}
    for key in keep_keys:
        if key in field:
            pv = _prune_value(field[key], 0)
            if pv is not None:
                out[key] = pv
    for k, v in field.items():
        if k in out or k in _DROP_KEYS:
            continue
        kl = k.lower()
        if "position" in kl or "rotation" in kl:
            continue
        if kl.startswith("pf") or kl.startswith("precision"):
            pv = _prune_value(v, 0)
            if pv is not None:
                out[k] = pv
    return out or None


def prune_dashboard_snapshot_for_llm(data: Any) -> Any:
    """
    Return a copy of the dashboard snapshot with low-value / high-token keys removed.
    Safe for game + merged JSON shapes (Farm Dashboard / dataMerger).
    """
    if data is None:
        return None
    if not isinstance(data, dict):
        return _prune_value(data, 0)

    root = copy.deepcopy(data)
    # Normalise top-level sections
    for key in ("fields", "allFields"):
        arr = root.get(key)
        if isinstance(arr, list):
            new_list: list[Any] = []
            for f in arr:
                if isinstance(f, dict):
                    pf = prune_field_entry(f)
                    if pf is not None:
                        new_list.append(pf)
                else:
                    nv = _prune_value(f, 0)
                    if nv is not None:
                        new_list.append(nv)
            root[key] = new_list[:300]

    if isinstance(root.get("vehicles"), list):
        slim: list[Any] = []
        for v in root["vehicles"][:120]:
            if not isinstance(v, dict):
                slim.append(_prune_value(v, 0))
                continue
            sv: dict[str, Any] = {}
            for vk in (
                "id",
                "name",
                "vehicleName",
                "displayName",
                "type",
                "category",
                "brand",
                "farmId",
                "isRunning",
                "motorIsStarted",
                "speed",
                "lastSpeed",
                "fuelLevel",
                "fuel",
                "damage",
                "operatingTime",
                "fillLevel",
                "fillType",
                "fillTypeName",
                "attachedTools",
                "implements",
                "hasConnectionHoses",
                "isAIControlled",
            ):
                if vk in v:
                    sv[vk] = _prune_value(v[vk], 0)
            for k2, v2 in v.items():
                if k2 in sv or _should_drop_key(k2):
                    continue
                kl = k2.lower()
                if "fill" in kl or "level" in kl or "capacity" in kl:
                    sv[k2] = _prune_value(v2, 0)
            slim.append(sv)
        root["vehicles"] = slim

    for section in ("economy", "farms", "production", "productionPoints", "animals", "weather", "missions", "statistics"):
        if section in root:
            root[section] = _prune_value(root[section], 0)

    # Strip heavy debug / duplicate
    for drop in ("debug", "rawLua", "fullXmlDump"):
        root.pop(drop, None)

    # Second pass: remove pose keys anywhere
    return _prune_value(root, 0)


def pruned_json_bytes_estimate(data: Any) -> int:
    """Rough UTF-8 length after prune (for metrics only)."""
    import json

    try:
        return len(json.dumps(data, ensure_ascii=False, default=str))
    except Exception:
        return 0


def _field_row_matches_ref(row: dict[str, Any], target: str) -> bool:
    t = (target or "").strip()
    if not t or not isinstance(row, dict):
        return False
    for key in ("farmlandId", "id"):
        if key not in row:
            continue
        v = row.get(key)
        if v is None:
            continue
        if str(v).strip() == t:
            return True
        try:
            if int(float(v)) == int(float(t)):
                return True
        except (TypeError, ValueError):
            continue
    return False


def slice_snapshot_for_single_field(snapshot: dict[str, Any], field_ref: str) -> dict[str, Any] | None:
    """
    Minimal snapshot: one field row + light farm context so the LLM cannot see other parcels' data.
    """
    ref = (field_ref or "").strip()
    if not ref or not isinstance(snapshot, dict):
        return None
    out: dict[str, Any] = {}
    for key in ("timestamp", "serverInfo", "activeFarm", "farmId", "gameTime", "error"):
        if key in snapshot:
            out[key] = copy.deepcopy(snapshot[key])
    for arr_key in ("fields", "allFields"):
        arr = snapshot.get(arr_key)
        if not isinstance(arr, list):
            continue
        for row in arr:
            if isinstance(row, dict) and _field_row_matches_ref(row, ref):
                pf = prune_field_entry(row)
                out["fields"] = [pf if pf is not None else copy.deepcopy(row)]
                out["_consultant_field_scope"] = ref
                return out
    return None


def prune_snapshot_fields_context_only(snapshot: dict[str, Any]) -> dict[str, Any]:
    """
    Server-wide consultant call focused on crops/soil: drop heavy non-field sections from LLM input.
    """
    if not isinstance(snapshot, dict):
        return snapshot
    root = copy.deepcopy(snapshot)
    for drop in ("vehicles", "animals", "missions", "productionPoints"):
        root.pop(drop, None)
    if "production" in root:
        root["production"] = _prune_value(root["production"], 0)
    for light in ("weather", "economy", "farms", "statistics"):
        if light in root:
            root[light] = _prune_value(root[light], 0)
    return root
