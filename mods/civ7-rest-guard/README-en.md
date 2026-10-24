# No More Turn（不再来一回合）

Version 1.8.5 · Civilization VII · Single-player only

No More Turn adds configurable breaks and a night-time play restriction. The interface follows the game's text language: English and Simplified Chinese are provided, with English as the base translation. The mod name retains its bilingual format.

Version 1.8.2 fixes missing Chinese glyphs in break-panel text by using the game’s native `font-body` class. An offline browser regression check verifies the actual Chinese font used to render the text.

Renamed from Rest Guard in 1.8.3. The Workshop item, mod ID, settings keys and `RestGuard_` save names stay the same for compatibility.

Version 1.8.4 groups each switch with its related settings: turn intervals, play duration, and night start/end times. Shared break duration and save retention follow these sections. Subtle thin rules separate sections beneath a single mod heading.

Version 1.8.5 immediately hides dependent controls when their switch is off. Enabling the switch restores them with their previous values. Shared break duration, save retention and reset remain visible. Visibility follows the draft; Confirm saves it and Cancel restores the saved settings.

## Defaults and settings

Open **Options → Additional Content → No More Turn（不再来一回合）**. Confirm Changes saves your settings; Cancel Changes discards them. Turn-based breaks, time-based breaks, and night-time restrictions have independent switches.

- **Turn-based breaks:** count completed end-turn requests in memory for the current session. The game turn selects intervals of 5/4/3/2/1 across turns 1–20/21–40/41–60/61–80/81+. Each interval can be set to 1–100. Loading preserves the counter without adding turns; exiting the game clears it.
- **Time-based breaks:** play for 25 minutes, then rest for 5 minutes. Play duration can be set to 1–240 minutes; break duration to 0.1–120 minutes. Loading counts toward play time.
- **Voluntary breaks:** after one minute without input, the break panel appears and pauses the play timer. Continue Game is always available. Five idle minutes complete a break and reset both counters; continuing early keeps your progress toward the next break.
- **Night-time restriction:** enabled by default from 22:00 to 07:00, using your computer's local time. Start and end times can be changed in 15-minute steps. Overnight and same-day windows work; equal times mean no restriction. You can exit during the restriction and change settings from the main menu. Reaching the end time never automatically submits a turn.

Required breaks disable Continue until the countdown ends. **Exit Game and Esc remain available**, using the game's native exit confirmation above the break panel.

## Separate break saves

Each voluntary, timed, turn-based, or night-time break attempts one local normal save. Names use `RestGuard_Idle`, `RestGuard_Time`, `RestGuard_Turn`, or `RestGuard_Night`, followed by the turn, local timestamp, and a unique suffix. They do not overwrite the game's autosave slots.

The default retention limit is **10 saves**, adjustable from **1 to 100**. After a new break save is confirmed, the mod removes older saves that match its complete naming format. The limit is shared across break types and campaigns. Other manual saves, autosaves, quicksaves, cloud saves, and other mods' saves are excluded. A failed query or deletion stops cleanup; another successful break save can try again. Changes to retention apply after the next successful break save.

The panel reports saving, success, or failure. Wait for confirmation before exiting. A failed or unavailable save is not retried repeatedly. Auto-save Before... is optional; with its compatible before-turn hook, the before-turn save finishes before the required break.

## Installation and validation

Subscribe to the [existing Steam Workshop item](https://steamcommunity.com/sharedfiles/filedetails/?id=3815557333), let Steam finish downloading, and restart the game to load the update. Enable No More Turn in Additional Content. Avoid keeping a second manual copy alongside the Workshop version.

Version 1.8.5 passed 209 offline checks, including language resolution, both translations, night-time boundaries, save retention, and the before-turn save integration. No live game test was performed for this release. See [validation history](VALIDATION.txt).
