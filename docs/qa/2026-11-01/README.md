# Civilization VII — Release and QA evidence

Snapshot: 2026-11-01 (UTC+08:00). Acceptance records are maintained in English. Original game screenshots, raw output, identifiers and reproduction strings retain their original language.

[Current version and QA Project](https://github.com/users/Stupidism/projects/5)

Publication-state correction: the latest recorded Micromanagement Master publishing turn is interrupted. No new release receipt is available; public version remains 0.6.1.

## How to read these records

- Public release, development version, installed build and tested build are separate facts. Equal version numbers do not imply equal bytes.
- A passed bounded test is not complete acceptance. Offline checks, native game API/input events and physical input are explicitly distinguished.
- Bug affected versions list only confirmed builds. Unknown earlier versions are not marked affected or unaffected.
- Screenshots below are real captured UI. Historical captures are labeled and do not validate a newer build. Missing screenshots remain explicit.
- This snapshot creates tracking records only. It does not publish Mod packages or authorize additional game tests.

## Integration run — 2026-11-01

macOS ARM64, Civilization VII 1.5.0 (1311346) Metal, Chinese UI, 2560 × 1080 game viewport. The run used an isolated copy of the original T53 quicksave. No turn was advanced. Game UI/API and native input events were used; no physical controller was connected.

### Offline results

| Suite | Passed | Failed | Coverage |
| --- | ---: | ---: | --- |
| Better Settlement UI | 65 | 0 | Browser dependency configured; no skips |
| AO / Policy / BCS / War / Resources / Rest Guard | 823 | 0 | One font test initially skipped |
| Native-font follow-up | 1 | 0 | Previously skipped test rerun with actual game font and Chromium |
| Garbage Time | 74 | 0 | Source tests |
| Total distinct passing checks | **963** | **0** | Not 963 live-game checks; not 963 checks per Mod |

### Preservation and shutdown

All game/control processes exited and were awaited. The complete original Saves baseline (422 files, 6 directories) was verified by path, size and SHA-256. Only the original quicksave changed due to explicit manual-save testing and was restored from the verified compressed baseline; unchanged originals were not rewritten. The owned test copy was removed. Original Mod flags (including null/default flags), modSettings and option files were restored. Two temporary Garbage Time runtime files were restored and baseline installed-file hashes verified. All four compressed recovery archives were deleted immediately after successful restoration. No extra full folder backup or permanent final-preservation archive was created. The game lock was released.

### Detailed observed values

- Better Settlement UI: city 196610 had food 24. Market `(117×4)/(5 gold + 12 slot value)=27.53` turns; lighthouse `(234×4)/(7 gold + 24 slot value)=30.19`; bath `(234×4)/(6 food×2 − 2 gold + 24×10%×2)=63.24`; monument `(117×4)/(7 culture×4 + 1 food×2 − 2 gold + 2 Influence×8)=10.64`. Native items, score output and ProductionTooltip agreed. No purchase, completion, overbuild or repair was executed.
- War Controls: commander 196609, army 65536; real unit movement was 3/3, 1/2 and two 0/2 values. Red zero values, empty slots and health bars were checked.
- Resources/AO/BCS: exactly one ResourceDefer control and zero AO/old-BCS skip controls; defer closed the page and set deferred. Seven city production queues/resources were unchanged before exit. Cohtml pseudo-element computed-style values were not used as reliable geometry evidence; screenshot plus installed CSS supported marker geometry.
- Policy UI: 16 cards, 8 slots, approximately 184.21px wide × 168px tall; 120 animation frames produced one layout. Left groups had 2+2 columns and right group 4. Filled slots correctly had zero skip controls.
- Play Again: C7S2 exported 73 fields; applying modified seeds and NoCivUnlocks accepted 74 fields, with player count accounting for the additional field. No new world was started.
- Rest Guard: temporary time-only settings used one-minute play/rest limits without debug exemption, suspended=false. Natural forced rest left all 423 files unchanged. Native quicksave succeeded after expiry and with 56.298 seconds remaining. Returning restored the overlay with 38.664 seconds remaining and the same deadline. Continue kept T53 and turnComplete=false. Repeated SaveComplete entries came from duplicate observation hooks, not proof of multiple saves. One idle panel was dismissed before the second natural forced-rest run; input events prevented inactivity without changing timers.
- Garbage Time: only city-panel.js and resource-model.js were temporarily installed. All automation switches remained off. Native accept opened configuration, applied the gold preset, changed gold weight 4→5 and saved. Actual resource bridge returned no changes/error=false with all seven city assignments unchanged.

## civ7-better-settlement-ui

**Better Settlement UI** (更好的定居点界面)

- Published: Not released
- Development: 0.1.10
- Release state: Unreleased; QA state: Partial live
- Evidence checked: 2026-11-01

### Verified scope

- 65 offline checks passed.
- T53 market, lighthouse, bath and monument scores and native tooltip content matched real city data. Resource slots use 12 points per turn; Influence uses weight 8.
- Production/purchase mode switching and insufficient-gold disabling passed.

### Remaining coverage

- Actual purchasing, completion, overbuilding and repairs.
- Physical controller input.

### Recorded defects

- No unresolved defect is recorded for this Mod in the reviewed evidence. This is not a claim of bug-free behavior.

### Screenshots

2026-11-01 integration capture; scope is the tested build described above.
![Better Settlement UI — real game UI](assets/04-market-small.jpg)

2026-11-01 integration capture; scope is the tested build described above.
![Better Settlement UI — real game UI](assets/05-bath-small.jpg)

## civ7-war-controls

**Micromanagement Master** (微操大师)

- Published: 0.6.1 — [Workshop](https://steamcommunity.com/sharedfiles/filedetails/?id=3822253543)
- Development: 0.6.1 + post-release fixes
- Release state: Unreleased; QA state: Partial live
- Evidence checked: 2026-11-01

### Verified scope

- T53 badges 3/3, 1/2 and 0/2 matched native movement values; zero was red, empty slots had no badge, health bars remained visible.
- Earlier T44 quick-transfer and LB/RB results retain their original scope.

### Remaining coverage

- The T53 run did not repeat movement, attacks, quick transfer or physical controller checks.
- Publication was requested, but the latest recorded attempt is interrupted and no completion receipt is available. Public release remains 0.6.1.

### Recorded defects

- No unresolved defect is recorded for this Mod in the reviewed evidence. This is not a claim of bug-free behavior.

### Screenshots

2026-11-01 integration capture; scope is the tested build described above.
![Micromanagement Master — real game UI](assets/06-movement-fractions-small.jpg)

## civ7-resource-planner

**Resource Planner** (资源规划)

- Published: 1.1.0 — [Workshop](https://steamcommunity.com/sharedfiles/filedetails/?id=3822254182)
- Development: 1.3.1
- Release state: Unreleased; QA state: Partial live
- Evidence checked: 2026-11-01

### Verified scope

- Installed triangle-centering CSS matched source. Negative red and positive green markers were centered inside the edges.
- Native focus/input changed preferences. Exactly one defer control existed; activation closed the screen and set deferred.
- Garbage Time integration returned no changes with error=false; all seven cities retained their assignments.

### Remaining coverage

- Actual resource reassignment/COMPLETED path, failure rollback and physical controller.

### Recorded defects

- No unresolved defect is recorded for this Mod in the reviewed evidence. This is not a claim of bug-free behavior.

### Screenshots

2026-11-01 integration capture; scope is the tested build described above.
![Resource Planner — real game UI](assets/07-resource-markers-small.jpg)

## civ7-rest-guard

**No More Turn** (不再来一回合)

- Published: 1.8.7 — [Workshop](https://steamcommunity.com/sharedfiles/filedetails/?id=3815557333)
- Development: 1.8.7-dev.1101-1438-315f6449
- Release state: Unreleased; QA state: Partial live
- Evidence checked: 2026-11-01

### Verified scope

- Natural one-minute forced break, without debug exemption, left all 423 save files unchanged.
- Native quick save succeeded with 56.298 seconds remaining and after the deadline; the overlay returned without resetting the deadline.
- Continue did not submit a turn. Original settings and quicksave were restored.

### Remaining coverage

- Night limits, turn thresholds, exit confirmation and physical controller were not rerun.
- Public 1.8.7 retains the old behavior; the development build is a different implementation.

### Recorded defects

- No unresolved defect is recorded for this Mod in the reviewed evidence. This is not a claim of bug-free behavior.

### Screenshots

2026-11-01 integration capture; scope is the tested build described above.
![No More Turn — real game UI](assets/10-rest-forced-small.jpg)

2026-11-01 integration capture; scope is the tested build described above.
![No More Turn — real game UI](assets/11-rest-menu-small.jpg)

## civ7-garbage-time

**Garbage Time** (垃圾时间)

- Published: 0.1.4 — [Workshop](https://steamcommunity.com/sharedfiles/filedetails/?id=3822254009)
- Development: 0.1.4 + unpublished UI/resource patches
- Release state: Unreleased; QA state: Needs retest
- Evidence checked: 2026-11-01

### Verified scope

- 74 offline checks passed. Native accept START/FINISH opened city configuration, changed gold weight 4 to 5, saved and closed the page.
- Actual resource bridge returned no changes/error=false without changing seven cities. Two temporary installed files were restored after testing.

### Remaining coverage

- IT-02: controller hints remain hidden.
- Actual resource reassignment, rollback, older planners without statusCode and physical controller.

### Recorded defects

- **IT-02** (open): [Garbage Time] Controller button hints remain hidden after action-key addition. Confirmed affected: 0.1.4 + unpublished city-panel.js patch; SHA256 469c1b7e1ea87021d5866da2becbf41438807d8777864b0f0509961ec9fd2369. Fixed in: Not fixed. Public 0.1.4 was restored after the test; this receipt does not establish the defect across every prior release.

### Screenshots

2026-11-01 integration capture; scope is the tested build described above.
![Garbage Time — real game UI](assets/12-garbage-city-small.jpg)

## civ7-play-again

**Play Again / Your Great Map** (你的神图很好，现在是我的了)

- Published: Not released
- Development: 0.4.0-dev (installed); 0.3.6-dev (main source)
- Release state: Unreleased; QA state: Needs retest
- Evidence checked: 2026-11-01

### Verified scope

- C7S2 exported 73 fields. Preview and apply succeeded with 74 accepted fields, zero skipped; the extra field was player count.
- Both seeds and NoCivUnlocks changed in real GameSetup. No new world was started.

### Remaining coverage

- IT-01: raw team and difficulty localization keys.
- Physical clipboard paste, nonempty memento replacement, invalid rosters, historical save import and new-world generation.
- The main source must not overwrite the newer installed build.

### Recorded defects

- **IT-01** (open): [Play Again] Team and difficulty labels expose raw localization keys. Confirmed affected: 0.4.0-dev installed build (2026-11-01). Fixed in: Not fixed. 0.3.6-dev and other earlier builds were not tested for this defect.

### Screenshots

2026-11-01 integration capture; scope is the tested build described above.
![Play Again / Your Great Map — real game UI](assets/02-code-export-preview.png)

2026-11-01 integration capture; scope is the tested build described above.
![Play Again / Your Great Map — real game UI](assets/03-code-preview-small.jpg)

## civ7-better-policy-ui

**Better Policy UI** (更好的政策界面)

- Published: Not released
- Development: 0.1.2-dev.1031-1947-19381774
- Release state: Unreleased; QA state: Partial live
- Evidence checked: 2026-11-01

### Verified scope

- T53 had 16 cards and 8 slots; all 120 animation frames shared one layout.
- Filled slots correctly displayed no skip control. Earlier 0.1.2 installed-process checks verified stable geometry with LF previews.

### Remaining coverage

- Empty-slot drafts, confirmation, force-turn and physical controller were not repeated in the latest combination.
- Other resolutions and all Mod combinations are not accepted by this evidence.

### Recorded defects

- **BPU-01** (closed): [Better Policy UI] Retain card geometry during asynchronous layout updates. Confirmed affected: 0.1.0 / build 1031-1501-38d835f3. Fixed in: 0.1.1; also verified in 0.1.2. No broader affected range inferred.
- **BPU-02** (closed): [Better Policy UI] Correct Gameface slot height and rem-valued geometry. Confirmed affected: 0.1.1 / build 1031-1601-c3456a23. Fixed in: 0.1.2. No broader affected range inferred.

### Screenshots

2026-11-01 integration capture; scope is the tested build described above.
![Better Policy UI — real game UI](assets/08-policy-layout-small.jpg)

## civ7-action-order

**Action Order Adjustments** (行动顺序调整)

- Published: Not released
- Development: 0.1.0
- Release state: Unreleased; QA state: Partial live
- Evidence checked: 2026-11-01

### Verified scope

- Installed runtime matched source. Shared service and production/card providers were present.
- Resource Planner owned the only defer control; no duplicate AO/old-BCS control appeared. Seven cities retained queues and resources.
- Earlier T38-to-T39 actual-save/single-submit evidence remains separately scoped.

### Remaining coverage

- Full three-stage ordering, empty drafts and physical controller were not repeated in this run.

### Recorded defects

- No unresolved defect is recorded for this Mod in the reviewed evidence. This is not a claim of bug-free behavior.

### Screenshots

2026-11-01 integration capture; scope is the tested build described above.
![Action Order Adjustments — real game UI](assets/07-resource-markers-small.jpg)

## civ7-map-tools-gamepad

**Better Controller Support** (更好的手柄支持)

- Published: 0.3.0 — [Workshop](https://steamcommunity.com/sharedfiles/filedetails/?id=3825193325)
- Development: 0.10.0-dev.1031-2359-31e6fd3f
- Release state: Unreleased; QA state: Partial live
- Evidence checked: 2026-11-01

### Verified scope

- Combined BSU/Policy/AO/Resource Planner screenshots and native input paths passed the recorded checks.
- Exactly one resource defer control. Policy geometry was stable for 120 frames.

### Remaining coverage

- No new physical-stick/button acceptance. Previously accepted stick code remains unchanged.
- Companion IT-02 belongs to Garbage Time, not automatically to BCS.

### Recorded defects

- No unresolved defect is recorded for this Mod in the reviewed evidence. This is not a claim of bug-free behavior.

### Screenshots

2026-11-01 integration capture; scope is the tested build described above.
![Better Controller Support — real game UI](assets/07-resource-markers-small.jpg)

2026-11-01 integration capture; scope is the tested build described above.
![Better Controller Support — real game UI](assets/08-policy-layout-small.jpg)

2026-11-01 integration capture; scope is the tested build described above.
![Better Controller Support — real game UI](assets/04-market-small.jpg)

## civ7-better-chinese-support

**Better Chinese Support** (更好的中文支持)

- Published: 0.2.2 — [Workshop](https://steamcommunity.com/sharedfiles/filedetails/?id=3829402170)
- Development: 0.2.2 (release worktree); main source 0.2.1
- Release state: Published; QA state: Offline only
- Evidence checked: 2026-11-01

### Verified scope

- 10 offline checks passed. Seven downloaded release files matched the release manifest.
- 0.2.2 explicitly names temples and missionaries as the Theocracy purchase-bonus targets.

### Remaining coverage

- New 0.2.2 text has not been checked in the live game. Older 0.2.1 screenshots do not validate the new wording.

### Recorded defects

- No unresolved defect is recorded for this Mod in the reviewed evidence. This is not a claim of bug-free behavior.

### Screenshots

No verified screenshot for the current development build is included.
## civ7-before-end-turn

**Auto-save Before...** (行动前自动存档)

- Published: 1.1.2 — [Workshop](https://steamcommunity.com/sharedfiles/filedetails/?id=3815596737)
- Development: Public 1.1.2; main source 1.1.1 + fixes
- Release state: Published; QA state: Partial live
- Evidence checked: 2026-11-01

### Verified scope

- Workshop 1.1.2 is installed; redundant manual copy was removed by its owner.
- Earlier T38 save-start/save-complete/single-submit then T39 evidence is retained.

### Remaining coverage

- Main-source/release mapping must be reconciled. Latest integration did not rerun the save chain.

### Recorded defects

- No unresolved defect is recorded for this Mod in the reviewed evidence. This is not a claim of bug-free behavior.

### Screenshots

No verified screenshot for the current development build is included.
## civ7-command-console

**Command Console** (命令控制台)

- Published: Not released
- Development: 0.1.0
- Release state: Unreleased; QA state: Partial live
- Evidence checked: 2026-10-28

### Verified scope

- 18 offline checks and native macOS input automation: js Game.turn returned 83; reveal all increased discovered plots from 2912 to 4536/4536.
- Backspace, history and Escape passed for ABC/English input.

### Remaining coverage

- Final installed copy was not cold-started after the last fixes. Chinese IME, clipboard and physical keyboard/controller were not accepted.

### Recorded defects

- No unresolved defect is recorded for this Mod in the reviewed evidence. This is not a claim of bug-free behavior.

### Screenshots

Historical UI capture (2026-10-28); not a new acceptance result. The launcher images show the input UI, not proof of successful command execution.
![Command Console — historical UI](assets/historical-console-20261028.jpg)

## fenhe

**Fenhe (gameplay + UI)** (分合（两模块合计）)

- Published: No release evidence
- Development: 0.2.0-alpha + controller UI
- Release state: Unreleased; QA state: Needs live test
- Evidence checked: 2026-10-30

### Verified scope

- Historical 36 offline checks; one Mac world Exploration Age integration/save/reload path passed.

### Remaining coverage

- New controller UI, English coverage, multiple maps/DLC/ages and local adapter distribution.

### Recorded defects

- No unresolved defect is recorded for this Mod in the reviewed evidence. This is not a claim of bug-free behavior.

### Screenshots

No verified screenshot for the current development build is included.
## civ7-autosave-limit

**Autosave Limit 150** (自动存档上限150)

- Published: No release evidence
- Development: 1.0.0
- Release state: Unreleased; QA state: Needs live test
- Evidence checked: 2026-10-30

### Verified scope

- Archived records describe a Mac native slider from 1 to 150. This run did not independently repeat it.

### Remaining coverage

- Version-specific acceptance evidence and bilingual metadata; no Workshop publication receipt.

### Recorded defects

- No unresolved defect is recorded for this Mod in the reviewed evidence. This is not a claim of bug-free behavior.

### Screenshots

No verified screenshot for the current development build is included.
## civ7-native-debug-input

**Mac DebugPanel Input Fix (public launcher)** (Mac DebugPanel 输入修复（启动器）)

- Published: 0.2.0 — [Workshop](https://steamcommunity.com/sharedfiles/filedetails/?id=3829280398)
- Development: 0.2.0 public launcher
- Release state: Published; QA state: Partial live
- Evidence checked: 2026-10-29

### Verified scope

- Apple Silicon / Steam Civ VII 1.5.0: Finder-extracted and Workshop-downloaded launcher paths were checked.
- Native DebugPanel reveal all increased discovered plots from 2912 to 4536.

### Remaining coverage

- QA-EXIT-11: exit crash remains unresolved; a similar pre-install stack means cause is not established.
- Other game versions/Intel/Chinese IME are not accepted. Internal native-input 0.4.0-dev is not this public launcher version.

### Recorded defects

- **QA-EXIT-11** (open): [macOS launcher] Investigate unresolved exit crash / code 11. Confirmed affected: Better Mod Support 0.2.0-dev; public Mac DebugPanel launcher 0.2.0 test environment. Fixed in: Not fixed. Root cause and regression boundary are unknown. A similar exit stack predates native-input installation.

### Screenshots

Historical UI capture (2026-10-29); not a new acceptance result. The launcher images show the input UI, not proof of successful command execution.
![Mac DebugPanel Input Fix (public launcher) — historical UI](assets/historical-native-reveal-20261029.jpg)

## civ7-mac-launcher

**Better Mod Support** (更好的Mod支持（Better Mod Support）)

- Published: Not released
- Development: 0.2.0-dev
- Release state: Unreleased; QA state: Needs retest
- Evidence checked: 2026-10-30

### Verified scope

- Historical checks cover enhanced Mod registry/persistence, native reveal all and Play Again save 834 import.
- 155 Node checks plus three native program checks were reported; draft PR #6.

### Remaining coverage

- QA-EXIT-11: exit code 11 unresolved.
- Clean-machine release, Intel, physical controller and IME; Cohtml debug bridge dependency remains.

### Recorded defects

- **QA-EXIT-11** (open): [macOS launcher] Investigate unresolved exit crash / code 11. Confirmed affected: Better Mod Support 0.2.0-dev; public Mac DebugPanel launcher 0.2.0 test environment. Fixed in: Not fixed. Root cause and regression boundary are unknown. A similar exit stack predates native-input installation.

### Screenshots

Historical UI capture (2026-10-30); not a new acceptance result. The launcher images show the input UI, not proof of successful command execution.
![Better Mod Support — historical UI](assets/historical-bms-reveal-20261029.jpg)

## civ7-controller-bridge

**Mac Controller Support Fix (retired)** (Mac 手柄支持修复)

- Published: 0.1.5 (unlisted) — [Workshop](https://steamcommunity.com/sharedfiles/filedetails/?id=3825119575)
- Development: Retired; merged into BCS
- Release state: Retired; QA state: Not applicable
- Evidence checked: 2026-10-24

### Verified scope

- Retirement receipt records unlisted visibility; independent code was removed.

### Remaining coverage

- Not an active development/release target.

### Recorded defects

- No unresolved defect is recorded for this Mod in the reviewed evidence. This is not a claim of bug-free behavior.

### Screenshots

No verified screenshot for the current development build is included.
## civ7-assistant

**Civ VII Assistant (auxiliary app)** (文明7小助手（辅助应用）)

- Published: Not released
- Development: 0.1.0 scaffold
- Release state: Paused; QA state: Not tested
- Evidence checked: 2026-10-30

### Verified scope

- No runnable acceptance deliverable recorded.

### Remaining coverage

- Paused as a fallback approach; no runnable acceptance deliverable.

### Recorded defects

- No unresolved defect is recorded for this Mod in the reviewed evidence. This is not a claim of bug-free behavior.

### Screenshots

No verified screenshot for the current development build is included.
## Evidence files

Selected machine observations are in [evidence/](evidence/). Local-only recovery manifests and session receipts remain in the integration work directory and were not uploaded.

## Sources and ownership

The snapshot reconciles the integration run, owner acceptance documents and the 2026-11-01 18:05 inventory. Owner session references are kept in the private Project. No source or main-branch runtime code was changed by this tracking setup.
