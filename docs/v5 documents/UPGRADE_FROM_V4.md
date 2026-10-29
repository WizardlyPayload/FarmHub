# Keep classic V4 while trying V5

**V5 is a second Windows app**, not an automatic replacement for classic V4. Public V4 4.2.1 and its `latest.yml` feed remain separate. V5 normally listens on **8768**; classic uses **8766**.

1. Keep your V4 installer and settings if you still want classic screens.
2. Install the **V5 5.2.7** Windows app and matching mod ZIP from the same release when published.
3. Launch **Farm Dashboard V5** and choose your save. It should open the sidebar and Save overview, not the classic six-card home.
4. Use exactly **one** game mod ZIP named `FS25_FarmDashboard.zip`. Do not leave `FS25_FarmDashboard-rf-...zip` beside it. Check the version required by the V5 release and the server before changing a shared mod.
5. Do **not** use **V4 → Check for updates** to get V5. A V5 installer must never be published to V4's `latest.yml`.

![V5 base overview](doc-screenshots/current-526/base-overview.png)

The October 2026 candidate was tested for **V5**. It was **not** a fresh V4 compatibility test against mod 5.1.0.12, so this guide does not promise that classic has been rebuilt or retested. If you want to return to V4, uninstall V5 through Installed apps while keeping your saves. Do not remove V4 or its settings as part of a V5 test.

For dedicated servers, use a matching canonical mod on the server and clients, then [link the multiplayer source](INSTALL.md#dedicated-multiplayer-join-as-a-client) or use FTP. Never copy a live server export into an unrelated single-player slot.
