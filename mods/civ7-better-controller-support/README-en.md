# Better Controller Support

Source directory: `civ7-better-controller-support`. The Mod ID and manual installation folder remain `civ7-map-tools-gamepad` for compatibility.

Version 0.2.1. Controller access to Civilization VII minimap tools on Windows/macOS, now including the map-input and menu-stick compatibility from Mac Controller Support Fix 0.1.5. The old mod is no longer required.

## Map tools

Open the native radial menu with RB; switch to **Map Tools** with LB/RB. Choose a tool with the left stick and press A once to open it directly. D-pad/left stick navigate; A activates and B closes the tool and returns directly to the map. Icons match the actual minimap buttons. Focus has a gold outline, long lists scroll and hidden/disabled entries are skipped.

Base lenses retain native controls. Cities, units and wonders require Map Trix; map tacks require Detailed Map Tacks. Missing tools are hidden. No third-party mod files or game assets are redistributed. Tack placement/removal remains the original mod's responsibility; no new delete shortcut.

## Integrated controller compatibility

Enabled by default on Mac, off on Windows/unknown platforms. Saved preferences take priority. Map tools work independently of this switch.

With compatibility enabled: left stick moves the plot cursor with camera follow, right stick pans, **R3 moves the selected plot to the center of the camera**, LT/RT zoom one step per press, RB opens the radial menu on the normal map. D-pad moves the plot cursor on an unfocused world but retains unit-action navigation. A/B stay native; X opens the radial menu or unit movement; Y invokes native next action and may end the turn. LB/L3 are unchanged.

Held menu analog navigation is normalized to the status expected by native menus. Focus locks, dialogs, pause screens, Rest Guard, non-controller input and city views retain priority. Motion is released on loss of focus/scope and expires if input stops.

Options → Add-ons → Better Controller Support contains compatibility, separate left/right vertical inversion and an optional debug bar. Confirm saves; Cancel discards. Debug defaults off. Inversion applies only while compatibility is enabled. Turning compatibility off leaves Map Tools available.

## Upgrade from the standalone Mac fix

Disable Mac Controller Support Fix and restart with Better Controller Support enabled. Existing settings are read from the same local storage key without an initialization write. No subscription changes are made automatically.

If both mods remain enabled, this mod supplies Map Tools and defers all compatibility input/options to the old mod, avoiding duplicate handlers independently of script order. Disable the old mod and restart to use the integrated implementation.

## Install and verification

Subscribe through Steam Workshop, wait for download, restart and enable Better Controller Support in Additional Content. For manual installs put the civ7-map-tools-gamepad folder in the game's Mods folder. Keep only one copy of this Mod ID.

76 offline tests passed, including native radial resolution/decorations, single-confirm tool opening, return to map and intervening-dialog guards. These do not run or control the game. During 0.2.0 screenshot capture the user confirmed Mac map inputs, R3 and radial stick navigation. The new direct-opening behavior has not been live-tested; Windows, settings persistence and complete map-tack placement/removal remain unverified.

Only controller preferences are saved locally; no game rules or save files are changed by installation. Original tool actions still perform normal gameplay behavior. Other mods changing the same input pipeline may require adaptation. See VALIDATION.md for evidence.

Development: npm test. Full detached-browser tests require CIV7_PLAYWRIGHT_MODULE; CIV7_CHROMIUM_PATH and CIV7_MODULES_DIR are optional overrides. Live tests require the repository AGENTS.md protocol and explicit authorization.
