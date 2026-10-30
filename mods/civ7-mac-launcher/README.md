# 更好的Mod支持 / Better Mod Support

0.2.0-dev：一次配置启动，在游戏 **选项 → 增强 Mod** 中管理。增强 Mod 自行注册名称、开关、设置和辅助程序；框架不内置可用 Mod 名单。

## 玩家使用

退出游戏后，解压包并双击 `Install.command`。安装器保留旧版本备份，将启动入口放到固定英文目录；输出一行可复制的 Steam 启动选项。在 Steam → 文明VII → 属性 → 通用填写一次：

```text
"/Users/你的账户/Library/Application Support/BetterModSupport/Current/civ7-mac-launcher/Civ7 Mod Launcher.app/Contents/MacOS/Civ7ModLauncher" %command%
```

请直接复制安装器按本机账户生成的路径，不要照抄上面的账户占位符。当前账户 `sunmer` 的完整路径不含中文。以后更新版本或启停增强 Mod 都无需改参数，也无需单独打开辅助软件。旧 `--native-input` / `--play-again` 不再是新版的功能开关。

在游戏附加内容里启用框架和依赖它的 Mod，然后进入 **选项 → 增强 Mod**。组件默认关闭，点确认后运行，取消会放弃修改；其他 Mod 也可注册自己的开关和下拉设置。启动状态在同一页显示。启用本机组件会运行该 Mod 安装的辅助代码。

- DebugPanel 输入是独立注册者：启用后，打开原版 DebugPanel，点击游戏内文本框，逐键输入命令，回车或点击执行。原版仍负责执行、历史和输出。新的注册式启动不创建 macOS 输入窗口。
- “神图是我的”也是注册者：在选项中启用存档转换服务。纯配置文字不需要运行此服务。
- 安装其他注册 Mod 后重启游戏即可发现，不修改框架或启动参数。卸载/关闭组件后框架停止其服务。

## 当前边界

Apple Silicon / Steam 开发版本。包含 Node 的包要求 macOS 14 或更高；原生输入补丁只接受已核验的 1.5.0 (1311346) 游戏二进制。其他版本仍可运行普通注册组件，但原生输入组件会报告不可用。

目前游戏 UI 与辅助服务依赖既有 Cohtml 本机调试桥（127.0.0.1:9444）。启动器不自动启用调试端口；没有该通道时会显示未连接。因此尚不能承诺全新环境“订阅即用”。app 使用 ad-hoc 签名，未 Developer ID 公证。

本版已完成代理实测：独立注册、设置跨重启保留、游戏内键盘输入并回车执行 `reveal all`、存档导入 834 项核对一致。尚未获用户验收；粘贴、输入法和实体手柄未验收。游戏退出码 11 仍是待排查项。参见 [VALIDATION.md](VALIDATION.md)。未发布新工坊条目。

## 开发者

[注册协议及完整示例](EXTENSIONS.md)。包可携带任意声明式扩展，不需要修改构建器里的功能名单：

```sh
python3 mods/civ7-mac-launcher/package.py /tmp/bms-build --native-input \
  --node /path/to/official-arm64-node --node-license /path/to/LICENSE \
  --extension-dir mods/civ7-native-debug-input \
  --extension-dir mods/civ7-play-again
```

`--native-input` 在这里是构建时携带原生桥，不是玩家日常启动参数。`--extension-dir` 可重复指定任意符合协议的 Mod。没有 Node 的构建仅用于旧启动器兼容/编译检查，不提供注册式辅助服务。

## English

Run `Install.command` once with the game closed. Copy its generated fixed Steam launch option, ending in `%command%`. Subsequent releases use the same entry path. Manage independently registered components in **Options → Enhanced Mods**, using native Confirm/Cancel. New components are off by default. Installed native helpers are trusted code; enabling one runs its auxiliary service. The existing Cohtml communication channel is still required. The new registry, keyboard entry/Return and registered save import passed an agent-run live test; user acceptance, paste/IME, physical controllers and clean-machine delivery remain pending. Game exit code 11 remains unresolved.
