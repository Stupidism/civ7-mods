# Civ VII 社区文件访问、联网与原生扩展案例核查

研究日期：2026-10-22。目标是寻找作者已实现的入口：普通 Workshop / `.modinfo` 模组直接读取任意完整存档、访问外网或 localhost、启动附带程序、加载 DLL / dylib。本轮只读取公开网页与作者仓库，不连接游戏、不运行下载项目、不操作 Saves，也没有重复本机反汇编。

## 结论

本轮找到了新的、可核对源代码的实现，但**尚未找到符合“只安装普通模组，不另装或启动程序、不改调试配置”条件的完整存档文件读取或原生组件加载案例**。这是本轮检索结果，不是对所有社区项目或引擎潜能的否定。

最有用的两个普通模组案例是：

1. **Chronicle** 用 `localStorage` 保存它自己记录的跨局数据；不能据此推断它能读取未载入的旧存档。
2. **PYDT Hotseat Support** 用 `GameTutorial.setProperty/getProperty` 将自定义 JSON 随游戏保存、在载入后读取；外部 **PYDT Electron Client** 才负责完整文件读写、监视目录和联网。客户端新增的 localhost API 也不在游戏中运行。

它们可作为“从安装之后的新局开始，主动留下开局快照”的实现依据，但**没有解决本项目最优先的“在读档列表选择任意已有存档，直接提取原始开局配置”入口**。保存自有数据、读取当前已载入世界、读取任意磁盘文件，是三种不同能力。

## 固定版本与分类

| 项目 | 本次固定源码 commit | 类型 / 平台依据 | 额外安装、启动或配置 | 对本项目的实际价值 |
|---|---|---|---|---|
| [Chronicle](https://github.com/poiurewq/civ7-chronicle) | `e079df788ded602229c878beca9ff2ce1e8fe992` | 普通 UI 模组；作者给出 Windows、macOS Mods 安装方式 | 按作者说明订阅或放入 Mods 并启用；无需单独助手 | 已有跨局本地记录模式；不提供旧存档原始字节 |
| [PYDT Hotseat Support](https://github.com/pydt/civ7-pydt-mod) | `200c5f3d223005c1278084d4e19fba0f8c9d5479` | 普通 `.modinfo` UI 模组；代码中无平台原生组件 | 模组自身可订阅；完整 PYDT 工作流另外使用其客户端 / 服务 | `GameTutorial` 自定义属性随存档交接的真实案例 |
| [PYDT Electron Client](https://github.com/pydt/client) | `0e58ac8f96adbd49f5ca5fef71b82905e5a1d562` | 游戏外应用；打包配置有 Windows、macOS、Linux | 另装并运行客户端；localhost API 另有启用选项 | 文件监视、读写、网络在外部程序实现；不是游戏 UI 绕过限制 |
| [FiretunerTerminal](https://github.com/ghost-ng/FiretunerTerminal) | `35d08e12e0d875f335cd295fced316f05fa7f2a9` | 游戏外 Python 工具；README 给出 Windows、Linux/Mac 安装步骤；本次核对的存档目录实现偏 Windows | Python 依赖、开启 `EnableTuner`、重启游戏、单独启动程序 | 可作开发调试工具，不能当成装上模组即用的发布方案 |

所有固定源码仅下载作静态阅读，保存在 `work/civ7-community-native-20261022/`；没有安装依赖或运行项目。

## 1. Chronicle：跨局历史来自自有存储

作者的[发布页](https://forums.civfanatics.com/resources/chronicle-stats-graphs-hall-of-fame.32899/)提供普通 Workshop / Mods 安装，明确说明名人堂只列出开启 Chronicle 时记录的游戏。其仓库 [README 第 3–18 行](https://github.com/poiurewq/civ7-chronicle/blob/e079df788ded602229c878beca9ff2ce1e8fe992/README.md#L3-L18)也将它描述为 UI 模组，并说历史列表来自它追踪过的游戏。

具体读写入口不是文件系统：

- [`scripts/chronicle-common.js` 第 159–202 行](https://github.com/poiurewq/civ7-chronicle/blob/e079df788ded602229c878beca9ff2ce1e8fe992/scripts/chronicle-common.js#L159-L202)：`loadShared()` 读取 `localStorage.getItem("modSettings")`，解析自己的命名空间。
- [同文件第 205–221 行](https://github.com/poiurewq/civ7-chronicle/blob/e079df788ded602229c878beca9ff2ce1e8fe992/scripts/chronicle-common.js#L205-L221)：序列化对象后写回 `localStorage.setItem("modSettings", str)` 并读回校验。

**可复用：**在新局启动前或开局时抓取设置，建立独立历史索引，之后在新建游戏界面选择该记录。需要设计可靠的局标识、版本号、容量上限与配置字段覆盖验证。

**限制：**该实现没有提供任意 `.Civ7Save` 读取入口，不能补出安装模组之前未记录的完整开局设置。其存储修复分支含 `localStorage.clear()`，本项目不应原样复制这个会影响其他存储内容的兜底操作。这里的借鉴仅指命名空间化的自有数据保存模式。

## 2. PYDT：模组把字段写进存档，客户端读取文件

作者于 2026-06-25 的[更新记录](https://www.playyourdamnturn.com/changelog)说明 Civ VII 支持需要一个模组，用于限制每次会话的回合数，并向存档补充回合状态。固定版本的 [modinfo 第 18–26 行](https://github.com/pydt/civ7-pydt-mod/blob/200c5f3d223005c1278084d4e19fba0f8c9d5479/pydt-hotseat-support.modinfo#L18-L26)只导入两个 UI JavaScript 文件，没有 executable、DLL 或启动命令。

### 普通模组实际调用

- [`hotseat-curtain.js` 第 31–42 行](https://github.com/pydt/civ7-pydt-mod/blob/200c5f3d223005c1278084d4e19fba0f8c9d5479/ui-next/screens/hotseat/hotseat-curtain.js#L31-L42)：`GameTutorial.getProperty("PYDT")` 获取 JSON，读取玩家名称。
- [同文件第 184–192 行](https://github.com/pydt/civ7-pydt-mod/blob/200c5f3d223005c1278084d4e19fba0f8c9d5479/ui-next/screens/hotseat/hotseat-curtain.js#L184-L192)：保存操作先调用 `GameTutorial.setProperty("PYDT", JSON.stringify({ player, turn }))`，再调用现有保存 UI。
- [`model-diplo-ribbon.js` 第 6–14 行](https://github.com/pydt/civ7-pydt-mod/blob/200c5f3d223005c1278084d4e19fba0f8c9d5479/ui/diplo-ribbon/model-diplo-ribbon.js#L6-L14)：外交条同样读取这个已载入游戏中的属性。

本次检查该固定 commit 的全部两个 JS 文件，没有 `XMLHttpRequest`、`fetch`、`WebSocket` 或完整磁盘文件读取实现。因此“PYDT 支持网上交换存档”不能作为“Civ VII 模组本身能联网”的证据。

### 文件读取与 localhost API 在哪里

[`pydt/client/app/src/preload.js` 第 1–15 行](https://github.com/pydt/client/blob/0e58ac8f96adbd49f5ca5fef71b82905e5a1d562/app/src/preload.js#L1-L15)导入 Electron、Node `fs`、`zlib`、`chokidar`，通过 Electron 自己的 `contextBridge` 暴露 `pydtApi`。

- [第 16–38 行](https://github.com/pydt/client/blob/0e58ac8f96adbd49f5ca5fef71b82905e5a1d562/app/src/preload.js#L16-L38)：监视外部目录的文件增加和变化。
- [第 96–129 行](https://github.com/pydt/client/blob/0e58ac8f96adbd49f5ca5fef71b82905e5a1d562/app/src/preload.js#L96-L129)：`fs.readFileSync`、`writeFileSync`、异步 `readFile` 等真正读写存档文件。
- [第 39–63 行](https://github.com/pydt/client/blob/0e58ac8f96adbd49f5ca5fef71b82905e5a1d562/app/src/preload.js#L39-L63)：客户端有自己注册系统自启动的选项；这不是 Civ VII 模组启动客户端。

新找到的 [PR #111](https://github.com/pydt/client/pull/111)于 2026-07-11 合并 localhost API。固定实现 [`app/src/turnApi.js` 第 1–47 行](https://github.com/pydt/client/blob/0e58ac8f96adbd49f5ca5fef71b82905e5a1d562/app/src/turnApi.js#L1-L47)在 Node 创建 HTTP server，监听 `127.0.0.1:47821`，只提供 `GET /turns`；[第 61–78 行](https://github.com/pydt/client/blob/0e58ac8f96adbd49f5ca5fef71b82905e5a1d562/app/src/turnApi.js#L61-L78)通过 Electron IPC 更新并按开关启停。[客户端界面第 74–90 行](https://github.com/pydt/client/blob/0e58ac8f96adbd49f5ca5fef71b82905e5a1d562/ui/app.component.html#L74-L90)有用户启用选项。

**结论：**这是外部应用向其他本机应用提供接口的证据，没有发现配套游戏模组去调用它。不能用它推翻本机游戏 UI 的 HTTP / HTTPS / WebSocket 实测结果。客户端[打包配置第 13–16、24–64 行](https://github.com/pydt/client/blob/0e58ac8f96adbd49f5ca5fef71b82905e5a1d562/package.json#L13-L64)覆盖 Windows、macOS、Linux；平台覆盖不等于无需单独安装和运行。

### 本项目可以借鉴到哪一步

`GameTutorial` 属性是一个真实作者项目已经使用的“随存档保留自定义字段”的候选。可以研究在新局最初阶段写入经过规范化的开局快照，之后对**已载入的该局**读取快照。它与 Chronicle 的跨局索引可以互补。

尚未验证的关键点包括：完整配置 JSON 的可接受大小、所有时代转换后的持久性、何时能取得未被随机化或时代进程改变的原始设置、局标识如何与读档列表对应、主菜单是否能够读取该字段。**现有源码没有显示 `GameTutorial.getProperty` 可以直接以任意存档路径为参数读取未载入文件。**因此不能将此路线宣称为任意旧存档的一键复制已打通。

## 3. FiretunerTerminal：文件工具由 Python 执行

该项目的[安装与使用说明第 50–98 行](https://github.com/ghost-ng/FiretunerTerminal/blob/35d08e12e0d875f335cd295fced316f05fa7f2a9/README.md#L50-L98)要求安装 Python 依赖、编辑 `AppOptions.txt` 将 `EnableTuner` 设为 1、重启游戏，再单独运行 Python 程序。它是调试工具，不能归类为普通 Workshop 模组。

容易误读的 `list_saves` 已核对：[`civ7_terminal/game_tools.py` 第 124–152 行](https://github.com/ghost-ng/FiretunerTerminal/blob/35d08e12e0d875f335cd295fced316f05fa7f2a9/civ7_terminal/game_tools.py#L124-L152)遍历外部 Python `Path`，调用 `root.rglob("*")`、`p.is_file()` 和 `p.stat()`。这不是 `GameStateStorage` 或其他游戏内 API 返回完整文件内容。该段目录候选使用 Windows 路径；README 虽有 Mac 安装步骤，也不能据此认为这段存档目录功能已正确覆盖 macOS。

**可借鉴：**开发期调试桥接与外部文件工具结构。**不满足的条件：**用户不应额外开启调试、安装依赖或启动外部进程。

## 4. DLL / dylib / 原生 loader 的检索结果

本轮针对 Civ VII / Civ7 的 DLL loader、native injector、ASI、mod loader、filesystem / file access、`readFileSync`、`XMLHttpRequest`、`WebSocket`、localhost，以及 CivFanatics 的相关讨论做了公开检索，再追到作者仓库。没有找到能同时证明以下三点的项目：

1. 确为 Civ VII，而非 Civ V、Unity 游戏或其他游戏；
2. 安装方式是普通 `.modinfo` / Workshop，不需要另装注入器、替换 DLL、修改启动参数或开启调试；
3. 已向 Civ VII 模组 JavaScript 暴露任意文件读写、外网通信或 helper 自动启动能力。

检索结果存在被放在 Civ VII 分类下的旧游戏 DLL 新闻、通用 Unity 注入器、单纯修改器广告，以及标题含 Civ VII 但说明自己只是独立演示界面的仓库；它们均不能作为本任务的已实现证据。未找到符合条件的原生 loader，并不等于已经证明编写任何 loader 都不可能；若走注入器或替换游戏原生文件，则产品的安装条件已发生变化，需要单独评估，不能隐称为装上普通模组即可使用。

## 与现有实测的关系

本轮没有新增游戏实测。已有[HTTPS 与文件 API 测试记录](civ7-https-live-test-2026-10-22.md)表明：本机构建游戏 UI 请求测试 HTTP / HTTPS 返回 404；外部正对照成功；已挂载 `fs://game/` 资源可通过标准 XHR `arraybuffer` 读取；原生读档列表 metadata 不含完整种子、纪念物和配置字节。这些结果只适用于已测路径。

上述社区代码没有提供新的、已经证实能把任意 `Saves` 文件映射到 `fs://game/` 的入口，也没有证明普通模组能启动 PYDT / Python 程序。它们确实证明两种有限而有用的能力：保存模组自有跨局记录，以及把自定义字段放入当前游戏状态并随正常存档交接。后续若验证这两个候选，应单列它们对“未来新局”的帮助，继续保留“任意既有存档读取入口仍未解决”的事实。

## 交付状态

- 已完成：公开作者案例筛选、4 个作者仓库固定 commit、关键源码静态核对。
- 未执行：下载项目代码、依赖或安装脚本的运行；游戏、调试端口或存档目录操作；未知原生函数探测。
- 最值得继续研究：`GameTutorial` 自定义初始快照 + 跨局索引，用于安装之后的新局；需完整备份后另行安排实际验证。
- 仍缺的核心证据：普通模组选择任意旧存档后，在不载入该世界、不依赖外部程序的情况下取得完整文件字节或完整原始开局配置。
