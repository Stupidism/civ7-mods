# Mod 目录与产品名称

仓库源码目录按当前产品英文名命名。目录重命名不改变 Mod ID、清单文件名、存档名、设置键、资源 URL 或工坊条目；历史发行回执中的绝对路径仍保留原值。

| 当前产品名称 | 源码目录 | 原目录 / 稳定 Mod ID |
|---|---|---|
| 不再来一回合 · No More Turn | `mods/civ7-no-more-turn` | `civ7-rest-guard` |
| 行动前自动存档 · Auto-save Before… | `mods/civ7-auto-save-before` | `civ7-before-end-turn` |
| 微操大师常凯申 · Micromanagement Master Chiang Kai-shek | `mods/civ7-micromanagement-master-chiang-kai-shek` | `civ7-war-controls` |
| 更好的手柄支持 · Better Controller Support | `mods/civ7-better-controller-support` | `civ7-map-tools-gamepad` |
| Mac 手柄支持修复 · Mac Controller Support Fix | `mods/civ7-mac-controller-support-fix` | `civ7-controller-bridge` |
| 你的神图很好，现在是我的了 · Your Great Map, My Next Game | `mods/civ7-your-great-map-my-next-game` | `civ7-play-again` |
| 自动存档上限 150 · Autosave Limit 150 | `mods/civ7-autosave-limit-150` | `civ7-autosave-limit` |
| 垃圾时间 · Garbage Time | `mods/civ7-garbage-time` | 不变 |
| 资源规划 · Resource Planner | `mods/civ7-resource-planner` | 不变 |
| 分合 · Fenhe | `mods/fenhe` | 源码目录不变，包含 `civ7-fenhe` / `civ7-fenhe-ui` |

## 安装与历史引用

安装脚本仍写入原稳定安装目录。手动从源码安装时，也请将模块内容放入原安装目录，确保 `.modinfo` 位于其第一层，避免保留新旧两份相同 Mod ID。此次不迁移用户机器上已安装的 Mod，也不重新上传工坊。

`docs/editorial/20261024-review/` 的文章 slug、已发布链接、历史回执和证据路径不因源码目录改名而重命名。源码引用、测试入口与 catalog 的 manifest 路径已改用新目录。
