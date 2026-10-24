# No More Turn — Civ VII Rescue Project

One more city to manage, one more technology to finish, one more battle next turn. I made No More Turn to give a single-player session clear stopping points, with breaks based on turns, elapsed time and the hours you choose.

## 1. Take breaks between turns

Five early turns can be quick. Five late-game turns can take most of an evening.

The default interval gets shorter as the campaign advances, from five turns to one, and can be adjusted. A break at the turn boundary gives you a clear pause; finishing it resets both the turn and time counters.

![Historical 1.3-series screenshot of a turn-triggered break. The current interface has changed.](assets/08-turn-rest.jpg)

*Historical 1.3-series screenshot of a turn-triggered break. The current interface has changed.*

## 2. Breaks even during a long turn

A turn-based reminder cannot help much when a single turn is taking a long time.

An independent timer defaults to 25 minutes of play followed by a five-minute break. Completing a full break resets both timers, so the other rule does not immediately demand another break.

## 3. Give an existing break credit

If you already stepped away for water, starting another mandatory break immediately afterward feels pointless.

Idle time starts a voluntary break after one minute by default. You can resume whenever you like. A full break clears both accumulated counters; an early return keeps the previous play totals.

## 4. Set a nightly stopping time

Sometimes you know exactly how late it is and still want to finish the next thing.

A separate night rule defaults to 10 p.m.–7 a.m. and has configurable hours. During that period you can exit, but continuing the session is unavailable. The schedule can be adjusted from the main menu.

## 5. Keep a separate save when a break starts

Stopping is easier when you have a checkpoint, but a new break save every time should not leave an endless list.

Idle, timed, turn-based and night breaks create distinct RestGuard saves and report their status. The default retention is ten. Cleanup only targets the mod’s own older saves after a new one succeeds, rather than deleting ordinary autosaves.

## 6. See the next break coming

An invisible timer is easy to forget; a permanent large panel gets in the way.

A compact HUD shows time and turn progress and provides access to settings. Intervals, break lengths and night hours live in the native options.

![Historical screenshot of the compact time and turn display at the top right. Current values and layout may differ.](assets/01-hud-both.jpg)

*Historical screenshot of the compact time and turn display at the top right. Current values and layout may differ.*

## Availability and testing

This article covers the published 1.8.5 feature set. Defaults are configurable, and these are in-game restrictions rather than an operating-system lock. Historical screenshots are visual references only; current night rules, save retention, settings persistence and the full controller flow still need complete in-game evidence. Check that a rest save actually succeeded before relying on it.

[No More Turn on Steam Workshop](https://steamcommunity.com/sharedfiles/filedetails/?id=3815557333)

Feedback is welcome. Please include your platform, game version, related mods and the action you were taking when something went wrong.
