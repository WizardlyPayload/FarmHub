# In-game chat bot (Hank / `!hank`) — multiplayer only

This document is **only** about the **FS25 AI Farm Manager mod** bridge: chat in the **game** → your **AI Farm Manager API** → reply back into **multiplayer** chat.

It does **not** apply to the **Farm Dashboard** (Electron app), Smart suggestions, consultant, or FTP — those work from your PC regardless of solo vs MP.

---

## Supported sessions

| Session | In-game Hank chat |
|---------|-------------------|
| **Single-player career** | **Not supported.** The mod does not register the chat hook or poll the API. Use **Farm Dashboard** on your PC for AI features. |
| **Multiplayer — you host** (listen server) | Supported. Install the mod, place `ai_farm_manager_config.xml` on **the host PC** under `modSettings`. |
| **Dedicated server** (your hardware, Linux, etc.) | Supported. Place the XML on the **server’s** FS profile `modSettings` (same machine that runs the dedicated process). |
| **Rented dedicated / MP host** | Supported when the provider runs a normal FS dedicated/MP host. Upload `ai_farm_manager_config.xml` to **that host’s** `modSettings` using their file/FTP tools — **not** on each player’s home PC. |
| **Joining as a client** | **Not supported** for *sending* triggers — only the **server / host** runs the bridge. Clients see bot replies in chat like everyone else. |

---

## Why multiplayer only?

- The bridge hooks **`Mission00.addChatMessage`** and sends replies with **`g_server:broadcastEvent(ChatEvent…)`**, which matches how **server-side** chat works in FS multiplayer.
- **Single-player** chat is not a supported target for this mod; solo players should use the **Farm Dashboard** + AI Farm Manager integration from Windows, not in-game `!hank`.

---

## Config file location (`ai_farm_manager_config.xml`)

Must be readable by **the game process that has authority** (host or dedicated server):

- **Path (typical Windows):**  
  `Documents\My Games\FarmingSimulator2025\modSettings\ai_farm_manager_config.xml`
- On a **Linux dedicated** or **G-Portal** box, use the profile path your host documents for that server (often under the instance user home or a path they expose via FTP).

Generated from **AI Farm Manager `/admin`** (“Download XML”) or **Farm Dashboard** (“Write to FS25 modSettings”) when that run targets the correct machine.

---

## Related code

- `fs25_ai_farm_manager_mod/src/main.lua` — `isChatBridgeActive()` (multiplayer check), hook registration, poll loop  
- `fs25_ai_farm_manager_mod/src/ChatHooks.lua` — chat interception and bot broadcast  
- Backend: `POST /api/chat/receive`, `GET /api/chat/poll`
