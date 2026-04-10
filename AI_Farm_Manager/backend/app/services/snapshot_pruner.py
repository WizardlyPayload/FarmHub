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
            # Cap for token control: keep at least 50 field rows when the farm has that many (never below [:50] intent when len>=50).
            n = len(new_list)
            max_fields = max(50, min(300, n))
            root[key] = new_list[:max_fields]

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
                slim_v = _slim_vehicles_for_equipment_hints(snapshot.get("vehicles"))
                if slim_v:
                    out["vehicles"] = slim_v
                return out
    return None


def _owner_farm_id(row: dict[str, Any]) -> int:
    try:
        return int(row.get("ownerFarmId", row.get("farmId")) or 0)
    except (TypeError, ValueError):
        return 0


def resolve_consultant_farm_id(snapshot: dict[str, Any], farm_id_query: int | None) -> int:
    """
    Farm Dashboard farm selector (or ``?farmId=``). Falls back to snapshot ``activeFarmId`` / ``activeFarm.id`` / 1.
    """
    if farm_id_query is not None:
        try:
            q = int(farm_id_query)
            if q > 0:
                return q
        except (TypeError, ValueError):
            pass
    raw_af = snapshot.get("activeFarmId") if isinstance(snapshot, dict) else None
    if raw_af is None and isinstance(snapshot, dict) and isinstance(snapshot.get("activeFarm"), dict):
        raw_af = snapshot["activeFarm"].get("id")
    try:
        af = int(raw_af) if raw_af is not None else 1
        return af if af > 0 else 1
    except (TypeError, ValueError):
        return 1


def prune_snapshot_to_active_farm(snapshot: dict[str, Any], farm_id: int) -> dict[str, Any]:
    """
    Keep only rows for the farm the player is viewing (same rule as ``filterFieldsForFarmView``:
    ``ownerFarmId`` / ``farmId`` must match). Drops other farms' fields, vehicles, animals, production chains.

    **Field ``isOwned``:** In Lua this flag is ``ownerFarmId == currentFarmId`` (the farm **active in the game
    session**). Farm Dashboard can switch ``activeFarmId`` to preview another farm without changing the
    save's current farm, so raw JSON may show ``isOwned: false`` on parcels that still belong to the
    selected farm. After filtering by ``ownerFarmId``, we set ``isOwned`` to **True** on each kept field
    row so the consultant does not suggest buying land the player already owns for that farm view.

    Call for consultant paths so the LLM is not given the whole map / other saves' data is already split by server.
    """
    if not isinstance(snapshot, dict) or farm_id <= 0:
        return snapshot
    root = copy.deepcopy(snapshot)
    root["activeFarmId"] = farm_id
    root["_consultant_farm_scope"] = farm_id
    if isinstance(root.get("activeFarm"), dict):
        afm = copy.deepcopy(root["activeFarm"])
        try:
            cur = int(afm.get("id", farm_id))
        except (TypeError, ValueError):
            cur = farm_id
        if cur != farm_id:
            afm["id"] = farm_id
        root["activeFarm"] = afm

    def keep_owned_field(f: dict[str, Any]) -> bool:
        return _owner_farm_id(f) == farm_id

    for key in ("fields", "allFields"):
        arr = root.get(key)
        if not isinstance(arr, list):
            continue
        kept: list[dict[str, Any]] = []
        for f in arr:
            if not isinstance(f, dict) or not keep_owned_field(f):
                continue
            fc = copy.deepcopy(f)
            fc["isOwned"] = True
            kept.append(fc)
        root[key] = kept

    if isinstance(root.get("vehicles"), list):
        root["vehicles"] = [
            copy.deepcopy(v)
            for v in root["vehicles"]
            if isinstance(v, dict) and _owner_farm_id(v) == farm_id
        ]

    an = root.get("animals")
    if isinstance(an, list):
        root["animals"] = [
            copy.deepcopy(b)
            for b in an
            if isinstance(b, dict) and _owner_farm_id(b) == farm_id
        ]

    prod = root.get("production")
    if isinstance(prod, dict) and isinstance(prod.get("chains"), list):
        prod = copy.deepcopy(prod)
        prod["chains"] = [
            copy.deepcopy(c)
            for c in prod["chains"]
            if isinstance(c, dict) and _owner_farm_id(c) == farm_id
        ]
        root["production"] = prod
    elif isinstance(prod, list):
        root["production"] = [
            copy.deepcopy(p)
            for p in prod
            if isinstance(p, dict) and _owner_farm_id(p) == farm_id
        ]

    if isinstance(root.get("productionPoints"), list):
        root["productionPoints"] = [
            copy.deepcopy(p)
            for p in root["productionPoints"]
            if isinstance(p, dict) and _owner_farm_id(p) == farm_id
        ]

    for fk in ("farms", "farmInfo"):
        fa = root.get(fk)
        if not isinstance(fa, list):
            continue
        slim: list[Any] = []
        for x in fa:
            if not isinstance(x, dict):
                continue
            try:
                xid = int(x.get("id", x.get("farmId")) or 0)
            except (TypeError, ValueError):
                xid = 0
            if xid == farm_id:
                slim.append(copy.deepcopy(x))
        root[fk] = slim

    return root


def cap_field_rows_in_snapshot(snapshot: dict[str, Any], max_rows: int) -> dict[str, Any]:
    """
    Limit ``fields`` / ``allFields`` length after pruning so FIELD MAP mode stays small enough
    for Gemini output (2.5 models may use internal tokens toward maxOutputTokens).
    """
    if not isinstance(snapshot, dict) or max_rows < 1:
        return snapshot
    out = copy.deepcopy(snapshot)
    for key in ("fields", "allFields"):
        arr = out.get(key)
        if isinstance(arr, list) and len(arr) > max_rows:
            out[key] = arr[:max_rows]
    return out


def _consultant_minimal_headers(root: dict[str, Any]) -> dict[str, Any]:
    """Tiny farm/save context for section-scoped consultant calls (after active-farm prune)."""
    out: dict[str, Any] = {}
    for k in (
        "timestamp",
        "serverInfo",
        "activeFarmId",
        "activeFarm",
        "farmId",
        "gameTime",
        "error",
        "_consultant_farm_scope",
    ):
        if k in root:
            out[k] = copy.deepcopy(root[k])
    return out


def prune_snapshot_for_dashboard_view(snapshot: dict[str, Any], view: str) -> dict[str, Any]:
    """
    Reduce consultant JSON to what the Farm Dashboard user is looking at (navbar section).

    Call **after** ``prune_snapshot_to_active_farm``. ``view`` matches hash sections:
    fields, vehicles, pastures, livestock, productions, economy. ``full`` / ``dashboard`` / ``landing`` = no op.
    """
    v = (view or "full").strip().lower()
    if v in ("full", "dashboard", "landing", "general", ""):
        return copy.deepcopy(snapshot)
    if not isinstance(snapshot, dict):
        return snapshot

    root = copy.deepcopy(snapshot)
    if v == "fields":
        return prune_snapshot_fields_context_only(root)

    h = _consultant_minimal_headers(root)

    if v == "vehicles":
        h["vehicles"] = copy.deepcopy(root.get("vehicles") or [])
        return h
    if v == "pastures":
        h["pastures"] = copy.deepcopy(root.get("pastures") or [])
        if root.get("animals"):
            h["animals"] = copy.deepcopy(root["animals"])
        return h
    if v == "livestock":
        h["animals"] = copy.deepcopy(root.get("animals") or [])
        return h
    if v == "productions":
        if "production" in root:
            h["production"] = copy.deepcopy(root["production"])
        if "productionPoints" in root:
            h["productionPoints"] = copy.deepcopy(root["productionPoints"])
        return h
    if v == "economy":
        for k in ("economy", "farmInfo", "farms", "statistics", "weather"):
            if k in root:
                h[k] = copy.deepcopy(root[k])
        return h

    return root


def _slim_vehicles_for_equipment_hints(vehicles: Any, limit: int = 100) -> list[dict[str, Any]]:
    """
    Minimal vehicle rows so the LLM can match tasks to owned equipment (harvest, plow, weed, lime)
    without sending full physics/poses. Empty list if none.
    """
    if not isinstance(vehicles, list):
        return []
    out: list[dict[str, Any]] = []
    for v in vehicles[:limit]:
        if not isinstance(v, dict):
            continue
        row: dict[str, Any] = {}
        for k in (
            "name",
            "vehicleName",
            "displayName",
            "type",
            "category",
            "brand",
            "fillType",
            "fillTypeName",
        ):
            if k in v and v[k] is not None:
                row[k] = v[k]
        if row:
            out.append(row)
    return out


def prune_snapshot_fields_context_only(snapshot: dict[str, Any]) -> dict[str, Any]:
    """
    Server-wide consultant call focused on crops/soil: drop heavy non-field sections from LLM input.
    Re-injects a **slim** ``vehicles`` list so the model can tell "use your combine" vs "consider acquiring".
    """
    if not isinstance(snapshot, dict):
        return snapshot
    root = copy.deepcopy(snapshot)
    raw_vehicles = root.get("vehicles")
    for drop in ("vehicles", "animals", "missions", "productionPoints"):
        root.pop(drop, None)
    if "production" in root:
        root["production"] = _prune_value(root["production"], 0)
    for light in ("weather", "economy", "farms", "statistics"):
        if light in root:
            root[light] = _prune_value(root[light], 0)
    # Field-map requests do not need global stats — saves prompt tokens.
    for drop_extra in ("statistics", "economy", "missions"):
        root.pop(drop_extra, None)
    slim_v = _slim_vehicles_for_equipment_hints(raw_vehicles)
    if slim_v:
        root["vehicles"] = slim_v
    return root


def pick_first_owned_field_row(
    snapshot: dict[str, Any],
    active_farm_id: int | None = None,
) -> tuple[str | None, dict[str, Any] | None]:
    """
    Choose one parcel for single-field consultant tests: first owned field for the active farm.

    Matches Farm Dashboard behaviour: filter by ``ownerFarmId`` / ``farmId`` vs ``activeFarmId``
    (from JSON or default 1). Falls back to any player-owned field, then any field with an id.
    """
    af = active_farm_id
    if af is None:
        raw_af = snapshot.get("activeFarmId")
        if raw_af is None and isinstance(snapshot.get("activeFarm"), dict):
            raw_af = snapshot["activeFarm"].get("id")
        try:
            af = int(raw_af) if raw_af is not None else 1
        except (TypeError, ValueError):
            af = 1

    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for key in ("fields", "allFields"):
        arr = snapshot.get(key)
        if not isinstance(arr, list):
            continue
        for f in arr:
            if not isinstance(f, dict):
                continue
            rid = f.get("farmlandId", f.get("id"))
            sk = str(rid).strip() if rid is not None else ""
            if sk and sk in seen:
                continue
            if sk:
                seen.add(sk)
            rows.append(f)

    def sort_key(f: dict[str, Any]) -> tuple[int, int]:
        v = f.get("farmlandId", f.get("id"))
        try:
            return (0, int(v))
        except (TypeError, ValueError):
            return (1, 0)

    rows.sort(key=sort_key)

    def owner_id(f: dict[str, Any]) -> int:
        try:
            return int(f.get("ownerFarmId", f.get("farmId")) or 0)
        except (TypeError, ValueError):
            return 0

    def field_ref_of(f: dict[str, Any]) -> str | None:
        v = f.get("farmlandId", f.get("id"))
        if v is None:
            return None
        s = str(v).strip()
        return s if s else None

    for f in rows:
        if owner_id(f) > 0 and owner_id(f) == af:
            ref = field_ref_of(f)
            if ref:
                return ref, f

    for f in rows:
        if owner_id(f) > 0:
            ref = field_ref_of(f)
            if ref:
                return ref, f

    for f in rows:
        ref = field_ref_of(f)
        if ref:
            return ref, f

    return None, None
