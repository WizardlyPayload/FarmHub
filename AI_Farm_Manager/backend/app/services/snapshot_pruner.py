"""Reduce Farm Dashboard snapshot size before LLM calls (token / cost control)."""
from __future__ import annotations

import copy
import json
from typing import Any

# LLM context block cap (``dashboard_service.build_dashboard_context_block``); trim dicts, never slice JSON text.
DEFAULT_LLM_CONTEXT_MAX_UTF8_BYTES = 120_000

# Root keys dropped first when UTF-8 JSON still exceeds budget (historical / debug / bulky logs).
_STRUCTURED_TRUNC_DROP_ORDER: tuple[str, ...] = (
    "fieldStatusHistory",
    "_fieldHistory",
    "fieldHistory",
    "missions",
    "debug",
    "rawLua",
    "fullXmlDump",
    "debugInfo",
    "statistics",
    "economy",
    "weather",
    "productionPoints",
    "production",
    "animals",
    "pastures",
    "vehicles",
    "allFields",
    "fields",
)

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
    # Non-JSON-native value: emit a short string (never slice whole-document JSON).
    s = str(obj)
    return s[:400] + ("…" if len(s) > 400 else "")


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
        # Loose bales / windrows on parcel (Farm Dashboard mod + merged API)
        "baleCountOnField",
        "baleCount",
        "hasWindrow",
        "windrowLiters",
        "windrowByFillName",
        "needsBaling",
        "baleableLooseLiters",
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
        # FS25 base has no player soil-moisture HUD; stray keys / mods confuse the LLM with irrigation.
        if kl == "moisture" or kl.endswith("soilmoisture") or kl.endswith("_moisture"):
            continue
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
                "ownerFarmId",
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
        scope = root.get("_consultant_farm_scope")
        if scope is not None and slim:
            try:
                fid = int(scope)
            except (TypeError, ValueError):
                fid = 0
            if fid > 0:
                slim = [
                    x
                    for x in slim
                    if isinstance(x, dict) and _owner_farm_id(x) == fid
                ]
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
    try:
        return len(json.dumps(data, ensure_ascii=False, default=str).encode("utf-8"))
    except Exception:
        return 0


def _snapshot_utf8_json_len(data: Any) -> int:
    try:
        return len(json.dumps(data, ensure_ascii=False, default=str).encode("utf-8"))
    except Exception:
        return DEFAULT_LLM_CONTEXT_MAX_UTF8_BYTES + 1


def truncate_snapshot_dict_to_max_utf8_bytes(data: Any, max_bytes: int) -> Any:
    """
    Ensure JSON serialization fits ``max_bytes`` UTF-8 by removing entire low-priority root keys / arrays.
    Output is always valid JSON when serialized (no string slicing of ``json.dumps`` output).
    """
    if max_bytes < 1:
        return data
    root: Any = copy.deepcopy(data)

    def sz() -> int:
        return _snapshot_utf8_json_len(root)

    if sz() <= max_bytes:
        return root

    if isinstance(root, list):
        while len(root) > 0 and sz() > max_bytes:
            root.pop()
        return root

    if not isinstance(root, dict):
        return root

    for key in _STRUCTURED_TRUNC_DROP_ORDER:
        if key in root and sz() > max_bytes:
            root.pop(key, None)

    # Shrink arrays from the end (whole elements only).
    for _ in range(50000):
        if sz() <= max_bytes:
            return root
        trimmed = False
        for arr_key in ("fields", "allFields", "vehicles", "animals", "pastures"):
            arr = root.get(arr_key)
            if isinstance(arr, list) and len(arr) > 0:
                root[arr_key] = arr[:-1]
                trimmed = True
                break
        if trimmed:
            continue
        victim = next(iter(root.keys()), None)
        if victim is None:
            return {"_truncated": True}
        root.pop(victim)

    return root if sz() <= max_bytes else {"_truncated": True, "error": "snapshot exceeds budget"}


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
    for key in ("timestamp", "serverInfo", "activeFarm", "activeFarmId", "farmId", "gameTime", "error", "_consultant_farm_scope"):
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
                scope = snapshot.get("_consultant_farm_scope")
                if scope is None:
                    scope = snapshot.get("activeFarmId")
                try:
                    af = int(scope) if scope is not None else 0
                except (TypeError, ValueError):
                    af = 0
                slim_v = _slim_vehicles_for_equipment_hints(
                    snapshot.get("vehicles"), farm_id=af if af > 0 else None
                )
                if slim_v:
                    out["vehicles"] = slim_v
                return out
    return None


def _owner_farm_id(row: dict[str, Any]) -> int:
    try:
        return int(row.get("ownerFarmId", row.get("farmId")) or 0)
    except (TypeError, ValueError):
        return 0


_CONSULTANT_FIELD_MAP_MAX_ROWS = 80  # match ``consultantSnapshotPrune.js`` MAX_FIELD_MAP


def _field_row_belongs_to_farm(row: dict[str, Any], farm_id: int) -> bool:
    """
    True when the parcel counts as this farm's land for consultant views.

    Uses the same rule as the Farm Dashboard Fields list (``filterFieldsForFarmView`` in
    ``fields.js``): ``ownerFarmId`` if set, otherwise ``farmId``. We intentionally **do not**
    use ``playerFarmId`` here — on some saves it matches the active session while the parcel
    is not owned by that farm, which made Smart suggestions name fields the player does not own.
    """
    if farm_id <= 0:
        return False
    oid_raw = row.get("ownerFarmId")
    if oid_raw is None or (isinstance(oid_raw, str) and not str(oid_raw).strip()):
        oid_raw = row.get("farmId")
    if oid_raw is None or (isinstance(oid_raw, str) and not str(oid_raw).strip()):
        return False
    try:
        oid = int(oid_raw)
    except (TypeError, ValueError):
        return False
    return oid > 0 and oid == farm_id


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


def prune_snapshot_to_active_farm(
    snapshot: dict[str, Any],
    farm_id: int,
    *,
    field_map_relax_empty_fields: bool = False,
) -> dict[str, Any]:
    """
    Keep only rows for the farm the player is viewing. **Field rows** use **ownerFarmId** first
    (same as Farm Dashboard ``filterFieldsForFarmView`` / Node ``fieldRowOwnedByFarm``); rows with no
    resolvable owner are dropped. Vehicles/animals/production still use ``_owner_farm_id``.

    **Field ``isOwned``:** In Lua this flag is ``ownerFarmId == currentFarmId`` (the farm **active in the game
    session**). Farm Dashboard can switch ``activeFarmId`` to preview another farm without changing the
    save's current farm, so raw JSON may show ``isOwned: false`` on parcels that still belong to the
    selected farm. After filtering by ownership keys, we set ``isOwned`` to **True** on each kept field
    row so the consultant does not suggest buying land the player already owns for that farm view.

    Call for consultant paths so the LLM is not given the whole map / other saves' data is already split by server.
    """
    if not isinstance(snapshot, dict) or farm_id <= 0:
        return snapshot
    root = copy.deepcopy(snapshot)
    pre_fields: list[Any] = copy.deepcopy(root["fields"]) if isinstance(root.get("fields"), list) else []
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
        return _field_row_belongs_to_farm(f, farm_id)

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

    if field_map_relax_empty_fields and isinstance(root.get("fields"), list) and len(root["fields"]) == 0 and pre_fields:
        kept_fb: list[dict[str, Any]] = []
        for f in pre_fields[:_CONSULTANT_FIELD_MAP_MAX_ROWS]:
            if isinstance(f, dict) and _field_row_belongs_to_farm(f, farm_id):
                fc = copy.deepcopy(f)
                fc["isOwned"] = True
                kept_fb.append(fc)
        root["fields"] = kept_fb

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


def prune_snapshot_home_overview(snapshot: dict[str, Any]) -> dict[str, Any]:
    """
    Home / dashboard Smart panel: one JSON bundle covering fields (agronomic), slim vehicles,
    animals, pastures, productions, and economy so the LLM can rank **three** farm-wide priorities.
    Called with ``view=home`` after active-farm prune.
    """
    if not isinstance(snapshot, dict):
        return snapshot
    field_slice = prune_snapshot_fields_context_only(copy.deepcopy(snapshot))
    h: dict[str, Any] = _consultant_minimal_headers(snapshot)

    for key in ("fields", "allFields"):
        if key in field_slice:
            h[key] = field_slice[key]

    if "vehicles" in field_slice:
        h["vehicles"] = field_slice["vehicles"]

    for fk in ("fields", "allFields"):
        arr = h.get(fk)
        if isinstance(arr, list) and len(arr) > 48:
            h[fk] = arr[:48]

    root = copy.deepcopy(snapshot)
    for key in ("pastures", "animals"):
        if key in root and root[key] is not None:
            h[key] = copy.deepcopy(root[key])
            if isinstance(h[key], list) and len(h[key]) > 96:
                h[key] = h[key][:96]

    for key in ("production", "productionPoints"):
        if key in root:
            h[key] = _prune_value(copy.deepcopy(root[key]), 1)

    for key in ("economy", "farmInfo", "farms", "statistics", "weather"):
        if key in root:
            h[key] = _prune_value(copy.deepcopy(root[key]), 1)

    h["_consultant_snapshot_mode"] = "home_overview"
    return h


_ECONOMY_FIELD_KEYS: frozenset[str] = frozenset(
    {
        "farmlandId",
        "id",
        "name",
        "label",
        "hectares",
        "fruitTypeIndex",
        "fruitTypeName",
        "growthState",
        "harvestReady",
        "baleCountOnField",
        "baleCount",
        "needsBaling",
        "baleableLooseLiters",
        "hasWindrow",
        "windrowLiters",
        "needsWork",
        "xmlFruitTypeHint",
    }
)


def _slim_field_rows_for_economy_view(fields: Any, max_rows: int = 48) -> list[dict[str, Any]]:
    """Harvest readiness, bales/swaths, crop identity — matches Farm Dashboard BYOK pruner."""
    if not isinstance(fields, list):
        return []
    out: list[dict[str, Any]] = []
    for row in fields[:max_rows]:
        if not isinstance(row, dict):
            continue
        slim = {k: copy.deepcopy(row[k]) for k in _ECONOMY_FIELD_KEYS if k in row}
        if slim:
            out.append(slim)
    return out


_MIN_HELD_LITERS = 1.0

_ECONOMY_MARKET_PRICE_SKIP: frozenset[str] = frozenset(
    {
        "AIR",
        "DIESEL",
        "DEF",
        "BALE_WRAP",
        "BALE_TWINE",
        "UNKNOWN",
    }
)


def _norm_fill_type(name: Any) -> str:
    if name is None:
        return ""
    s = str(name).strip().upper()
    return s


def _merge_fill_level_map(
    levels: Any,
    held: dict[str, dict[str, Any]],
    source: str,
) -> None:
    if not isinstance(levels, dict):
        return
    for raw_key, v in levels.items():
        key = _norm_fill_type(raw_key)
        if not key or key == "UNKNOWN":
            continue
        liters = float("nan")
        if isinstance(v, (int, float)):
            liters = float(v)
        elif isinstance(v, dict) and isinstance(v.get("level"), (int, float)):
            liters = float(v["level"])
        if not (liters == liters) or liters < _MIN_HELD_LITERS:
            continue
        rec = held.setdefault(key, {"liters": 0.0, "sources": set()})
        rec["liters"] += liters
        rec["sources"].add(source)


def _chain_owned_by_farm(chain: dict[str, Any], farm_id: int) -> bool:
    o = chain.get("ownerFarmId", chain.get("farmId", chain.get("playerFarmId")))
    if o is None:
        return True
    try:
        return int(o) == farm_id
    except (TypeError, ValueError):
        return False


def _collect_held_fill_types_for_economy_view(
    root: dict[str, Any],
    farm_id: int,
    fields_for_farm: list[dict[str, Any]],
) -> tuple[dict[str, dict[str, Any]], frozenset[str]]:
    """Physical stock: production I/O, vehicles, animals, harvest/bale/windrow fields (matches JS pruner)."""
    held: dict[str, dict[str, Any]] = {}

    prod = root.get("production")
    if isinstance(prod, dict):
        chains = prod.get("chains")
        if isinstance(chains, list):
            for ch in chains:
                if not isinstance(ch, dict) or not _chain_owned_by_farm(ch, farm_id):
                    continue
                _merge_fill_level_map(ch.get("inputFillLevels"), held, "production.input")
                _merge_fill_level_map(ch.get("outputFillLevels"), held, "production.output")

    ppts = root.get("productionPoints")
    if isinstance(ppts, list):
        for pt in ppts:
            if not isinstance(pt, dict) or not _chain_owned_by_farm(pt, farm_id):
                continue
            _merge_fill_level_map(pt.get("inputFillLevels"), held, "productionPoint.input")
            _merge_fill_level_map(pt.get("outputFillLevels"), held, "productionPoint.output")
            _merge_fill_level_map(pt.get("storageFillLevels"), held, "productionPoint.storage")

    veh = root.get("vehicles")
    if isinstance(veh, list):
        for ve in veh:
            if isinstance(ve, dict):
                _merge_fill_level_map(ve.get("fillLevels"), held, "vehicle")

    an = root.get("animals")
    if isinstance(an, list):
        for a in an:
            if isinstance(a, dict):
                _merge_fill_level_map(a.get("fillLevels"), held, "animal.fillLevels")
                _merge_fill_level_map(a.get("storageData"), held, "animal.storage")

    for f in fields_for_farm:
        if not isinstance(f, dict):
            continue
        hr = f.get("harvestReady") is True
        try:
            bales_n = float(f.get("baleCountOnField", f.get("baleCount", 0)) or 0)
        except (TypeError, ValueError):
            bales_n = 0.0
        try:
            wind = float(f.get("windrowLiters", 0) or 0)
        except (TypeError, ValueError):
            wind = 0.0
        try:
            loose_b = float(f.get("baleableLooseLiters", 0) or 0)
        except (TypeError, ValueError):
            loose_b = 0.0
        bales = bales_n > 0
        windrow = wind >= _MIN_HELD_LITERS
        loose_bale = loose_b >= _MIN_HELD_LITERS
        if not hr and not bales and not windrow and not loose_bale:
            continue
        ft = _norm_fill_type(f.get("fruitTypeName") or f.get("fruitType") or f.get("xmlFruitTypeHint"))
        if not ft:
            continue
        rec = held.setdefault(ft, {"liters": 0.0, "sources": set()})
        if rec["liters"] < _MIN_HELD_LITERS:
            rec["liters"] = _MIN_HELD_LITERS
        rec["sources"].add("field:harvest_ready" if hr else "field:bale_or_windrow")

    held_types = frozenset(held.keys())
    return held, held_types


def _held_fill_types_to_list(held: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for fill_type, rec in held.items():
        liters = float(rec.get("liters", 0) or 0)
        src = rec.get("sources")
        sources = sorted(src) if isinstance(src, set) else []
        rows.append(
            {
                "fillType": fill_type,
                "litersApprox": round(liters, 3),
                "sources": sources,
            }
        )
    rows.sort(key=lambda x: x.get("litersApprox", 0), reverse=True)
    return rows


def _economy_subset_for_held_inventory(econ: Any, held_types: frozenset[str]) -> Any:
    """Strip global sell-point matrices; keep price rows only for held fill types."""
    if not isinstance(econ, dict):
        return econ
    out = copy.deepcopy(econ)
    out.pop("sellPoints", None)

    price_types = frozenset(t for t in held_types if t not in _ECONOMY_MARKET_PRICE_SKIP)

    def _filter_price_map(obj: Any) -> dict[str, Any]:
        if not isinstance(obj, dict):
            return {}
        nxt: dict[str, Any] = {}
        for k, v in obj.items():
            if _norm_fill_type(k) in price_types:
                nxt[k] = v
        return nxt

    mp = out.get("marketPrices")
    if isinstance(mp, dict):
        mp2 = copy.deepcopy(mp)
        crops = mp2.get("crops")
        if isinstance(crops, dict):
            mp2["crops"] = _filter_price_map(crops)
        out["marketPrices"] = mp2
    ftp = out.get("fillTypePrices")
    if isinstance(ftp, dict):
        out["fillTypePrices"] = _filter_price_map(ftp)
    return out


def prune_snapshot_for_dashboard_view(snapshot: dict[str, Any], view: str) -> dict[str, Any]:
    """
    Reduce consultant JSON to what the Farm Dashboard user is looking at (navbar section).

    Call **after** ``prune_snapshot_to_active_farm``. ``view`` matches hash sections:
    fields, vehicles, pastures, livestock, productions, economy, home.
    ``full`` / ``dashboard`` / ``landing`` / ``general`` = no op.
    """
    v = (view or "full").strip().lower()
    if v in ("full", "dashboard", "landing", "general", ""):
        return copy.deepcopy(snapshot)
    if not isinstance(snapshot, dict):
        return snapshot

    root = copy.deepcopy(snapshot)
    if v == "home":
        return prune_snapshot_home_overview(root)
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
        farm_id = resolve_consultant_farm_id(root, None)
        fe = root.get("fields")
        fields_list = fe if isinstance(fe, list) else []
        held_map, held_types = _collect_held_fill_types_for_economy_view(root, farm_id, fields_list)
        held_list = _held_fill_types_to_list(held_map)
        fin = root.get("finance")
        finance_facts: dict[str, Any] = {}
        if isinstance(fin, dict):
            for fk in ("money", "loan", "loanMax", "netWorth"):
                if fk in fin:
                    finance_facts[fk] = copy.deepcopy(fin[fk])
        if "money" not in finance_facts and root.get("money") is not None:
            finance_facts["money"] = copy.deepcopy(root.get("money"))
        h["_consultant_held_fill_types"] = held_list
        h["_consultant_economy_inventory_scope"] = (
            "Only fill types in _consultant_held_fill_types represent physical stock "
            "(storage, vehicles, animals, or harvest-ready/bale/windrow fields). "
            "Do not advise selling or pricing any other commodity."
        )
        if finance_facts:
            h["_consultant_finance_facts"] = finance_facts
        for k in ("farmInfo", "farms", "statistics", "weather"):
            if k in root:
                h[k] = copy.deepcopy(root[k])
        if "economy" in root:
            h["economy"] = _economy_subset_for_held_inventory(copy.deepcopy(root["economy"]), held_types)
        for k in ("finance", "money"):
            if k in root:
                h[k] = copy.deepcopy(root[k])
        if isinstance(fe, list) and fe:
            h["fields"] = _slim_field_rows_for_economy_view(fe)
        if "production" in root:
            h["production"] = copy.deepcopy(root["production"])
        if "productionPoints" in root:
            h["productionPoints"] = copy.deepcopy(root["productionPoints"])
        return h

    return root


def _slim_vehicles_for_equipment_hints(
    vehicles: Any,
    limit: int = 100,
    *,
    farm_id: int | None = None,
) -> list[dict[str, Any]]:
    """
    Minimal vehicle rows so the LLM can match tasks to owned equipment (harvest, plow, weed, lime)
    without sending full physics/poses. Empty list if none.

    When ``farm_id`` is set (>0), only includes vehicles whose ``ownerFarmId`` / ``farmId`` matches
    (defensive filter for field-map / section-scoped snapshots).
    """
    if not isinstance(vehicles, list):
        return []
    out: list[dict[str, Any]] = []
    fid = 0
    if farm_id is not None:
        try:
            fid = int(farm_id)
        except (TypeError, ValueError):
            fid = 0
    for v in vehicles[:limit]:
        if not isinstance(v, dict):
            continue
        if fid > 0 and _owner_farm_id(v) != fid:
            continue
        row: dict[str, Any] = {}
        for k in (
            "name",
            "vehicleName",
            "displayName",
            "type",
            "category",
            "brand",
            "ownerFarmId",
            "farmId",
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
    scope = root.get("_consultant_farm_scope")
    try:
        af = int(scope) if scope is not None else 0
    except (TypeError, ValueError):
        af = 0
    slim_v = _slim_vehicles_for_equipment_hints(raw_vehicles, farm_id=af if af > 0 else None)
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
