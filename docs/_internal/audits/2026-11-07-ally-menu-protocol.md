# Ally disposable game menu protocol after V53

V53 deleted Ally's real savegame1 during unverified menu navigation. The exact
deleted bytes have not been recovered. This protocol is a prerequisite for any
later FarmHub gameplay packet; it is not a test request or permission to restore
the missing save.

1. Check RF ownership. Keep the FarmHub gameplay hold until the V53 recovery
   audit has returned and the next frozen packet explicitly includes this gate.
2. Before staging, record a full file manifest and hashes for every real save
   slot. Make a separately readable byte-for-byte backup of those slots, not
   only a hash list or the game's older automatic backups. Confirm its count
   and manifest match before launching FS25. Preserve the backup until the
   entire test and restoration are reviewed.
3. Stage only the exact packet bytes and disposable slot20. Record the game's
   exact PID and UTC start time, arm the independent hard-stop helper, and read
   its `ARMED` line before world interaction. The hard stop also limits time
   spent in menus; it does not prevent a wrong menu action.
4. On every FS25 menu screen, capture and inspect a screenshot **before each
   input**. Send one click/key at a time, wait for the screen to settle, and
   inspect the next screenshot. Never send a chained or repeated key sequence
   across a screen transition. A missed or ambiguous transition is a stop gate.
5. On the Game Saves list, visually identify slot20 and its disposable save
   title before selecting it. Select only that visible slot with a single
   targeted action and verify the resulting screen before proceeding. Do not
   send Backspace, Delete, typed text, Enter, or any confirmation key on the
   save list. Do not open, delete, rename or load a real slot.
6. Confirm the world loaded from disposable slot20. If any real save slot is
   missing or altered, stop the test immediately, preserve screenshots/logs and
   all backups, and report an INCIDENT. Do not replace a live slot with an
   older backup or keep testing.
7. Quit without saving. Hash-compare every real save slot and the rest of the
   as-found profile/app/shortcut state, remove only disposable material, and
   confirm no FS25 or V5 process/Windows row remains. Report any mismatch as a
   failed restoration even if the game/export/page comparison passed.

The next packet must point to this protocol and name a small test-specific
screen route. If the operator cannot follow the screenshot gate with the
available control method, return BLOCKED rather than improvising blind keys.
