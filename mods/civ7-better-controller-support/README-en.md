# Better Controller Support

Source directory: `civ7-better-controller-support`. The Mod ID and manual installation folder remain `civ7-map-tools-gamepad` for compatibility.

Version 0.3.0 (88 offline checks passed; new plot shortcuts not live-tested). Controller map tools, stacked-unit cycling and settlement shortcuts on Windows/macOS, including compatibility from Mac Controller Support Fix 0.1.5.

## Stacked units and settlements

On the normal map or with a unit selected, shortcuts target the currently highlighted plot (Xbox layout):

- With two or more of your units on that plot, **RB selects the next, LB the previous**, wrapping within that plot. Includes explorers, settlers, merchants, sleeping and exhausted units. Excludes foreign, packed/off-map and remote units. Works before selecting a unit too.
- **X opens the settlement on that plot**, whether or not a unit is selected. Your cities/towns use native management; foreign and independent settlements retain native diplomacy/contact rules. A remote rural tile owned by a city is not its settlement tile.
- Without a stack/settlement, the original button action remains. Menu tabs, move/attack targeting, city screens, dialogs and focus locks retain control. RB cycles units over a stack; to open the radial menu, deselect the unit and move the cursor to a plot without stacked units.

These shortcuts work independently of the Mac compatibility switch and Map Trix. Validation is offline; physical-controller and Windows live behavior remain unverified.

## Map tools

Open the native radial menu with RB; switch to **Map Tools** with LB/RB. Choose a tool with the left stick and press A once to open it directly. D-pad/left stick navigate; A activates and B closes the tool and returns directly to the map. Icons match the actual minimap buttons. Focus has a gold outline, long lists scroll and hidden/disabled entries are skipped.

Base lenses retain native controls. Cities, units and wonders require Map Trix; map tacks require Detailed Map Tacks. Missing tools are hidden. No third-party mod files or game assets are redistributed. Tack placement/removal remains the original mod's responsibility; no new delete shortcut.

## Integrated controller compatibility

Enabled by default on Mac, off on Windows/unknown platforms. Saved preferences take priority. Map tools work independently of this switch.

With compatibility enabled: left stick moves the plot cursor with camera follow, right stick pans, **R3 moves the selected plot to the center of the camera**, LT/RT zoom one step per press. LB/RB cycle stacked units where available; otherwise RB opens the radial menu on the normal map. D-pad retains unit-action navigation. A/B stay native. X prioritizes a settlement; otherwise it opens the radial menu or unit movement. Y invokes native next action and may end the turn. L3 is unchanged.

Held menu analog navigation is normalized to the status expected by native menus. Focus locks, dialogs, pause screens, Rest Guard, non-controller input and city views retain priority. Motion is released on loss of focus/scope and expires if input stops.

Options → Add-ons → Better Controller Support contains compatibility, separate left/right vertical inversion and an optional debug bar. Confirm saves; Cancel discards. Debug defaults off. Inversion applies only while compatibility is enabled. Turning compatibility off leaves Map Tools available.

## Upgrade from the standalone Mac fix

Disable Mac Controller Support Fix and restart with Better Controller Support enabled. Existing settings are read from the same local storage key without an initialization write. No subscription changes are made automatically.

If both mods remain enabled, this mod supplies Map Tools and plot shortcuts, while the old mod handles compatibility input/options. The shortcut entry loads after the old fix (load order 4000) and this mod's bridge. Disable the old mod and restart to use the integrated compatibility implementation.

## Install and verification

Subscribe through Steam Workshop, wait for download, restart and enable Better Controller Support in Additional Content. For manual installs put the civ7-map-tools-gamepad folder in the game's Mods folder. Keep only one copy of this Mod ID.

0.3.0 adds offline plot-shortcut checks using the native input dispatcher and city handler, including compatibility routing and cancellation when targets change. The existing 76 checks cover map tools and compatibility. During 0.2.0 capture the user confirmed Mac map inputs, R3 and radial stick navigation; that feedback does not validate these new shortcuts. Windows, settings persistence and complete map-tack placement/removal remain unverified. See VALIDATION.md for the current count.

Only controller preferences are saved locally; no game rules or save files are changed by installation. Original tool actions still perform normal gameplay behavior. Other mods changing the same input pipeline may require adaptation. See VALIDATION.md for evidence.

Development: npm test. Full detached-browser tests require CIV7_PLAYWRIGHT_MODULE; CIV7_CHROMIUM_PATH and CIV7_MODULES_DIR are optional overrides. Live tests require the repository AGENTS.md protocol and explicit authorization.
