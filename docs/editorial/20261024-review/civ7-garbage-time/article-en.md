# Garbage Time — Civ VII Rescue Project

The outcome may be clear, but the checklist keeps growing: spare resources, idle production queues and units that need to come home. I made Garbage Time for repetitive jobs you can describe with clear rules. Every automation starts disabled; enable only the work you actually want it to handle.

## 1. Assign new resources using your preferences

Resources keep arriving after you have already decided what each settlement should specialize in.

Optional resource automation reuses Resource Planner preferences each turn when allocation is available. It requires Resource Planner and Resource Re-sorts, defaults to unassigned resources, and does not choose preferences or initiate trades.

## 2. Send units back to a rally point

After a campaign, getting scattered units home can become another round of individual orders.

Units can head to the nearest reachable friendly settlement or a chosen destination, then sleep on arrival. Aircraft use legal rebasing. This does not initiate attacks or declarations of war, and an invalid destination pauses the task.

## 3. Guide settlement growth with your priorities

Handling growth across many settlements is repetitive, but maximizing one yield can create a happiness problem.

Growth decisions use global yield weights with per-settlement overrides and a happiness threshold. If the mod cannot obtain reliable yield information, it leaves the decision unsubmitted.

## 4. Fill an empty city queue with a project

Once the important buildings are done, repeatedly choosing projects in empty city queues adds little to your plans.

Enabled cities choose an available science or culture project according to their weights when the queue is empty. Existing queues stay intact, and towns keep their focus rather than being treated as cities.

## 5. Bring treasure fleets home

A treasure fleet has a clear destination, but still needs attention for the journey and the final delivery.

Treasure automation finds the nearest reachable homeland settlement and uses the native unload action on arrival. Delivery consumes the fleet as usual, so this is an explicit opt-in action.

## 6. Choose a missionary scope before automating

Finding the next conversion target is repetitive, but sending missionaries abroad is not always part of the plan.

Choose whether to include your own settlements, city-states or other powers; the default is your own. The mod considers reachable areas that still need conversion, distinguishes urban and rural targets, and uses native charge and eligibility rules.

## 7. Keep research from sitting empty

Late in a game, choosing the next technology or civic can become another routine interruption.

Independent technology and civic options choose a shorter estimated available unfinished item, including masteries, before repeating future research. Research already in progress is left alone.

## 8. Get a direct route to a happiness problem

Knowing that happiness is low somewhere is different from finding the settlement quickly.

A separate shortage reminder takes you to the affected settlement. It flags the problem without choosing or constructing a happiness building for you.

## Availability and testing

This is for single-player. Settings are scoped to the player, campaign and era, so a new game or age starts with automation off again. It does not end turns, pick policies or handle diplomacy for you. Historical validation is mainly on Windows 1.5.0; every combination, modern-era case and complete controller flow has not been tested.

[Garbage Time on Steam Workshop](https://steamcommunity.com/sharedfiles/filedetails/?id=3822254009)

Feedback is welcome. Please include your platform, game version, related mods and the action you were taking when something went wrong.
