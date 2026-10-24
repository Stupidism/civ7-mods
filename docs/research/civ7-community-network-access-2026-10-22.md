# Civ VII 社区项目是否实现游戏内任意联网

调查日期：2026-10-22。范围：原作者 GitHub 源码、作者网站、CivFanatics 与 Workshop 线索；不运行下载代码，不连接游戏，不触碰 Saves。源码快照仅用于阅读，保存在 `work/community-network-research-20261022/`。

## 结论

本轮没有找到可核实的“普通 Civ VII mod 的游戏内 JS 直接请求任意 HTTP/HTTPS/WebSocket 服务器”的成功实例。找到的真实联网项目都把网络工作放在游戏外：桌面客户端、Python 伴随程序、Node 工具或开发调试连接。

这个结论是已检索项目的结果，不等于证明所有版本、平台和未公开项目绝无入口。尤其不能把外部工具源文件里出现 `fetch`、`XMLHttpRequest` 或 `WebSocket`，当成游戏内 JS 能联网的证据。

## 已核实代码的项目

| 项目 | 游戏内做什么 | 网络请求在哪执行 | 附加要求 | 对本项目的意义 |
| --- | --- | --- | --- | --- |
| Play Your Damn Turn / PYDT Civ VII | 把当前玩家和回合写到 `GameTutorial` 属性，随存档交给外部程序 | Electron 桌面客户端 / 网站 | 安装客户端，或者手动网页上传下载 | 是“mod 写文件中间数据，外部程序联网”的现成生产项目；不是纯 mod 直接联网 |
| civ7-playbycloud | 自动保存，读取原生列表，协助切换回合 | Rust 桌面 agent 的 `ureq` | 单独运行桌面 agent；云服务 | 进一步支持本地文件通信方案，没有消除外部进程 |
| civ7-autopilot | 接受调试端口注入的 JS，用游戏操作 API 执行行动 | Python `urllib.request`、外部模型程序 | Python、FireTuner、模型服务等；示例针对 Windows Steam | 确实调用远程 AI，但 HTTP 调用不在 mod JS |
| FiretunerTerminal | 通过调试连接执行游戏 JS | Python TCP/CDP 客户端及 MCP 服务 | Python，EnableTuner；部分情况 CDP 9444 | 属于开发工具，不符合“只安装 mod” |
| civ7-live-player | 接受 Node 工具经 CDP 发来的 JS | Node `fetch` + `WebSocket` | Node、可用 Cohtml DevTools | WebSocket 调用存在，但运行地点是游戏外 |

### PYDT：新发现且源码边界明确

作者于 2026-06-25 的公告添加 Civ VII 支持，明确说 mod 用于限制每次一回合、把回合状态放入存档；其网站说明是桌面客户端检测存档并上传。2026-07-13 客户端更新提到的本地 HTTP 服务，不能误认为游戏内 mod 开放了网络。[作者公告](https://www.playyourdamnturn.com/changelog)、[官网使用流程](https://www.playyourdamnturn.com/)

代码审查固定版本：mod `200c5f3d223005c1278084d4e19fba0f8c9d5479`，client `0e58ac8f96adbd49f5ca5fef71b82905e5a1d562`。

- [modinfo](https://github.com/pydt/civ7-pydt-mod/blob/200c5f3d223005c1278084d4e19fba0f8c9d5479/pydt-hotseat-support.modinfo)只导入两个 UI 替换文件；所见完整两个 JS 文件没有 XHR、fetch 或 WebSocket。
- [hotseat-curtain.js 第 184 行附近](https://github.com/pydt/civ7-pydt-mod/blob/200c5f3d223005c1278084d4e19fba0f8c9d5479/ui-next/screens/hotseat/hotseat-curtain.js#L184)的保存处理器用 `GameTutorial.setProperty("PYDT", JSON.stringify({player,turn}))`，再调用原生保存界面。这里没有读取完整文件或上传。
- [客户端 turnApi.js](https://github.com/pydt/client/blob/0e58ac8f96adbd49f5ca5fef71b82905e5a1d562/app/src/turnApi.js#L1)导入 `node:http`、`electron-log`，在 Electron 主进程里监听 `127.0.0.1:47821`，提供 GET `/turns`。这是供外部程序查询的客户端服务。
- [客户端 turnCacheService.ts 第 90 行附近](https://github.com/pydt/client/blob/0e58ac8f96adbd49f5ca5fef71b82905e5a1d562/ui/shared/turnCacheService.ts#L90)的 XHR 下载存档运行在桌面客户端 UI；接着调用 `window.pydtApi.gunzip`。此 UI 不是 Civ VII 的 Cohtml UI。
- [独立 civ7-save-parser](https://github.com/pydt/civ7-save-parser/blob/master/src/index.ts#L1)导入 Node `fs.readFileSync`，命令行入口读取用户给定路径。源码确实能解析文件，但不解决游戏内取得文件字节的入口。

### civ7-autopilot：远程 AI 是外部 Python 发起的

固定版本 `fe4e65f047376b2a2f7acc3b3d66dbefd0e00e80`。

[jev.py 第 49–56 行](https://github.com/petershk/civ7-autopilot/blob/fe4e65f047376b2a2f7acc3b3d66dbefd0e00e80/jev.py#L49)在 Python 中构造 HTTPS POST 并 `urlopen`；[tuner.py 第 4–14 行](https://github.com/petershk/civ7-autopilot/blob/fe4e65f047376b2a2f7acc3b3d66dbefd0e00e80/tuner.py#L4)用 Python socket 连 `127.0.0.1:4318`；[autopilot.py 第 99–114 行](https://github.com/petershk/civ7-autopilot/blob/fe4e65f047376b2a2f7acc3b3d66dbefd0e00e80/autopilot.py#L99)甚至会由外部进程改 `AppOptions.txt` 中的 `EnableTuner 1`。它能自动化配置，不代表 mod 获得了配置或启动进程权限。

### 其他已知工具的源码复核

- civ7-playbycloud，版本 `1f39787fffe97d4bb7630e0a2fa46508d5a84a7d`：[mod 自动保存代码](https://github.com/jnazzar1/civ7-playbycloud/blob/1f39787fffe97d4bb7630e0a2fa46508d5a84a7d/mod/ui/civ7pbem-autosave.js#L55)只调用 `Network.saveGame`；[Rust api.rs](https://github.com/jnazzar1/civ7-playbycloud/blob/1f39787fffe97d4bb7630e0a2fa46508d5a84a7d/client/src/api.rs#L310)负责上传。作者 [NOTES](https://github.com/jnazzar1/civ7-playbycloud/blob/1f39787fffe97d4bb7630e0a2fa46508d5a84a7d/mod/NOTES.md#L35)也明确记录其 mod 的文件、socket、process IO 限制。对限制的绝对措辞属于该作者结论，本报告不外推为所有版本事实。
- FiretunerTerminal，版本 `35d08e12e0d875f335cd295fced316f05fa7f2a9`：[README](https://github.com/ghost-ng/FiretunerTerminal/blob/35d08e12e0d875f335cd295fced316f05fa7f2a9/README.md#L76)要求开启 FireTuner；[cdp.py](https://github.com/ghost-ng/FiretunerTerminal/blob/35d08e12e0d875f335cd295fced316f05fa7f2a9/civ7_terminal/cdp.py#L38)在 Python 中发现调试目标、创建 WebSocket。
- civ7-live-player，版本 `ff1347241d4e998d771c2fccc25eadd006dcf738`：[civ7-live-devtools.mjs](https://github.com/windwhinny/civ7-live-player/blob/ff1347241d4e998d771c2fccc25eadd006dcf738/scripts/civ7-live-devtools.mjs#L3)从 Node 端请求 `/json/list` 并连接 CDP；[README 前置条件](https://github.com/windwhinny/civ7-live-player/blob/ff1347241d4e998d771c2fccc25eadd006dcf738/README.md#L10)要求游戏 DevTools 可用。

## 有价值但还不能复用的线索：LocalStorage.sqlite 桥接

Bruno-BRG 的 Civilization VII AI [作者架构文档](https://raw.githubusercontent.com/Bruno-BRG/game-playing-ai-civilization-vii/main/docs/architecture.md)说 Cohtml 阻止 loopback HTTP，于是让游戏脚本和 Python companion 通过游戏 `LocalStorage.sqlite` 交换 observation/decision，由 companion 调 NVIDIA HTTPS API。

[作者 README](https://raw.githubusercontent.com/Bruno-BRG/game-playing-ai-civilization-vii/main/README.md)要求安装 uv/Python 依赖、设置 NVIDIA key、安装 add-on，再另行运行 `uv run civ7-ai bridge`；[pyproject](https://github.com/Bruno-BRG/game-playing-ai-civilization-vii/blob/main/pyproject.toml)的 CLI 入口是 `civ7_ai.cli:main`。所以即使桥接有效，也没有解决外部程序自动启动。

证据限制：本轮网页搜索缓存可读上述作者文件，但实时 GitHub 仓库、API tree、raw CLI 源码抓取均返回 404。没有取得桥接实现，**不能确认 SQLite 表名、localStorage 键、是否误覆盖共享 `modSettings`、外部写入是否实时可见、锁竞争或 macOS 兼容性**。不把它当成已核实可直接移植的代码，只列为值得独立验证的设计线索。未对用户的 LocalStorage.sqlite 做任何操作。

## 对本项目的判断

1. 没有找到足以推翻本机 HTTPS 实测结果的普通 mod 示例。
2. 社区有成熟的间接路径：游戏 mod 用原生存档或持久化属性交接数据，游戏外的程序读文件并联网。这与现有配置文件通信原型属于同一类架构。
3. `LocalStorage.sqlite` 可能让交接更轻量，但仍需要外部程序，且未经源码和实机核验，不能承诺替代当前已验证方案。
4. 任意 HTTPS、任意文件读取和自动启动进程是三个不同能力；找到其中一个接口也不能默认另两个成立。

## 检索边界

检索关键词覆盖 Civ7/Civilization VII + WebSocket、XMLHttpRequest、fetch、localhost、HTTP API、network sandbox、Twitch、Discord webhook、AI bridge，并追查作者仓库运行入口。论坛、Workshop、Nexus 的泛用页面常把其他游戏内容混在结果里；未把 Skyrim 或 Civ VI 项目当作 Civ VII 证据。未找到公开可核实的纯 mod 正例，未访问私人 Discord、未联系作者、未安装新工具或修改游戏设置。
