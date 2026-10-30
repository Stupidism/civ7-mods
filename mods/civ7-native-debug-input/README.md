# In-game DebugPanel input

A registered Better Mod Support consumer. Enable it in Options → Enhanced Mods, then press the game's DebugPanel key. Commands are entered in a game-native textbox and handed to the original parser, history and output. No macOS text window is created in registry mode.

This development build still needs the shared host's Cohtml communication channel and the hash-pinned Steam Apple Silicon 1.5.0 native bridge. Agent live testing on 2026-10-30 verified clicking the in-game textbox, keyboard entry and Return submitting `reveal all` through the original parser (2912 → 4536/4536 revealed plots, turn unchanged). User acceptance, paste/IME and physical controllers remain untested. Game exit code 11 remains unresolved. The legacy standalone launcher retains its old Cocoa input window for compatibility.
