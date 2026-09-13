# Witcombe + RF client join hang ~89% after FS25 1.21

**Date:** 2026-07-28  
**From:** Wizard (FarmHub / Dash diagnosis)  
**To:** Ash (Realistic Farming workshop coordinator), Claude(A), Tyson / Claude(T)  
**Status:** Evidence handoff. FarmDashboard is not the root cause. RF join/sync work needed.

---

## Summary

Multiplayer clients joining the GPortal dedicated **Witcombe Park Farm** save stick on the loading bar at about **89%**.

This is **not** a FarmDashboard hang. FarmDashboard had a separate `copyFile` Bool/Number spam bug (fixed in RF edition **5.0.0.1**). That fix cleaned the dedicated script log but **did not** unblock the join.

The join stall lines up with Witcombe map load pressure (distance texture over-cap), SoilFertilizer value-map sync blasting hundreds of chunks to the joining client, broken event registration timing (`Invalid event id`), then stream-in death while Market Dynamics / MasterHUD / CropStress keep thrashing.

---

## Evidence / logs

| Role | Path / note |
|------|-------------|
| Dedicated | `Documents\My Games\FarmingSimulator2025\log_2026-07-28_19-28-52.txt` (also earlier `18-57-10` on FarmDashboard 5.0.0.0) |
| Client | `log.txt` / `logs\log_2026-07-28_19-33-59.txt` (and earlier join attempts) |
| Map | Witcombe Park Farm **1.3.0.1** |
| Stack | Full Realistic Farming suite + FarmDashboard **5.0.0.1** |

FarmHub-local copy of this handoff (same content intent):  
`FarmHub/docs/rf-suite/ASH-HANDOFF-witcombe-89-join-hang.md`

Related tracking already known to Ash:

- **SF PR / issue family #756** — value-map resync storm (OPEN in UNIFIED / MEMORY)
- **SF #755** — fill-type / distance-texture cap family (GIANTS 255 limit; hybrid policy / wontfix framing)

---

## Timeline (client 19:33 session)

Order from the client join attempt (and matching dedicated noise):

1. **Map load** — Witcombe foliage densmap is huge (~**21.5M** instances).
2. **Error on client and dedicated:** too many distance textures (**max 255**).
3. Client **joined network game**.
4. **Invalid event id** for `SoilRequestFullSyncEvent` and `RealisticFarmingSyncRequestEvent`.
5. **`packetReceived` Lua nil errors** (events not registered / wrong id on the receiving side).
6. SoilFertilizer server side: **99 fields / 384 value-map chunks** sent **synchronously** to the joining client.
7. Roughly **~300 i3d** stream progress, then stall.
8. While stuck: Market Dynamics expire/restore loops; MasterHUD register spam; CropStress `buildFieldMap`.
9. Player **force quit**.

Same structural overload was likely present before FS25 **1.21**; joins used to finish slowly. After 1.21, join/sync timing looks tipped so stream-in dies at ~89% (Invalid event id is the smoking gun in the logs). Do **not** claim unverified densmap API breaks; cite this log evidence only.

---

## Root cause ranking

1. **Primary:** Late MP stream-in crushed by Witcombe distance-texture over-cap **plus** SoilFertilizer value-map join storm **plus** broken event registration timing (worse / failing after 1.21).
2. **Secondary thrash during load:** Market Dynamics expire/restore loops; MasterHUD register spam; CropStress field-map build during the hang window.
3. **Large fleet** may add stream cost but looks secondary.
4. **FarmDashboard:** innocent of this hang (copyFile spam was a separate bug and is fixed).

---

## Why it worked before 1.21

- The same structural overload (Witcombe + full RF + SF value-map sync + fill-type/texture pressure) was likely already there.
- Join used to **finish slowly** rather than hard-stick.
- **1.21** appears to tip join/sync timing so `SoilRequestFullSyncEvent` / `RealisticFarmingSyncRequestEvent` hit **Invalid event id**, and stream-in dies around **89%**.
- Stick to log evidence. Do not invent densmap API regression claims without a source check.

---

## Ask for Ash / RF seats

Please route and prioritize:

| Owner area | Ask |
|------------|-----|
| **SoilFertilizer** | Fix dedicated **join sync**: do not blast **384** value-map chunks synchronously to a joining client. Relate to known **#756** value-map storm work if still open. |
| **Fill types / textures** | Stay under the **255** distance-texture / fill-type pressure with **Witcombe + SF**. Same family as **#755** (engine cap; hybrid / degrade / UnlimitedFillTypes policy already discussed). |
| **Network / sync** | Register event ids **before** the client sends sync requests so `SoilRequestFullSyncEvent` and `RealisticFarmingSyncRequestEvent` are never Invalid event id. |
| **Market Dynamics** | Stop expire/restore loops during client load / join. |
| **MasterHUD** | Reduce register spam during vehicle stream-in. |
| **FarmDashboard** | **No action required** for this hang. |

Ash: please get this onto Claude(A) / Tyson awareness; Claude(T) for implementation once ownership is clear. This is an RF-side API/sync ask, not a FarmHub build ticket.

---

## Binary test plan

Leave FarmDashboard **on** for all of these (it is not the hang).

1. **SoilFertilizer off** → retry dedicated join (does ~89% clear?).
2. **Witcombe vanilla only** (no RF suite) → join baseline.
3. **RF + tiny fleet** (same map) → isolate fleet stream cost.
4. **Singleplayer Witcombe + SF** → confirm SP load survives without MP sync path.
5. Keep FarmDashboard loaded so dashboard export noise is not confused with hang causality again.

---

## FarmDashboard note (for clarity)

- **RF edition 5.0.0.1:** `copyFile` Bool-only + overview export failure latch. Shipped local mods + GPortal attempt. Cleans dedicated Script error spam. **Not** the join hang fix.
- **Classic public line:** GitHub **4.2.1** / mod **3.4.0.7** only for the public spam fix on classic. Separate product line from RF 5.x.
- Do not spend RF seat time on FarmDashboard for this ~89% hang.

---

## Suggested Ash next steps

1. Bank this in MEMORY / UNIFIED risk notes if join-hang after 1.21 is not already explicit.
2. Confirm whether **#756** lands the dedicated join sync shape needed here (chunked / deferred / non-blocking), or open a follow-up if #756 is only resync-storm and not join-stream.
3. Keep **#755** family visible for Witcombe + SF texture/fill pressure (policy already Option C hybrid).
4. Ask Claude(T) for a short event-registration order audit on SF + NetworkSync request events under 1.21.
5. Optional: MDM / MasterHUD / CropStress load-time quieting as secondary PRs once join sync is unblocked.

-- Wizard
