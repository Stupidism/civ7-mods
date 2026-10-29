# 更好的Mod支持 / Better Mod Support

独立 Mod 项目，0.1.0-dev。把原来 DebugPanel 输入修复启动器中的 Steam 查找、参数传递、进程管理和设置恢复抽成共享实现。DebugPanel 输入修复仍是独立可选功能，不是其他辅助组件的前提。

## 使用

构建包解压后，将 `civ7-mac-launcher` 放在 Mods 目录。包含“神图”组件的构建另有 `civ7-play-again`，安装并在游戏中启用它。已有版本不要同时安装两份。启动器的 `.modinfo` 仅提供说明；仅订阅或启用条目不能自动运行本机程序。

Steam → 文明7 → 属性 → 通用 → 启动选项，一次填写：

```text
"实际路径/civ7-mac-launcher/Civ7 Mod Launcher.app/Contents/MacOS/Civ7ModLauncher" --native-input --play-again %command%
```

将“实际路径”替换为本机解压位置。工坊发布后也可用工坊下载目录中的相同可执行文件；本独立条目尚未发布，没有新的工坊 ID。可只保留一个功能参数，或都不选。参数必须放在 `%command%` 前；游戏自身的参数放在它后。以后直接点 Steam 的“开始游戏”，不再另开辅助软件。删除启动选项即可恢复普通启动。

- `--native-input`：需要包含输入修复的构建。仍使用原版 DebugPanel 命令处理器，不逐条映射命令。仅支持已验证 SHA-256 的 Steam Apple Silicon 1.5.0 (1311346)。临时开启 DebugPanel，游戏退出后恢复自己改过的那一行。
- `--play-again`：需要包含存档组件和 Node 的构建。自动启动“你的神图很好，现在是我的了”的辅助服务，游戏退出时一起停止。运行库在包内，玩家无需另装 Node / Python / Xcode。首次启动不转换存档、不写连接令牌到安装目录、不编译 OCR。
- 双击 app 不带参数时只启动游戏；原 DebugPanel 专用 app 保留默认启用输入修复的行为。

**“神图”的边界：** 此 PR 解决辅助组件的随游戏启动与结束，提供内存中会话令牌握手。当前存档导入仍复用该 Mod 既有的本机 Cohtml 调试桥（127.0.0.1:9444）；启动器没有擅自修改游戏调试配置，也不自动开放端口。干净环境若未启用该通信通道，完整存档导入仍不可用。纯文字/C7S2 导入不受影响。无调试端口的原生文件通信路线尚待开发；不能把本 PR 称为完整恢复任意存档或订阅即全自动可用。

## 平台与验证

- 构建目标：Apple Silicon Mac，Steam Civilization VII。Intel、Windows、Linux 未实现。
- 仅启动器/输入修复构建最低系统声明为 macOS 11；包含 Node 的包保守声明 macOS 14。实际支持须以所捆绑 Node 与游戏自身要求的交集为准；没有跨系统实测。
- 2026-10-30 用户确认旧 0.2.0 输入修复启动器通过 Steam 启动选项可用。这是拆分前的实测，不能代替本版验收。
- 新版只运行隔离离线测试、编译、签名完整性与打包检查；没有启动游戏、连接游戏端点、更新安装目录或读取/写入真实 Saves。
- app 是 ad-hoc 签名，未 Developer ID 公证。不能承诺首次互联网下载在所有 Mac 上无 Gatekeeper 提示。
- 尚未更新既有公开工坊条目。验收记录见 [VALIDATION.md](VALIDATION.md)。

## 构建

开发者需要 Apple Command Line Tools 和 Python 3；这些不是玩家依赖：

```sh
python3 mods/civ7-mac-launcher/package.py /tmp/c7-launcher-build --native-input \
  --node /path/to/official-node-arm64/bin/node --node-license /path/to/official-node-arm64/LICENSE
```

不传 `--node` 则不捆绑“神图”；不传 `--native-input` 则不捆绑原生输入库。只接受 ARM64 Node 22+、系统动态库依赖及明确提供的 Node LICENSE，不下载或依赖开发机缓存。输出 ZIP 同时携带文件大小/哈希清单、组件许可证和执行权限。Node 的体积使组合包明显大于旧输入修复包。

## 给其他 Mod 开发者

公共 Cocoa 启动器在 `src/`；`runtime/supervisor-core.mjs` 管理辅助组件生命周期，`providers.mjs` 读取构建时放入已校验包内的 `providers.json`。组件模块导出 `async startLauncherService()`，完成准备后返回异步关闭函数；启动失败会逆序关闭已经启动的组件。构建器必须一起打包依赖和许可证，把所有运行资源纳入 `helper-manifest.json`。

当前 `--play-again` 是第一个辅助组件组合；后续增加组合需要显式打包与启动选项，不能靠订阅目录扫描执行任意脚本。宿主关闭、启动失败、正常退出均负责清理。该接口只负责进程启动，游戏通信 API 由各 Mod 自己实现。

保留旧 `Civ7 Native Debug Input` 内部数据目录用于单实例锁与未完成设置恢复日志兼容。全新运行日志按 UUID 隔离。设置冲突拒绝覆盖；备份保留供排查。

## English quick start

Extract the build, install its mod folders, then set Steam Launch Options to the quoted absolute path to `Civ7ModLauncher`, followed by `--native-input` and/or `--play-again`, then `%command%`. Launch through Steam thereafter. Providers must be included in that build. No separate runtime installation is needed by players.

The Play Again provider starts automatically, but full save import still requires its existing localhost Cohtml debugger bridge. This launcher does not enable that debugger. The new split has only offline validation; the user's successful Steam test covered the previous 0.2.0 input launcher. Apple Silicon only; no Intel or non-Mac claim, no notarization, no new Workshop release.
