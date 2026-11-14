# Better Controller Support 0.10.2

Release **0.10.2** combines three settings-storage fixes—multi-key compatibility, legacy calibration migration, and failed-save recovery—with menu/scroll improvements and automatic local diagnostics. See [storage fixes](docs/storage-review-fixes.md), [integration notes](docs/integration-20261113.md), and [scroll follow-up](docs/scroll-followup-20261114.md).

Load Game keeps the moving RS marker on the selected scroll region and suppresses only that page's duplicate native right-side icon, restoring it on exit. With full stick deflection, acceleration reaches maximum after approximately 1.8 seconds; the complete scroll range then takes at most three seconds. Partial deflection remains slower, and release, reversal or popup takeover resets acceleration. Other pages' native icons are outside this page-specific suppression rule.

## Current six feature groups

| Feature | Entry | Behavior |
| --- | --- | --- |
| Stick compatibility correction | Options → Add-Ons → this mod's settings | Defaults OFF. Enable manually only when a device needs it; configure stick swap and vertical inversion separately. Existing settings are preserved. |
| Map tools radial menu | Open the native radial and use LB/RB to select Map Tools | Provides filters, cities, units, wonders, and map tacks with the same icons as the minimap buttons. Press A once to open the selected panel directly; press B to return. Map Trix and Detailed Map Tacks are optional—their entries are hidden when absent. |
| Map selection centering | With input compatibility enabled, press R3 on the map | Moves the selected plot to the center of the camera for easier inspection and continued input. |
| Menu scroll navigation | R3 in menus; right stick left/right and up/down | R3 focuses a selectable item near the visible center of the active scroll region. Deliberate right-stick horizontal movement switches regions; sustained vertical scrolling accelerates; hints use the native NavigationTray. A popup can cancel the same routed input or claim the current frame, immediately stopping background scrolling. |
| Same-plot units and settlement | LB/RB to cycle; X for the settlement | When several of your units occupy one plot, LB/RB cycles through them. Before or after selecting a unit, X opens that plot's settlement. Native legality checks govern whether it can open or act. |
| Force end turn | Hold View/Back for about 1 second, then release | A short press still opens the social panel. After a one-second hold, release invokes native force-end-turn. Native blockers, save flows, and Rest Guard remain respected—not bypassed. |

## Boundaries with optional page mods

The following features are outside this package. All three page mods are optional; without them, the six controller groups above still work.

| Optional mod | Responsible features |
| --- | --- |
| [Resource Planner](../civ7-resource-planner/README-en.md) | Resource layout, allocation preferences, empty-resource-slot reminders, close deferral, and skip-this-turn. |
| [Better Settlement UI](../civ7-better-settlement-ui/README-en.md) | Four-column settlement layout, scores, payback, sorting, build deferral, and skip-this-turn. |
| [Better Policy UI](../civ7-better-policy-ui/README-en.md) | Compact policy layout; policy/tradition/crisis empty-slot reminders, close deferral, and skip-this-turn. |

## Upgrade and settings

Replace this mod's complete directory during updates so removed files cannot linger. The internal mod ID stays unchanged. On reliable keyed storage, legacy calibration is loaded and migrated when settings are confirmed. Legacy records on affected macOS key-blind storage require the explicit [migration procedure](docs/storage-review-fixes.md); do not clear other mods’ settings. Do not enable it together with the old standalone Mac controller fix or keep duplicate local and Workshop copies.

## Automatic controller diagnostics

> Automatic diagnostics passed offline validation and are installed in the local development build. Gameface persistence and physical-controller behavior for the new code still require separate verification.

Diagnostics are always on by default, independent of both Show Debug and the compatibility toggle. They record only page startup/build, the five validated persisted switches, effective map/menu switches, device/input context/view/panel/block reason, named engine actions and axis vectors, plus map/menu bridge mapping, pass-through, suppression, and errors. `nav-move` is an engine ACTION stream: the log cannot infer the physical left/right stick or identify a hardware/driver cause. Diagnostics parse the latest shared document only to merge their own namespace safely and never record foreign settings. They do not read UI text, saves, player names, or chat, issue gameplay commands, or upload anything.

The recorder retains startup information and initial/latest health summaries outside the rolling events for at most three recent shell/game page sessions, with at most 512 input/change events and 96 KiB of UTF-8 JSON across them. Each input source/stage admits at most four events per second. Manual marks and other state records also have rate and capacity limits; excess samples enter bounded counters. Dirty data normally flushes synchronously no more than once per ten seconds. A write replaces only this page's session and preserves other sessions from the latest stored document. It merges only `civ7-map-tools-gamepad.diagnostics.v1` inside an existing, exactly validated shared `modSettings` document; it neither creates a second key nor creates an empty shared settings document. A clean install without verified BCS calibration records in memory only; those records cannot be recovered after the page closes. Invalid, ambiguous, quota-failed, or failed-readback storage pauses persistence while retaining memory. Unload makes a best-effort synchronous write, but a process crash, power loss, or unverifiable storage can still lose the final batch.

While the page is alive, use `globalThis.__civ7BetterControllerDiagnosticsV1.snapshot()` in the development console for a read-only copy. `flush()` requests one best-effort write and `mark('short label')` adds a manual marker; none sends input or game commands. For offline extraction, quit the game, copy `LocalStorage.sqlite`, then read the exact row from the copy: `sqlite3 backup-LocalStorage.sqlite "SELECT value FROM \"Values\" WHERE id='fs://game' AND key='modSettings';"`; parse the diagnostics namespace above from that JSON. Keep this read-only—do not clear, rewrite, or query the live database in place.

The complete 0.10.2 offline suite passed **194 tests, zero failures/skips**, including isolated Chromium. No new in-game, physical-controller or Windows acceptance is claimed. Installation is not live acceptance. See [validation records](VALIDATION.md).

Development: `npm test`; set `CIV7_PLAYWRIGHT_MODULE` for the isolated browser regression, which does not connect to the game. `python3 tools/package.py` only creates the runtime package.
