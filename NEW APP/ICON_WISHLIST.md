# Icon wishlist — sidebar / navigation only

**Scope:** Dedicated icon assets for **left sidebar** and **top-bar nav controls**.  
**Exclude:** `Dashboard Pictures/` assets — those remain **section backdrops** (`section-meta.ts` `SECTION_BACKGROUNDS`), not nav icons.

**Current state:** `SectionSidebar.tsx` incorrectly uses full photo thumbnails from Dashboard Pictures. `section-meta.ts` defines temporary text glyphs (`⌂`, `LS`, `FD`, …) — replace with the icons below.

**Art direction:** Flat or soft-3D farm-dashboard style; readable at 24px on `#0f172a` / glass sidebar; single accent color (`--farm-accent`, green-gold) + white/light gray strokes. SVG source + exported PNG @1x/@2x.

---

## Primary sidebar sections (8)

| Name | Size | Usage | Metaphor |
|------|------|-------|----------|
| `nav-overview` | 24×24 (32×32 @2x) | Sidebar: Overview / home command center | Simple farmhouse or dashboard gauge — “command center”, not a photo |
| `nav-livestock` | 24×24 | Sidebar: Livestock | Stylized cow head silhouette or barn + animal — herd management |
| `nav-fields` | 24×24 | Sidebar: Fields | Top-down field parcel / plowed rows — crop blocks |
| `nav-vehicles` | 24×24 | Sidebar: Vehicles | Tractor side profile — fleet |
| `nav-pastures` | 24×24 | Sidebar: Pastures | Fence post + grass tuft — husbandry / grazing |
| `nav-productions` | 24×24 | Sidebar: Productions | Factory silo + arrow (input→output) — production chains |
| `nav-economy` | 24×24 | Sidebar: Economy | Coins + wheat stalk or market scale — finance & storage hub |
| `nav-map` | 24×24 | Sidebar: Fleet map | Map pin on folded map / minimap square — vehicle positions |

### Active / alert states (same metaphors)

| Name | Size | Usage | Metaphor |
|------|------|-------|----------|
| `nav-*-active` | 24×24 | Sidebar item selected | Filled variant or accent ring of each section icon |
| `nav-alert-dot` | 8×8 | Sidebar alert dot (fields/pastures/productions) | Solid accent circle — already CSS; optional SVG for retina |

---

## Top bar (navigation chrome)

| Name | Size | Usage | Metaphor |
|------|------|-------|----------|
| `nav-settings` | 20×20 | Top bar: Settings button | Gear cog |
| `nav-notifications` | 20×20 | Top bar: Notification bell | Bell outline; pair with badge count in CSS |
| `nav-weather` | 20×20 | Top bar: weather chip (optional prefix) | Sun/cloud combo — temp chip already shows text |
| `nav-brand` | 28×28 | Top bar: app mark (optional) | Farm Dashboard logo mark — simplified `logo.png` |

---

## Economy sub-navigation (optional — if tabs get icons later)

Not required for first cutover; listed for consistency if economy tabs move to icon+label layout.

| Name | Size | Usage | Metaphor |
|------|------|-------|----------|
| `nav-economy-market` | 20×20 | Economy tab: Market | Price tag / chart |
| `nav-economy-purchases` | 20×20 | Economy tab: Purchases | Receipt / tractor purchase |
| `nav-economy-storage` | 20×20 | Economy tab: Storage | Silo / grain bin |
| `nav-economy-redtape` | 20×20 | Economy tab: Red Tape | Clipboard + checkmark — compliance mod |

---

## Livestock sub-tabs (optional)

| Name | Size | Usage | Metaphor |
|------|------|-------|----------|
| `nav-livestock-animals` | 20×20 | Livestock tab: Animals | List / ear-tag |
| `nav-livestock-statistics` | 20×20 | Livestock tab: Statistics | Bar chart |
| `nav-livestock-genetics` | 20×20 | Livestock tab: Genetics | DNA helix |

---

## Delivery checklist

- [ ] SVG master for each **primary** `nav-*` (8 sections)
- [ ] `-active` variant or documented CSS tint approach
- [ ] PNG export 24px and 32px for Electron sharpness
- [ ] Wire `SectionSidebar.tsx` to `/assests/img/nav/` (or `NEW APP/public/icons/nav/`) — **remove** Dashboard Pictures from sidebar
- [ ] Align with `SECTION_NAV_META` in `section-meta.ts` (single source of icon path + labelKey)
- [ ] `aria-hidden="true"` on decorative icons; keep visible text labels for a11y

---

## Do not create (out of scope)

- Dashboard Pictures backgrounds (fields.png, livestock.png, …) — already used as section atmosphere in `Shell.tsx`
- Vehicle shop thumbnails, commodity fill icons, map marker sprites — separate asset passes
- Splash / marketing logo — keep existing `logo.png`
