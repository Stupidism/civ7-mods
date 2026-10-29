# 2026-10-30 — shared launcher validation

Scope: isolated checkout; no game launch, UI/CDP access, installation changes, Workshop upload, or real Saves access.

- User reported that the existing 0.2.0 DebugPanel app works through Steam Launch Options. This evidence belongs to the old app, not this extraction.
- 140 Node tests pass (0 skipped): existing Play Again parser/import/UI fixtures plus launcher provider rollback, readiness failures, parent loss, session handshake and a real isolated supervisor subprocess SIGTERM/cleanup test.
- Three native test executables pass: settings preservation/conflict refusal/CRLF/Steam paths; launch-option parsing and argument preservation/path refusal; ARM64 branch redirection and mismatch refusal.
- Shared Cocoa launcher compiled for ARM64 with warnings enabled. Package construction validates bundled Node architecture/version/system-library dependencies and includes its license. Bundle signature integrity and file-hash manifests are checked during packaging; this is not notarization.
- Readiness proves helper startup only. Play Again still uses its existing loopback Cohtml debugger bridge. No clean-install end-to-end save import, new launch flow, crash recovery, alternate Steam library, or cross-Mac acceptance is claimed by this PR.
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

Remaining acceptance before release: complete verified Saves backup, game lock and Rest Guard scope; Steam launch with the split build; original `reveal all`; helper startup/stop and settings recovery; Play Again explicit menu request and actual imported configuration comparison on the intended communication path. A clean machine without the debugger cannot yet use the full-save route.
