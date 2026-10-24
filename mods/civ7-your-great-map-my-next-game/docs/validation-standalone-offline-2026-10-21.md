# 0.3.2-dev 离线改动与纯 mod 调查

日期：2026-10-21。用户正在游戏并要求暂不测试；本轮没有连接游戏、更新已安装 mod、重启、载入对局或访问当前 Saves。本文不构成实机验收。

## 已完成的源码改动

- 新建第一页直接显示两个入口：读取设置文件、粘贴图片或文字；删除中间的来源选择框。
- 读档页只新增“以此设置新建游戏”，删除自定义另存配置和主动 DLC/MOD 检查按钮。
- 一次只解析一组配置。重复种子标签、多组编号、无法配对的种子拒绝导入，不混用不同组的数据。
- 文字可以在游戏内输入框中解析。粘贴事件不提供数据时保留原生输入行为；文字路径不访问辅助程序。
- 加载失败后使用游戏已有内容清单核对依赖。仅具体缺失项显示红色/黄色；没有查到依赖问题则只显示原加载错误。
- 二进制解析核心迁到 `ui/save-reader.js`，文件输入由调用方提供。核心使用普通 JavaScript；不调用 Node、Buffer、TextDecoder、文件系统、网络或游戏接口。旧工具只是该核心的主机包装。

## 离线证据

`node --test tests/*.test.mjs`：87 项通过。覆盖实际界面脚本的模拟游戏边界、单组解析、无辅助程序的文字路径、加载失败诊断、完整属性保留、64 位精度、非法编码拒绝与源字节不变。

以 `work/save-setup-probe/` 中已有的真实古典存档副本进行交叉复核：51 个游戏属性、16 个地图属性、64 个玩家槽位，与既有基线完全一致；95,222 字节起始配置原样保留。运行前后文件哈希相同。未读取用户正在玩的存档。机器记录为该目录的 `portable-reader-validation.json` 和 `standalone-offline-tests.txt`。

模拟游戏边界的测试不能确认 Cohtml 的真实布局、剪贴板行为或存档字节入口。它们也不能代替新局启动后的实机检查。

## 社区与官方资料

已找到并阅读社区解析器、浏览器编辑器和两套 Civ VII 开发 skill。具体来源、固定版本和原生大厅候选见[研究记录](../../../docs/research/civ7-save-import-ecosystem-2026-10-21.md)。

当前确认的区别：外部程序能够读取文件并解析；游戏 UI mod 能否直接取得所选存档的完整字节，仍未验证。解析核心的迁移解决的是前者的运行环境依赖，不能把后者自动判为通过。

没有加入未经验证的 GAME_STATE/热座载入调用。该候选还须确认是否能停留在准备界面、是否适用单人存档、得到的是原始还是当前配置、取消后能否清除旧局状态。任何试验须待用户允许，并先完整备份、校验整个 Saves。

## 内置截图识别调查

免费识别引擎本身存在。关键前提仍是 mod 能够拿到粘贴图片的数据，以及游戏内 JavaScript 环境能否运行识别引擎。

| 方案 | 已确认事实 | 尚未解决的接入条件 |
| --- | --- | --- |
| [Tesseract.js](https://github.com/naptha/tesseract.js) | Apache-2.0，可在本地运行，多语言；不必使用付费云 API。 | 浏览器版本使用 Worker 和 WebAssembly；模型和运行文件可以打包，但 Civ VII 的相关支持未验证。见[官方 FAQ](https://github.com/naptha/tesseract.js/blob/master/docs/faq.md)。 |
| [Ocrad.js](https://github.com/antimatter15/ocrad.js) | 纯 JavaScript 识别方案，GPL-3.0。 | 常用入口需要图像像素；尚无本项目中文配置识别质量和游戏内运行证据。换引擎不能解决图片输入。 |
| [macOS Vision](https://developer.apple.com/documentation/vision/vnrecognizetextrequest) | 系统提供原生文字识别；旧辅助程序已使用。 | 这是原生程序接口，不是可直接从 mod JavaScript 调用的函数；尚未找到游戏提供的桥接。 |
| [Windows OCR](https://learn.microsoft.com/en-us/uwp/api/windows.media.ocr) | 系统 OCR API 存在。 | 桌面应用还有包身份要求；不是把一个 JS 文件放进 mod 即可调用的接口。 |

Coherent 官方剪贴板文档说明其标准集成通过宿主的 `OnClipboardTextGet/Set` 处理 UTF-8 **文字**，引擎本身不直接访问系统剪贴板。这解释了为什么不能把网页里的图片粘贴代码直接当成游戏内已可用；也不排除 Civ VII 有尚未确认的自定义扩展。[官方剪贴板集成说明](https://docs.coherent-labs.com/cpp-gameface/integration/optional_features/inputhandlingcpp_native/)

结论是**尚未找到可交付的内置图片输入和识别链**，不是“免费 OCR 不存在”或已经证明纯 mod 不可能。没有将截图发送到在线识别服务，也没有为此新增权限或外部常驻程序。

## 交付边界

源码仍保留旧辅助程序的存档转换/图片路径，防止把未经验证的新路径宣传为可用。当前不满足“其他玩家装上即用”，不作为纯 mod 发布。界面简化和解析改动只保存在工作区，等待后续原生入口验证。
