# Civilization VII live testing

## Mandatory save preservation

The user requires a complete backup of the entire game save directory before every live game test. Backing up only the latest turn, quicksave, or BeforeEndTurn/BeforeDiplomacy files is insufficient.

- Before starting, restarting, loading, saving, creating a test world, advancing turns, or otherwise testing in the game, copy the entire `~/Library/Application Support/Civilization VII/Saves` directory, including every subdirectory such as `auto`, `auto/prev`, and `quick`.
- Store each backup in a new timestamped directory outside the game directory and repository. Never replace an earlier backup.
- Verify the complete relative file list, file sizes, and SHA-256 hashes against the source. Save a manifest of source paths, hashes, and backup time. If the source changes while copying or verification is incomplete, stop before testing and resolve the backup first.
- New worlds and loads can rotate or overwrite autosaves even when no explicit save is requested. A named save of the current turn does not preserve campaign history.
- Preserve original saves and use test copies. Do not delete or overwrite user saves as test cleanup.
- A user instruction to stop interacting with the game overrides earlier permission to test. Continue recovery or investigation offline until the user permits game interaction again.

## Recording and testing without No More Turn interruptions

- Before recording Civilization VII gameplay or live-testing another mod, disable or explicitly suspend `civ7-rest-guard` (No More Turn / 不再来一回合). Its turn, time, idle, and night restrictions must all be inactive; verify this before interacting. Testing Rest Guard itself is the exception.
- Use a scoped recording/debug activity marker when supported, restore the prior state at the end, and never silently change the user's saved restriction settings. An open debug port alone is not proof that debugging is in progress.
- Full verified Saves backups remain mandatory before live tests and loads.
- For gameplay footage, center the settlement or action first, move the mouse smoothly, and perform actions decisively. Slow cursor travel does not mean long pauses between clicks. T25 replay sequence: found town with the settler, Space for the next required action, select the natural wonder tile, then show the immediate feat/reward.

## Explicit activity scope

The local recording entry point `work/civ7-pickups-20261022/record.py` now automatically renews a recording activity marker. Other live-test commands should run inside `scripts/with-game-activity.mjs debug -- <command>` using the native ARM64 Node runtime. The local patched Rest Guard recognizes these markers; manually disable an older or unpatched installed copy. The wrapper is not a backup replacement. Do not use a debug scope when testing Rest Guard's own restrictions.

## Shared game UI lock (mandatory for all sessions)

Before launching, restarting, loading, testing, recording, installing/replacing live game mods, using CDP, or clicking the game UI, request the host-wide queue with `python3 scripts/game-lock.py request --thread <your-chat-id> --purpose "specific authorized activity"`.

The local program owns scheduling. A free, unpaused queue is granted automatically in FIFO order. Release atomically grants the next request and the program sends its notification with `codex queue`. Do not ask the dashboard model to grant, do not grant yourself manually, and do not forward notifications in program mode. `request` may return your granted owner/token immediately; otherwise wait for the program's message and continue independent offline work. A queued request alone is not permission. Cancel requests when no longer needed; do not leave speculative work in the queue. A repeated request is idempotent.

After a grant, set `CIV7_SESSION_ID` and `CIV7_GAME_LOCK_TOKEN` to the granted values. Check `python3 scripts/game-lock.py assert` before each direct UI/CDP action. Run command-based work through `python3 scripts/game-lock.py run -- <command>`; `scripts/with-game-activity.mjs` guards its lifecycle automatically. Never manually set `CIV7_GAME_LOCK_GUARDED`. Renew with `heartbeat` at safe boundaries, at least every 15 minutes.

Before release, stop and await every child game-control/recording command, restore the previous Rest Guard state, and record game/save state and backup evidence. Use `python3 scripts/game-lock.py release --reason "stopped all commands; restored prior state; current game state and evidence"` with your session/token. Release triggers immediate program delivery; do not call send_message_to_thread or mark-notified yourself in program mode. Cancel an unneeded queued request with `cancel --thread <your-chat-id>`. Never release another chat's ownership. If interrupted, leave ownership intact for investigation.

User stop instructions override grants. An idle/completed chat or overdue heartbeat is never proof that the game is free. The program never steals, expires or resumes a lock. A heartbeat overdue by 60 minutes creates one reminder per ownership token, asking the holder to renew or safely finish and release. Manual pause/resume remains a dashboard operation based on the user's instruction; neither restart nor passage of time resumes a paused queue. New state defaults to paused until prior users are confirmed stopped.

### Program service and durable notification

`python3 scripts/game-lock.py status` remains read-only. `tick` runs one deterministic scheduling/delivery pass; `serve` runs the same pass every two seconds under a singleton process lock. The macOS LaunchAgent `com.sunmer.civ7-game-lock` keeps the service running, including after login. `request`, `release` and `resume` also run a pass immediately, so normal handoff does not wait for a timer. The old model heartbeat automation 7-2 is paused; morning/evening reporting is separate.

The persistent outbox is `state.notification`. Sending uses the installed Codex CLI's queue command, not model inference or a new agent process. Only an accepted queue receipt marks delivered. Failure retains the exact owner/token and retries with bounded backoff (5 seconds up to 30 minutes); nobody else receives the lock. The CLI queue accepts a message for the existing chat; acceptance does not mean the recipient has already executed it. If the app is unavailable, ownership remains reserved.

Delivery is at least once: a crash after acceptance but before the local acknowledgement can duplicate a message. Always assert the current token before work, and ignore duplicate or stale grants. No old-token message authorizes a new lock cycle. Delivery and release/pause are serialized, and guarded commands still prevent release. This is cooperative coordination, not OS isolation; all direct UI tools must honor it. Full verified Saves backups and authorized test scope remain mandatory.

Service operation, checks and failure recovery: `docs/game-lock-program.md`.
