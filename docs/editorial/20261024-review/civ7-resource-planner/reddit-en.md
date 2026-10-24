# Resource Planner: settlement preferences and batch resource assignment for Civ VII

Once an empire has enough resources, allocating them becomes a lot of shuffling: happiness here, science there, perhaps another slot from a camel. I made Resource Planner to organize that work around settlement groups, yield preferences and batch assignment. It extends beezany’s Resource Re-sorts, which is required.

A few things it focuses on:

**Address happiness shortfalls first.** Happiness filling handles cities before towns and stops targeting a settlement once it is no longer negative. A towns-only action leaves city allocations alone.

**Give each settlement a yield preference.** Click a yield icon to set that settlement’s preference and assign suitable resources. Preferences are remembered and can be cleared, keeping the intended role visible instead of rebuilding it from memory each turn.

**Plan across the empire.** Assign by Preference compares yields and capacity across settlements, using matching and iterative improvements. Existing allocations are preserved by default; including them in a reshuffle is an explicit choice.

The core features are available on Workshop. Stable ordering and interaction/localization fixes discussed here belong to the local 1.1.0 update and need a release check before being presented as shipped. Earlier Windows 1.5.0 tests cover grouping, preferences, happiness and camel allocation, not every era or resource mod. The planner respects available slots and game rules, but does not promise a mathematically optimal allocation or failure-free execution.

[Steam Workshop](https://steamcommunity.com/sharedfiles/filedetails/?id=3822254182)

Required: [Resource Re-sorts by beezany](https://steamcommunity.com/sharedfiles/filedetails/?id=3507102808).

I’m the author. If you try it, please include your platform, game version and related mods when reporting an issue.
