# FarmHub wiki (source)

These Markdown files are the **source** for the [GitHub Wiki](https://github.com/WizardlyPayload/FarmHub/wiki) on **WizardlyPayload/FarmHub**.

## Pages

| Wiki file | GitHub wiki page |
|-----------|------------------|
| [Home.md](Home.md) | Home |
| [Installation-Guide.md](Installation-Guide.md) | Installation-Guide |
| [User-Manual.md](User-Manual.md) | User-Manual |
| [Developer-Guide.md](Developer-Guide.md) | Developer-Guide |
| [Security-and-Network.md](Security-and-Network.md) | Security-and-Network |
| [Troubleshooting.md](Troubleshooting.md) | Troubleshooting |
| [Releases-and-Upgrades.md](Releases-and-Upgrades.md) | Releases-and-Upgrades |

## Publishing to GitHub Wiki

GitHub wikis are a **separate git repo**. After editing here:

```bash
git clone https://github.com/WizardlyPayload/FarmHub.wiki.git
# Copy wiki/*.md into the clone (preserve filenames)
# Copy wiki/_Sidebar.md to _Sidebar.md in the wiki repo root
cd FarmHub.wiki
git add .
git commit -m "Sync wiki from main repo"
git push
```

Or paste each page manually in the GitHub **Wiki** tab → **New Page**.

## Canonical docs in `docs/`

For the longest, screenshot-linked manuals, see the main tree:

- [docs/INSTALL.md](../docs/INSTALL.md)
- [docs/USER_MANUAL.md](../docs/USER_MANUAL.md)
- [docs/SECURITY.md](../docs/SECURITY.md)
- [docs/DEVELOPER_HANDOVER.md](../docs/DEVELOPER_HANDOVER.md)
- [docs/CHANGELOG.md](../docs/CHANGELOG.md)

**Versions:** app **3.9.0**, mod **2.3.0.0** (May 2026).
