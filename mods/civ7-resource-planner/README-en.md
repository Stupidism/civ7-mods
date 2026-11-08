# Better Resource UI

[简体中文](README.md) · **1.5.0** · November 9, 2026

Review settlement yields, mark priorities, fill happiness shortfalls and assign resources in one panel. English and Simplified Chinese follow the game language. The internal ID remains `civ7-resource-planner`, preserving existing preferences.

## Installation and compatibility

[Steam Workshop](https://steamcommunity.com/sharedfiles/filedetails/?id=3822254182). Restart after Steam finishes updating and confirm the mod is enabled. Avoid duplicate manual and Workshop copies.

This is now standalone: **a separate Resource Re-sorts installation is no longer required**. Disable competing commerce-page overrides, including the separate Resource Re-sorts mod. These pages derive from Resource Re-sorts 3.0.2 by beezany; see [NOTICE.md](NOTICE.md). No separate Action Order mod is needed; disable retired Action Order Adjustments.

## Layout and sorting

Cities, towns and disconnected settlements form three vertically stacked groups. Actions are on the left; sorting and highlighting form two left-aligned rows above the settlements; unassigned resources are on the right. Each settlement has yields/preferences on the left and resource slots on the right.

Select a sort icon to sort; select it again to reverse direction. Assignments do not reorder the list. Sorting is recalculated only on explicit sorting or reopening. Railway/factory sorts appear in the Modern Age; highlighting reflects available resource effects. Hover or controller focus explains the action. **Tidy resource slots** groups cards without reallocating resources.

## Preferences and allocation

Each yield independently cycles Neutral → Prefer ×2 → Avoid ×0 → Neutral. Multiple marks are allowed. Green outlines and inset upward triangles indicate preferences; red outlines and inset downward triangles indicate avoidance. Gold fill marks current focus. Marks change preferences only; **Assign by preference** applies the allocation. Avoidance zeros that yield's score, not other contributions of a mixed resource, and does not prohibit manual placement.

Automatic defaults prefer the highest positive bare yield for each yield type, including positive ties. Resource and percentage bonuses are excluded. Any manual edit or clear freezes defaults. **Reset preferences** restores automatic defaults; a settlement's clear icon removes its marks only. Camels and assigned-resource rearrangement are optional and their switches persist.

Gold/Food/Science/Culture/Production/Happiness use weights 1/2/4/4/4/8. Prefer doubles the relevant contribution; Avoid zeros it. Influence has no conversion weight. Assign by preference only scores happiness improvement up to zero; the separate Fill happiness action uses selectable higher targets.

Allocation compares weighted benefits across eligible settlements, capacity, resource classes and trade connections, including useful Camel capacity. Iterative improvements do not guarantee a global optimum. Native locks and legality still apply. Operations wait for confirmation and stop on cancellation, context changes, locks or timeout; confirmed adjustments remain, and incomplete recovery is reported.

## Happiness targets

Choose Cities first or Towns only, then **Fill happiness**. Settlement targets are 0 or 5; city targets are 0 or 20, defaulting to 0. Cities use the higher applicable target. Towns only leaves cities alone. Changing options does not allocate resources; shortages or capacity may prevent reaching a target.

## Production and Salt

City headings show the current unit, building or project and invested/required production when known. Unknown progress is omitted; towns have no redundant non-training label. The production queue's own display belongs to Better Settlement UI.

Conditional production resources count only when the current queue head matches their condition; Salt applies to unit training. All production contributions compare the before/after value:

`usable production = min(final production for the current item, remaining cost) + max(pre-percentage base production − remaining cost, 0)`

With base60, +50% and80 remaining, +2base scores0. With30 remaining, it scores2. This excludes the bonus-driven waste interval while retaining additional base overflow. Flat, percentage and conditional contributions follow the same comparison, then production weight and preference are applied. Unknown remaining cost retains the uncapped estimate. Displayed raw yields remain unchanged. This is an allocation valuation policy, not exact simulation of every native overflow mechanic or future queue item.

## Reminders and controls

Reminders require a legal empty slot and an available resource. Damaged resources do not count as available; only conditionally useful resources such as Salt with no matching production do not prompt assignment. The reminder toggle persists. Closing normally defers unfinished resource work to later this turn. Use the skip button beside Close or hold the page skip action (default X) for one second to skip this turn. Checks resume next turn; this does not automatically end the turn.

Mouse: select/place resources, Shift-drag matching resources, middle-click quick fill/removal, right-click to cancel selection first.

Controller: four areas cover main actions, sorting/highlighting, settlement preferences, and slots plus the unassigned pool. Use the left stick/D-pad to choose an area, Confirm to enter, and triggers to switch. Cancel first drops a carried resource, then leaves editing/the area before closing. While carrying resources, unrelated controls are disabled. Contextual quick actions handle matching resources; the remove action returns a carried assigned resource to the pool. Occupied slots can be exchanged; displaced resources that cannot return to the source remain unassigned. Follow the game's device-specific bottom-tray icons. Full physical-controller acceptance remains pending.

The Garbage Time integration is retained and requires enabling its resource automation separately. UI preferences are shared by older saves of the same map. Resource assignments still change your current game normally.

## Validation and development

184 offline checks passed with zero skips for this release. Historical Mac live checks cover their respective builds only. The latest production valuation, full physical-controller behavior, Windows, multiplayer and all third-party combinations have not completed live acceptance. Existing Workshop screenshots show1.1.0, not this layout.

[Historical validation](https://github.com/Stupidism/civ7-mods/blob/main/mods/civ7-resource-planner/VALIDATION.md). Run `node --test tests/*.test.mjs` from this directory with Node.js22+. Tests requiring installed native libraries or a browser explicitly skip when unavailable. Package with `python3 tools/package.py --output <directory-outside-repository>`.
