# 单行设置复制码

实现版本：`0.3.6-dev`，modinfo `9`。日期：2026-10-22。

## 使用入口

新建第一页 → 粘贴配置文字 → 粘贴一行 → 核对结果 → 填入设置。

同一粘贴窗口的“生成当前设置码”读取当前新建配置，展示一行 `C7S2`。点击输入框后按 Ctrl/Cmd+A、Ctrl/Cmd+C 复制。它不依赖系统剪贴板读取、外部程序、网络或游戏调试端口。第一页保留两个按钮。

`C7S2` 增加纪念物与高级设置，自动枚举当前游戏开放的设置，并显示未收录项目。`C7L1`、`C7S1` 仍可导入。这些码描述当前新建配置，**不是整个存档的完整配置快照**：不包含存档进度、账号、会话或 DLC/MOD 清单，也不会读取已有存档文件。

## C7L1：兼容阵容格式

```text
C7L1;ANTIQUITY;H:HIMIKO_ALT:NORMAN;A:FRIEDRICH:GREECE;A:SAYYIDA_AL_HURRA:ICELAND;A:ISABELLA:DAI_VIET;A:IBN_BATTUTA:PRUSSIA;A:AUGUSTUS:MONGOLIA;A:CATHERINE:MING
```

格式来源：[生成器网页](https://ghost-ng.github.io/Civ7Generator/)及[作者格式解析源码](https://github.com/ghost-ng/Civ7Generator/blob/1027b43de158cf326803baa8a860927ebcf97ff9/Mod/ghostng-random-civ-generator/ui/import-parse.js)。本项目独立实现文本契约和游戏适配，不复制该项目的 UI 或自动替换随机项行为。

- 首字段固定 `C7L1`，第二字段是 `ANTIQUITY`、`EXPLORATION` 或 `MODERN`。
- 后续条目为 `H:领袖:文明` 或 `A:领袖:文明`；省略 `LEADER_` / `CIVILIZATION_` 前缀。
- `RANDOM` 表示明确指定随机，不能与“不认识的 ID”混为一谈。
- 解析保留所有 H/A 条目。当前界面是单人新建入口，应用时只允许一个 H，映射到实际本地玩家 ID；A 按其在码内的顺序对应可用 AI 席位。
- 示例的七人阵容可完整解析；每个具体组合能否在某个时代使用，仍由当前游戏的参数域决定。语法有效不代表所有文明都适用于该时代。
- 不包含地图、尺寸和种子；导入时代/阵容后，恢复原有的两个有效种子。

## C7S1：本项目的常用设置格式

```text
C7S1;MAP={base-standard}maps/pangaea-plus.js;SIZE=HUGE;GAMESEED=1467319409;MAPSEED=1467319429
```

带时代和阵容的示例：

```text
C7S1;AGE=ANTIQUITY;MAP={base-standard}maps/pangaea-plus.js;SIZE=HUGE;SPEED=STANDARD;DIFFICULTY=DEITY;GAMESEED=1467319409;MAPSEED=1467319429;H:ISABELLA:ROME;A:AMINA:GREECE
```

`C7S1` 是本项目的新格式，不声称第三方生成器已经支持它。字段用分号隔开，每个设置用 `KEY=value`，玩家条目沿用 H/A 格式。字段可省略，但同一个字段不可重复。保留字段顺序用于规范输出；输入允许任意设置顺序，H/A 条目的相对顺序保持。

| 字段 | 内容 | 游戏参数 |
| --- | --- | --- |
| AGE | ANTIQUITY / EXPLORATION / MODERN | Age |
| MAP | 当前游戏中实际使用的地图 ID，例如 `{base-standard}maps/pangaea-plus.js` | Map |
| SIZE | HUGE、STANDARD 等；也接受完整 MAPSIZE_ 前缀 | MapSize |
| PLAYERS | 2–64 的整数，实际不能超过当前地图上限 | PlayerCount / 席位 |
| SPEED | STANDARD 等；也接受完整 GAMESPEED_ 前缀 | GameSpeeds |
| DIFFICULTY | DEITY 等；也接受完整 DIFFICULTY_ 前缀 | Difficulty |
| GAMESEED | 游戏随机种子 | GameRandomSeed |
| MAPSEED | 地图随机种子 | MapRandomSeed |

有完整 H/A 阵容时，玩家数由条目数量确定。若同时出现 PLAYERS，必须与阵容数量一致。生成当前设置码时写入阵容，不冗余输出 PLAYERS。

种子输入接受 `-2147483648` 至 `4294967295` 的十进制整数。规范输出使用无符号 32 位表示，写入游戏时使用相同位模式的有符号整数；例如 `4294967295` 和 `-1` 是同一个种子。

输入上限 32000 字符。允许字段周围空白和一个末尾分号；不忽略中间空字段、未知键、不支持的版本、多份码拼接或溢出种子。地图 ID 只作为游戏参数域中的精确选项匹配，绝不当文件路径读取或执行。

## C7S2：纪念物与高级设置

沿用 C7S1 基本字段和 H/A 阵容，增加 `G:参数ID=编码值` 和 `P:玩家序号:参数ID=编码值`。玩家序号从 0 起，指向同一行 H/A 阵容的顺序，不是宿主的实际席位编号。

```text
C7S2;AGE=ANTIQUITY;GAMESEED=1467319409;MAPSEED=1467319429;H:ISABELLA:ROME;A:RANDOM:RANDOM;G:AgeLength=%22AGE_LENGTH_STANDARD%22;G:NoCivUnlocks=false;G:Crises=%5B%5D;P:0:PlayerMementoMajorSlot=%22MEMENTO_FOUNDATION_IMAGO_MUNDI%22;P:0:PlayerMementoMinorSlot1=%22NONE%22
```

`C7S2` 同样是本项目的格式，不声称第三方生成器已支持。示例只展示部分字段，建议在新建界面选好后自动生成，避免手写漏项。

- 编码值是 `encodeURIComponent(JSON.stringify(value))`。百分号编码用于保留引号、分号、中文和其他分隔符，不是 URL 请求。
- 支持布尔值、32 位整数、文字 ID 和不重复的标量列表；禁止对象、嵌套列表、null、控制字符、超长文本及重复字段。每码至多 512 个扩展参数，每列表至多 256 项。
- 参数 ID 大小写敏感，使用 `GameSetup` 的稳定名称；枚举选项同样使用可解析名称，绝不导出仅在当前进程有效的数字字符串句柄。
- 基本字段与领袖/文明只能使用原有字段，不允许通过 G/P 再定义；玩家扩展项必须有对应阵容。
- 两个标准纪念物参数是 `PlayerMementoMajorSlot`、`PlayerMementoMinorSlot1`。`NONE` 明确清空该槽；省略字段不代表要求清空。导入前核对原生解锁资料，不尝试解锁。
- 自动收录 `getGameParameters()`、`getPlayerParameters()` 提供的单选、多选、开关、有符号/无符号整数。支持团队、玩家难度、自定义难度细项、时代长度/过渡/文明选择规则、独立势力、起点/海平面、灾害强度、回合限制、胜利/危机/传承路线等，以及使用相同类型的第三方选项。实际收录取决于当前时代、地图、模式和已安装内容。
- 对 `InvertSelection` 多选项，列表保留引擎的“排除列表”语义；例如 `Crises=[]` 是全部启用，预览不会误标为全部关闭。空列表、false 和 0 都必须保留。
- 隐藏/无效选项、年代过渡专用玩家状态、大厅设置、不支持的文本/其他类型、缺少稳定 ID 的内容会列入未收录报告。匹配的只读选项可以核对，但不会被强行修改。
- 带有扩展项的计划不能降级导出为 C7L1/C7S1，避免静默丢失纪念物或高级设置。代码过长会拒绝导出，不截断。

静态接口依据（本机原版 1.5.0 源码，未连接运行中的游戏）：

- `core/ui-next/screens/create-game/game-parameters-model.js`：参数枚举、按 ID 查找与设置。
- `core/ui/shell/create-panels/game-creation-options.js`：Select/Boolean/Integer/UnsignedInteger 类型，数组使用 `values`，反向选择语义。
- `core/ui-next/screens/create-game/memento-select-model.js`：两格纪念物、`NONE` 清空、先清重复槽位、`Online.Metaprogression` 解锁元数据。
- `core/config/SetupParameters.xml`、`base-standard/config/config.xml`：标准高级参数和依赖定义。

## 游戏内应用规则

1. 校验空闲主菜单与单人席位。进行中的对局不修改。
2. 先规则集，再时代、地图、尺寸、速度、主难度，每一步等待刷新并重新读取选项。
3. 恢复游戏高级参数，再调整 AI 席位。依赖其他选项才出现的设置延后重试；无进展则逐项报告。高级游戏规则失败时停止后续阵容填入，避免在不同规则下继续。
4. 检查玩家上限，不覆盖另一名人类玩家；每个席位先领袖后文明，再恢复团队、玩家难度等。目标始终映射到实际 H/A 席位，不使用旧候选列表。
5. 预检纪念物、解锁状态与重复装备；需要交换时先清空编码中相应槽位，再装备。预检失败不进入纪念物写入，但之前的时代/领袖变更可能已经触发游戏重置。
6. 最后填写种子，未编码种子时保留原值。最终重新读取每项，检查后续修改有没有使前面的值失效。游戏拒绝、只读冲突、选项不可用会具体提示；已经采用的修改保留，没有完整事务回滚，不把部分成功报告为全部成功。
7. 全部流程不自动开局、不自动载入存档，不把不可用选项替换成 RANDOM。

## 实现与离线验证

- `ui/setup-code.js`：纯解析、校验、规范编码；没有宿主 IO。
- `ui/setup-code-game.js`：注入游戏边界的预览、导入和导出适配。
- `ui/setup-code-parameters.js`：原生参数类型、选项域、纪念物解锁、列表语义与收录范围。
- `ui/play-again.js`：现有原生文字输入和弹窗接入。
- `play-again.modinfo` / `tools/install.mjs`：包含新增模块；本轮未运行安装脚本。

`node --test tests/*.test.mjs`：**131 项通过，0 失败**。本次新增 17 项，覆盖完整扩展配置在不同进程句柄下的往返、纪念物互换/清空/重复/未解锁、原生 setter 拒绝、开关 false/整数 0/空多选/排除列表、自定义规则先于文明、依赖项延后、只读冲突、后续变更覆盖值、未收录报告及进行中对局保护。

界面脚本测试直接执行实际 adapter，在模拟游戏边界下验证旧码兼容和“粘贴 C7S2 → 填入纪念物/开关/多选 → 生成当前 C7S2”。测试没有请求辅助程序、读取游戏存档或启动世界。

本轮没有连接游戏、安装/热加载 mod、修改调试配置或触碰用户 Saves。真实布局、焦点、原生参数刷新时序和平台兼容仍需后续实机验证；实机前仍必须完整备份所有存档。
