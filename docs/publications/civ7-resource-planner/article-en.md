# Resource Planner — give resources a destination, not another spreadsheet

*Civ VII Rescue Project*

I'm the author of Resource Planner, an extension for beezany's Resource Re-sorts. It adds settlement grouping, happiness filling and allocation based on the role you give each settlement.

Once the empire grows, assigning a resource is less about finding an empty slot and more about remembering which city needs what. The aim is to keep those decisions visible in the resource panel instead of rebuilding the plan every time.

## 1. Group cities and towns, then sort by yield

Cities, towns and disconnected settlements do not all have the same resource needs. A long mixed list makes those differences harder to scan.

The panel groups them separately and sorts within each group by gold, food, science, culture, production or happiness. Look for happiness shortfalls or high-science cities without searching every row. Groups can be collapsed when you do not need them.

![Cities and towns are grouped separately, with happiness sorting to help locate settlements that need resources. (v1.1.0, Mac, October 23.)](assets/03-english-overview.png)

## 2. Prioritize happiness shortfalls until zero or above

An empty slot is not necessarily where another happiness resource is useful. Some settlements may still be negative while others already have enough.

Fill targets negative happiness and stops adding pure happiness resources once a settlement reaches zero or above. The city-resource action handles cities before towns; the towns-only action leaves city allocations alone. Limited resources, slots and game rules still constrain what can be filled.

![This fill assigned seven resources. Kamakura’s happiness rose from −9 to −6; limited resources can still leave a shortfall.](assets/en-happiness-after.png)

## 3. Mark settlement priorities and assign new resources in one click

Several cities may accept the same resource, but its value can be very different in a research center and a production center.

Click a settlement's yield icon to remember its preference and try assigning suitable resources. Assign by Preference considers the chosen settlements together, comparing yields and capacity instead of giving the first row first claim.

Existing allocations are kept by default. You can include them when you want a reshuffle, and optionally include camels so that their additional capacity is considered. The remembered roles save you from rebuilding the plan on every visit.

![The production-focused capital rose from 109 to 114 production, while the science-focused settlement rose from 47 to 55 science.](assets/en-preferences-after.png)

## 4. Pair with Garbage Time to assign new resources automatically

Once settlement priorities are set, Garbage Time can handle newly available resources without another visit to the panel.

Enable its resource automation under Options → Additional Content. It applies the remembered preferences once per local-player turn, using unassigned resources by default and waiting while the game locks allocation. Resource Planner and Resource Re-sorts must both be enabled.

In this native-game capture, eight resources were assigned with the panel closed: capital Production rose from 109 to 129, and Erfen Keji Science from 47 to 55.

![Eight resources were assigned while the resource panel was closed. Reopening it shows 129 Production in the capital and 55 Science in Erfen Keji.](assets/resources-after.png)

## Availability and testing

Workshop version 1.1.0 requires Resource Re-sorts to be installed and enabled. English and Simplified Chinese are supported through the normal resource/trade panel. Preferences persist across restarts and loads; older saves from the same map share these UI preferences.

The game still enforces resource locks, trade connections, resource classes and capacity. Allocation is not guaranteed globally optimal. The October 23–24 Mac 1.5.0 Metal checks covered both languages, mouse resource interaction, happiness filling, preference assignment and sorting. Physical controllers, multiplayer and every third-party combination are not fully verified.

[Resource Planner on Steam Workshop](https://steamcommunity.com/sharedfiles/filedetails/?id=3822254182)

[Required: Resource Re-sorts](https://steamcommunity.com/sharedfiles/filedetails/?id=3507102808)

It does not create more resources. It helps make the ones you have fit the roles you already planned.
