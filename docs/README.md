# Documentation

## What to read (players & GitHub visitors)

| Document | When to use it |
| -------- | -------------- |
| [../README.md](../README.md) | **Start here** — download, quick install, overview |
| [**v5 documents/**](./v5%20documents/README.md) | **Start here for Farm Dashboard V5** — full manual, installation, current UI illustrations, companion mods, testers, and security (port 8768). Classic V4 manuals below remain historical. |
| [TESTERS.md](./TESTERS.md) | **Tester drop** — new rebuild vs classic, one mod, full feature checklist |
| [INSTALL.md](./INSTALL.md) | Step-by-step install (mod → app → setup; dedicated join-as-client or FTP) — **classic V4 UI** |
| [USER_MANUAL.md](./USER_MANUAL.md) | Every **classic** screen, setting, section, and modal (incl. §3.4a join-as-client) |
| [SECURITY.md](./SECURITY.md) | LAN access, passwords, firewall |
| [UPGRADE_FROM_FS25-Farm-Dashboard.md](./UPGRADE_FROM_FS25-Farm-Dashboard.md) | Upgrading from the public 2.0.0 line |
| [CHANGELOG.md](./CHANGELOG.md) | Version history |
| [SCREENSHOTS.md](./SCREENSHOTS.md) | Screenshot filenames + capture checklist (maintainers) |
| [DEMO_COMPANION_MOD_LISTS.md](./DEMO_COMPANION_MOD_LISTS.md) | **Site demo:** two non-overlapping companion mod packs (`savegame19` / `savegame18`) |
| [LIVE_DEMO_WEBSITE.md](./LIVE_DEMO_WEBSITE.md) | Cloudflare tunnel → Try now on farmdashboard.co.uk |

**V5 release preparation:** use the [V5 help pack](./v5%20documents/README.md) and verify the exact app, mod ZIP, installer and V5 update feed before publishing. The V4 release documents are retained as historical records, not as instructions for a new V5 release.

**Wiki:** [../wiki/Home.md](../wiki/Home.md)

---

## Developers

| Document | Purpose |
| -------- | ------- |
| [DEVELOPER_HANDOVER.md](./DEVELOPER_HANDOVER.md) | Architecture, code map, build, debug |
| [AUTHORS.md](./AUTHORS.md) | Credits |

Planning notes, audits, i18n pipeline, old release copy, and engine reference text live under **[`_internal/`](./_internal/)** — not required for end users.

**Repository target:** V5 app **5.1.0** · mod **5.1.0.0**. The published release may differ until release assets are uploaded. The separate classic V4 line remains unchanged. Build scripts: [../tools/README.md](../tools/README.md).
