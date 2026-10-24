# Development preview: paste a shared Civ VII setup instead of copying every setting

A great map share often includes two seeds but leaves you to reconstruct the map type, age, leaders and other settings. I’m developing Your Great Map, My Next Game around a configuration you can inspect before applying. This is a development preview, not a release announcement.

A few things it focuses on:

**Paste a shared configuration.** The development build adds a text-paste entry to new-game setup, parsing supported seed descriptions or configuration codes into a visible result. The goal is to inspect the shared information before starting a game.

**Share the setup around the seeds.** The configuration can carry map and size, speed, difficulty, age, leaders, civilizations and player slots. The extended format includes supported mementos, teams and advanced options, with a coverage report for settings it could not encode.

**Stop when required choices are unavailable.** Allowed options are checked again after age or leader changes. Unavailable choices stop the import rather than silently dropping AI slots or choosing random replacements. Fields applied earlier may remain, so review the resulting setup before starting.

The current 0.3.6-dev priority is text configuration import, with no Workshop release. The new UI and flow are mainly verified offline; successful in-game runs of an older helper do not validate this implementation. Arbitrary save-file reading, screenshot OCR and lossless campaign reproduction are not complete. DLC, other mods, unlocks and game generation can affect the result.

I’m the author. Which part of this would be most useful in your own games? This is a preview, with no release link yet.
