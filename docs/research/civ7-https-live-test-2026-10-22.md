# Civ VII 外网 HTTPS 与存档接口实测

日期：2026-10-22。用户要求先完整备份存档，再实测外网 HTTPS，同时继续寻找完整存档读取接口。

## 结果

**本机当前 Mac 构建的对局 UI 中，直接使用 XMLHttpRequest 调用外网 HTTPS 未成功。** 两个独立域名的 GET/POST 共四项请求全部得到空响应、状态 404；同一台电脑上的外部客户端对相同请求全部返回 200，并正确回显随机测试标记。加密 WebSocket 的外部对照成功，游戏端则在 8 秒内未建立连接。

**JS 能无损读取游戏已挂载的资源文件；尚未找到读取任意完整存档的已验证入口。** 本轮带详细信息的原生查询返回 105 条记录、55 个字段，未包含种子、纪念物、完整配置或文件字节。此结果不等于证明所有未公开 API 都不存在。

本轮没有部署服务器、上传存档、修改产品代码/安装目录/调试设置，也没有退出对局、载入存档、保存游戏、创建世界或推进回合。只执行了测试请求、已知资源读取、API 名称检查和原生存档列表查询。

## HTTPS 测试方法与证据

环境实际为 `fs://game/root-game.html`，不是主菜单。已存在的 CDP 仅用于运行开发测试代码并收集结果；真正的请求由游戏 UI 中的 `XMLHttpRequest` / `WebSocket` 发起，没有让外部程序代替游戏请求后伪装成功。

测试端点：`https://httpbingo.org/anything`、`https://httpbin.org/anything`。仅发送随机的 `civ7-https-test-...` 字符串，POST 使用 `text/plain`，不带账号令牌、存档内容、文件路径或游戏设置。端点用途见 [httpbingo 官方说明](https://httpbingo.org/) 和 [httpbin 作者服务](https://httpbin.org/)。

| 对照/请求 | 电脑端 | 游戏端 |
|---|---|---|
| httpbingo HTTPS GET | 200，标记匹配 | 404，响应为空，约 1 ms |
| httpbingo HTTPS POST | 200，方法和内容匹配 | 404，响应为空，约 2 ms |
| httpbin HTTPS GET | 200，标记匹配 | 404，响应为空，约 2 ms |
| httpbin HTTPS POST | 200，方法和内容匹配 | 404，响应为空，约 2 ms |
| `wss://httpbingo.org/websocket/echo` | 建立连接并回显匹配 | 8 秒超时，未触发 open |
| `fs://game/core/ui/component-support.js` | 本机原件作校验基准 | 200，54,398 字符，内容标记匹配 |

游戏日志将四项 HTTPS 记为 `ResourceRequestJob | Failed loading resource`。这支持当前宿主没有正常完成这些 URL 请求，不能仅凭 404 断言远端服务器收到请求后拒绝。我们没有两个公共服务的服务器日志，尚未进一步区分宿主路由、网络支持或策略原因。

Coherent 的 [XHR API](https://docs.coherent-labs.com/cpp-gameface/api_reference/classes/interface_x_m_l_http_request/) 列出 XHR 接口；[资源响应](https://docs.coherent-labs.com/cpp-gameface/integration/asyncresourceresponses_native/) 和 [WebSocket 接入](https://docs.coherent-labs.com/cpp-gameface/integration/optional_features/websockets/) 文档说明具体处理需要宿主实现。公开引擎文档不等于 Civ VII 当前构建开放了同等能力。

证据：

- `work/https-save-api-probe-20261022/https-probe.mjs`：可复核测试代码。
- `work/https-save-api-probe-20261022/https-ingame-c35aaed4.json`：有效实测及全部正向对照。
- `work/https-save-api-probe-20261022/https-log-excerpts.txt`：仅包含测试标记的日志行。
- `https-result.json`：初次仅完成外部对照，因当前无主菜单而未执行游戏请求。
- `https-ingame-result.json`：第一次对局探测在记录配置快照时遇到 BigInt 序列化错误，尚未执行网络请求；修正测试记录器后才取得上表有效结果。不能把这两次准备失败算成网络失败证据。

测试前后 Configuration 快照一致，始终为 `inShell=false`、`gameStarted=true`。没有改动 UI 页面或启动另一局。

## 存档读取接口补验

按原版 `main-menu.js:1153` 的查询方式，使用 `SaveLocationOptions.LOAD_METADATA`，以及 NORMAL/AUTOSAVE/QUICKSAVE 类别查询本地单人普通存档。只订阅并关闭本测试自己的查询，不关闭其他 UI 查询，不调用 save/load/delete。

实际返回 105 条记录、55 个字段。除自有字段外，也检查了原型上的属性描述。所有 `path` 都是绝对路径，所有 `additionalInfo` 都是空字符串；存在文明、领袖、时代、难度、速度、地图名称和依赖清单等简介字段，没有种子、纪念物、完整初始配置或文件字节。

对已经证实可读取的资源 `fs://game/core/ui/component-support.js`，设置 `responseType='arraybuffer'` 得到 54,398 字节，SHA-256 为 `e0cb9938e9bace5b08659199bffa56ef225b1198214f0d02c1b566a4109ca056`，与磁盘原件完全相同。因此不是 JS 无法处理二进制数据。文档列出的 `responseArrayBuffer()` 方法在本机该对象上不存在，应以实测的标准 `responseType` 路线为准。

还发现 `ReflectionArchives` 对象确实存在，含若干游戏状态反射方法；本轮只检查名称，没有调用未明参数的函数。它尚未被证实能读取磁盘存档，不能作为功能已打通的依据。详细静态研究见 [完整存档 API 调查](civ7-complete-save-api-2026-10-22.md)。

此前 `file://` 读取存档副本曾与原生崩溃相关联，见 [事故记录](../../mods/civ7-play-again/docs/validation-2026-10-18.md)。本轮没有重复这一探测，也没有猜测 fs 别名或使用路径穿越。

证据：`work/https-save-api-probe-20261022/save-api-probe.mjs`、`save-api-result.json`。API 名称、原型描述、查询字段类型及资源字节哈希均已记录；测试没有导出存档内容到网络。

## 存档保全

所有测试前均将整个 Saves 复制到游戏目录和仓库之外的新时间戳目录，验证完整目录/相对文件清单、大小及 SHA-256，并检查复制期间源文件稳定。清单包含每个文件源路径、哈希、时间。

完整记录：`work/https-save-api-probe-20261022/save-preservation-summary.json`。备份位于 `~/Documents/Civ7-save-backups/`：

- `20261022-113108-383472-external-https-before-probe`：329 文件，1,386,931,714 字节。
- `20261022-113313-542931-external-https-before-ingame-probe`：330 文件，1,393,748,880 字节。
- `20261022-113400-322494-external-https-before-request-test`：330 文件，1,393,748,880 字节。
- `20261022-113731-144434-save-api-before-read-only-probe`：330 文件，1,393,748,880 字节。
- `20261022-113920-666254-save-api-after-background-tests`：331 文件，1,400,566,090 字节。

HTTPS 后复核与测试前完整清单及哈希相同。后续游戏仍处于对局中，存档复核发现一份自动存档更新；最终备份还多一份存档，没有缺失文件。因此不宣称整个会话前后所有活动存档完全不变。已保留所有测试前备份及最后完整状态，没有回滚、删除或覆盖用户存档，也没有测试新存档需要清理。

## 当前决定

当前不能把“mod 直接把存档发给服务器解析”列为已可用路线：已测试的 HTTPS/WSS 没有连通，完整文件输入也未打通。继续保留纯 JS 解析/转换核心和已经验证的原生配置文件信号通信；后续只有找到有依据的入口，才进一步测试。结论限于本机当前 Mac 构建及所测 UI 上下文，不冒充 Windows 或所有未来版本的结论。
