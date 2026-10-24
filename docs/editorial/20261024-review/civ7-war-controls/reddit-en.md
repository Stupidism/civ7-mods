# War Controls development update: fewer selection steps and a previewable ranged volley

Sometimes the tiring part of combat is not deciding what to attack, but repeatedly selecting units and switching modes. I made this mod to reduce that overhead. Workshop currently has the experimental 0.5.1 release under War Controls; the newer Micromanagement Master 0.6.0 workflows described below are still in development and acceptance testing.

A few things it focuses on:

**Select a ranged unit, ready to aim.** When the required movement and legal targets are present, selection enters attack-target mode. You still choose the target and confirm the attack; selection alone does not fire.

**Keep selection moving after deployment or an attack.** The 0.6.0 development build retains commander focus for eligible deployments and can select the next eligible same-type ranged unit from that commander after a manual attack. It advances selection, not the next attack.

**Preview a volley before committing.** The developing 0.6.0 stationary volley shows participating units and target previews, with temporary exclusions. Each shot is rechecked and the sequence stops when the target dies, without moving to chase it. Commander movement is spent when firing begins, not when a preview is cancelled.

This is tactical input assistance, not an AI deciding your wars. The 0.6.0 volley and selection workflows are not confirmed as part of the current Workshop release. The new volley system targets legal ranged attacks in single-player, not melee, aircraft or every third-party combat trigger. Existing Mac checks verify particular combat and commander-movement cases, not every combination.

[Steam Workshop](https://steamcommunity.com/sharedfiles/filedetails/?id=3822253543)

I’m the author. If you try it, please include your platform, game version and related mods when reporting an issue.
