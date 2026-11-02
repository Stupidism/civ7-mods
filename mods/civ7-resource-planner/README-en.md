# Resource Planner

[简体中文](README.md) · Extension for **Resource Re-sorts 3.0.2** by beezany.

The development source supports English and Simplified Chinese using the game's text language. Other languages use the game's English fallback. There is no separate language setting. The October 23, 2026 translation is a local development update: it has not been installed or published to the Workshop, and has not been tested in the running game.

## Using the resource panel

Open the existing Resources / Trade panel with both Resource Planner and [Resource Re-sorts](https://steamcommunity.com/sharedfiles/filedetails/?id=3507102808) enabled.

- The six yield icons on the left sort settlements by Gold, Food, Science, Culture, Production or Happiness. Click the same icon again to reverse the order. Happiness descending is the initial default; your sorting choice is remembered.
- Settlements appear in Cities, Towns and Outside the trade network groups. Sorting stays within each group; groups can be collapsed. Order is recalculated when opening the resource page or explicitly sorting. Yields and slots update while you move resources, but the settlement order stays fixed, including after automatic allocation finishes.
- **Fill** beside City resources improves negative happiness in cities first, then towns. **Fill** beside Bonus resources handles towns only and does not take resources away from cities. Pure happiness resources stop being added once happiness reaches zero.
- Click a settlement's yield icon to remember its preference and immediately try to assign suitable resources. The highlighted icon and **Preference** label show the choice. Click the label's × to clear it.
- **Assign by preference** considers all settlements with a preference and their available slots together.
- **Include Camels** allows capacity expansion. **Include assigned resources** allows existing assignments to be rearranged. Both options start off whenever the page opens and also apply to Fill.
- When a resource is already selected, clicking a settlement's yield icon attempts to place it instead of starting preference allocation. Right-click / Esc first cancels the selected resource and drag; with nothing selected, it can close the panel.

Preferences are saved by map seed, player and settlement identity. They survive reopening the panel, restarting and loading. Older saves from the same map share these UI preferences; preferences are not written into the game save.

## Allocation rules

Gold / Food / Science / Culture / Production / Happiness use weights of **1 / 2 / 4 / 4 / 4 / 8**. Happiness only scores improvement from a negative value toward zero: raising -2 by 6 counts as 16 points. Influence has no assigned conversion weight and contributes zero to the score.

Allocation uses maximum-weight matching followed by improvements to individual moves and swaps. Percentage bonuses use gross base yields; warehouse and building bonuses use applicable undamaged buildings. City, town, capital, distant-land and construction-queue conditions are considered separately. Nonlinear combinations are improved iteratively, not exhaustively searched.

Each Camel provides two net extra slots after accounting for its own slot. It is used only when the added capacity improves the result. With both options enabled, already assigned Camels may also move. Unrecognized third-party conditions are not counted as supported settlement bonuses.

Turn locks, resource classes, trade connections and capacity still apply. The game decides whether an assignment is legal. Operations wait for confirmation; on failure, the mod attempts to undo changes from that operation and reports any incomplete recovery. If there is no suitable resource, free slot, preference or positive gain, it leaves assignments unchanged.

## Installation and compatibility

Keep Resource Re-sorts enabled. For manual installation, exit the game and copy the entire `civ7-resource-planner` folder into:

- Windows: `%LOCALAPPDATA%/Firaxis Games/Sid Meier's Civilization VII/Mods/`
- macOS: `~/Library/Application Support/Civilization VII/Mods/`

The `.modinfo` file must be directly inside that folder. Avoid enabling both manual and Workshop copies with the same Mod ID. Other mods replacing the same commerce page or model can conflict; recheck compatibility after game or Resource Re-sorts updates.

This UI extension declares `AffectsSavedGames=0` and does not add game database rules. Resource assignments still affect your current game normally. Historical testing used Civilization VII 1.5.0 (1311346); see [validation notes](VALIDATION.md) for exact versions, platforms and limits.

The panel retains native controller paths. Offline coverage includes controller pickup and Cancel, but full physical-controller navigation and placement have not been verified for this update.

## Development and attribution

Run `node --test tests/*.test.mjs` with Node.js 22+. The reactive sorting test reads the locally installed game Solid runtime; set `CIV7_SOLID_PATH` if needed. It explicitly skips that check when the runtime is absent. Offline tests do not launch or connect to the game.

The commerce page and model derive from Resource Re-sorts 3.0.2 by beezany and use native game UI components. Resource Re-sorts must be installed separately. Original mod and game code remain the property of their respective owners; this extension grants no additional license for third-party code.
