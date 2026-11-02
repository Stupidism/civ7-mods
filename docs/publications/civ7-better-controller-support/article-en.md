# Better Controller Support for Civilization VII

*Civ VII Rescue Project — Part 1*

Hi everyone! I'm the author of **Better Controller Support**, a UI mod that makes Civilization VII's map tools easier to reach with a controller and adds input fixes for Mac players.

If you've ever put down your controller just to open a list, choose a map tack, or catch up with a cursor left behind by the camera, these are the problems I wanted to address.

**Version 0.2.1 is available on [Steam Workshop](https://steamcommunity.com/sharedfiles/filedetails/?id=3825193325).** Here are its seven main features. The screenshots show version 0.2.0 running on macOS with the game set to Chinese; English UI text is also included in the mod.

## 1 Open map tools from the radial menu

**The problem:** Lenses, city lists, unit lists, wonders and map tacks are useful throughout a game, but reaching their minimap buttons with a controller can interrupt what you're doing.

**The fix:** Available tools appear in the game's native radial menu, using the same icons as their minimap buttons. Version 0.2.1 lets you select a tool and press A once to open it directly, then press B to close it and return to the map. Tools that aren't installed or available stay hidden. The new direct-opening and return flow has passed offline checks; an in-game check is still pending.

![Map tools grouped in the native radial menu, with the selected tool highlighted.](assets/01-map-tools-wheel.png)

*Your map tools, together in the radial menu.*

## 2 Keep the selected item visible in long lists

**The problem:** A list isn't much use with a controller if you can't tell which row is selected, or if the selection moves off-screen while the list stays still.

**The fix:** Supported lists get a gold outline around the selected item and scroll to keep it visible. Navigation skips hidden and disabled entries. City, unit and wonder lists use **Map Trix**, which is an optional companion mod.

![The wonders list scrolled to keep the highlighted row visible.](assets/02-list-scroll.png)

*The list follows your selection, so you can keep browsing without reaching for the mouse.*

## 3 Choose map tack icons with a controller

**The problem:** Planning a city with map tacks is handy, but an icon picker without controller navigation breaks the flow before you even place a marker.

**The fix:** With **Detailed Map Tacks** installed, you can navigate its icon picker using directional input. Confirming an icon hands control back to that mod's placement flow. Detailed Map Tacks still handles placement, previews and deletion; the full placement and deletion sequence has not yet been verified with this controller support.

![Detailed Map Tacks icon picker with an icon selected through controller navigation.](assets/03-map-tack-icons.png)

*Browse the map tack icons from your controller.*

## 4 Restore map input on Mac

**The problem:** On Mac, the game can recognize a controller while map movement or access to the radial menu still fails to respond as expected.

**The fix:** The input compatibility mode handles plot selection, camera movement and opening the radial menu. It is enabled by default on macOS. Windows defaults to the game's native map input, while the map-tool additions are available on both platforms.

![The game map with controller input compatibility active on macOS.](assets/04-mac-map-input.png)

*Move the plot cursor and camera with the sticks on Mac.*

## 5 Bring the plot cursor to the center of the view

**The problem:** You've moved the camera somewhere else, but the selected plot is still far away. Moving the cursor back one tile at a time gets old quickly.

**The fix:** With input compatibility enabled, click the right stick, R3, to move the selected plot to the center of the current camera view. The camera stays where it is; the selection comes to you.

![The selected plot at the center of the camera view after pressing R3.](assets/05-r3-center.png)

*Press R3 to select a plot in the area you're already looking at.*

## 6 Set vertical inversion separately for each stick

**The problem:** Moving a plot cursor and panning a camera are different actions. A single inversion setting may make one feel right and the other feel wrong.

**The fix:** The mod provides separate vertical inversion options for the left and right sticks in **Options → Add-ons → Better Controller Support**. These apply while input compatibility is enabled. Both controls are present in the settings page; applying changes and retaining them after a restart still need verification.

![The settings page with separate vertical inversion options for the left and right sticks.](assets/06-controller-settings.png)

*Separate settings for the plot cursor and the camera.*

## 7 Make menu navigation respond to the left stick

**The problem:** Some menus respond to the D-pad but ignore the left stick, making the same controller feel inconsistent from one screen to the next.

**The fix:** Input compatibility also handles left-stick navigation in menus. In the radial menu, the highlighted icon and its central label change together as you move between entries.

![The radial menu showing a different highlighted tool after left-stick navigation.](assets/07-menu-stick.png)

*The highlighted tool and its name follow your selection.*

## Download and optional companion mods

**[Subscribe to Better Controller Support on Steam Workshop](https://steamcommunity.com/sharedfiles/filedetails/?id=3825193325)**, let Steam finish downloading it, then restart the game and enable it in Additional Content.

- **[Map Trix](https://steamcommunity.com/sharedfiles/filedetails/?id=3507072814)** supplies the city, unit and wonder lists shown here.
- **[Detailed Map Tacks](https://steamcommunity.com/sharedfiles/filedetails/?id=3507297712)** supplies the map tack picker and placement tools.

Both are optional. Base-game lenses remain available without them. Better Controller Support includes English and Simplified Chinese UI text.

## Testing and feedback

Mac map movement, R3 recentering and radial stick navigation have received feedback from a player using a physical controller. List scrolling and icon-picker navigation were checked in-game using simulated controller inputs. Windows and other controller models still need testing.

If you try it, please share your platform, controller model, game version and any other UI mods you're using. If something stops responding, tell me which panel was open and which button or stick you used. That will help me reproduce it.
