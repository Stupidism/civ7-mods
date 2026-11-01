# Mod release and acceptance tracking

Project: [Civilization VII — Releases & QA](https://github.com/users/Stupidism/projects/5) (owner-private, linked to Stupidism/civ7-mods).

Use the Mod registry for the current public/development version, bounded QA state, known bugs and screenshot links. Keep separate bug records for affected/fixed versions and acceptance tasks for untested paths. Do not describe an untested path as a confirmed defect.

All acceptance records are written in English. Preserve exact source strings and screenshot language when needed for reproduction. The language of product interfaces, promotion and user conversations is unchanged.

For every update:

1. Identify the Mod and exact build. A repeated semantic version may contain different bytes.
2. Update Published version only from a publication receipt. Preserve the prior release while publication is in progress.
3. Record actual tests, platform, input method and evidence. Separate offline, native-event and physical-device results.
4. Add screenshot links tied to the tested build. Label historical screenshots; say when none are available.
5. Record confirmed affected builds and verified fixed builds for bugs. Keep uncertain boundaries explicit.
6. Close an acceptance task only when its listed checks are complete, or replace its scope with an explicit reviewed decision. Preserve old test history when a new build is created.

The initial payload and idempotent creation receipts are under `work/mod-status-project/`. The import scripts create this reviewed snapshot; they are not an unattended synchronization job. Review updated facts before any subsequent remote change. The existing game-lock, full Saves preservation and Rest Guard rules apply to any future live test. Tracking entries alone do not grant game control or publication permission.
