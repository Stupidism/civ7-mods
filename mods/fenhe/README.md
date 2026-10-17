# 分合 0.2.0-alpha 源码

包含 `mod/civ7-fenhe`（玩法）与 `mod/civ7-fenhe-ui`（已有存档兼容界面）、模拟引擎、原生接入器、构建工具和测试。当前为实验版；完整能力与限制见 [说明与边界](说明与边界.txt)、[历史实机验证](实机验证.txt)。

## 从源码使用

1. 准备 Node.js 22+、Python 3 和 Windows / Steam Civilization VII。
2. 在本目录执行 `node tools/build.mjs`，然后退出游戏，运行 `Install-Fenhe.ps1` 安装两个模块。
3. 按 [使用说明](说明与边界.txt) 配置本机调试接口、启动游戏与 `启动世界接入器.ps1`，从自己已有的单人存档推演并选择进入下一时代。
4. 接入器自动导出当前世界、生成 `Fenhe_Intervention.Civ7Map`，随后创建并核对新的游戏。不要直接从新建游戏地图列表启动分合地图。

`mod/civ7-fenhe/maps/` 保留目录，初始不携带个人世界地图；`tools/apply-plan.mjs` 在接入时把生成的地图写入安装目录。无需使用开发者的示例存档。

## 本地生成数据

本仓库没有上传 `data/latest.json`、其他世界快照、`results/`、`evidence/`、试玩存档或包含个人世界数据的 `分合推演.html`。它们属于运行输入和生成结果，已加入忽略规则。

`data/calibrated.json` 保留模型参数。纯规则测试使用人工构造世界，可直接运行 `npm test`。`tools/calibrate.mjs`、`run.mjs`、`report.mjs`、`verify-release.mjs` 等离线研究／验收工具需要先准备自己的世界快照及运行结果；历史文档中的数据集和截图路径用于说明当时验证，不是本仓库的必备文件。

本次公开归并没有改变模拟和接入算法，也没有把实验版提升为已完成的自动时代切换功能。
