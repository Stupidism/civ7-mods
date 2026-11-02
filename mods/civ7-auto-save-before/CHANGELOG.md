# Changelog

## 1.1.2 — 2026-10-22

- Follow the game language for all save progress messages, failure reasons, retry/cancel buttons, notifications and the mod description. Supply English defaults and Simplified Chinese translations through native localization.
- Preserve fixed save names and existing save behavior, including the 1.1.1 save-before-rest integration.
- Validate 27 matching localization entries and 79 offline tests with the installed game handlers. No live save/load test was performed for this release.

## 1.1.1 — 2026-10-20 (local development)

- With Rest Guard 1.5.1, confirm the BeforeEndTurn save before opening the forced turn break. Continue submits the already-saved turn once, without another write.
- Load the save wrapper after Rest Guard and check its request eligibility before saving. Repeated end-turn attempts during rest or settings do not overwrite the snapshot.
- 79 autosave tests and 69 Rest Guard tests pass, including save failure/retry, all standard turn inputs, and a time threshold crossed during saving. These are offline tests with the game's action panel and a mocked native bridge; live acceptance and Workshop publication remain pending.

## 1.1.0 — 2026-10-18 (public preview)

- Rename the current display title and options group to **Auto-save Before...** to cover both end-turn and diplomatic-action snapshots.
- Publish the existing 1.1.0 implementation to Workshop item 3815596737, including diplomatic-action saves, independent settings and the HUD shortcut. Keep the mod ID and save-slot names.
- Update the public description and cover to explain both features. Verify all 8 downloaded runtime files against the upload manifest. 70 automated tests pass without skips; new diplomacy save/load and settings behavior still await full in-game acceptance.

### Development notes — 2026-10-15

- Add a separate `BeforeDiplomacy` overwrite slot before local-turn diplomatic actions: war declarations, alliances, projects/responses and peace-deal submissions. Viewing information does not save.
- Add independent, default-on end-turn and diplomacy switches in native Options → Add-ons, with Confirm/Cancel and a HUD shortcut. Settings follow the Rest Guard integration and preserve other mods' shared storage.
- Hold multi-command responses, deal-session cleanup and post-declaration movement until saving succeeds. Preserve explicit retry and cancel on failure, and pass through normally when the game disallows saving.
- Add a Windows installer that refuses a running game, backs up the previous mod and verifies installed file hashes.
- 70 automated tests pass, including four toggle combinations and the actual shipped peace-deal/map-war handlers with substituted native APIs. New settings and diplomatic save/load behavior still await in-game acceptance; 1.0.2 was the published version at the time of these development notes.

## 1.0.2 — 2026-10-08

- Recover when the native save finishes but its completion notification is missing. Previously the outstanding-save counter stayed nonzero, so retrying could repeatedly time out without issuing another write.
- After five seconds, try one fresh overwrite. Resynchronize only if the native serializer accepts it; require a fresh start and successful completion before submitting the turn. A busy serializer keeps the original wait, and a failure still leaves the turn unsubmitted.
- Replay the captured missing-completion boundary in regression tests, including busy rejection, late callbacks, synchronous callbacks, failed recovery and cancellation.
- 42 automated tests pass. In-game fault injection dropped the first native completion; a second real overwrite completed after about 5.5 seconds and released the test continuation exactly once without advancing the test turn.

The reason the game occasionally omits the initial completion notification remains unknown. This release fixes recovery from the observed missing notification; it does not claim to fix the game's event delivery.

## 1.0.1 — 2026-10-08

- Rename the displayed mod title to **Save Before End Turn**.
- Update the Workshop cover and add a real in-game screenshot of the `BeforeEndTurn` local save.
- Keep the mod ID, save filename and runtime behavior unchanged.

The screenshot shows an existing save in the native load menu; a save/load round trip for this release is still unverified.

## 1.0.0 — 2026-10-08

First public preview release.

- Save to the single local `BeforeEndTurn` slot before submitting the current turn.
- Wait for successful save completion; keep the current turn on failure or timeout.
- Support the standard mouse, keyboard, controller and automatic end-turn paths.
- Keep native quicksave and autosave behavior independent.
- Compose with Rest Guard by saving after its rest completes.

Validation: 31 automated checks with game/native API substitutes; mod initialization observed in the local game log. An actual save/load round trip is not yet verified. The Workshop cover is an original explanatory graphic, not a gameplay screenshot.
