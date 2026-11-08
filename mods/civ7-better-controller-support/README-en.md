# Better Controller Support 0.10.2-dev

Source candidate **0.10.2-dev** (2026-11-09) fixes multi-key settings compatibility, legacy calibration migration and recovery after a failed save. Workshop remains at **0.10.1**. This candidate has offline checks only; it has not been installed or validated in game. See [storage review fixes](docs/storage-review-fixes.md).

## Current six feature groups

| Feature | Entry | Behavior |
| --- | --- | --- |
| Stick compatibility correction | Options → Add-Ons → this mod's settings | Defaults OFF. Enable manually only when a device needs it; configure stick swap and vertical inversion separately. Existing settings are preserved. |
| Map tools radial menu | Open the native radial and use LB/RB to select Map Tools | Provides filters, cities, units, wonders, and map tacks with the same icons as the minimap buttons. Press A once to open the selected panel directly; press B to return. Map Trix and Detailed Map Tacks are optional—their entries are hidden when absent. |
| Map selection centering | With input compatibility enabled, press R3 on the map | Moves the selected plot to the center of the camera for easier inspection and continued input. |
| Menu scroll navigation | R3 in menus; right stick left/right and up/down | R3 focuses a selectable item near the visible center of the active scroll region. Deliberate right-stick horizontal movement switches regions; sustained vertical scrolling accelerates, with hints following the active region. |
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

Published 0.10.1 retained the 0.10.0 runtime and passed 136 offline regressions with no skips. The 0.10.2-dev candidate changes storage code, so published-version acceptance does not cover it. Candidate evidence is recorded in the storage fixes document; in-game, physical-controller and Windows validation remains pending. See [validation records](VALIDATION.md).

Development: `npm test`; set `CIV7_PLAYWRIGHT_MODULE` for the isolated browser regression, which does not connect to the game. `python3 tools/package.py` only creates the runtime package.
