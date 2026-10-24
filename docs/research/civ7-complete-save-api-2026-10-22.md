# Civ VII 完整存档内容读取入口复核

日期：2026-10-22。任务：寻找普通 mod 在玩家选中一个 `.Civ7Save` 后，取得完整开局配置或原始文件字节的入口。本文只做离线源码、静态二进制、官方文档及真实项目核对；没有连接游戏、运行未知 native 调用、安装模组、读取 `local-connection.js`，也没有读写用户 Saves。主线程提供的实测结果在下文单独标注。

## 当前结论

**这轮仍未找到已证实的“任选磁盘存档 → mod 取得完整字节/原始开局配置”接口，也没有新的、有源码依据的 Saves → `fs://` URL 可以推荐。** 已经进一步排除了两种误判：读档界面没有丢弃一份本来完整的配置；公共 TypeScript 声明仓库也没有补出一个未经注意的 native 文件读取 API。

本轮主线程追加只读测试后，有依据的结果和剩余候选为：

1. **已通过：** XHR `responseType="arraybuffer"` 能无损读取已挂载游戏资源，54,398 字节及 SHA-256 与原件一致。不能由此宣称存档目录已可访问。
2. **已确认：** 带 LOAD_METADATA 的原生列表返回 105 条、55 个字段；path 都是绝对路径，additionalInfo 都为空；没有种子、纪念物、完整配置或 bytes/payload 字段。
3. 对当前已经载入的对局读取已知 Configuration getter，调查是否有原始配置键；这只能研究当前对局，不能读取其他未载入存档。
4. **已确认存在、未调用：** 新发现的 `ReflectionArchives` native 库暴露于当前对局 UI；其函数缺少公开使用合同，**本报告不建议在进行中对局试调用反射遍历或任何写函数**。

原生配置文件的请求/回复信号已经有独立证据，但“传话成功”不提供 helper 自动启动入口。原生 `Network.loadGame` 的专门配置分支仍是另一条研究方向，本文不把它的失败等同于文件读取绝无可能，也不建议在当前对局测试载入。[前一份生态报告](civ7-save-import-ecosystem-2026-10-21.md)、[附带组件与通信报告](civ7-bundled-helper-2026-10-22.md)

## 1. 读档列表是否偷偷带着完整配置

### 原版 JS：保留了原始结果

本机原版根目录 `M` 为：

`/Users/sunmer/Library/Application Support/Steam/steamapps/common/Sid Meier's Civilization VII/CivilizationVII.app/Contents/Resources/Base/modules/`

`M/core/ui/save-load/model-save-load.js` 的直接证据：

- 12–65 行：`DEFAULT_FILE_QUERY_ENTRY` 包括路径/文件描述、创建与保存时间、当前回合、领袖/文明/时代、地图类型/尺寸、难度/速度、规则集和启用/必需模组。没有种子、纪念物、完整 game/map/player 配置或文件字节。
- 194–200 行：原生 `GameStateStorage.querySaveGameList` 请求传入 Location、Type、LocationOptions、ContentType、ForceRefresh。
- 203–207 行：`FileListQueryResults` 的 `fileList` 原样成为 `QueryDoneEvent` 内容。
- 292–306 行：用于界面的 `SaveGameInfo` 最后使用 `...file`，保留原始条目的所有 enumerable 自有字段；不是只挑选几个简介字段。
- 400–431 行：载入时把文件描述及 `additionalInfo` 交还原生 `Network.loadGame`；没有对 `additionalInfo` 做 JSON/二进制配置解码。

对应 `.js.map` 内嵌的是 Firaxis 原始 TypeScript：`SaveGameInfo extends FileQueryEntry`；但 `FileQueryEntry` 的 native 定义不在该 source map 内。**默认对象不能独自证明引擎永远只返回这些字段**，所以本轮又核对了 native 构造结果的函数。

### 原生结果构造：字段表与简介一致

本机 ARM64 游戏程序的 `0x1003e357c–0x1003e4a68` 是向脚本构造存档条目的函数。已保存静态反汇编和字符串引用：

- `work/civ7-save-api-research-20261022/query-entry-bindings.asm`
- `work/civ7-save-api-research-20261022/binding-string-references.json`

它明确注册/填充的字段涵盖上述简介，另外还包括 `tunerActive` 和 `isLiveEventGame`。模组数组条目的内容是 `ID/title/subscriptionID`。在该完整函数范围中，没有发现完整配置容器、raw bytes、随机种子、纪念物或每位玩家完整配置字段。

同版本 `GameStateStorageLibrary` 注册函数 `0x1003e3388–0x1003e357c` 的方法为：

`querySaveGameList`、`closeFileListQuery`、`closeAllFileListQueries`、`getGameConfigurationSaveType`、`getFileExtension`、`doesPlatformSupportLocalSaves`、`isPlayerSaveOwner`。

这与主线程此前对原型的实测一致，没有新增的命名明确的 byte/file/config getter。有限范围的静态和运行时枚举不是对所有未公开库的穷尽证明。

### LOAD_METADATA 的真实含义不能扩大

`M/core/ui/shell/main-menu/main-menu.js:1153–1159` 用：

`AUTOSAVE | NORMAL | QUICKSAVE | SaveLocationOptions.LOAD_METADATA`

作为列表查询的 `LocationOptions`。这给“按原版拿足列表元信息”提供了明确范例。它**不是**“把整个存档内容作为 metadata 返回”的承诺，native 条目构造仍是上述字段表。`SaveOptions` 中有同名或相关标志，也不能据名称互换两种枚举、传给未经确认的载入调用。

安全的小测范围是：使用已知列表 API、自己的 query id 和原版选项，接收 raw `fileList`，记录字段名、值类型及有界长度；只关闭自己的查询。不要为了观察列表而调用 load/sync/remove。即使 `path` 是真实 OS 路径，也还需要另一个已支持的读取 API，不能直接假设把它拼成 `fs://game/...` 就可以读取。

**主线程追加实测已经完成这一项。** `work/https-save-api-probe-20261022/save-api-result.json` 记录 105 条存档、55 个字段，含自有属性与原型形状；没有 seed/memento/config/bytes/payload 字段。所有 path 都是 absolute-path，additionalInfo 全空。GameStateStorage 原型仍只有上述 7 个方法。这加强了“查询仅给简介”的结论，但没有把绝对路径转换成可用的 UI 文件 URL。

## 2. XHR 能读二进制，但 URL 必须由游戏宿主支持

### Coherent 官方能力与 Civ VII 路由是两层

Coherent 的 XHR API 文档明确列出 `responseType`、`response`、`responseArrayBuffer()` 和 `responseBlob()`；因此二进制读取能力有官方依据，不必依赖 `FileReader`。同时，资源请求的文件读取由游戏 C++ 的 `IAsyncResourceHandler::OnResourceRequest` 实现；官方示例中的 `ReadFileFromDisk` 是**宿主自行实现的函数**，不是 mod JS 能直接调用的全局接口。[XHR API](https://docs.coherent-labs.com/cpp-gameface/api_reference/classes/interface_x_m_l_http_request/)、[资源请求宿主集成](https://docs.coherent-labs.com/cpp-gameface/integration/asyncresourceresponses_native/)

这些当前公开文档标注版本 3.1.4.1，不能假定 Civ VII 的嵌入版本和所有实现细节相同。

### 目前有依据的本机路由

此前已保存的原生资源路径函数 `0x1004df1a4–0x1004dfa5c`（`work/civ7-save-research-20261021/native-static/resource-path.asm`）含 `fs/coui`、`live`、`blp` 的处理，以及 filesystem host `game/cache/steam` 的分支。该函数有明确的无 host 报错，要求形如 `fs://game/`。

本轮进一步确认 `cache` 分支引用 `DNA/Textures`，位置为 `0x1004df4fc`。它有纹理缓存限定/检查逻辑，不能当作用户目录的通用映射。`steam` 分支本身也不等于 `STEAM_CLOUD` 存档类型；两个名称属于不同系统。

本轮对 `Resources/Base`、`Resources/DLC` 的 XML、SQL、JSON、INI、modinfo 和文本配置搜索，没有找到把 Saves 挂载为 UI 资源路径的配置。原版 UI 文件中也没有从 `fs://cache` 或 `fs://steam` 读取存档的调用范例。**因此本报告不提供猜测的 `/Users/...`、`../`、`file://` 或不存在的 `fs://saves` 路径。**

`ImportFiles` 能把 mod 自带资源放入游戏资源系统，不能自动把玩家任意已有存档挂进去。官方动作文档的镜像也只说明资源导入/替换，没有任意用户文件选择器或存档挂载 API。[官方动作原文镜像，固定版本](https://github.com/mateicanavra/civ7-modding-tools/blob/e73bbbd5f2301922f7204b694ed7cf9ba047bc44/apps/docs/official/guides/modinfo-files-actions.mdx)

### 主线程 2026-10-22 新实测

我只读取了主线程落盘结果：`work/https-save-api-probe-20261022/https-ingame-c35aaed4.json`。测试在 `root-game.html`，没有切换界面或载入/保存；前后仍在对局，Configuration 未变。

- `fs://game/core/ui/component-support.js`：XHR 200，54,398 字符，内容标记吻合。
- 两个外部 HTTPS echo 服务、GET/POST 共四项：游戏侧均 404、空响应、约 1–2 ms；同一测试的外部正对照均 200 且 echo 标记吻合。
- WSS：外部正对照成功，游戏侧超时、未 open。

它证明当前测试上下文能正常使用 XHR 获取一个已挂载的游戏资源，不能从构造器存在推出能直接访问互联网，更不能从联网失败推出所有原生通信都失败。请求没有传输用户存档。

**主线程追加实测已完成二进制正对照。** 同一个 `fs://game/core/ui/component-support.js` 设置 `responseType="arraybuffer"` 后得到真正的 ArrayBuffer，54,398 字节，SHA-256 为 `e0cb9938e9bace5b08659199bffa56ef225b1198214f0d02c1b566a4109ca056`，与磁盘原件一致。官方当前文档中的 `responseArrayBuffer()` 在这个构建中不存在；原型有内部 `_responseArrayBuffer` 名称，但没有试调内部方法。结果记录于 `save-api-result.json`。因此这里可正式确认“已挂载资源二进制读取通过”，不能据此宣传“存档字节读取通过”。

还有必须保留的已知事故边界：`mods/civ7-play-again/docs/validation-2026-10-18.md:84–90` 记载早前在进行中的对局发起 `file://` 存档副本请求后，游戏的 `cohtml::resource 1` 线程发生空指针崩溃，时机吻合、未重复确认因果。该路径本轮没有重试，之后也不能把“只读”当作安全理由再次试探。

## 3. 当前对局的 Configuration 与原始开局快照

原生 `ConfigurationLibrary` 注册函数 `0x1003ce130–0x1003ce3a4` 提供 getGame/editGame、getMap/editMap、getPlayer/editPlayer、getUser、getDebug、getXR。已保存 `work/civ7-save-api-research-20261022/configuration-bindings.asm`。没有在这一注册表里找到 `getInitialConfiguration` 或“指定存档路径”的 overload 名称。

有源码依据的已知只读入口包括 `Configuration.getGame()`、`getMap()`、`getPlayer(id)` 及其 getValues/getValue；它们对应当前 App 配置。已经载入某局后可读取该局的一些完整设置值，但**当前配置不能自动等同于整个战役最初开局快照**。

原版使用 `campaignStartAgeType` 和 `previousAgeCount`，例如 `M/base-standard/ui-next/screens/victories/victories-screen-model.js:709–714`；暂停菜单的 `startAgeType` 是另一个字段（`pause-menu-model.js:254`）。native 还注册 getPreviousAge/getPreviousCivilization。它们说明有部分历史信息，不证明包含原始纪念物、完整原始玩家配置或所有 mod 参数；历史序列顺序也不能未经验证就假定。

特别排除几个相近名字：

- `saveCheckpoint/restoreCheckpoint` 在原版由 `Configuration.getUser()` 调用，服务于选项界面的音画设置撤销，见 `M/core/ui/options/model-options.js:135–139、235–241`；不是任意存档的开局快照。
- `loadConfiguration/saveConfiguration` 的 native 邻近注册属于 `VisualRemapsLibrary`；原版调用 `VisualRemaps.saveConfiguration()`，见 `M/core/ui/options/screen-options.js:171`。
- `loadAsset` 是 WorldUI 视觉资源预加载，见 `M/core/ui/shell/main-menu/main-menu.js:1937–1940`。
- `loadJSON` 位于 `AppAutomationLibrary`，邻近 `copyAutosave` 等测试工具；没有原版 UI 读取存档用法，不能据名字把它当二进制通道。
- 原生 `getConfiguration` 字符串在 `GameVictoryManagerLibrary` 的注册附近，原版实际用来读取启用的胜利条件，见 `M/base-standard/ui/endgame/model-endgame.js:71`；不是通用存档 getter。

可选的只读研究是检查当前 getter 返回的键和类型，特别是否出现已经由外部解析确认的 `InitialConfiguration` 容器。但若没有，不能反复猜字符串调用未知引擎函数；也不应通过先载入其他存档来把“当前配置 getter”包装成不影响对局的读取功能。

## 4. 新线索：ReflectionArchives；尚不能作为方案

本轮离线检查发现二进制中有明确的 `ReflectionArchivesLibrary` 和 `ReflectionArchives` 注册，不只是搜索到孤立文本。注册函数位于 `0x100e74a70–0x100e74d0c`，对象挂载函数附近为 `0x100e73428–0x100e73494`。

已注册名称包括 `get`、`getByComponentID`、`getRoot`、`getRootByName`、`getGame`、`getMap`、`getPlayers`、`getPlayer`、showVerboseValues/setVerboseValues。档案对象的相邻注册字符串还有 getParent/getChildren/getChild/getMember/getMemberValueString/getMemberValueHash，**也有** setMemberToDesync/scrambleMemberValue/setMemberToLogHash 等调试修改能力。

证据保存在 `work/civ7-save-api-research-20261022/reflection-archives-bindings.asm`、`binding-string-references.json` 和 `gamecore-config-xrefs.json`。

本机原版 JS 没有该库的调用范例；本次主来源搜索没有找到公开接口文档或作者的可运行读取实现。**主线程追加存在性检查已确认当前 `root-game.html` 中 ReflectionArchives 是 object，上述方法在原型上；没有调用其中任何函数。** 仍不知 getter 返回值的确切结构、在不启用开发设置的普通环境中是否一样、是否能访问初始设置。名称和附近的 `Game::Instance/Map::Instance` 更像当前游戏状态反射，**没有任何证据表明它能打开某个磁盘存档**。

存在性检查已足够，不需要重复。不要猜 getRoot 的参数，不要递归遍历未知 native 图，不要试任何 set/scramble 方法。进一步调用应先找到或离线确定签名、边界和实现，不属于当前进行中对局的建议小测。

## 5. 公共类型声明和作者项目没有补上该入口

### 类型声明的来源边界

`mateicanavra/civ7-modding-tools` 的 `@civ7/api` 自述是带来源记录的 API projection。本次固定 commit `e73bbbd5f2301922f7204b694ed7cf9ba047bc44`。`src/provenance.ts` 明确记录生成输入是原版 source map 的 embedded TypeScript，且列出 `runtime-availability/lifecycle/loading-realm/absent-module-definitions` 等非承诺。[来源记录](https://github.com/mateicanavra/civ7-modding-tools/blob/e73bbbd5f2301922f7204b694ed7cf9ba047bc44/packages/civ7-api/src/provenance.ts)

其生成的 `model-save-load.d.ts` 仍写 `SaveGameInfo extends FileQueryEntry`，没有给出一个额外 native 文件 getter。该文件是有用的原版 UI 模块投影，不能把任何 `any` 或未解决的 native 全局类型当成受支持 API。[生成声明](https://github.com/mateicanavra/civ7-modding-tools/blob/e73bbbd5f2301922f7204b694ed7cf9ba047bc44/packages/civ7-api/src/generated/modules/Base__modules__core__ui__save-load__model-save-load.d.ts)

Policy Yield Previews 的作者提供 `types/engine.d.ts` 社区声明，便于其 UI/gameplay 代码开发；其中宽泛索引签名不是 native 能力承诺。本轮没有从该主来源找到完整存档读取接口。[作者声明文件](https://github.com/rockfactory/civ7-lf-policies-yields-preview/blob/main/types/engine.d.ts)

### 已存在解析器的文件入口仍在外部

前报告已核对的 Node 解析器、网页编辑器和 playbycloud，分别通过 Node/Rust 的文件 API 或正常浏览器文件选择器取得字节。playbycloud 的 companion 使用原生存取，而外部 agent 监听文件；它没有提供纯 mod 打开原始字节的新 API。[playbycloud 作者说明](https://github.com/jnazzar1/civ7-playbycloud/blob/1f39787fffe97d4bb7630e0a2fa46508d5a84a7d/mod/NOTES.md)、[存档解析器作者源码](https://github.com/pydt/civ7-save-parser/tree/12fd8598283cc32cb9270b326bc8ebf393f5b59c)

没有把 FireTuner/CDP/MCP 开发工具的 `read_file/list_saves` 之类宿主方法混入游戏 mod API。那些工具本身在游戏外运行并取得文件系统权限，无法由同名函数推导普通模组具有相同能力。

## 6. 下一步的明确边界

| 候选 | 已知依据 | 这轮可以回答的问题 | 仍不能证明 |
|---|---|---|---|
| 已知 `fs://game` 资源的 XHR 二进制返回 | Coherent API + 原版读取 + 实测散列一致 | 已确认当前环境能无损拿到已挂载资源字节 | Saves 可达、任意存档可选 |
| 带 LOAD_METADATA 的原生列表 | 原版用法 + native 构造 + 实测 105 条 | 已确认 55 字段、绝对 path、空 additionalInfo | 全量配置、种子、纪念物 |
| 当前对局 Configuration 的已知 getter | 原版 UI + native 绑定 | 当前设置、部分战役历史及具体键 | 其他存档、原始开局全量快照 |
| ReflectionArchives 存在性 | native 注册 + 实测原型 | 已确认当前 UI 暴露该对象，函数未调用 | 安全遍历、原始配置、文件读取 |
| 原生配置文件信号 | 前一轮请求/回复已通过 | mod/helper 可通过配置文件传递最小消息 | helper 自动启动、完整导入 |

当前没有依据推荐新的磁盘读取 URL，也没有依据建议为了“试试看”更改游戏状态。若上述只读检查仍没有完整数据入口，正确的产品状态是保留已验证的解析与 UI 成果，继续离线研究原生加载分支；不能把“装上就能直接读取任意旧存档”标成已完成。

本机静态二进制 SHA-256 记录沿用前轮：`55642f4d349a617242e5610d3458341b7af254a9eecb4eb2955d0cbc097c5ac7`。所有地址只适用于这个构建；不是可在其他版本调用的稳定接口。研究证据位于 `work/civ7-save-api-research-20261022/`，没有修改原报告或主 mod 源码。
