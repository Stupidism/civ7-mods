# Mac Controller Support Fix — Civ VII Rescue Project

Your controller is connected to the Mac and can navigate menus, but the map feels inconsistent. I made Mac Controller Support Fix for that gap: plot selection, camera input and access to the radial menu when the controller is already recognized by the system.

## 1. Restore plot and camera movement

A controller may work in menus while map sticks fail to reach the intended actions.

The compatibility layer connects left-stick plot selection and camera following, plus right-stick camera movement, to the relevant map actions.

## 2. Bring the plot cursor back into view

The camera is where you want it, but the selected plot is far away.

Press R3 to bring the selected plot to the current camera center. The selection moves; the camera stays where you are looking.

## 3. Give each stick its own vertical direction

Plot selection and camera panning can feel better with different vertical directions.

Each stick has a separate inversion setting. Defaults are non-inverted on the left and inverted on the right, with native confirm and cancel controls in the options page.

## 4. Make the radial menu and menus respond

Opening the map wheel or continuing with the left stick in a menu can expose gaps in input handling.

The ordinary map context gets a radial-menu route while unit and menu contexts keep their own actions. Version 0.1.5 also adds menu-stick compatibility; its in-game retest remains distinct from the offline checks.

## Availability and testing

The standalone Workshop release is 0.1.5. Physical Xbox controller feedback comes from the earlier 0.1.3 version; the 0.1.5 menu-input update has offline coverage but still needs in-game retesting. This mainly targets the ordinary map context, not every city or selection mode, and cannot fix a controller the operating system does not recognize. Follow the project’s Steam Input setup notes; other controller models still need feedback.

[Mac Controller Support Fix on Steam Workshop](https://steamcommunity.com/sharedfiles/filedetails/?id=3825119575)

Feedback is welcome. Please include your platform, game version, related mods and the action you were taking when something went wrong.
