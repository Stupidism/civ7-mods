# 单文件本地 HTML 转换 Civ VII 存档的可行性

日期：2026-10-22。这里只查浏览器标准与厂商资料；没有操作游戏、用户存档或浏览器，也没有运行下载代码。

## 结论

可实现“随 mod 附带一个 HTML → 用户双击，在普通浏览器中选择一个存档 → 本地 JS 解析 → 下载新 `.Civ7Cfg` 或显示可复制的配置码”。不需要 Node/Python、本地服务、浏览器扩展或上传服务器。必须把解析器及所有运行依赖打包进 HTML，避免运行时导入旁边的 JS 文件。

这是浏览器能力层面的可行性，尚不是跨浏览器产品实测。它仍需要用户主动选择文件及保存/复制结果；不能承诺静默找到存档、写入游戏目录，或无条件“一键复制到剪贴板”。

## 能力与边界

| 环节 | 支持方式 | 必须注意 |
| --- | --- | --- |
| 双击 HTML 执行 JS | `file://` 页面中的内联普通 `<script>` | 不关闭浏览器安全设置，不要求启动本地服务器 |
| 选择存档 | `<input type="file" accept=".Civ7Save">`，一次一个；可增加拖放 | 由用户选择，不能由脚本预填真实路径 |
| 读取字节 | `await input.files[0].arrayBuffer()` | 读取选中的 `File`，不是 `fetch("file:///…")` |
| 本地转换 | 内联打包的纯 JS 解析/编码核心 | 不自动依赖 Node `fs`、外部模块、CDN 或网络 |
| 生成配置文件 | `new Blob([bytes])` → `URL.createObjectURL` → `<a download="名称.Civ7Cfg">` | 文件名只是建议；目录由浏览器/用户决定；下载后适时 revoke URL |
| 生成配置码 | 输出到可选择的 `<textarea>`，用户按 Ctrl/Cmd+C | 不依赖自动剪贴板读取或授权；游戏侧粘贴/长度/应用能力另行验证 |
| 自动复制按钮 | 可选 `navigator.clipboard.writeText`，失败则选中文本并显示复制快捷键 | 必须检测能力；用户手势、浏览器策略不同 |
| 直接访问/写入 Saves | 本方案不支持 | 完整路径不能由网页任意读取，下载属性也不能指定目录 |

### 文件选择与二进制读取

MDN 明确说明用户可用 file input 或拖放选本地文件，然后由 JS 处理；上传只是可选动作。`File` 是 `Blob` 的子类，继承 `arrayBuffer()`，得到文件全部二进制字节。它与从页面源 URL 发起跨域请求不是同一个机制。[File API 使用指南](https://developer.mozilla.org/en-US/docs/Web/API/File_API/Using_files_from_web_applications)、[File](https://developer.mozilla.org/en-US/docs/Web/API/File)、[Blob.arrayBuffer](https://developer.mozilla.org/en-US/docs/Web/API/Blob/arrayBuffer)

文件输入不能由脚本设置到任意路径，浏览器也隐藏真实路径；`accept` 仅帮助选择，应仍验证文件头、版本、长度和解析边界。[input type=file](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/file)

### 为什么要单 HTML 内联打包

WHATWG HTML 支持没有 `src` 的内联脚本；省略 `type` 时为普通脚本。MDN 说明 HTML 可直接双击打开，但 `file://` 加载 ES module 依赖会受 CORS 限制。因此构建时把现有模块打成单个内联普通脚本（例如 IIFE），运行时不保留静态/动态 import、fetch 本地依赖或远程 CDN。[HTML script 标准](https://html.spec.whatwg.org/multipage/scripting.html#the-script-element)、[MDN 本地文件](https://developer.mozilla.org/en-US/docs/Learn_web_development/Howto/Tools_and_setup/set_up_a_local_testing_server)、[MDN Modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)

### 下载和目录权限

`download` 支持同源 Blob URL；浏览器可能直接保存、显示保存对话框或按用户偏好处理。`download` 的 `/`、`\` 会转成下划线，不能把 `~/…/Saves/…` 当成输出目录。应明确让用户保存/移动到原生配置所在目录，或使用配置码路径。[MDN download](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/a#download)

另一套 File System Access API 可以直接读写用户选择的文件/目录，但需要用户授予访问，且兼容性主要在 Chromium；不能作为“无需额外目录授权、标准浏览器直接用”的基础路径。[Chrome 官方 File System Access 文档](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access)

### 剪贴板

不要把“`file://` 一定不是安全上下文”当作结论：MDN 将顶层本地 file URL 列为可能安全的环境。但 Async Clipboard 仍有用户激活、许可/提示和浏览器差异，不能保证每台机器自动复制无提示。以可选中配置码和普通复制快捷键作为可靠基础，自动复制只是增强。[Secure contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts)、[Clipboard API](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API)

同理，用户主动按 Ctrl/Cmd+V 触发的 `paste` 事件可以提供本次粘贴的数据；它和网页无交互调用 `navigator.clipboard.read()` 不同。截图粘贴可作为后续入口，但 OCR 引擎与模型的离线打包、体积及运行兼容性需要另外验证。[paste event](https://developer.mozilla.org/en-US/docs/Web/API/Element/paste_event)

## 对当前产品流程的意义

最少依赖的流程是：**浏览器选择存档 → 生成配置码 → 复制 → 回游戏粘贴并微调**。这样可免去输出配置文件的手动放置，但游戏输入框承载完整配置的长度、格式校验、参数应用和往返一致性仍需本项目实现与测试。`.Civ7Cfg` 下载保留为原生配置载入的备选。两种方案都没有赋予游戏 JS 新的网络或文件权限，也不提供后台自动同步。
