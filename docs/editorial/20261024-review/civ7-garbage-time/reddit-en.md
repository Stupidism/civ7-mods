# I made Garbage Time to handle optional repetitive tasks in Civ VII

The outcome may be clear, but the checklist keeps growing: spare resources, idle production queues and units that need to come home. I made Garbage Time for repetitive jobs you can describe with clear rules. Every automation starts disabled; enable only the work you actually want it to handle.

A few things it focuses on:

**Assign new resources using your preferences.** Optional resource automation reuses Resource Planner preferences each turn when allocation is available. It requires Resource Planner and Resource Re-sorts, defaults to unassigned resources, and does not choose preferences or initiate trades.

**Send units back to a rally point.** Units can head to the nearest reachable friendly settlement or a chosen destination, then sleep on arrival. Aircraft use legal rebasing. This does not initiate attacks or declarations of war, and an invalid destination pauses the task.

**Fill an empty city queue with a project.** Enabled cities choose an available science or culture project according to their weights when the queue is empty. Existing queues stay intact, and towns keep their focus rather than being treated as cities.

This is for single-player. Settings are scoped to the player, campaign and era, so a new game or age starts with automation off again. It does not end turns, pick policies or handle diplomacy for you. Historical validation is mainly on Windows 1.5.0; every combination, modern-era case and complete controller flow has not been tested.

[Steam Workshop](https://steamcommunity.com/sharedfiles/filedetails/?id=3822254009)

I’m the author. If you try it, please include your platform, game version and related mods when reporting an issue.
