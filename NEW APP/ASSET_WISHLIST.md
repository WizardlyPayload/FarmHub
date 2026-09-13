# Asset wishlist — backgrounds & icons

Drop section photos in  
`FS25_FarmDashboard_App/web/assests/img/Dashboard PIctures/`  
(note the existing folder spelling `PIctures`).

Nav icons go in `NEW APP/public/icons/nav/` (or `/assests/img/nav/`) — see also `ICON_WISHLIST.md`.

**Art notes for backgrounds:** wide 16:9 or 21:9, soft focus, not too busy behind glass cards. Prefer natural farm light (warm/green) — avoid heavy blue color grading; the UI no longer adds a blue haze.

---

## Section backgrounds (atmosphere)

| Filename | Status | Used by | Subject ideas |
|----------|--------|---------|---------------|
| `Background.png` | Have | Overview | Wide farmstead / golden hour yard — “home base” |
| `Fields.png` | Have | Fields, Moisture | Crop rows / harvester in field |
| `Vehicles.png` | Have | Vehicles | Tractor / fleet yard |
| `Pastures.png` | Have | Pastures | Cattle / fence / grazing |
| `Productions.png` | Have | Productions | Factory / silo / production hall |
| `Economy.png` | Have | Economy | Market / grain sale / money + crops |
| `Livestock.png` | Have | (legacy livestock route) | Same family as pastures — animals close-up OK |
| `Storage.png` | **Need** | Storage | Grain bins / barn interior stock |
| `RedTape.png` | **Need** | Red Tape mod | Clipboard / paperwork / compliance desk (farm office) |
| `Ads.png` | **Need** | ADS mod | Workshop / service bay / wrench on tractor |
| `Invoices.png` | **Need** | Invoices mod | Invoice stack / farm office desk |
| `HirePurchasing.png` | **Need** | Hire & purchasing mod | Dealership lot / hire machinery |
| `Map.png` | **Need** | Fleet map (optional) | Soft topo / aerial map texture (must stay readable under pins) |

**Specs:** PNG or WebP, ~1920×1080 min (2560×1440 nicer). Keep faces/logos out of the lower 40% if possible (cards sit there).

**Reuse OK until dedicated art lands:** Storage/RedTape/Invoices/Hire can temporarily copy `Economy.png`; Ads can copy `Vehicles.png`; Map can stay empty (`null`) if you prefer a solid dark canvas for pins.

---

## Sidebar / top-bar icons (required)

Full detail in `ICON_WISHLIST.md`. Short list:

| Asset | Size | Notes |
|-------|------|-------|
| `nav-overview` | 24×24 (+32 @2x) | Farmhouse / command gauge |
| `nav-fields` | 24×24 | Field parcels |
| `nav-vehicles` | 24×24 | Tractor profile |
| `nav-pastures` | 24×24 | Fence + grass |
| `nav-productions` | 24×24 | Silo / factory |
| `nav-storage` | 24×24 | Grain bin |
| `nav-economy` | 24×24 | Coins + wheat |
| `nav-map` | 24×24 | Map pin |
| `nav-redtape` | 24×24 | Clipboard (mod) |
| `nav-ads` | 24×24 | Wrench / ADS (mod) |
| `nav-invoices` | 24×24 | Invoice (mod) |
| `nav-hirepurchasing` | 24×24 | Keys / hire (mod) |
| `nav-settings` | 20×20 | Gear |
| `nav-notifications` | 20×20 | Bell |
| `nav-brand` (optional) | 28×28 | App mark |

SVG masters preferred; export PNG @1x/@2x for Electron.

---

## Optional later

| Asset | Notes |
|-------|-------|
| Splash background | Already uses dashboard splash path — refresh if you want less blue grade |
| Weather icons | Sun/cloud/rain set for top bar |
| Empty-state illustrations | Per section when no data |

---

## Checklist

- [ ] Replace/refresh existing section photos if they have a blue cast baked in
- [ ] Add `Storage.png`, `RedTape.png`, `Ads.png`, `Invoices.png`, `HirePurchasing.png`, `Map.png`
- [ ] Deliver 8+ primary nav SVGs (see `ICON_WISHLIST.md`)
- [ ] Wire nav icons in `SectionSidebar.tsx` (remove glyph placeholders)
