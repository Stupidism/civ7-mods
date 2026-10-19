# 分合 0.2.0-alpha 源码

包含 `mod/civ7-fenhe`（玩法）与 `mod/civ7-fenhe-ui`（已有存档兼容界面）、模拟引擎、原生接入器、构建工具和测试。当前为实验版；完整能力与限制见 [说明与边界](说明与边界.txt)、[历史实机验证](实机验证.txt)。

## 从源码使用

1. 准备 Node.js 22+、Python 3 和 Steam Civilization VII。Windows 有历史实机记录；macOS 接入器已适配路径，完整世界接入仍待实机验收。Apple Silicon 请使用可运行的 arm64 Node。
2. 在本目录执行 `node tools/build.mjs`，然后退出游戏。Windows 运行 `Install-Fenhe.ps1` 安装两个模块；Mac 手动安装见下文。
3. Windows 按 [使用说明](说明与边界.txt) 配置本机调试接口、启动游戏与 `启动世界接入器.ps1`；Mac 见下文。从自己已有的单人存档推演并选择进入下一时代。
4. 接入器自动导出当前世界、生成 `Fenhe_Intervention.Civ7Map`，随后创建并核对新的游戏。不要直接从新建游戏地图列表启动分合地图。

`mod/civ7-fenhe/maps/` 保留目录，初始不携带个人世界地图；`tools/apply-plan.mjs` 在接入时把生成的地图写入安装目录。无需使用开发者的示例存档。

## macOS 接入器

安装与配置前先退出游戏：备份已有同名模块，将 `mod/civ7-fenhe`、`mod/civ7-fenhe-ui` 两个目录复制到 `~/Library/Application Support/Civilization VII/Mods/`。备份同一游戏目录中的 `AppOptions.txt`，将 `EnableDebugPanels`、`EnableTuner`、`UIDebugger` 三项设为 `1`；恢复时使用自己的备份。PowerShell 安装和配置脚本仅适用于 Windows。

启动游戏、启用两个模块并载入单人存档后，在本目录执行 `node tools/bridge.mjs`。接入器默认使用：

| 用途 | macOS 默认值 |
| --- | --- |
| 导出地图与介入前备份 | `~/Library/Application Support/Civilization VII/Saves/` |
| 生成地图的安装位置 | `~/Library/Application Support/Civilization VII/Mods/civ7-fenhe/maps/` |
| Python 3 命令 | `python3` |

自定义位置可通过环境变量 `FENHE_SAVES`（Saves 目录）、`FENHE_MODS`（包含 `civ7-fenhe` 的 Mods 目录）和 `FENHE_PYTHON`（Python 3 命令或可执行文件路径）指定；路径请使用绝对路径。直接运行 `apply-plan.mjs` 时，`--python` 优先于 `FENHE_PYTHON`。Windows 仍使用原有 Documents/My Games 存档位置、LocalAppData 安装位置和 `python` 命令。其他平台需显式指定两个目录，不推测游戏布局。

2026-10-19 修复了 Mac 缺少 `USERPROFILE` / `LOCALAPPDATA` 导致的启动崩溃，以及后续安装目录和 Python 命令不匹配。新增隔离测试覆盖实际接入器启动、介入前备份查找、生成地图替换、原地图备份、自定义目录及 Python 选择；游戏接口和地图生成器使用测试替身。修复期间没有操作正在运行的游戏、修改已安装模块或真实存档；完整 Mac 世界导出、进入新时代及保存重载仍待实机验收。

## 本地生成数据

本仓库没有上传 `data/latest.json`、其他世界快照、`results/`、`evidence/`、试玩存档或包含个人世界数据的 `分合推演.html`。它们属于运行输入和生成结果，已加入忽略规则。

`data/calibrated.json` 保留模型参数。纯规则测试使用人工构造世界，可直接运行 `npm test`。`tools/calibrate.mjs`、`run.mjs`、`report.mjs`、`verify-release.mjs` 等离线研究／验收工具需要先准备自己的世界快照及运行结果；历史文档中的数据集和截图路径用于说明当时验证，不是本仓库的必备文件。

本次公开归并没有改变模拟和接入算法，也没有把实验版提升为已完成的自动时代切换功能。
