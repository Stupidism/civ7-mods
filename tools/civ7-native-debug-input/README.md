# 共享启动器迁移：0.3.0-dev

启动与设置恢复实现已迁往 [独立 Mac Mod 启动器](../../mods/civ7-mac-launcher/)。本目录保留输入桥和专用打包入口，专用 app 默认启用输入修复。新版开始传递 Steam 游戏参数；尚未实机验收或发布。2026-10-30 用户确认的是旧 0.2.0 通过 Steam 启动选项工作。以下为历史发行记录。

## 工坊公开版 0.2.0（2026-10-29）

[订阅 Mac DebugPanel 输入修复](https://steamcommunity.com/sharedfiles/filedetails/?id=3829280398)。用户已授权公开；标题、封面和随包说明去掉私密测试标记，补齐 Finder 默认路径及其他 Steam 库查找方法。公开可见性、标题和全文经匿名 Steam API 回读；9 个下载文件哈希一致，启动器权限保留。程序与既有实机版本逐字节一致，本次未运行游戏。最新 ZIP 在 `dist/civ7-native-debug-input/0.2.0-public/`；回执见 `workshop.json`。以下旧记录保留作历史证据。

# 原版 DebugPanel 的 Mac 替代输入框

实验性原生辅助模块，针对本机 Steam / ARM64 / Civilization VII 1.5.0 (1311346)。它不是可直接放进 Mods 文件夹的普通 JavaScript Mod。

## 一键启动器 0.2.0

已提供内置辅助模块的 macOS .app。解压发布 ZIP，退出文明7，然后双击“启动文明7（输入修复）.app”。不需要 Python、Node、Xcode 或终端。自动寻找 Steam 游戏库；无法找到时允许用户选择游戏应用。校验游戏及模块哈希，拒绝不兼容版本和重复启动；调试面板原本关闭时，暂时开启并在游戏退出后恢复该项设置。

本机 Finder 解压与双击启动、真实输入/原版 reveal all、自动开启及退出后恢复设置均已验证。现有程序为 ad-hoc 签名，**没有 Developer ID 签名/公证**，spctl 评估返回 rejected；不能承诺其他 Mac 从互联网下载后直接无提示运行。详见 USER-GUIDE.txt、VALIDATION.txt。

发行包位于仓库 dist/civ7-native-debug-input/0.2.0/。ZIP 和工坊候选目录包含相同 app。工坊清单仅作为说明入口，不自动执行原生代码；真实工坊上传、订阅、下载权限及启动验收状态记录在发行说明中，不能用本地目录测试代替。

开发者构建完整包：运行本目录的 package.py 并指定新的输出目录。launcher-core-test.mm 覆盖配置恢复、冲突拒绝、CRLF 及 Steam 库路径解析；package.py 生成清单与 ZIP，保留执行权限并校验签名完整性。用户运行不依赖这些构建工具。

## 行为

打开原版 DebugPanel（键盘 ` 键）时，显示一个能正常输入的 macOS 文本框。输入原版命令后按 Return 或点击“执行”。原版 DebugPanel 仍负责命令历史、Output 回显、解析和执行。辅助模块不维护命令映射，也不调用 `Visibility.revealAllPlots`。

点击原版 Output 可以展开其输出区。关闭辅助输入框后，可关闭原版面板，稍候再打开，重新唤出输入框。当前是独立小窗口，尚未做成与原版输入栏完全重叠的外观。

退出游戏时先关闭这个小输入窗，再确认游戏的退出提示。输入窗有焦点时按 Command-Q，原版确认窗口可能出现在它后面。

命令限 1–254 个可打印 ASCII 字符；不支持中文命令、换行或超长输入。请切到 ABC 输入法。原生处理器认识哪些命令，由游戏版本决定。“已交给原版处理”仅表示提交完成，执行结果以游戏行为和原版输出为准。

## 实现

启动时通过 `DYLD_INSERT_LIBRARIES` 加载本目录编译的 dylib。扫描 Mach-O 的 `MH_EXECUTE` 映像，核对大小及完整 SHA-256，然后只改接内存中原版 ConsoleInput 的一条 ARM64 `BL` 指令。它通过附近私有中转页调用辅助函数，其他 InputText 调用不变。

辅助函数先调用原本的 InputText。用户有新提交时，将文字复制到原版的输入缓冲区并返回提交状态。随后由原版调用者完成自己的历史记录、回显和 `DebugConsoleInput` 事件提交。因此线程和执行时机仍由原版输入调用链决定。

磁盘上的游戏程序、签名和原版资源不修改；本模块不打开网络端口。不带加载环境变量正常启动游戏即不启用。版本或指令不匹配时拒绝接入。

仅接受的程序 SHA-256：

`55642f4d349a617242e5610d3458341b7af254a9eecb4eb2955d0cbc097c5ac7`

## 构建和验证

```sh
sh tools/civ7-native-debug-input/build.sh
clang++ -arch arm64 -std=c++17 -O0 tools/civ7-native-debug-input/tests/patch-test.cpp -o tools/civ7-native-debug-input/build/patch-test
tools/civ7-native-debug-input/build/patch-test
```

独立测试验证精确调用点改接、原函数保持不变、指令不匹配拒绝。编译产物为 `build/libCiv7NativeInput.dylib`。

本次受控启动、备份和实机证据在 `work/native-debug-input-20261029/`。后续代理实测必须重新申请游戏锁，完整备份并校验 Saves，暂停 Rest Guard，再用新的锁令牌运行；不能直接复用该目录中的旧令牌。启动需设置 `SteamAppId=1295660`、`SteamGameId=1295660`、`DYLD_INSERT_LIBRARIES` 为本模块绝对路径及 `CIV7_NATIVE_INPUT_ENABLE=1`。可选日志路径为 `CIV7_NATIVE_INPUT_LOG`。不会修改 Steam 的全局启动参数。

## 验收边界

2026-10-29 已通过真实 Mac 键盘事件输入 `help all` 和 `reveal all`；原版 Output 回显这两种文本。测试存档的已揭开地块从 2912/4536 到 4536/4536，回合保持 83，原版自然奇观发现流程触发。没有通过替代 JS 控制台执行开图。

这证明当前版本的通用文本提交路径和 `reveal all` 效果，不能推广成所有原版命令均已逐项验证。`help all` 的回显已观察到，但没有观察到完整帮助列表。原版历史写入走原调用链，辅助 Mac 文本框暂未接入上下键历史导航。中文 IME、手柄、多人、其他版本和其他 Mac 环境未验收。未替换已安装的 `civ7-command-console`，未发布工坊。

## 0.2.0 私密工坊验收补充

真实订阅条目 3829280398、下载全文件哈希及权限、Finder 双击、原版 reveal all 已通过。最终包在 dist/civ7-native-debug-input/0.2.0-verified/。详情与退出时现有崩溃边界见 [验收记录](../../docs/research/civ7-native-launcher-validation-2026-10-29.md)。仅私密测试，未公开；没有 Developer ID 签名或公证。
