# 自动存档上限 150

源码目录：`civ7-autosave-limit-150`。Mod ID 和手动安装目录继续使用 `civ7-autosave-limit`，保持已安装版本及设置兼容。

将 **选项 → 游戏 → 自动保存 → 自动存档数量** 的滑块范围改为 **1–150**，每次增减 1。适用于主菜单和对局内的选项界面。

沿用游戏原有的设置保存、确认和取消逻辑，不强制修改当前保留数量或存档回合间隔。当前机器已另行将保留数量设为 150，间隔为 1 回合。

将整个 `civ7-autosave-limit` 目录复制到 macOS 的 `~/Library/Application Support/Civilization VII/Mods/`，重新启动游戏后加载。Windows 安装到 `%LOCALAPPDATA%/Firaxis Games/Sid Meier's Civilization VII/Mods/`。

本地适配目标：Civilization VII 1.5.0。移除模组可恢复原版滑块范围；已保存的数量仍保留在用户配置中。
