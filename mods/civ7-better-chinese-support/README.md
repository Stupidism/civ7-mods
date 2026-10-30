# 更好的中文支持 · Better Chinese Support

0.2.1：仅修正简体中文**玩法描述中的错谬、适用范围和遗漏条件**。不改译名，不替换音译，不加入台词或历史文风润色，不翻译其他 Mod，不改变游戏规则与数值。

## 修正范围

| 内容 | 修正重点 |
| --- | --- |
| 神社（海上） | 必须位于海岸并邻接平地 |
| 弥勒寺 | 古典时代幸福值建筑分类判定；每个合格市中心或城区地块 +2 文化、+1 生产力，不按建筑数量叠加 |
| 巨蟒土丘 | 必须是草原平地，草原丘陵不满足条件 |
| 南马都尔 | 岛屿条件指所属定居点 |
| 哈特谢普苏特 | 按不同资源种类计数，非文明特色资源 |
| 汉朝能力 | 科技建筑建成所在地获得人口；各时代首都、城市、定居点范围分别保留 |
| 汉长城 | 降低的是同类改良设施的费用涨幅 |
| 诺曼能力 | 陆地单位、驻防区块均受邻接水岸条件限制 |
| 腓特烈两种形态 | 建成指定建筑时，在建造它的定居点获得步兵；占领奖励按每座定居点首次判定 |
| 亚述能力、王宫 | 首次占领按每座定居点判定；王宫收益按巨作计数，不限抄本 |
| 紫禁城 | 产出加成属所在城市；防御工事观光收益属己方范围 |
| 布干达氏族社会 | 6 格内其他己方定居点，非他人定居点 |

共 29 个原版中文文本键：从徂川公开表中筛选并复核 27 条规则，涉及 24 个键；另保留神社、弥勒寺的 5 个键。仅替换错误内容或补充遗漏条件；保留原本正确的措辞、句序与百科链接。来源与归属见 [NOTICE.md](NOTICE.md)。

采用明确清单 `reference/functional-selection.json`，不再整表导入任何分类；原 CSV 仅留作来源记录，不随安装包分发。尚未复核的功能条目也不自动纳入。逐条适用文本和未纳入条目见 `docs/import-audit.json`。

## 工坊下载

0.2.1 已发布：[Steam 创意工坊](https://steamcommunity.com/sharedfiles/filedetails/?id=3829402170)。发行包回下载的 7 个文件已按路径、大小和 SHA-256 核验。

## 安装与升级

本 Mod 只依赖 `base-standard`；对应 DLC 未安装时不创建其内容。只更新简体中文，英文和繁体中文原版文本保持不变。精确匹配文本键及原文，遇到已变化的官方或第三方文本会跳过，须重新审阅后再适配。

macOS：`~/Library/Application Support/Civilization VII/Mods/civ7-better-chinese-support/`

Windows：`%LOCALAPPDATA%/Firaxis Games/Sid Meier's Civilization VII/Mods/civ7-better-chinese-support/`

退出游戏后备份并替换该 Mod 目录。由 0.1.0 升级时移除旧 `text/community.sql` 和 `text/official-samples.xml`；新版清单只加载 `metadata.xml`、`functional.sql`、`mechanics.sql`。重新启动游戏后生效。无需改动存档。

不建议同时启用整表翻译版《简中翻译修正和改进》，否则它仍可能改变名称、台词等本 Mod 范围外的文字。

当前 0.2.1 已通过离线检查，并于 2026-10-30 安装、完成实机显示复验：古典和探索场景均为 29 条修正及 4 条原文对照逐字匹配；15 个百科页面和海上神社生产提示已截图核对。未覆盖实际建造、物理鼠标悬浮或全部时代变体，具体证据与未验收路径见 [VALIDATION.md](VALIDATION.md)。

## 开发

```sh
python3 tools/build.py --game '/path/to/CivilizationVII.app/Contents/Resources'
python3 -m unittest discover -s tests -v
```

可通过 `CIV7_GAME_DIR` 指定官方资产根目录；无本机游戏时，涉及官方资产的测试会跳过，通用检查仍运行。根目录 `npm test` 支持 `PYTHON` 指定 Python 3 可执行文件。

构建仅读取官方资产；不连接游戏、不修改存档。新增勘误须先更新明确清单、记录规则依据，并检查实际修改键集合。

## English

Version 0.2.1 corrects only misleading Simplified Chinese gameplay descriptions and missing conditions. It includes Jinja, Mireuksa, Serpent Mound and selected, reviewed effect-scope corrections. No renaming, transliteration replacement, narrative rewriting or translations of other mods. No gameplay changes. Selected findings reference Cuchuan's public correction list; see NOTICE.md. Offline checks pass; see VALIDATION.md for installation and live-test status.
