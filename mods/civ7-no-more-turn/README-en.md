Version 1.8.8 (2026-11-06) removes all break autosaves and retention cleanup with their options. The break panel keeps a single row of two buttons — Continue Game and Open settings — and Open settings enters the full native pause menu for manual saving, options and exit. The included runtime was accepted by the user in game on 2026-11-06.

# No More Turn（不再来一回合）


Version 1.8.8  · Civilization VII · Single-player only

No More Turn adds configurable breaks and a night-time play restriction. The interface follows the game's text language: English and Simplified Chinese are provided, with English as the base translation. The mod name retains its bilingual format.

Version 1.8.2 fixes missing Chinese glyphs in break-panel text by using the game’s native `font-body` class. An offline browser regression check verifies the actual Chinese font used to render the text.

Renamed from Rest Guard in 1.8.3. The Workshop item, mod ID and settings keys stay the same for compatibility. Existing save files are left in place.

Version 1.8.4 groups each switch with its related settings: turn intervals, play duration, and night start/end times. Shared break duration follows these sections. Subtle thin rules separate sections beneath a single mod heading.

Version 1.8.5 immediately hides dependent controls when their switch is off. Enabling the switch restores them with their previous values. Shared break duration and reset remain visible. Visibility follows the draft; Confirm saves it and Cancel restores the saved settings.

Version 1.8.6: default turn intervals now use the reverse Fibonacci sequence 13/8/5/3/2. Existing settings are preserved; new configurations and Reset use the new defaults. 

Version 1.8.7: break saves moved to the autosave category with short language-specific names (AutoSave_Rest_… / AutoSave_休息_…). Superseded by 1.8.8, which removes break autosaves entirely.

Version 1.8.8: removes all break autosave and retention-cleanup logic and the related options; the mod never creates, queries or deletes save files in any break mode, and existing saves are not moved or deleted. The break panel keeps only Continue Game and Open settings in one row; Open settings enters the full native pause menu with manual save, options and exit — there are no separate save or exit buttons. Loading, the waiting-to-start curtain and main-menu waits no longer count as play time while previous progress is preserved. Settings changes can be confirmed during breaks and the night restriction; a running forced break keeps its original deadline. Break panels show native controller glyph hints and a focus highlight. An explicit activity marker from recording/debug tooling pauses restrictions; an open debug port alone is not treated as activity.

## Defaults and settings

Open **Options → Additional Content → No More Turn（不再来一回合）**. Confirm Changes saves your settings; Cancel Changes discards them. Turn-based breaks, time-based breaks, and night-time restrictions have independent switches.

- **Turn-based breaks:** count completed end-turn requests in memory for the current session. The game turn selects intervals of 13/8/5/3/2 across turns 1–20/21–40/41–60/61–80/81+. Each interval can be set to 1–100. Loading preserves the counter without adding turns; exiting the game clears it.
- **Time-based breaks:** play for 25 minutes, then rest for 5 minutes. Play duration can be set to 1–240 minutes; break duration to 0.1–120 minutes. Loading, the start curtain and main-menu waits pause play time without resetting previous progress or turn counts.
- **Voluntary breaks:** after one minute without input, the break panel appears and pauses the play timer. Continue Game is always available. Five idle minutes complete a break and reset both counters; continuing early keeps your progress toward the next break.
- **Night-time restriction:** enabled by default from 22:00 to 07:00, using your computer's local time. Start and end times can be changed in 15-minute steps. Overnight and same-day windows work; equal times mean no restriction. You can exit during the restriction and change the night schedule through Open settings → Options → Additional Content. Reaching the end time never automatically submits a turn.

Required breaks disable Continue until the countdown ends. Esc or the controller’s Cancel button opens the native exit confirmation.

## Manual saving during breaks

During a break, **Open settings** opens the native pause menu. Returning from the menu restores the break panel; the countdown continues and a required break cannot be skipped. This mod no longer creates, queries or deletes game saves in any break mode. Save-retention and voluntary-autosave settings have been removed; legacy values are ignored. Existing saves are not moved or deleted.

Auto-save Before... remains optional and manages its own before-turn saves. No More Turn creates no additional snapshot.

## Installation and validation

Subscribe to the [existing Steam Workshop item](https://steamcommunity.com/sharedfiles/filedetails/?id=3815557333), let Steam finish downloading, and restart the game to load the update. Enable No More Turn in Additional Content. Avoid keeping a second manual copy alongside the Workshop version.

Version 1.8.5 passed 209 offline checks, including language resolution, both translations, night-time boundaries, save retention, and the before-turn save integration. No live game test was performed for this release. See [validation history](VALIDATION.txt).

Version 1.8.8: the 2026-11-05 development build 1.8.7-dev.1103-2223-9b620247 passed in-game checks — loading and waiting-to-start time not counted, the timer growing after game start, the one-minute break trigger, exit confirmation cancelling back into the break, the two-button panel, the night trigger, and confirming the night switch in native options. The user accepted the build on 2026-11-06. The earlier 157 offline checks passed; the maintainer will re-run them before release. This does not establish physical-controller or per-scenario diplomacy coverage.
