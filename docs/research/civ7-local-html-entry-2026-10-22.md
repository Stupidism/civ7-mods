# Civ VII 与单文件 HTML 存档转换入口

日期：2026-10-22。本轮只查本机原版源码、已有解析器与公开文档，没有操作运行中的游戏或用户 Saves。

## 两个问题应分别判断

1. **用户用普通浏览器打开自含 HTML 后能否解析存档：有标准 Web API 支持。** 用户通过文件选择框或拖放交出一个 File，脚本读取其字节并本地解析；不必启动服务器或 Node/Python。当前项目已有不依赖宿主文件系统的 JS 解析与转换核心，可据此做单文件页面，但本轮没有实现新的页面或验证整条游戏回填流程。[File API](https://developer.mozilla.org/en-US/docs/Web/API/File_API)、[读取二进制](https://developer.mozilla.org/en-US/docs/Web/API/Blob/arrayBuffer)
2. **游戏中点击一个链接能否直接唤起浏览器并打开 mod 内 HTML：尚未证实。** 能画出链接/按钮，不代表游戏宿主会把任意 file URL 交给操作系统。

## 本机原版外链检查

检索安装中 `CivilizationVII.app/Contents/Resources/Base` 与 `DLC` 的源码和资源定义（排除二进制及 source maps），未发现任意 URL 的浏览器启动用例。唯一匹配是 `Base/modules/core/ui/components/fxs-link.js`：

- 第 7 行读 `url` 属性作为名称。
- 第 9 行调用 `Network.openURLFromType(URLType[key])`。
- 第 20 行将该属性描述为预定义 URL。

这说明原版组件按枚举选择链接；不提供可以传入本地 HTML 路径的证据。未调用该接口试探任意参数，未尝试 `file://` 游戏资源请求，未修改任何原版文件。检索未找到，不等于所有未公开 native 入口绝不存在。

## 不依赖助手的可实施候选流程

随 mod 附带一个自含 HTML，用户双击打开 → 选择一份存档 → 本地解析 → 输出一组配置。回到游戏有两个候选交接方式：

- 文本配置码：用户复制并粘贴到 mod，mod 校验并设置新建参数。社区已有有限字段的文本导入实现，本项目完整字段回填尚需开发和测试。
- `.Civ7Cfg` 下载：页面生成字节并提供下载；用户保存到游戏能发现的配置位置，再通过原生界面读取。浏览器下载链接不能保证自动写进特定游戏目录。[download 属性](https://developer.mozilla.org/en-US/docs/Web/API/HTMLAnchorElement/download)

本地页面不能通过已知能力直接控制游戏 UI；“只需打开 HTML，不安装助手”可作为产品方向，“打开 HTML 即自动读档并回填”尚不成立。网页只获得用户主动选择的文件，不能擅自按预置完整路径打开旧档。[文件选择限制](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/file)

## 打包注意

- 将自有解析器、样式和界面打包进同一个 HTML；避免 `file://` 下外部 ES module 导入、fetch 邻近文件等浏览器来源限制。[本地文件来源](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy)
- 不需要联网，不需要上传原始存档。OCR 若加入，需另外评估内置依赖和模型体积，不能从存档读取成功推断 OCR 已可用。
- 复制操作保留普通可选文本作为基础路径，不依赖自动剪贴板访问或额外剪贴板授权。
- 浏览器能力细节见同日 `civ7-local-html-browser-2026-10-22.md`；现有解析核心位于 `mods/civ7-play-again/ui/save-reader.js` 与 `save-configuration.js`。

本轮交付的是可行性调查，未安装/运行辅助工具，未将候选页面作为已完成产品。
