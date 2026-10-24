# Civ VII 随 mod 附带原生组件与 localhost 通信调查

日期：2026-10-22。目标是普通玩家只安装 Workshop/`.modinfo` 模组，便能从存档复制开局设置；允许附带组件，但不能要求玩家另行启动程序、安装运行库、配置调试端口或批准额外权限。

本研究子任务仅阅读官方文档、作者源码、本机安装资源与主线程已落盘的测试结果；没有自行连接游戏、执行陌生项目、修改游戏/mod 安装目录或操作 Saves。主线程实测与静态研究在下文分开标注。

## 结论

**目前没有找到普通 Civ VII mod 通过受支持入口自动启动附带 executable，或自动加载附带 DLL/dylib 的证据。** 因此不能把“把 helper 一起放进 mod 压缩包”当成“别人装上就能用”的已完成方案。这里没有断言 Steam 禁止分发二进制文件，也没有证明所有未公开引擎能力都不存在；未解决的是游戏如何执行这个文件。

**Coherent 支持原生绑定、资源请求及 WebSocket，但这些文档描述游戏开发者如何接入宿主，不是 mod 能自行追加 C++ 绑定的合同。** 本机 Civ VII 的 XHR/WebSocket 构造器存在，也不足以证明它们能访问 localhost。[原生绑定](https://docs.coherent-labs.com/cpp-gameface/integration/ui_scripting/javascript_native/)、[WebSocket 宿主集成](https://docs.coherent-labs.com/cpp-gameface/integration/optional_features/websockets/)

主线程本轮已取得更具体的负向结果：主菜单里的 XHR 对本地应答服务得到 404，但服务端没有收到请求；WebSocket 超时且没有握手。其适用范围是当前 Mac 构建、当前 shell 上下文和实际测试的 URL/请求，不能扩张为所有平台、所有 URL 或所有通信方法的绝对结论。**随后通过原生配置文件完成了最小请求/回复信号测试，消息传递不依赖 HTTP、WebSocket 或 CDP。** 测试没有加载回复配置，也没有验证完整存档导入协议；helper 仍由开发环境启动，自动启动是独立的缺口。

## 1. 官方 mod 加载机制实际说明了什么

### 已证实：动作加载数据、资源和 JavaScript

官方 SDK 的 `modinfo Files` 文本目前通过社区维护的原文镜像查阅。本机 Steam common 目录没有找到已安装的 Development Tools/Documentation，因此没有把镜像冒充当前本机 SDK 原件。镜像自述其来源为官方文档，并保留具体动作说明；本次固定到 `mateicanavra/civ7-modding-tools` commit `e73bbbd5f2301922f7204b694ed7cf9ba047bc44`。[镜像来源声明](https://github.com/mateicanavra/civ7-modding-tools/blob/e73bbbd5f2301922f7204b694ed7cf9ba047bc44/apps/docs/official/README.mdx)

文档列出的动作包括 `UpdateDatabase`、`UpdateText`、`UpdateIcons`、`UpdateColors`、`UpdateArt`、`ImportFiles`、`UIScripts`、`UIShortcuts`、`UpdateVisualRemaps`、`MapGenScripts`、`ScenarioScripts`。`UIScripts` 加载 `.js`；`ImportFiles` 把资源引入游戏文件系统并可覆盖相同相对路径；`UIShortcuts` 是需要开启 debug panel 的 HTML 调试入口。**动作清单没有描述加载 native library 或执行 OS 程序的动作。** “导入文件”不能等同于“执行任意文件”。[动作文档](https://github.com/mateicanavra/civ7-modding-tools/blob/e73bbbd5f2301922f7204b694ed7cf9ba047bc44/apps/docs/official/guides/modinfo-files-actions.mdx)

本机游戏原件的独立核对：遍历 `CivilizationVII.app/Contents/Resources/Base/modules` 与 `DLC` 共 46 份 `.modinfo`，实际使用动作是 ImportFiles、UIAudioRules、UIScripts、UIShortcuts、UpdateArt、UpdateColors、UpdateDatabase、UpdateIcons、UpdateText、UpdateVisualRemaps。没有发现执行程序/加载库的使用范例。该结果只是原件使用清单，**不是引擎支持类型的穷尽枚举**。详细文件列表保存在 `work/civ7-helper-research-20261022/installed-mod-actions.json`。

官方 Workshop 公告确认自动下载/安装模组及提供 SDK、上传器、FireTuner；没有承诺为模组启动任意附带程序。[Firaxis 公告](https://steamcommunity.com/ogg/1295660/announcements/detail/544486109101429368)

Steamworks 对 Workshop 的标准集成说明，是 Steam 下载内容后，游戏通过 `GetItemInstallInfo` 获取安装目录，再由游戏读取和解释这些内容；不能由“订阅会自动下载”推出“目录里的 exe 会自动运行”。这属于分发与执行的两个环节。[Steam Workshop Implementation Guide](https://partner.steamgames.com/doc/features/workshop/implementation)

### 未发现：普通 mod 的启动或动态加载入口

没有找到经过官方文档或实际作者代码证实的以下能力：

- `.modinfo` 启动附带 `.exe`、Mach-O executable 或脚本；
- `.modinfo` 按平台自动 `LoadLibrary`/`dlopen` 一个自定义 DLL/dylib，并调用其入口；
- UI JavaScript 调用一个已公开的 spawn/exec/load-native API；
- 模组能通过 Coherent `engine.call` 为自己注册一个新的 native 函数。

原版 `core/ui/components/fxs-link.js:7–20` 调用的是 `Network.openURLFromType(URLType[key])`，其属性说明就是预定义 URL。没有证据表明它接受任意文件或自定义协议来启动 helper。不能直接把它当作“打开 mod 内程序”的接口。

DLL 注入、替换游戏启动器、修改游戏二进制/启动参数、预先注册 OS 协议或系统服务，都不能当成普通 Workshop mod 已支持的安装流程。本次没有实施这些方式。

## 2. Coherent 官方文档：能做，但由谁实现

| 能力 | 官方接口和前提 | 对 Civ VII mod 的含义 |
|---|---|---|
| JS 调原生 | 游戏 C++ 在 OnReadyForBindings 中通过 `View::BindCall` 或 RegisterForEvent 注册；JS 用 engine.call/trigger 调用 | 可以调用游戏已注册的入口；不提供给 JS 动态绑定任意 OS API 的能力 |
| WebSocket | 宿主需接入 WebSocket 库并实现 `IViewListener::OnCreateWebSocket` | `new WebSocket` 名称存在不能证明宿主实际支持该地址和连接 |
| 资源读取 | `IAsyncResourceHandler::OnResourceRequest` 由宿主处理 URL 并填充响应 | 接口本身不决定 Civ VII 把哪些本地路径/协议开放给 UI |
| HTTP 支持组件 | Extended Setup Guide 要求宿主按需求随应用分发 HttpServer library | 库文件存在只是依赖条件，不是 loopback 已可用的证明 |
| DevTools | 宿主设置 EnableDebugger=true 和 DebuggerPort | 是显式启用的调试通道，不符合“不配置调试端口”作为产品依赖的要求 |

来源分别为 [JavaScript 与 native 通信](https://docs.coherent-labs.com/cpp-gameface/integration/ui_scripting/javascript_native/)、[WebSockets](https://docs.coherent-labs.com/cpp-gameface/integration/optional_features/websockets/)、[异步资源处理](https://docs.coherent-labs.com/cpp-gameface/integration/asyncresourceresponses_native/)、[宿主设置](https://docs.coherent-labs.com/cpp-gameface/integration/setup_guide_native/)、[DevTools 设置](https://docs.coherent-labs.com/cpp-gameface/integration/optional_features/devtools/devtools_cpp/)。这些是当前公开的 Gameface 文档，不保证与 Civ VII 嵌入版本、编译选项和定制宿主完全一致。

本机应用目录确实含 `libHttpServer.Mac.dylib`、`libcohtml.Mac.dylib` 和 V8 库。它们是游戏自身附带的宿主组件；存在这些文件不代表把另外一个 dylib 放进 Mods 后会被加载。

## 3. UI → localhost：静态源码与主线程测试

### 静态已证实

本机 `Base/modules/core/ui/component-support.js:41–56` 以及 `core/ui-next/utilities/async-load.js:3–24` 使用 `XMLHttpRequest` 读取资源文本。原版接受状态 0 或 200。它们没有显示 localhost 调用范例。

`base-standard/scripts/voronoi-utils.js:512–528` 包含先判断 `typeof fetch == "function"` 的读取函数，并在不支持时返回 null；代码存在不能证明当前 UI 有 fetch。此次本机原版 UI 静态搜索没有找到向 localhost 发起 WebSocket 的范例。

### 主线程已实测；本研究者仅阅读其结果

2026-10-22，主线程在完整备份之后、主菜单里执行了能力枚举与受控本地应答服务测试。结果文件包含 `inShell=true`、`gameStarted=false`，测试结束仍是主菜单且未启动对局。

- `work/bundled-helper-probe-20261022/runtime-capabilities.json`：process、require、Module、File、FileReader、fetch、Worker、WebAssembly 均为 undefined；XMLHttpRequest 与 WebSocket 是 function，Blob 是 function。Node 打包、Node fs、WASM OCR 或浏览器 FileReader 不能在此上下文直接假定可用。
- `work/bundled-helper-probe-20261022/transport-result.json`：枚举 Network/UI/Modding/GameStateStorage 及原型，没有发现命名明确的通用启动进程/加载库方法；不能用此有限枚举断言全部 native engine binding 都不存在。
- 同一测试中 XHR 触发 onload，code=404，marker 不匹配；WebSocket 4 秒超时，未 open；本地服务命中列表为空。仅有 onload 回调不是成功连接证据。
- 该应答程序由开发测试环境启动，文件明确标记 `helperStartedByMod=false`。这次测试本身不能证明 mod 自动启动 helper。
- 后续 `work/bundled-helper-probe-20261022/controlled-transport-result.json` 已补正对照：外部 Node 对同一服务的 HTTP 返回 200 且 marker 匹配，WebSocket 也收到匹配 marker；服务端只记录两次 control 命中。游戏侧仍是 XHR 404、WebSocket 未 open/超时。由此可以排除“此次应答服务根本没工作”的解释，但仍不能确定具体是 URL 路由、宿主实现还是其他引擎策略导致失败。

上述受控测试支持“当前测试方式没有让游戏 UI 连到 localhost 服务”，不支持“所有本地通信方式都不可能”。也不因失败就建议开放调试端口给普通玩家。

## 4. 原生配置文件：最小请求/回复信号测试已通过

不能从 localhost 请求失败推导 helper 完全无法与 mod 通信。静态原版已有 `Network.saveGame`、`GameStateStorage.querySaveGameList`、`Network.loadGame` 的配置存取入口：`core/ui/save-load/model-save-load.js:194、351、395`。外部组件可以像普通存档工具一样读写文件；mod 可以通过游戏已实现的存取行为传递数据，而不直接获得 OS 文件 API。

完整候选协议是：mod 保存有唯一请求标识的专用 GAME_CONFIGURATION → helper 监听并读取请求 → helper 输出带对应标识的 `.Civ7Cfg` 响应 → mod 原生列表查询发现响应并调用配置载入。主线程已验证其中的保存请求、主机读取、写出回复和游戏发现回复四步，尚未执行最后的加载。playbycloud 的保存/目录监听提供了相关先例，不能替代本项目自己的完整验收。

具体测试脚本与结果为 `work/bundled-helper-probe-20261022/file-roundtrip-probe.mjs` 和 `file-roundtrip-result.json`：

1. 开发环境先启动只处理唯一测试文件名的主机监听器。它不是 mod 自动启动的。
2. 游戏 UI 调用 `Network.saveGame`，把未修改的当前新局配置保存为唯一命名的本地 `GAME_CONFIGURATION` 请求文件。
3. 监听器确认文件稳定、解析并验证其类型为配置，再以禁止覆盖的方式复制同样字节到唯一回复文件。请求为 107,072 字节，SHA-256 为 `53c3af06d438b2e633d7694b4656dfedeed200dde220d74b1a183fe65cf125b0`。
4. 游戏通过 `GameStateStorage.querySaveGameList` 及 `FileListQueryResults` 发现匹配的回复文件，报告 `response-observed`；只关闭自己的列表查询。
5. 没有调用 `Network.loadGame`，没有加载或创建对局。测试前后完整 Configuration 快照相同，仍为 `inShell=true`、`gameStarted=false`。

CDP 仅用于把测试代码送入已经运行的游戏并收集测试结果，**请求和回复本身通过配置文件与原生列表传递，没有经 CDP 传递**。因此已证明这种最小通信方式可以不依赖调试通道；未证明完整产品在关闭调试器的干净环境中已可使用，也未证明 mod 会启动监听器。

应验证：请求需要的字段能否被配置保存完整保留；响应的结构、文件名/扩展名与列表缓存是否正确；异步保存/查询/载入结果能否按唯一标识关联；失败/过期响应是否会误改新建设置；加载响应后能否恢复正常新局状态。这些都可以用专用测试配置完成，不需要读取或改写用户原始存档。

**这项进展解决了一种最小“如何传话”的方式，尚未解决“由谁先启动 helper”。** 原始存档选择如何编码进请求、回复配置的实际加载、过期/重放/错误处理，都还需要实现和验证。开发人员先运行 helper 的测试，不能作为“订阅 mod 后全自动”的最终验收。

## 5. 已有开源项目实际如何跨出游戏沙盒

### civ7-playbycloud：外部应用安装 companion，方向相反

该项目有可独立启动的 Rust 桌面程序/CLI。README 要玩家下载并运行它，GUI 可以安装 UI companion。`gui/src/main.rs:271–286` 把 bundle 写入 Mods；`:519–528` 由外部 GUI 发起安装。mod 使用原生 save/load 操作，Rust agent 读取/上传文件。**不是 mod 在启动时运行 Rust 程序。** [作者 README](https://github.com/jnazzar1/civ7-playbycloud/blob/1f39787fffe97d4bb7630e0a2fa46508d5a84a7d/README.md)、[GUI 源码](https://github.com/jnazzar1/civ7-playbycloud/blob/1f39787fffe97d4bb7630e0a2fa46508d5a84a7d/gui/src/main.rs#L271)

作者 `mod/NOTES.md:35–37` 选择让 UI 与 agent 通过 Saves/Hotseat 目录协调，而不是 UI socket；其中“no file/socket/process IO”是作者的能力结论，有实际架构对应，但不能仅靠一句笔记证明 Civ VII 所有上下文绝无此类能力。[作者调查](https://github.com/jnazzar1/civ7-playbycloud/blob/1f39787fffe97d4bb7630e0a2fa46508d5a84a7d/mod/NOTES.md)

### civ7-live-player、civ7-modding-tools：调试客户端

`windwhinny/civ7-live-player` README 明确要求 Node 18+ 和启用 Cohtml DevTools，通过 WebSocket/Runtime.evaluate 控制游戏。这是外部调试自动化，不是无配置的普通模组。[作者仓库](https://github.com/windwhinny/civ7-live-player)

`mateicanavra/civ7-modding-tools` 的 `packages/civ7-direct-control/src/session/socket.ts` 在外部 Node 环境 `import { createConnection } from "node:net"` 连接 Tuner。工具仓库同时提供生成 mod 的 SDK，不应把两种运行环境混为一谈。[固定版本源码](https://github.com/mateicanavra/civ7-modding-tools/blob/e73bbbd5f2301922f7204b694ed7cf9ba047bc44/packages/civ7-direct-control/src/session/socket.ts)

本次没有找到能作为反例的公开实现：仅订阅 Civ VII Workshop 项目，便自动运行原生 helper 并建立 UI 通信。检索到的桌面 mod manager、存档编辑器与调试客户端都不能填补这个证据缺口。

## 6. 对当前开发的决定

1. 继续优先验证原生存档/配置载入入口。它们是真正由游戏托管的现有接口，可以满足普通玩家的安装要求；这份报告不重复讨论解析算法。
2. 保存可在游戏 JS 中运行的解析与转换核心。它解决计算部分，但还需要受支持的文件输入/原生载入路径。
3. 保留已经通过的原生配置文件信号测试，作为无需调试端口的通信候选证据。不要把 HTTP/WS 的测试失败扩展为所有通信不可能；也不要把文件通信成功扩展为 helper 自动启动或完整导入成功。
4. 不把“附带 exe + localhost”或“附带 exe + 文件通信”设为已可交付的默认方案：必须分别证明 **自动启动/加载入口、正常通信、无需开发设置的干净环境**，缺少任何一项都不能叫装上即用。
5. 若发现具体官方入口或真实开源实例，再针对那个入口做最小测试。当前没有依据去反复猜 engine.call 名字、尝试注入、改系统启动项，或让用户开启调试端口来掩盖缺口。

## 证据范围与保存位置

- 本轮网页原文摘取、官方文档镜像快照、本机动作清单位于 `work/civ7-helper-research-20261022/`。仅下载/读源码，没有安装依赖或执行项目。
- Coherent 官网版本标注 3.1.4.1；本报告不假定这是 Civ VII 实际嵌入版本。
- 官方文档镜像 commit：`e73bbbd5f2301922f7204b694ed7cf9ba047bc44`；playbycloud commit：`1f39787fffe97d4bb7630e0a2fa46508d5a84a7d`。
- 主线程每项实机测试之前均完整备份 Saves 并核对相对路径、大小及 SHA-256；备份位于仓库和游戏目录外的 `~/Documents/Civ7-save-backups/`，每次使用独立时间戳。
- `work/bundled-helper-probe-20261022/save-preservation.json` 记录最终复核：原有 327 个文件、1,373,458,119 字节的路径、大小及哈希全部未变。两个专用测试配置在完整测试后备份完成之后，按精确名称和哈希移到该备份的 `probe-artifacts/`；最终活跃 Saves 文件清单及哈希与测试前完全一致。没有删除或覆盖原始存档。
- 本轮未加载/启动对局、未更新安装中的 mod，也未修改调试设置。临时通信服务和文件监听器已结束。
- 未穷尽未公开代码、Discord、所有 Workshop 内容及未来版本。“未找到受支持的启动入口”是有边界的调查结果，不是宣称数学上的不可能。
