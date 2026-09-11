# Draft release note — Dedicated “join as client” (4.2.1 + v5)

**Status:** internal draft for the **4.2.1** (legacy Electron) and **v5** (NEW APP) release line. Paste/adapt into GitHub / itch release copy when the updated mod ships. Do not treat version numbers below as final until the release is cut.

---

## Headline

**Dedicated servers without FTP:** join the dedicated host as a multiplayer client with the Farm Dashboard mod, opt in to **mirror export**, and point the desktop app at the local `data.json` folder in **Local** mode.

## What changed

- The **same mod** on dedicated **authority** streams `data.json` to an **opted-in joined client** via MP events.
- The client writes:

  `%USERPROFILE%\Documents\My Games\FarmingSimulator2025\modSettings\FS25_FarmDashboard\<slot>\data.json`

- Desktop app **Local** file watch works for **4.2.1** and **v5** — **no FTP required** for this path.
- **FTP remains Advanced** for headless-only admins (empty server / zero players).

## Player steps (short)

1. Install the updated mod on the **dedicated server**.
2. On the dashboard PC, install the same mod and **join as a client** (spare/alt account or admin playing).
3. Opt in: mirror / receive server export (Setup wizard labels may say *Mirror export*, *Receive server export*, or similar).
4. Confirm local `data.json` updates while connected.
5. App → **Local** server → that folder.

## Honest limits

- Needs **at least one** connected client with the mod and opt-in.
- Empty dedicated (zero players) = **no mirror** until someone joins — use FTP.
- Large exports may lag a few seconds behind the authority write.
- Requires the **updated mod** with export mirror on **server and client**.

## Explicitly not

- Giants dedicated HTTP **:8080** is **not** a substitute for `data.json`.
- FTP is **not** removed.

## Docs

- [INSTALL.md — Dedicated server](../INSTALL.md#dedicated-server-join-as-client-or-ftp)
- [USER_MANUAL.md §3.4a](../USER_MANUAL.md#34a-dedicated-server--join-as-client-no-ftp)
- Wiki: [Installation Guide — Dedicated](../../wiki/Installation-Guide.md#dedicated-servers-join-as-client-or-ftp)
