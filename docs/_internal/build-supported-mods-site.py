"""Build a reviewable public-site candidate from the accepted 5.2.7 package.

The catalog is exported directly from the V5 UI source. This script only writes a
new local ZIP; Sarah handles any VPS deployment after review and approval.
"""

from __future__ import annotations

import html
import json
from pathlib import Path
import re
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[2]
DROP = Path.home() / "Documents" / "FarmDash Release"
SOURCE = DROP / "farmdashboard-website-5.2.7-upload.zip"
TARGET = DROP / "farmdashboard-website-supported-mods-v2-staged.zip"
BASE = "https://www.farmdashboard.co.uk/"
STATES = {"live": "Direct data", "limited": "Partial data", "detection-only": "Detected only", "unmapped": "Catalog information only"}
CATEGORIES = {"finance": "Finance", "economy": "Economy", "fields": "Fields", "contracts": "Contracts", "livestock": "Animals", "production": "Productions", "storage": "Storage", "construction": "Construction", "fleet": "Vehicles", "units": "Units"}


def esc(value: object) -> str:
    return html.escape(str(value), quote=True)


def slug(entry: dict) -> str:
    return re.sub(r"[^a-z0-9-]+", "-", re.sub(r"([a-z])([A-Z])", r"\1-\2", entry["id"]).lower()).strip("-")


def frame(title: str, description: str, canonical: str, content: str) -> str:
    return f'''<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>{esc(title)} | FS25 Farm Dashboard</title><meta name="description" content="{esc(description)}" />
<link rel="canonical" href="{esc(BASE + canonical)}" /><meta name="robots" content="index, follow, max-image-preview:large" />
<meta property="og:type" content="website" /><meta property="og:site_name" content="FS25 Farm Dashboard" />
<meta property="og:title" content="{esc(title)} | FS25 Farm Dashboard" /><meta property="og:description" content="{esc(description)}" />
<meta property="og:url" content="{esc(BASE + canonical)}" />
<link rel="stylesheet" href="css/site.css?v=5.2.7" /><link rel="stylesheet" href="css/supported-mods.css?v=1" />
<link rel="icon" href="assets/icon.png" type="image/png" /></head>
<body data-page="supported-mods" data-bg="hero"><div class="site-bg" aria-hidden="true"><div class="site-bg__plane site-bg__plane--a"></div><div class="site-bg__plane site-bg__plane--b"></div><div class="site-bg__scrim"></div></div>
<header id="site-header"></header><main>{content}</main><footer id="site-footer"></footer>
<script src="js/site-config.js?v=5.2.7"></script><script src="js/site-shell.js?v=5.2.7-supported-1"></script><script src="js/site.js?v=5.2.7"></script></body></html>'''


def mod_page(entry: dict) -> str:
    title = entry["title"]
    status = STATES[entry["support"]]
    detail = entry["desc"]
    section = entry.get("relatedSection") or CATEGORIES[entry["category"]].lower()
    description = f"How FS25 Farm Dashboard works with {title}: {detail}"[:155]
    content = f'''<section class="hero hero--sub"><div class="hero__inner"><p class="mod-kicker"><a href="supported-mods.html">Supported mods</a> / {esc(CATEGORIES[entry['category']])}</p>
<h1>{esc(title)} and Farm Dashboard</h1><p class="mod-lead">{esc(detail)}</p><p class="mod-status">{esc(status)} in the current V5 companion catalog</p></div></section>
<section class="section"><div class="mod-grid"><article class="glass-card"><h2>What the dashboard shows</h2><p>{esc(detail)}</p>
<p>The in-game mod must be enabled on this save for its companion data to appear. Farm Dashboard reads that save; it does not operate the companion mod for you.</p></article>
<article class="glass-card"><h2>Where to look</h2><p>Open the <strong>{esc(section.replace('-', ' ').title())}</strong> area in Farm Dashboard after loading a save with this mod enabled. Some companion information is folded into a standard dashboard screen.</p>
<p><a href="screens.html">Explore the dashboard screens</a> or <a href="install.html">read the install guide</a>.</p></article></div></section>
<section class="section section--compact"><h2>Compatibility scope</h2><p>{'The dashboard reads a direct companion export when it is available.' if entry['support'] == 'live' else 'The dashboard reads a limited set of companion information. It does not reproduce every in-game feature.'} Each optional mod can be enabled or disabled per save. When it is absent from the loaded save, its companion view is hidden while saved dashboard data is retained.</p>
<p><a href="supported-mods.html">Browse all companion mods</a> · <a href="demo.html">Try the demo</a></p></section>'''
    return frame(f"{title} compatibility", description, f"mod-{slug(entry)}.html", content)


def index_page(entries: list[dict]) -> str:
    integrated = [e for e in entries if e["support"] in ("live", "limited")]
    rows = []
    for category in CATEGORIES:
        group = [e for e in integrated if e["category"] == category]
        if not group:
            continue
        cards = "\n".join(f'''<a class="glass-card mod-card" href="mod-{slug(e)}.html"><span class="mod-status">{esc(STATES[e['support']])}</span><h3>{esc(e['title'])}</h3><p>{esc(e['desc'])}</p><span class="feature-grid__link">See compatibility details →</span></a>''' for e in group)
        rows.append(f'<section class="section section--compact" id="{esc(category)}"><h2>{esc(CATEGORIES[category])}</h2><div class="mod-grid">{cards}</div></section>')
    informational = [e for e in entries if e["support"] not in ("live", "limited")]
    information = " ".join(f'<li><strong>{esc(e["title"])}</strong> — {esc(STATES[e["support"]])}</li>' for e in informational)
    content = f'''<section class="hero hero--sub"><div class="hero__inner"><h1>FS25 mod compatibility</h1>
<p class="mod-lead">Farm Dashboard has data integrations for {len(integrated)} optional companion mods in its current catalog: {sum(e['support']=='live' for e in integrated)} direct and {sum(e['support']=='limited' for e in integrated)} partial. They work alongside the standard fields, animals, productions, storage and map screens.</p>
<p>Enable only the mods you want on a save. Companion pages follow the mods actually loaded in that save.</p></div></section>
<section class="section section--compact"><h2>Find a mod</h2><p>Each linked page explains the information Farm Dashboard can show and where to find it. “Partial data” means the dashboard reads selected information, not the entire in-game mod.</p></section>
{''.join(rows)}<section class="section section--compact"><h2>Other mods in the research catalog</h2><p>These are catalogued for reference; they are not counted as data integrations.</p><ul class="mod-info-list">{information}</ul></section>'''
    return frame("Supported FS25 mods", f"Explore {len(integrated)} FS25 companion mod integrations in Farm Dashboard, with honest details for each mod and its dashboard data.", "supported-mods.html", content)


def main() -> None:
    if TARGET.exists():
        raise FileExistsError(TARGET)
    entries = json.loads(subprocess.check_output(["node", str(ROOT / "docs/_internal/export-companion-catalog.cjs")], cwd=ROOT, text=True, encoding="utf-8"))
    if len(entries) < 50 or len({e["id"] for e in entries}) != len(entries):
        raise RuntimeError("Companion catalog is incomplete or contains duplicate IDs")
    integrated = [e for e in entries if e["support"] in ("live", "limited")]
    pages = {"supported-mods.html": index_page(entries).encode("utf-8")}
    for entry in integrated:
        name = f"mod-{slug(entry)}.html"
        if name in pages:
            raise RuntimeError(f"Duplicate mod slug: {name}")
        pages[name] = mod_page(entry).encode("utf-8")
    css = '''.mod-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,22rem),1fr));gap:1rem}.mod-card{display:block;text-decoration:none}.mod-card p{line-height:1.55}.mod-status{display:inline-block;padding:.3rem .65rem;border:1px solid currentColor;border-radius:2rem;font-size:.8rem;font-weight:700}.mod-lead{max-width:52rem;line-height:1.65}.mod-kicker a{color:inherit}.mod-info-list{columns:2;line-height:1.9}.mod-info-list li{break-inside:avoid}@media(max-width:700px){.mod-info-list{columns:1}}'''.encode("utf-8")
    pages["css/supported-mods.css"] = css
    with zipfile.ZipFile(SOURCE) as source, zipfile.ZipFile(TARGET, "w", allowZip64=True) as target:
        for item in source.infolist():
            if item.filename in pages:
                raise RuntimeError(f"New page collides with existing site: {item.filename}")
            data = source.read(item.filename)
            if item.filename == "js/site-shell.js":
                shell = data.decode("utf-8")
                anchor = '{ id: "screens", href: "screens.html", label: "Screens" },'
                if shell.count(anchor) != 1:
                    raise RuntimeError("Cannot locate shared navigation")
                shell = shell.replace(anchor, anchor + '\n    { id: "supported-mods", href: "supported-mods.html", label: "Supported mods" },')
                shell = shell.replace('<a href="screens.html">Screens</a>', '<a href="screens.html">Screens</a>\n        <a href="supported-mods.html">Supported mods</a>')
                data = shell.encode("utf-8")
            elif item.filename == "index.html":
                text = data.decode("utf-8")
                anchor = '<main>'
                if text.count(anchor) != 1:
                    raise RuntimeError("Cannot locate home main element")
                text = text.replace(anchor, anchor + f'<p class="site-mod-link"><a href="supported-mods.html">Explore {len(integrated)} supported companion mod integrations and their compatibility details →</a></p>', 1)
                data = text.encode("utf-8")
            elif item.filename == "sitemap.xml":
                sitemap = data.decode("utf-8")
                if sitemap.count("</urlset>") != 1:
                    raise RuntimeError("Invalid sitemap")
                links = "\n".join(f"  <url><loc>{BASE}{name}</loc></url>" for name in pages if name.endswith(".html"))
                data = sitemap.replace("</urlset>", links + "\n</urlset>").encode("utf-8")
            if item.filename.endswith(".html"):
                page = data.decode("utf-8")
                old_shell = "js/site-shell.js?v=5.2.7-footer-1"
                if old_shell in page:
                    data = page.replace(old_shell, "js/site-shell.js?v=5.2.7-supported-1").encode("utf-8")
            target.writestr(item, data)
        for name, data in pages.items():
            target.writestr(name, data, compress_type=zipfile.ZIP_DEFLATED)
    with zipfile.ZipFile(TARGET) as result:
        if result.testzip():
            raise RuntimeError("ZIP CRC failed")
        names = result.namelist()
        if len(names) != len(set(names)) or any("/t/" in n or ".." in Path(n).parts for n in names):
            raise RuntimeError("Duplicate or protected site path")
        for name in pages:
            if name not in names:
                raise RuntimeError(f"Missing {name}")
    print(f"{TARGET}: {len(integrated)} integrated mods, {len(entries)} catalog rows, {len(pages)-1} new pages, {len(names)} ZIP entries")


if __name__ == "__main__":
    main()
