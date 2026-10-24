# Mac Controller Support Fix: plot movement, camera input and R3 recentering

Your controller is connected to the Mac and can navigate menus, but the map feels inconsistent. I made Mac Controller Support Fix for that gap: plot selection, camera input and access to the radial menu when the controller is already recognized by the system.

A few things it focuses on:

**Restore plot and camera movement.** The compatibility layer connects left-stick plot selection and camera following, plus right-stick camera movement, to the relevant map actions.

**Bring the plot cursor back into view.** Press R3 to bring the selected plot to the current camera center. The selection moves; the camera stays where you are looking.

**Give each stick its own vertical direction.** Each stick has a separate inversion setting. Defaults are non-inverted on the left and inverted on the right, with native confirm and cancel controls in the options page.

The standalone Workshop release is 0.1.5. Physical Xbox controller feedback comes from the earlier 0.1.3 version; the 0.1.5 menu-input update has offline coverage but still needs in-game retesting. This mainly targets the ordinary map context, not every city or selection mode, and cannot fix a controller the operating system does not recognize. Follow the project’s Steam Input setup notes; other controller models still need feedback.

[Steam Workshop](https://steamcommunity.com/sharedfiles/filedetails/?id=3825119575)

I’m the author. If you try it, please include your platform, game version and related mods when reporting an issue.
