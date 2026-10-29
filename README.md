# Civilization VII Mods

Stupidism 的文明7 Mod 开发合集。收录已发布 Mod 与独立开发项目，包含当前源码、测试、安装说明和各项目的验证记录。

| 项目 | 当前源码版本 | 功能与状态 |
| --- | --- | --- |
| [更好的手柄支持 · Better Controller Support](mods/civ7-better-controller-support/) | 0.3.0 | 地图工具轮盘与 Mac 输入兼容；新增 LB/RB 循环同格单位、X 打开定居点，88 项离线回归，新增功能实机待验 |
| [No More Turn（不再来一回合）](mods/civ7-no-more-turn/) | 1.8.6 | 默认回合间隔改为 13/8/5/3/2；源码包含额外活动标记及手柄改动，不能等同于工坊发行包 |
| [行动前自动存档 · Auto-save Before...](mods/civ7-auto-save-before/) | 1.1.2 | 回合前和外交行动前固定存档；先保存再休息；已同步跟随游戏语言的 1.1.2 发行源码 |
| [微操大师常凯申](mods/civ7-micromanagement-master-chiang-kai-shek/README-zh-CN.txt) | 0.6.0 | 连续部署、原地齐射与增援切换；当前源码另含自动选敌及快速转移开发改动，未全部进入工坊包 |
| [垃圾时间 · Garbage Time](mods/civ7-garbage-time/README-zh-CN.txt) | 0.1.4 | 主动开启军队、定居点、宝藏、传教、科技、市政及资源自动化；宝藏船自动兑现已实测 |
| [资源规划 · Resource Planner](mods/civ7-resource-planner/) | 1.1.0 | 资源排序、分组、幸福度填充和定居点倾向分配；需要 Resource Re-sorts |

目录命名与稳定 Mod ID 对照见 [目录名称表](docs/mod-directory-names.md)。

源码版本可能高于原工坊／独立仓库的已发布版本。上传本合集不代表所有开发版本已经完成实机验收，也不会自动更新工坊条目。模块、版本及依赖的机器可读索引见 [catalog.json](catalog.json)。

## Mac 启动组件（开发中）

[Mac Mod 启动器](mods/civ7-mac-launcher/) 将 Steam 启动接入抽成独立项目；[原版 DebugPanel 输入修复](tools/civ7-native-debug-input/) 复用它，[你的神图很好，现在是我的了](mods/civ7-play-again/) 提供首个辅助服务适配器。新版仅离线验证，完整存档导入仍依赖已有游戏通信桥，尚未发布。

## Steam 创意工坊

截至 2026-10-28 收集的发布记录如下；发行包与上表源码的验证范围分开记录。

| 模组 | 工坊版本 | 订阅 |
| --- | --- | --- |
| 更好的手柄支持 · Better Controller Support | 0.3.0 | [Steam](https://steamcommunity.com/sharedfiles/filedetails/?id=3825193325) |
| Auto-save Before... | 1.1.2（8 文件哈希核验回执） | [Steam](https://steamcommunity.com/sharedfiles/filedetails/?id=3815596737) |
| 微操大师 · War Controls | 0.6.0（19 文件哈希核验回执） | [Steam](https://steamcommunity.com/sharedfiles/filedetails/?id=3822253543) |
| 垃圾时间 · Garbage Time | 0.1.4 | [Steam](https://steamcommunity.com/sharedfiles/filedetails/?id=3822254009) |
| 资源规划 · Resource Planner | 1.1.0 | [Steam](https://steamcommunity.com/sharedfiles/filedetails/?id=3822254182) |
| No More Turn（不再来一回合） | 1.8.6（默认值及说明更新） | [Steam](https://steamcommunity.com/sharedfiles/filedetails/?id=3815557333) |

历史发行包下载核验见各条目记录；更好的手柄支持 0.3.0 本轮只做离线验证，未强制下载或安装。资源规划在工坊关联了 Resource Re-sorts 必需项。发布回执在各模组的 `docs/workshop.json` 和 `docs/release-*.json`（较新发行以对应 release 回执为准）；资源规划 1.1.0 已完成中英文及资源交互的 Mac 对局验收，见 [模块记录](mods/civ7-resource-planner/VALIDATION.md)；其余历史范围见 [Mac 验证记录](docs/validation-macos-2026-10-18.md)。

## 安装

面向 Windows / Steam Civilization VII 1.5.0，兼容边界见各项目说明。先退出游戏，再选取需要的 Mod 安装。

- No More Turn、Auto-save Before...：各目录带有安装脚本。
- 微操大师常凯申、Garbage Time、Resource Planner：将对应目录复制到下方的 Mods 目录；`.modinfo` 必须位于该 Mod 目录的第一层。

```text
%LOCALAPPDATA%/Firaxis Games/Sid Meier's Civilization VII/Mods/
```

macOS 手动安装目录：`~/Library/Application Support/Civilization VII/Mods/`。

订阅工坊版时避免同时安装相同 Mod ID 的手动副本。各项目保留原有 Mod ID 和设置命名空间，本次归并不改变游戏行为。

资源规划依赖 beezany 的 [Resource Re-sorts](https://steamcommunity.com/sharedfiles/filedetails/?id=3507102808)（`bz-re-sorts`，开发时使用 3.0.2），该依赖不随本仓库分发。垃圾时间的“资源分配垃圾时间”还需要本仓库的资源规划模块启用。

## 开发与检查

Node.js 22+，无需安装 npm 依赖。在仓库根目录执行：

```sh
npm run check
npm test
```

测试按 6 个包含自动测试的项目分别运行。回合前存档中读取原版游戏源码的集成检查，在没有本机游戏时会跳过；可用 `CIV7_GAME_DIR` 指定游戏根目录。自动测试不替代实机测试，历史证据的版本与范围以各项目验证文档为准。

## 原项目与权利说明

- [No More Turn 原仓库与发布版](https://github.com/Stupidism/civ7-rest-guard) · [Steam](https://steamcommunity.com/sharedfiles/filedetails/?id=3815557333)
- [Auto-save Before... 原仓库与发布版](https://github.com/Stupidism/civ7-before-end-turn) · [Steam](https://steamcommunity.com/sharedfiles/filedetails/?id=3815596737)

两个原仓库保留。本仓库从当前本地工作副本归并，包括尚未提交到原仓库的开发代码。没有复制旧仓库的 `.git` 历史。

第三方页面派生代码、游戏接口引用与图片归属见 [NOTICE.md](NOTICE.md)。本次归并未新设开源许可证；公开可读不等同于授予额外的再分发许可。
