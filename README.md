# Civilization VII Mods

Stupidism 的文明7 Mod 开发合集。收录 2026-10-17 的六个项目、七个可加载模块，包含当前源码、测试、安装说明和各项目的验证记录。

| 项目 | 当前源码版本 | 功能与状态 |
| --- | --- | --- |
| [更好的手柄支持 · Better Controller Support](mods/civ7-map-tools-gamepad/) | 0.2.1 | 轮盘一次确认打开地图工具，B 直接回地图；内置 Mac 输入兼容，76 项离线回归 |
| [Mac 手柄支持修复 · Mac Controller Support Fix](mods/civ7-controller-bridge/) | 0.1.5 | 补充菜单摇杆兼容；RB 轮盘，方向独立设置；中英文界面，附加内容设置，调试栏默认隐藏 |
| [No More Turn（不再来一回合）](mods/civ7-rest-guard/) | 1.8.5 | 界面跟随游戏语言（中英文）；休息存档默认保留10个，独立夜间限制；已发布，新增功能待实机验收 |
| [行动前存档 · Auto-save Before...](mods/civ7-before-end-turn/) | 1.1.1 | 回合前和外交行动前分别覆盖固定存档；新增先保存再休息，工坊仍为1.1.0 |
| [微操大师常凯申](mods/civ7-war-controls/README-zh-CN.txt) | 0.6.0 | 连续部署、原地齐射与增援切换；集中火力临时加成已实测，其他新增功能见验证记录 |
| [垃圾时间 · Garbage Time](mods/civ7-garbage-time/README-zh-CN.txt) | 0.1.4 | 主动开启军队、定居点、宝藏、传教、科技、市政及资源自动化；宝藏船自动兑现已实测 |
| [资源规划 · Resource Planner](mods/civ7-resource-planner/) | 1.1.0 | 资源排序、分组、幸福度填充和定居点倾向分配；需要 Resource Re-sorts |
| [分合 · Fenhe](mods/fenhe/) | 0.2.0-alpha | 国家分裂、融合与新时代世界生成；包含 `civ7-fenhe`、`civ7-fenhe-ui` 两个模块，实验版 |

源码版本可能高于原工坊／独立仓库的已发布版本。上传本合集不代表所有开发版本已经完成实机验收，也不会自动更新工坊条目。模块、版本及依赖的机器可读索引见 [catalog.json](catalog.json)。

## Steam 创意工坊

2026-10-18 已公开发布；下列为工坊版本，可能低于上表的开发源码版本。

| 模组 | 工坊版本 | 订阅 |
| --- | --- | --- |
| 更好的手柄支持 · Better Controller Support | 0.2.1 | [Steam](https://steamcommunity.com/sharedfiles/filedetails/?id=3825193325) |
| Mac 手柄支持修复 · Mac Controller Support Fix | 0.1.5 | [Steam](https://steamcommunity.com/sharedfiles/filedetails/?id=3825119575) |
| Auto-save Before... | 1.1.0（两个独立存档槽，公开预览版） | [Steam](https://steamcommunity.com/sharedfiles/filedetails/?id=3815596737) |
| 战争操作 · War Controls | 0.5.1（实验版） | [Steam](https://steamcommunity.com/sharedfiles/filedetails/?id=3822253543) |
| 垃圾时间 · Garbage Time | 0.1.4 | [Steam](https://steamcommunity.com/sharedfiles/filedetails/?id=3822254009) |
| 资源规划 · Resource Planner | 1.1.0 | [Steam](https://steamcommunity.com/sharedfiles/filedetails/?id=3822254182) |
| No More Turn（不再来一回合） | 1.8.5 | [Steam](https://steamcommunity.com/sharedfiles/filedetails/?id=3815557333) |

三个新条目的下载文件已逐一核对 SHA-256。资源规划在工坊关联了 Resource Re-sorts 必需项。发布回执在各模组的 `docs/workshop.json`；资源规划 1.1.0 已完成中英文及资源交互的 Mac 对局验收，见 [模块记录](mods/civ7-resource-planner/VALIDATION.md)；其余历史范围见 [Mac 验证记录](docs/validation-macos-2026-10-18.md)。

## 安装

面向 Windows / Steam Civilization VII 1.5.0，兼容边界见各项目说明。先退出游戏，再选取需要的 Mod 安装。

- No More Turn、Auto-save Before...：各目录带有安装脚本。
- 微操大师常凯申、Garbage Time、Resource Planner：将对应目录复制到下方的 Mods 目录；`.modinfo` 必须位于该 Mod 目录的第一层。
- 分合：使用 [分合源码安装说明](mods/fenhe/README.md)，通过 `Install-Fenhe.ps1` 安装两个模块；世界接入还需要 Node.js、Python 和本机官方调试接口。

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

测试按六个项目分别运行。回合前存档中读取原版游戏源码的集成检查，在没有本机游戏时会跳过；可用 `CIV7_GAME_DIR` 指定游戏根目录。自动测试不替代实机测试，历史证据的版本与范围以各项目验证文档为准。

分合的模拟、桥接与构建源码完整保留；个人存档、导出的世界地图、实机数据快照、运行日志和生成的回放不上传。接入器会从使用者自己的游戏导出并生成所需地图。详见 [分合说明](mods/fenhe/README.md)。

## 原项目与权利说明

- [No More Turn 原仓库与发布版](https://github.com/Stupidism/civ7-rest-guard) · [Steam](https://steamcommunity.com/sharedfiles/filedetails/?id=3815557333)
- [Auto-save Before... 原仓库与发布版](https://github.com/Stupidism/civ7-before-end-turn) · [Steam](https://steamcommunity.com/sharedfiles/filedetails/?id=3815596737)

两个原仓库保留。本仓库从当前本地工作副本归并，包括尚未提交到原仓库的开发代码。没有复制旧仓库的 `.git` 历史。

第三方页面派生代码、游戏接口引用与图片归属见 [NOTICE.md](NOTICE.md)。本次归并未新设开源许可证；公开可读不等同于授予额外的再分发许可。
