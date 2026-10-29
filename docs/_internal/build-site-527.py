"""Stage the 5.2.7 public-site ZIP from the accepted local 5.2.6 ZIP.

This writes only the flat release folder. It never connects to or changes the VPS.
"""

from pathlib import Path
import re
import zipfile


ROOT = Path(__file__).resolve().parents[2]
DROP = Path.home() / "Documents" / "FarmDash Release"
SOURCE = DROP / "farmdashboard-website-5.2.6-upload.zip"
TARGET = DROP / "farmdashboard-website-5.2.7-upload.zip"
SHOTS = ROOT / "docs" / "v5 documents" / "doc-screenshots" / "current-527"
TEXT_EXT = {".html", ".css", ".js", ".xml", ".txt", ".json"}
IMAGE_NAMES = ("catua-overview.png", "catua-orchards.png", "catua-productions.png", "catua-map.png")


def update_text(name: str, data: bytes) -> bytes:
    text = data.decode("utf-8").replace("5.2.6", "5.2.7")
    if name.endswith(".html") and "js/site-shell.js" in text:
        current = 'js/site-shell.js?v=5.2.7"'
        prior_cache_key = 'js/site-shell.js?v=5.2.7.1"'
        if text.count(current) + text.count(prior_cache_key) != 1:
            raise RuntimeError(f"Cannot locate unique footer script URL: {name}")
        text = text.replace(prior_cache_key, 'js/site-shell.js?v=5.2.7-footer-1"')
        text = text.replace(current, 'js/site-shell.js?v=5.2.7-footer-1"')
    if name == "js/site-shell.js":
        old = '<a href="${manual}">Classic V4 manual</a>'
        if text.count(old) != 1:
            raise RuntimeError("Cannot locate the incorrect footer manual label")
        text = text.replace(old, '<a href="${manual}">V5 manual</a>')
    if name == "index.html":
        anchor = '    <section class="section section--compact" id="from-v4">'
        if text.count(anchor) != 1:
            raise RuntimeError("Cannot locate unique gallery insertion point")
        cards = "\n".join(
            '        <figure class="glass-card glass-card--shot">\n'
            f'          <img src="assets/screenshots/current-527/{file}?v=5.2.7" alt="{alt}" loading="lazy" />\n'
            f"          <figcaption>{caption}</figcaption>\n"
            "        </figure>"
            for file, alt, caption in (
                ("catua-overview.png", "Catuaí save overview in Farm Dashboard 5.2.7", "Catuaí — save overview"),
                ("catua-orchards.png", "Owned coffee and banana orchards in Farm Dashboard 5.2.7", "Catuaí — coffee and banana orchards"),
                ("catua-productions.png", "Catuaí production screen in Farm Dashboard 5.2.7", "Catuaí — productions"),
                ("catua-map.png", "Catuaí fleet map image in Farm Dashboard 5.2.7", "Catuaí — Fleet map"),
            )
        )
        section = (
            '    <section class="section" id="catua-dlc">\n'
            '      <div class="section__head"><h2>Catuaí and expansion orchards</h2>'
            '<p>Full-window captures from the installed 5.2.7 app using a recorded Catuaí save. '
            'The dashboard reads this farm; it does not change it.</p></div>\n'
            '      <div class="split-cards">\n' + cards + '\n      </div>\n    </section>\n\n'
        )
        text = text.replace(anchor, section + anchor)
    return text.encode("utf-8")


def main() -> None:
    if TARGET.exists():
        raise FileExistsError(TARGET)
    for file in IMAGE_NAMES:
        if not (SHOTS / file).is_file():
            raise FileNotFoundError(SHOTS / file)
    with zipfile.ZipFile(SOURCE) as src, zipfile.ZipFile(TARGET, "w", allowZip64=True) as dst:
        for item in src.infolist():
            data = src.read(item.filename)
            if Path(item.filename).suffix.lower() in TEXT_EXT:
                data = update_text(item.filename, data)
            dst.writestr(item, data)
        for file in IMAGE_NAMES:
            dst.write(SHOTS / file, f"assets/screenshots/current-527/{file}", compress_type=zipfile.ZIP_DEFLATED)
    with zipfile.ZipFile(TARGET) as result:
        if result.testzip() is not None:
            raise RuntimeError("ZIP CRC failed")
        names = set(result.namelist())
        if len(names) != len(result.namelist()):
            raise RuntimeError("Duplicate ZIP entry")
        if any("/t/" in n or n.lower().endswith(".exe") for n in names):
            raise RuntimeError("Tester path or installer in website package")
        for item in result.infolist():
            if Path(item.filename).suffix.lower() not in TEXT_EXT:
                continue
            data = result.read(item.filename).decode("utf-8")
            if "5.2.6" in data:
                raise RuntimeError(f"Stale version label: {item.filename}")
            for match in re.findall(r'(?:src|href)=["\'](assets/screenshots/[^"\']+)', data):
                asset = match.split("?", 1)[0].split("#", 1)[0]
                if asset not in names:
                    raise RuntimeError(f"Broken screenshot link: {item.filename} -> {asset}")
        print(f"{TARGET.name}: {TARGET.stat().st_size} bytes, {len(names)} entries, CRC and screenshot links OK")


if __name__ == "__main__":
    main()
