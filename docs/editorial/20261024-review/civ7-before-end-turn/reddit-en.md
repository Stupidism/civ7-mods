# I made a Civ VII mod to save before ending a turn or confirming diplomacy

You've finished moving your units and managing your cities, then press Next Turn and notice something you missed. Loading the usual autosave means doing those actions again. I made Auto-save Before… to keep a checkpoint immediately before ending the turn or confirming a major diplomatic action.

A few things it focuses on:

**Keep the work you did this turn.** BeforeEndTurn records the state immediately before the next-turn action proceeds, keeping the city management and unit moves you have already completed.

**A checkpoint before diplomatic commitments.** BeforeDiplomacy keeps a checkpoint before supported diplomatic actions are submitted, so you can reload and reconsider the target or action. It uses a separate slot from BeforeEndTurn; reloading does not guarantee the AI will accept a repeated proposal.

For single-player. Each fixed checkpoint is shared across campaigns on the same computer and overwritten by the next matching action; keep separate saves for anything you want to retain. These three screenshots show the installed macOS 1.1.1 interface and a turn-end save; Workshop is on 1.1.2. A complete diplomatic save/load round trip was not retested for this article.

[Steam Workshop](https://steamcommunity.com/sharedfiles/filedetails/?id=3815596737)

I’m the author. If you try it, please include your platform, game version and related mods when reporting an issue.
