# FS25 Farm Dashboard — User guide

Short reference for **field work**, **windrows / bales**, and **offline rules** on field cards.

**Full illustrated manual:** **[USER_MANUAL.md](./USER_MANUAL.md)**

---

## Field rules (offline)

The dashboard applies **local heuristics** (`rules-engine.js`) on **field cards**: one primary suggestion per field, based on merged **Lua + XML** data (growth, swaths, bales, Precision Farming hints where present, fleet vs shop tools). Suggestions are computed **entirely on this PC** inside the dashboard from merged game data.

---

## Field workflows — swaths, windrows, and bales

- **Swaths / windrows** — Unfinished harvesting or baling may show as loose material. The mod exports **`windrowLiters`** and **`windrowType`** (`Straw`, `Grass`, `Hay`, or omitted). The UI shows a compact **volume badge** when data is present.
- **Bales** — The UI counts **bales still on the field**. Clear or move them before cultivation or soil work when the card warns you.

**Practical tip:** Finish **baling** and **clear bales** to satisfy “needs work” style warnings. Numbers come from what the game actually sees (sampling + merge).

---

## Advanced crops (FS25)

Rules respect **FS25-specific** behaviour where the merge exposes it (e.g. grass vs arable, regrowth crops). Wording on screen comes from the **rules layer** and mod **`suggestions`** — keep the game and mod updated for best accuracy.

---

**More detail:** [README.md](../README.md) · [SECURITY.md](./SECURITY.md) · [DEVELOPER_HANDOVER.md](./DEVELOPER_HANDOVER.md)
