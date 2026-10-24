Live game regression for Civilization VII 1.5.0

This uses the game's existing local Cohtml development endpoint on port 9444.
It requires the isolated WarControls_TurnStart save, turn 122, the scout with
component ID 524294 and commander 3211268. No save is distributed in this repo.
Close post-load dialogs before running. Do not use a normal player save.
The script issues actual game commands and consumes the normal packing cost;
reload the disposable save when the scout runs out of movement. It never saves
or ends a turn. Select/target input enters the actual ContextManager route.

From the source directory:
node tests/live/controller-targeting.mjs exit --cancel
node tests/live/controller-targeting.mjs exit
node tests/live/controller-targeting.mjs join --cancel
node tests/live/controller-targeting.mjs join

These assert membership, placement, no Move requests, commander position/moves,
normal unit movement cost, and cancel behavior. Run without --clear-focus for
acceptance: that optional probe clears focus to diagnose the old 0.5.0 bug.
The script prepares a packed/unpacked fixture if necessary before selection.
Automated API fixtures in ../*.test.mjs cannot replace these live checks.
