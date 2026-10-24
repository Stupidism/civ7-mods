# Micromanagement Master Chiang Kai-shek — Civ VII Rescue Project

Sometimes the tiring part of combat is not deciding what to attack, but repeatedly selecting units and switching modes. I made this mod to reduce that overhead. Workshop currently has the experimental 0.5.1 release under War Controls; the newer Micromanagement Master 0.6.0 workflows described below are still in development and acceptance testing.

## 1. Select a ranged unit, ready to aim

A ranged unit has a legal target, but selecting it still leaves another mode-switching click before you can aim.

When the required movement and legal targets are present, selection enters attack-target mode. You still choose the target and confirm the attack; selection alone does not fire.

## 2. Make joining a commander more direct

Trying to join a nearby commander can turn into selecting another unit on the tile or issuing the wrong movement order.

Supported cases prioritize joining mode, and right-clicking a commander tile can prioritize joining over movement. An illegal join does not silently become a move. An existing action mode is cancelled before the next operation.

## 3. Deploy the unit you picked

You want one packed unit in a particular position, not an entire army deployed at once.

Selecting an individual packed unit can enter that unit’s legal deployment mode. You choose the tile; the mod does not automatically deploy the whole army.

## 4. Spot empty commanders and simpler reinforcement choices

Empty commanders are easy to miss, while a reinforcement with only one valid commander can involve unnecessary selection.

A pink base marks an empty commander, without counting reinforcements still en route. A sole legal commander can be handled directly; multiple commanders still require a choice.

## 5. Keep selection moving after deployment or an attack

After deploying a unit you find the commander again; after firing, you hunt for the next eligible ranged unit.

The 0.6.0 development build retains commander focus for eligible deployments and can select the next eligible same-type ranged unit from that commander after a manual attack. It advances selection, not the next attack.

## 6. Preview a volley before committing

When several ranged units share a target, you need to know who will fire and who should retain their action.

The developing 0.6.0 stationary volley shows participating units and target previews, with temporary exclusions. Each shot is rechecked and the sequence stops when the target dies, without moving to chase it. Commander movement is spent when firing begins, not when a preview is cancelled.

## 7. Preview reinforcement destinations

A silent fallback to a different reinforcement destination can be worse than an extra click.

The 0.6.0 preview keeps candidate destinations visible, including invalid ones. You can browse them, but confirmation is disabled for an invalid target rather than redirecting the order. Controller browsing is part of this development work and still needs full in-game acceptance.

## Availability and testing

This is tactical input assistance, not an AI deciding your wars. The 0.6.0 volley and selection workflows are not confirmed as part of the current Workshop release. The new volley system targets legal ranged attacks in single-player, not melee, aircraft or every third-party combat trigger. Existing Mac checks verify particular combat and commander-movement cases, not every combination.

[Micromanagement Master Chiang Kai-shek on Steam Workshop](https://steamcommunity.com/sharedfiles/filedetails/?id=3822253543)

Feedback is welcome. Please include your platform, game version, related mods and the action you were taking when something went wrong.
