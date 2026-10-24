# Mac Controller Support Fix · Mac 手柄支持修复

[简体中文](README.md) · Version 0.1.5

A Civilization VII compatibility mod for Mac players whose Xbox controller works in menus but stops working on the world map. The left stick moves the plot cursor and can make the camera follow it; the right stick pans the camera. Each stick has a separate direction setting. RB (right bumper) opens the world-map radial menu. Version 0.1.5 adds compatibility for HOLD analog navigation in the main menu and radial panels.

## Setup

Subscribe on Steam Workshop, wait for the download, restart the game, and enable the mod under Additional Content. **Enable Steam Input** for Civilization VII and use the official Xbox layout.

Open **Options → Add-ons → Mac Controller Support Fix** from the main menu or pause menu:

- **Enable controller compatibility**: on by default. Disable to restore native input.
- **Invert left-stick up/down**: off by default, removing the forced inversion from 0.1.2. Affects the plot cursor and its camera-follow. Toggle and confirm if the direction feels reversed.
- **Invert right-stick up/down**: affects only the right stick. On by default; existing preferences survive upgrades.
- **Show debug bar**: off by default. Enable when troubleshooting. Hiding it does not disable controller support.

Confirm to save, or cancel to discard changes. The interface follows the game's English or Simplified Chinese language setting. The original Controller Bridge mod ID and settings key are retained.

Keep only one copy: Workshop or manual installation. The manual folder is `~/Library/Application Support/Civilization VII/Mods/civ7-controller-bridge/`, with the manifest directly inside it. Disable the mod under Additional Content and restart to unload it.

## Controls

| Input | World-map behavior |
| --- | --- |
| Left stick | Move the plot cursor and its camera-follow; vertical direction is independently configurable |
| Right stick | Pan the camera |
| D-pad | Move the map cursor when the world has focus; navigate unit buttons when a unit is selected |
| A / B | Native confirm / cancel |
| LT / RT | Zoom out / in one step per press |
| Right stick click | Center the plot cursor on the camera |
| RB (right bumper) | Open the radial menu on the world map; preserve native next-item navigation in unit views and menus |
| X | Alternate radial-menu shortcut on the world map; movement targeting for a selected unit |
| Y | Native next action; may end the turn after required actions are complete |
| Menu | Native pause menu |
| LB, left stick click | Passed through; full unit cycling and all native shortcuts are not implemented |

The bridge pauses when menus or panels take over. City/Dual views and native soft-cursor mode are excluded. D-pad movement expires after about 0.75 seconds without another direction event; release and press again if needed. This prevents stuck movement after a lost connection. Zoom is discrete rather than continuous.

## Validation and limits

An early version received successful manual feedback with an Xbox Bluetooth controller on Mac. The user confirmed left-stick direction working in 0.1.3. The user also reported RB opening the radial menu, but left-stick navigation failing in the main menu and radial panel. Version 0.1.5 passes 64 offline tests, including native menu-slot and radial-panel HOLD navigation, plus the existing map, settings and backup checks. Chinese button rendering was checked separately with the game's fonts.

Native menu slots and radial panels ignore HOLD analog events. This patch normalizes only menu nav-move/HOLD to UPDATE, preserving vectors and native routing. No raw input trace was captured from the reported failure, so this addresses a reproduced compatibility gap; it is not yet confirmed to resolve the user’s exact symptom. No live game was opened for this update. Native tutorial and view restrictions on opening the radial menu are preserved. Other controllers, multiplayer, city views, and the complete native shortcut set have not been verified. Steam and the game must already receive menu controller events. Other mods that replace input modes may conflict.

Before live testing or loading test saves, back up the entire `Saves` directory, including `auto`, `auto/prev`, and `quick`. Verify the backup and use test copies. The mod declares `AffectsSavedGames=0` and adds no game rules or save entities; normal controller actions still affect the current campaign.

## Troubleshooting

Enable Show debug bar, confirm, and return to the map. Check for Map bridge active and increasing Left / Right / D-pad counters. Counters measure input events, not physical button presses. Debug mode also writes a bounded set of menu stick samples to UI.log under `[ControllerBridge:MenuInput]`. If navigation still fails, enable it and move each stick and the D-pad to capture diagnostics; no menu action is confirmed automatically.

Report the game version, controller, Steam layout, current screen, input, and result. Search `[ControllerBridge]` in `~/Library/Application Support/Civilization VII/Logs/UI.log`. Disable controller compatibility to restore the original input behavior.

This is an unofficial community mod, not affiliated with Firaxis, 2K, Apple, or Microsoft.
