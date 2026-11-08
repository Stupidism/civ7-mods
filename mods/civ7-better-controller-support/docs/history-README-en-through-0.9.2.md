# Historical snapshot through BCS 0.9.2

Captured before the 2026-10-31 Action Order extraction. Installation and validation statements below describe earlier work, not BCS 0.10.0.

> 2026-10-31: the policy reminder uses Resource Planner’s native close-button frame with a skip arrow, beside Close. Mouse users get a tooltip; controller users get a bottom action-glyph/hold hint. Skip semantics and policy drafts are unchanged. All 190 related offline checks pass; the new appearance has not been live-tested.

> 2026-10-31, 0.9.2: shared ordering with settlement 0.1.7 puts policy/resource reminders before postponed production in both the main button and secondary icons. Offline regressions pass; new ordering is not live-accepted or published.

**Source 0.9.0, not installed:** Policy layout has moved to the independent Better Policy UI 0.1.0 Mod. BCS no longer packages or registers policy layout scripts/styles. Global input, map tools and turn-tail reminders are retained. Earlier installation records below remain historical.

**Current source: 0.9.1 development build installed; macOS storage checks passed, physical input acceptance pending.** Calibration uses its own namespace inside the community `modSettings` document, without adding a second storage key. Ambiguous or invalid reads report an error and retain the last valid session configuration. Legacy settings require an exact-row backup migration. The native custom-option approach was rejected because the live restart lost its value. See [migration notes](docs/controller-storage-0.9.1.md).

# Better Controller Support

Scroll navigation was installed locally on 2026-10-31 as development build `1031-1246-95f340d1`; all 38 files verified. Restart required; live validation remains pending. Current receipt: `docs/installation-force-single-line-2026-10-31.json`. Source-only statements below describe the earlier implementation stage.

## Scroll areas and focus (2026-10-31, source only)

Press the right stick to immediately focus the nearest enabled control to the visible centre of the active scroll area, without activating it. Vertical right-stick input scrolls; deliberate left/right input selects adjacent scroll areas, marked with a gold outline. Switching requires a horizontal magnitude of at least 0.75 and twice the vertical magnitude. One switch per deflection; return to neutral before switching again or after a vertical gesture. Edges do not wrap.

Device-aware glyphs and bilingual captions appear beside the existing bottom controller hints. The switch hint is hidden for a single area. Read-only details remain scrollable; pressing the stick there preserves the existing focus. Switching areas does not select a different item. Native FxsScrollable and Solid ScrollArea are supported; other custom scroll components remain outside this scope. Map R3 behavior is unchanged.

Processing follows stick calibration and also works with compatibility disabled. Blur, mouse mode, focus locks, Rest Guard and panel changes stop it; held input from an old panel cannot scroll a new area. All 132 offline tests pass, including detached Chromium and the native FxsScrollable implementation. Not installed, published or physically tested in this iteration.


This machine moved to the **local development channel** on 2026-10-31: `[DEV]` name, base version and build ID, currently `0.8.0 / 1031-1050-17a54363`. The matching Workshop item is unsubscribed; exactly one copy remains in local `Mods/civ7-map-tools-gamepad`. The internal ID, settings keys and runtime code are preserved. Use the [channel workflow](../../docs/mod-install-channels.md) for future installations instead of writing into Workshop content. File verification passed; the displayed name still needs confirmation after the next launch. The [migration receipt](docs/installation-development-channel-2026-10-31.json) supersedes older records for the current installation source.

Current source is based on 0.8.0. The split baseline was locally installed on 2026-10-31; the settler, menu, event-popup and force-turn patches below were paired-installed locally on 2026-10-31 after 188 offline tests passed. Live validation after restarting and Workshop publication remain pending. Settlement columns, score/payback, sorting, local navigation and Build last now belong to [Better Settlement UI](../civ7-better-settlement-ui/README-en.md). Their registrations, icon definitions and ranking writes have been removed here. The new Mod preserves the original per-save ranking keys.

Stick compatibility/swap/inversion, map tools, plot shortcuts and force end turn remain here. Policy layout remains temporarily: three columns per pane, four on wide displays, for both mouse and controller. Resource layout belongs to Resource Planner; this extraction does not edit its source.

Resource/policy reminders and X hold-to-skip remain BCS features. A shared v1 turn-order service supports either Mod alone and both load orders, with only one native action writer/guard. When both are enabled, reminders precede explicitly deferred Build last, after ordinary actions and remaining unit moves. Pair settlement 0.1.7 with this coordinated 0.9.2 source build; older BCS packages still include settlement enhancements. See the [contract](../civ7-better-settlement-ui/docs/turn-order-contract.md).

Source, installed copies and Workshop versions have different evidence. The latest paired-install receipt is [recorded here](docs/installation-input-force-2026-10-31.json). The user reported working sticks on the ordinary map after installation, followed by a separate settler-lens problem; that feedback does not validate every input context.

## Settler and merchant panels

Installed locally: the settler legend keeps the same map compatibility, swap and inversion settings instead of suspending them merely because the legend occupies the panel stack. Ruler/cancel and other legend buttons delegate to the native panel; menus, dialogs and input locks retain priority. Disabling compatibility restores the legend's native input context.

The merchant chooser intentionally uses the left stick to navigate trade-city buttons. This behavior is unchanged. The settler suspension gap already exists in the identical stick runtime shipped in 0.7.0 and 0.8.0. All 113 offline tests pass; no running-game interaction, installation or physical input sampling occurred for this patch. Its effect on physical settler input still needs live validation.

## Manual stick-role swap

Options → Add-ons → Better Controller Support includes Swap left/right stick roles. In the pending patch it also swaps focus navigation and scrolling in the startup shell, the in-game pause menu and subpages that remain in that view. The intended calibrated roles are left stick for focus and right stick for scrolling. Map vertical-inversion settings do not affect menus.

Merchant lists, radial menus and other in-game panels retain their existing roles: the user reported working left-stick city selection in the merchant chooser. D-pad and confirmation/cancellation are unchanged. Confirm applies saved settings and neutralizes scrolling started by the patch; disabling compatibility restores native handling. Swap defaults off and preserves previous settings. The reported map calibration uses compatibility and swap on, with both vertical inversions off.

The option also covers small event-choice popups. With compatibility enabled these temporarily use pure menu input, allowing the calibrated left stick and D-pad to navigate the native Panel. Residual camera/plot actions from the original Dual context are suppressed. Navigation never confirms a reward automatically. Closing the popup or disabling compatibility restores native context; new panels, focus locks and Rest Guard retain priority.

All 121 offline tests pass, including both menu/map hook orders and the pending settler/event fixes. No installation or running-game interaction occurred for these patches. Physical-stick and D-pad behavior remain unverified; see the installation receipt for deployment state.

## Resource and policy reminders

Unassigned resources become a final action only when an empty settlement slot can legally accept one. Native assignment checks respect capacity and restrictions; assignment locks and empire/treasure resources do not create this reminder. Any empty normal policy, tradition or crisis-policy slot creates a policy reminder, even if no replacement card is currently available.

These actions come after ordinary blockers and remaining unit moves, before explicitly deferred Build last. The next-action button opens the native resource/policy screen, going directly to crisis policies when only crisis slots are empty. Closing a screen does not silently dismiss an unfilled-slot reminder.

On the resource tab or a policy/tradition/crisis-policy tab, **hold X for 1 second and release**, or click **Skip this turn**. Resource and policy skips are independent; a policy skip covers all three slot classes. Next turn resets both. Short X retains its native action. Skip uses the native considered-assignment operation when legal; it never assigns cards, confirms/discards policy drafts or closes the screen. Native required notifications still require engine acknowledgement.

Pending reminders block normal and automatic end turn. Explicit force-end-turn remains available. This UI state is not saved; reloading rechecks outstanding slots.

## Force end turn

Installed local fix: explicit force intent now travels with the current request through asynchronous autosaving, for both the native keyboard action and controller hold. Card reminders no longer mistake the resumed force request for an ordinary turn. Native input guards, saving and rest restrictions retain priority; ordinary/automatic turns still check empty slots. The controller progress hint has a definite horizontal width. The shared implementation is updated in Better Settlement UI too; both copies were updated together in this local installation. All 188 related offline tests pass, with installation recorded separately; live validation remains pending.

On the normal map or with a unit selected, **hold View / Back for 1 second, then release** to invoke native force end turn. A progress indicator changes to a release prompt at the threshold. Short press still opens the native social panel; Y keeps its next-action function.

Opening menus, switching windows/devices, or changing the turn/selected unit cancels the hold. Available only during your active turn. Nothing submits before release, and repeated input cannot submit twice. Uses the native end-turn entry and its mod wrappers, retaining Rest Guard restrictions. Enabled on Windows/macOS independently of Mac compatibility. Offline validation only; live behavior remains unverified.

## Stacked units and settlements

On the normal map or with a unit selected, shortcuts target the currently highlighted plot (Xbox layout):

- With two or more of your units on that plot, **RB selects the next, LB the previous**, wrapping within that plot. Includes explorers, settlers, merchants, sleeping and exhausted units. Excludes foreign, packed/off-map and remote units. Works before selecting a unit too.
- **X opens the settlement on that plot**, whether or not a unit is selected. Your cities/towns use native management; foreign and independent settlements retain native diplomacy/contact rules. A remote rural tile owned by a city is not its settlement tile.
- Without a stack/settlement, the original button action remains. Menu tabs, move/attack targeting, city screens, dialogs and focus locks retain control. RB cycles units over a stack; to open the radial menu, deselect the unit and move the cursor to a plot without stacked units.

These shortcuts work independently of the Mac compatibility switch and Map Trix. Validation is offline; physical-controller and Windows live behavior remain unverified.

## Map tools

Open the native radial menu with RB; switch to **Map Tools** with LB/RB. Choose a tool with the left stick and press A once to open it directly. D-pad/left stick navigate; A activates and B closes the tool and returns directly to the map. Icons match the actual minimap buttons. Focus has a gold outline, long lists scroll and hidden/disabled entries are skipped.

Base lenses retain native controls. Cities, units and wonders require Map Trix; map tacks require Detailed Map Tacks. Missing tools are hidden. No third-party mod files or game assets are redistributed. Tack placement/removal remains the original mod's responsibility; no new delete shortcut.

## Integrated controller compatibility

Options → Add-ons → Better Controller Support restores the compatibility toggle, separate vertical inversion switches and debug bar. Confirm applies changes; Cancel discards them. New configurations default off on all platforms; existing saved preferences remain authoritative. Do not enable the standalone Mac fix simultaneously. This restoration is source-only and has not been installed or live-tested.

Stack cycling, settlement shortcuts, Map Tools and hold actions remain separate features. Button names above describe Xbox layouts; in-game hints use native device-specific glyphs plus localized action text.

Disable the standalone Mac Controller Support Fix and restart so it cannot remap native input. This mod does not change subscriptions or the old mod's files.

## Install and verification

Subscribe through Steam Workshop, wait for download, restart and enable Better Controller Support in Additional Content. For manual installs put the civ7-map-tools-gamepad folder in the game's Mods folder. Keep only one copy of this Mod ID.

0.4.0 adds offline Build last checks through native production close, short-Y, action rendering and next-action methods, preserving native turn blockers. It also adds hold/release, cancellation, duplicate-input and native end-turn routing checks. 0.3.0 adds offline plot-shortcut checks using the native input dispatcher and city handler, including compatibility routing and cancellation when targets change. The existing 76 checks cover map tools and compatibility. During 0.2.0 capture the user confirmed Mac map inputs, R3 and radial stick navigation; that feedback does not validate these new shortcuts. Windows, settings persistence and complete map-tack placement/removal remain unverified. See VALIDATION.md for the current count.

Controller preferences remain local. Reminder skips last for the current UI session and turn. Settlement ranking persistence now belongs to Better Settlement UI. Original tool actions still perform normal gameplay behavior. Other mods changing the same input pipeline may require adaptation. See VALIDATION.md for evidence.

Development: npm test. Full detached-browser tests require CIV7_PLAYWRIGHT_MODULE; CIV7_CHROMIUM_PATH and CIV7_MODULES_DIR are optional overrides. Live tests require the repository AGENTS.md protocol and explicit authorization.
