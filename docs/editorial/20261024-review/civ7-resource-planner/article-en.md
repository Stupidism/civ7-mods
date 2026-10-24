# Resource Planner — Civ VII Rescue Project

Once an empire has enough resources, allocating them becomes a lot of shuffling: happiness here, science there, perhaps another slot from a camel. I made Resource Planner to organize that work around settlement groups, yield preferences and batch assignment. It extends beezany’s Resource Re-sorts, which is required.

## 1. Separate cities, towns and disconnected settlements

A long resource list makes it hard to see which settlements can receive resources and which need a different kind.

Collapsible city, town and disconnected groups keep the list readable. Sort by gold, food, science, culture, production or happiness to find the settlements you want to work on.

## 2. Address happiness shortfalls first

One settlement may already have enough happiness while another remains negative, and manual assignment makes the imbalance easy to miss.

Happiness filling handles cities before towns and stops targeting a settlement once it is no longer negative. A towns-only action leaves city allocations alone.

## 3. Give each settlement a yield preference

A science city, a production center and a food-starved settlement do not need the same resources.

Click a yield icon to set that settlement’s preference and assign suitable resources. Preferences are remembered and can be cleared, keeping the intended role visible instead of rebuilding it from memory each turn.

## 4. Plan across the empire

Assigning everything to the first eligible city can leave a more useful destination with nothing.

Assign by Preference compares yields and capacity across settlements, using matching and iterative improvements. Existing allocations are preserved by default; including them in a reshuffle is an explicit choice.

## 5. Include the slots a camel can create

A camel can be valuable because of what its extra slots let you assign, not just because of its own entry.

The optional camel setting considers the benefit of additional capacity. It is off by default, so opening the panel does not automatically trigger a broader reshuffle.

## 6. Keep the list still while you work

If assigning a resource changes the sort order, the settlement you were working on can move away under the cursor.

The 1.1.0 update keeps ordering stable during allocation and reserves reordering for opening the panel or an explicit sort change. Placement takes priority when a resource is selected, with cancellation separated from closing the panel. These changes remain subject to the update’s acceptance checks.

## Availability and testing

The core features are available on Workshop. Stable ordering and interaction/localization fixes discussed here belong to the local 1.1.0 update and need a release check before being presented as shipped. Earlier Windows 1.5.0 tests cover grouping, preferences, happiness and camel allocation, not every era or resource mod. The planner respects available slots and game rules, but does not promise a mathematically optimal allocation or failure-free execution.

[Resource Planner on Steam Workshop](https://steamcommunity.com/sharedfiles/filedetails/?id=3822254182)

Required dependency: [Resource Re-sorts by beezany](https://steamcommunity.com/sharedfiles/filedetails/?id=3507102808)

Feedback is welcome. Please include your platform, game version, related mods and the action you were taking when something went wrong.
