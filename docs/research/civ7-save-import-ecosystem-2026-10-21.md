# Civ VII 存档解析、原生入口与专用 skill 调查

调查日期：2026-10-21（Asia/Shanghai）。本次仅查网页、作者仓库和本机已安装的静态游戏源码；没有连接游戏进程、调试端口或 UI，没有安装、启动或重启任何模组或游戏，也没有运行下载项目的代码。

## 用户澄清后的产品边界

用户明确允许读文件和附带组件。验收条件是**只安装 mod，不再安装其他软件、另行启动工具、配置环境或额外授权**，并不要求所有代码只能在 UI JavaScript 内执行。以下“纯 mod”调查只是实现路线之一；随 mod 附带并自动运行的组件同样可以满足要求，前提是验证其正常加载、通信和平台兼容。

本次补充静态核对：安装中的 Base/modules 与 DLC 共 46 份 modinfo 使用了 ImportFiles、UIScripts、UIAudioRules、UIShortcuts、UpdateArt、UpdateColors、UpdateDatabase、UpdateIcons、UpdateText、UpdateVisualRemaps。该清单仅表示已观察到的使用，不是引擎支持类型的完整枚举。原版 `core/ui/components/fxs-link.js` 使用 `Network.openURLFromType(URLType[key])` 打开预定义链接；没有证据能用它启动任意附带程序。尚未确认无需额外设置的原生组件自动加载入口。

旧实现的具体差距：`启动存档设置工具.command` 需要单独执行且依赖本机 Node；`tools/game-bridge.mjs` 依赖预先启用的 Cohtml 调试端口。打包 Node 最多解决运行库安装，不能单独解决自动启动和游戏通信。此结论来自本仓库源码，不是用户不允许读文件。

## 结论

**已经有人解析 Civ VII 存档，也确实有 Civ VII 专用 skill。此前不能把“没找到游戏内读取文件入口”说成“存档解析没有现成做法”。** 本次确认了两个独立解析项目、一个实际浏览器编辑器、两套专用 skill 和官方 Modding SDK 的公开说明。现有项目能够提供二进制结构、字段标记、解压方法与原生 UI 调用范例。[PYDT 解析器](https://github.com/pydt/civ7-save-parser)、[iqqmuT 编辑器](https://github.com/iqqmuT/civ7-save-editor)、[Civ7 Modding skill](https://github.com/chrislittle/civ7-modding-skill)

但本次尚未找到一项已经验证的现成实现，能在**普通 Workshop UI mod 内，从读档列表选中的任意 `.Civ7Save`，直接拿到全部文件字节或完整初始配置**，同时不加载对局、不运行辅助进程。已确认的外部编辑器靠 Node 文件读取或浏览器文件选择器取得文件。这是输入通道的差别，不是解析算法必须依赖辅助程序。[Node 读取实现](https://github.com/iqqmuT/civ7-save-editor/blob/b52cf161cb0b56a8e22ab7eeed48933a3cbea50d/index.js#L73)、[浏览器作者页面](https://civ7editor.vercel.app/)

有一个值得继续验证的原生候选：**保留普通存档的 `GAME_STATE` 类型，通过原生热座/多人载入路径先进入准备大厅，再快照设置并新建游戏**。它与已经失败过的“把普通存档当 `GAME_CONFIGURATION` 加载”是两条不同路径。现有原版和社区代码支持“存档 → 大厅 → 准备 → 开始”的流程，但尚不能证明任意单人存档可走通，也不能保证跨时代配置完整。当前用户正在游戏中，本次没有试调用。

## 已找到的实现及可借鉴部分

| 来源 | 源码确认的能力 | 取得文件的方式 | 对本项目的意义与边界 |
| --- | --- | --- | --- |
| [iqqmuT/civ7-save-editor](https://github.com/iqqmuT/civ7-save-editor) | 校验 `CIV7` 文件头；定位长度前缀分块的 zlib 数据；解压、按标记定位金钱/影响力、重新压缩；从头部找领袖。MIT。 | `fs/promises.readFile`，Node `Buffer` 与 `zlib`。 | 证明社区已经做过真实存档二进制读写；其业务字段主要是金钱和影响力，不是完整开局设置接口。可借鉴格式和测试，不应直接宣称其已完成本需求。 |
| [pydt/civ7-save-parser](https://github.com/pydt/civ7-save-parser) | `parseRaw`、`parseChunk`、字段标记表；读取回合、时代、速度、尺寸、DLC/mod、领袖、文明、人类/AI、队伍；含解压和修改玩家类型。MIT。 | 调用方传 `Buffer`；CLI 使用 Node `readFileSync`。 | 最有用的独立结构参照。源码包含变长组分隔的处理；可用来检查自己的完整设置解析是否错误地假定固定偏移。它没有提供游戏内文件读取能力。 |
| [civ7editor.vercel.app](https://civ7editor.vercel.app/)（作者 boris-perepelita） | 页面内嵌 JS 用 `Uint8Array`、小端读写和 pako 解压/重压，实现浏览器中的金钱/影响力修改；另有 mod 生成器。 | `<input type="file">` / 拖放 → `FileReader.readAsArrayBuffer`。 | 证实处理存档可以使用浏览器 JS；把这段代码放入 mod 并不会自动得到文件选择器或 `FileReader`。作者页未链接可确认的 GitHub 源仓库或清晰代码许可，因此本次仅阅读实现，不复制进产品。 |
| [jnazzar1/civ7-playbycloud](https://github.com/jnazzar1/civ7-playbycloud) | UI companion 自动保存、打开筛选后的原生读档页、热座大厅快速开始；Rust 客户端解析和上传文件。 | 游戏内调用原生 `Network.saveGame/loadGame`；实际文件由桌面 Rust agent 读取。 | 是与本项目输入通道问题很接近的先例；作者选择了 companion + 外部代理，没有展示 mod 直接取原始字节的办法。其架构不能直接当“纯 mod 已解决”的证据。 |

浏览器编辑器的作者明确介绍了金钱/影响力修改、生成数类作弊 mod 以及全部在浏览器处理的行为。[作者发布帖](https://www.reddit.com/r/Civilization_VII/comments/1urr6b8/i_made_a_browserbased_save_editor_mod_generator/) 本次下载原站 HTML 后只读检查：`parse` 在约 580 行、`handleFile` 在约 687 行；未上传用户存档，也未执行该页面脚本。

### PYDT 解析器的具体借鉴点

- `parseRaw` 从文件头和组长度开始遍历，分别处理 group1、group2、group3，以及 group3 到 group4 的变长分隔。其后 group5 是容错读取，失败会返回空数组；因此不能把“parse 成功”解释成“全文件所有配置都解析完整”。[源码](https://github.com/pydt/civ7-save-parser/blob/12fd8598283cc32cb9270b326bc8ebf393f5b59c/src/index.ts#L418)
- `parseChunks` 明确区分主要文明与独立势力，玩家 ID 来自固定 slot marker，而不是队伍 ID；这有助于防止复制设置时把队伍、人类槽位或城邦弄混。[源码](https://github.com/pydt/civ7-save-parser/blob/12fd8598283cc32cb9270b326bc8ebf393f5b59c/src/index.ts#L316)
- `REVERSING.md` 记录了社区对压缩区和 typed chunk 的逆向过程，但同一文件还保留了互相矛盾的旧“当前玩家”结论。使用时应以当前源码、字段置信度及自己的样本验证为准，不照单全收。[作者逆向笔记](https://github.com/pydt/civ7-save-parser/blob/12fd8598283cc32cb9270b326bc8ebf393f5b59c/REVERSING.md)

## 官方支持到哪里

官方提供了 Workshop、模组示例和文档；2026 年 5 月的 UI modding 说明还明确提到 SDK 的 UI 源文件、稳定入口与可读导出名，并说明部分构建工具仍在完善。因此“有官方 Modding SDK”是事实；**不能据此推出 SDK 对 mod 公开了任意存档的完整反序列化 API**。本次没有找到官方公开的 `.Civ7Save` 完整格式规范或“从存档只读设置”的 API 合同。[官方 Workshop 公告](https://steamcommunity.com/ogg/1295660/announcements/detail/544486109101429368)、[官方 UI modding 公告](https://store.steampowered.com/news/posts/?enddate=1778880609&feed=steam_community_announcements)

搜索到的 [dmanuel64/pyciv7](https://github.com/dmanuel64/pyciv7) 虽自称 Python SDK bindings，README 所展示的是生成、校验、打包 `.modinfo` 和 SQL 数据，不能将其当作原生运行时读档桥接。

### 本机原版源码确认的接口

本机目录根为：

`~/Library/Application Support/Steam/steamapps/common/Sid Meier's Civilization VII/CivilizationVII.app/Contents/Resources/`

此次遍历 `Base/modules` 与 `DLC` 中的静态 JS 调用点，确认如下。这里只反映已观察到的调用，不把未搜到当作引擎一定不存在。

| 原版来源（根目录下相对路径） | 确认事实 |
| --- | --- |
| `Base/modules/core/ui/save-load/model-save-load.js:12` | 读档列表默认条目包含路径、文件名、当前/起始时代、人数、速度、尺寸、地图脚本、领袖/文明和 mods；未声明种子、纪念物或原始字节字段。 |
| 同文件 `:194` | 枚举入口是 `GameStateStorage.querySaveGameList`。 |
| 同文件 `:227` | 原版已对配置和普通存档分别检查 enabledMods/requiredMods。 |
| 同文件 `:351`、`:395` | 保存、加载入口是 `Network.saveGame`、`Network.loadGame`；按 `SaveFileTypes` 区分配置、状态和时代转换。JS 只是传参给引擎，没有在此读取二进制。 |
| `Base/modules/core/ui/save-load/screen-save-load.js:937`、`:1064` | 加载有立即返回失败、异步 `LoadComplete` 和超时失败处理。可复用原版失败提示，而不是再增加主动 DLC 检测按钮。 |
| 同文件 `:1001`、`:1618` | 原生载入逻辑接受 LAN/WIRELESS/INTERNET/HOTSEAT/FIRAXIS_CLOUD 等 server 类型，和单人 NONE 分支分开。 |

`jnazzar1/civ7-playbycloud` 的 companion 代码使用 `screen-save-load` 的 `server-type=SERVER_TYPE_HOTSEAT`，并在后续准备流程调用 `Network.toggleLocalPlayerStartReady()`；快速开始脚本缩短的是大厅 `Network.startGame()` 之前的倒计时。这支持“原生加载可能先恢复大厅配置”的候选方向。[读档按钮源码](https://github.com/jnazzar1/civ7-playbycloud/blob/1f39787fffe97d4bb7630e0a2fa46508d5a84a7d/mod/ui/civ7pbem-loadbutton.js)、[大厅开始源码](https://github.com/jnazzar1/civ7-playbycloud/blob/1f39787fffe97d4bb7630e0a2fa46508d5a84a7d/mod/ui/civ7pbem-fastlaunch.js)

作者的 `mod/NOTES.md` 声称 mod 无原始文件/socket/process IO，并把许多流程标成待实测。该判断是有参考价值的作者结论，**不是本次独立证明的绝对引擎限制**。[作者能力调查](https://github.com/jnazzar1/civ7-playbycloud/blob/1f39787fffe97d4bb7630e0a2fa46508d5a84a7d/mod/NOTES.md)

## 已找到并阅读的专用 skill

1. **[chrislittle/civ7-modding-skill](https://github.com/chrislittle/civ7-modding-skill)**。已读 `SKILL.md` 和 `references/ui-modding.md` 的 UI 注册、文件挂载、存储、JS API 部分。可借鉴 `Controls.decorate`、自定义 `Panel`、`UIScripts`/`ImportFiles`、新旧 UI 栈处理，以及不要通过搜索不到一个名字就断言不存在的做法。它关于持久化的原生存档方案是用 `GAME_CONFIGURATION` 保存 mod 配置档案，并调用原生 query/save/delete；未给出任意普通 `.Civ7Save` 字节读取接口。[UI reference](https://github.com/chrislittle/civ7-modding-skill/blob/5511937663bfc5c4f70bbd359bd94c6ff86546ab/references/ui-modding.md#L840)
2. **[darqsatyr1c0n/civ7-mod-agent-skills](https://github.com/darqsatyr1c0n/civ7-mod-agent-skills)**。已读 `skills/civ7-ui-debugging/SKILL.md` 和配套 reference。内容涵盖 modinfo、旧 DOM/CSS 兼容、事件、日志、调试及原生 UI 挂载点；没有提供新的存档原始读取接口。[UI skill](https://github.com/darqsatyr1c0n/civ7-mod-agent-skills/blob/12a9c654a15e9a09dfe024c8949efeaa12da85e8/skills/civ7-ui-debugging/SKILL.md)

这两套是社区知识和操作流程，不会扩充游戏运行时权限。本次仅作为研究资料阅读，没有执行其安装器、调试设置修改、重启或测试指示；也没有把它们放入用户全局 skills 目录。

## 不应混淆的接口

- 浏览器 `FileReader.readAsArrayBuffer` 是浏览器编辑器当前实际采用的输入方式；是否存在于本机 Civ VII 的 Cohtml 集成中，需要以游戏能力为准。普通浏览器能运行，不能推断模组也能运行。
- Coherent 官方文档确实定义了 JS `XMLHttpRequest` 的二进制响应能力；这只证明 UI 引擎有该类能力，不证明 Civ VII 允许任何 `file://` 路径、将 Saves 挂进 `fs://game`，或开放 HTTP 请求。应核对 Civ VII 的宿主映射，不能凭 URL 猜测并反复尝试。[官方 XHR API](https://docs.coherent-labs.com/cpp-gameface/api_reference/classes/interface_x_m_l_http_request/)
- 搜索中出现的 `cohtml.FileReader` / `IFileSystemReader.OpenFile` 是 Unity/C++ 宿主集成接口，不是已经公开给 Civ VII mod JS 的同名对象。[官方宿主接口](https://docs.coherent-labs.com/unity-prysm/api_reference/classes/classcohtml_1_1_file_reader/)

## 建议后续验证顺序（未执行）

1. 保留已经迁移到普通 JS 的二进制解析核心，以独立 parser 的结构作交叉核对。解析代码与文件输入通道分开，避免重新把整个功能绑定到 Node。
2. 静态优先核对原生 `GAME_STATE` → 热座准备大厅的配置恢复路径。用户允许测试后，先完整备份所有存档，再检查单人存档能否只恢复配置、是否自动进入世界、如何退出保存状态而不污染新局，以及双方种子、纪念物、全部玩家和高级参数是否完整。
3. 若大厅方案不可行，再评估原生载入旧局后自动抓取配置并回新建界面。该路线慢且可能旋转自动存档，应如实说明行为；它也可能只暴露当前时代值，而不是原始开局值，不能未验证就作为完整复制交付。
4. 若必须获取原始字节，优先寻找宿主明确支持的文件选择或存档读取接口；没有证据时，不用打开调试端口、启动外部程序等要求冒充“装 mod 即用”。

所有候选都保留用户界面要求：读档页只留复制设置入口，新建页两个入口，一次仅处理一组；不恢复独立导出配置、主动 DLC 检测或多组翻页。

## 固定版本与本地证据

只读下载保存于 `work/civ7-save-research-20261021/`，没有安装依赖或运行项目代码：

- iqqmuT 编辑器：`b52cf161cb0b56a8e22ab7eeed48933a3cbea50d`；`save-editor.js`。
- PYDT parser：`12fd8598283cc32cb9270b326bc8ebf393f5b59c`；`pydt-parser/`。
- civ7-playbycloud：`1f39787fffe97d4bb7630e0a2fa46508d5a84a7d`；`playbycloud/`。
- chrislittle skill：`5511937663bfc5c4f70bbd359bd94c6ff86546ab`；`skill-main.md`、`skill-ui-modding.md`。
- darqsatyr1c0n skills：`12a9c654a15e9a09dfe024c8949efeaa12da85e8`；`ui-debugging-skill.md`、`ui-debugging-reference.md`。
- 浏览器编辑器原站 HTML：`browser-editor-index.html`；仅页面源码快照，无仓库版本号，不能视为固定发行版。
- 官方新闻原文由 Steam `ISteamNews/GetNewsForApp/v2` 返回并保存：`official-workshop-2025.txt`、`official-modding-2026.txt`。

本次没有穷尽所有社区私有仓库、Discord、工坊内未公开源码或未来游戏版本；“未找到纯 mod 原始文件入口”是当前调查边界，不是数学上的不可能证明。

## 2026-10-22 补充：原生路径及重置边界

继续调查仍全程离线。完整的原版大厅生命周期报告在 `work/civ7-save-research-20261021/native-lobby-analysis.md`；它逐项定位了源文件与行号。关键新增结论：

- `MultiplayerLobbyCreated` 不是可靠的配置就绪信号；原版在 `MultiplayerJoinGameComplete` 后打开大厅，两个事件也不能证明返回的是最初开局配置。
- 大厅 close 必须先取消两种倒计时，再 leave/exit。单纯移除界面不够。退出热座、回主菜单、进入单人新建均可重置设置，需先复制数据再恢复。
- 游戏拥有 `campaignStartAgeType` 与 `startAgeType` 两个字段；不能仅凭当前时代字段推断原始战役时代。GameSetup 参数 getter/setter 有源码实例，但没有确认任意带类型属性袋的完整可逆恢复接口。
- 已有真实副本的 initial/current 比较也否定了“读取当前配置即可完整复制原始设置”的捷径：随机 AI 的领袖/文明已确定，并有 SavedGame/StartTurn、席位和 mod 清单等变化。比较结果只存在工作区，未上传存档。

另外对本机 arm64 游戏二进制进行了**只读静态反汇编**，没有注入、挂接或调用。二进制 SHA-256 为 `55642f4d349a617242e5610d3458341b7af254a9eecb4eb2955d0cbc097c5ac7`。下列地址只适用于这个构建；反汇编工具显示的邻近符号名称不可靠，记录按地址判断。这些是静态推断，不是官方 API 合同或已通过的实机测试。

| 函数/范围 | 静态观察 | 对实现的影响 |
| --- | --- | --- |
| `0x1003e29e0` | 载入请求读取 FileName/DisplayName，以及 Type、ContentType、Location、LocationOptions、LocationCategories、Slot、Directory、AdditionalInfo 等字段 | Directory 与存档类型是不同概念，不能随意把 EXPLICIT 当作 SaveTypes。 |
| `0x100402318` | 优先 FileName，空时再使用 DisplayName；非特定位置先经过存在性检查，再进入加载入口 | 立即 false 可能早于配置反序列化，不能把旧测试失败归因于内容格式。 |
| `0x1001d4f64` → `0x1001e1ab4` → `0x1001dee40` | 文件检查经过路径组装和类型决定的扩展名补全；常量包括 `.Civ7Cfg`、`.Civ7Save`、`.Civ7Map`、`.tmx`、`.json` | 将普通档请求仅改为配置类型会改变预期文件名。这是解释旧失败的候选原因，尚未证明能直接用普通档加载初始配置。 |
| `0x1003341ec` | ContentType=配置使用配置分支，普通状态的 NONE 与多人分支不同 | 单纯伪装类型与 GAME_STATE→大厅是不同路线，需要独立验证。 |
| `0x1003e4d5c` | SaveDirectories 中的 EXPLICIT 值为 6 | 只能确认枚举；不能据此假设路径/扩展名检查消失。 |
| `0x1004df1a4` | UI 资源解析有 fs/coui、live、blp 分类，文件系统 host 分支观察到 game/cache/steam；无 host 的文件系统 URL 会报错 | 没有发现明确的用户 Saves 挂载入口；未执行猜测 URL 探测，也没有重试曾导致崩溃的路径。 |

中间反汇编/地址提取脚本位于 `work/civ7-save-research-20261021/native-static/`，仅用于开发研究，不放入 mod 包。

本轮同时把转换和原始/待加载配置核对数据生成移到 `ui/save-configuration.js`；旧主机工具复用它。真实副本输出与迁移前逐字节一致，94 项离线检查通过。**算法内置化已完成，存档输入/配置交付给引擎的入口仍未完成**，因此没有将未经验证的大厅路线设为默认，也没有宣称附带程序已能自动运行。
