# 2026-10-30 — shared launcher validation

Initial offline scope: isolated checkout. A separate authorized live round was completed afterward; see the live results below. No Workshop upload occurred.

- User reported that the existing 0.2.0 DebugPanel app works through Steam Launch Options. This evidence belongs to the old app, not this extraction.
- 143 Node tests pass (0 skipped): existing Play Again parser/import/UI fixtures plus launcher provider rollback, readiness failures, parent loss, session handshake, draining an in-flight conversion on shutdown, atomic configuration publication/no-overwrite, and a real isolated supervisor subprocess SIGTERM/cleanup test.
- Three native test executables pass: settings preservation/conflict refusal/CRLF/Steam paths; launch-option parsing and argument preservation/path refusal; ARM64 branch redirection and mismatch refusal.
- Shared Cocoa launcher compiled for ARM64 with warnings enabled. Package construction validates bundled Node architecture/version/system-library dependencies and includes its license. Bundle signature integrity and file-hash manifests are checked during packaging; this is not notarization.
- Readiness proves helper startup only. Play Again still uses its existing loopback Cohtml debugger bridge. No clean-install debugger-free import, crash recovery, alternate Steam library, or cross-Mac acceptance is claimed by this PR.
- Historical native input acceptance and the published 0.2.0 receipt remain under `tools/civ7-native-debug-input/`. No public package was updated.

Run on an Apple Silicon development host:

```sh
node --test mods/civ7-mac-launcher/tests/*.test.mjs mods/civ7-play-again/tests/*.test.mjs
clang++ -std=c++17 -fobjc-arc -framework Foundation mods/civ7-mac-launcher/tests/core.mm -o /tmp/c7-core-test
/tmp/c7-core-test
clang++ -std=c++17 -fobjc-arc -framework Foundation mods/civ7-mac-launcher/tests/plan.mm -o /tmp/c7-plan-test
/tmp/c7-plan-test
clang++ -std=c++17 tools/civ7-native-debug-input/tests/patch-test.cpp -o /tmp/c7-patch-test
/tmp/c7-patch-test
```

## Subsequent live acceptance

[Full report and screenshots](../../docs/validation/better-mod-support-20261030/README.md): Steam launch passed with the shared package; actual native input submitted `reveal all` and revealed 2912 → 4536/4536 plots; explicit Play Again import matched all 834 values and opened the stock setup editor after removing Fenhe's additional defaults for the test. With those defaults present, import was safely rejected. All original 401 saves and prior settings/install state were preserved/restored.

Launcher/helper cleanup passed, but **both game exits returned code 11**. This remains unresolved and blocks claiming normal-exit acceptance. The full-save route still depends on the existing Cohtml bridge. Controlled missing-bridge and corrupt-bundle live cases, clean-machine delivery, direct start of the imported campaign and cross-Mac acceptance remain untested. The PR stays draft.
