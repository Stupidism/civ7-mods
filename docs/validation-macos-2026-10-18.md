# macOS 验证记录 · 2026-10-18

> 历史验证记录：保留当时的测试范围和结果，不代表当前收录清单。当前 PR 仅收录 catalog.json 中的六个 Mod。


## 结论

源码检查和 324 项自动测试在 Apple Silicon Mac 上通过。五个常规模组已安装、被游戏识别并出现在目标配置中；已看到 Metal 版主菜单。尚未进入测试对局，因此不能据此宣布存档、休息、战斗操作、自动化或资源分配已在 Mac 实机验收通过。

分合的规则测试通过，但世界接入器使用 Windows 环境变量和路径，默认启动在 Mac 上立即失败；本次没有安装分合的两个模块。

## 环境

- 源码：`Stupidism/civ7-mods`，`main`，`d9eb140198c498d979d276fd0883727852ff78cb`。
- 系统：macOS 27.0.1（26A434），arm64。
- 游戏：Steam Civilization VII 1.5.0（1311346），Metal；Steam build ID 25516395。
- 测试运行时：Node.js 24.19.0，arm64。
- 本机默认 Node 24.14.0 为 x86_64，执行 `npm run check` 报 `env: node: Bad CPU type in executable`。本次改用 Codex 随附的 arm64 Node，未更改全局 Node 配置。
- 本机 Resource Re-sorts 为 3.0.2，与仓库记录一致；但游戏 `Mods.sqlite` 中 `bz-re-sorts` 的 `Disabled` 为 1，需要在游戏的“附加内容”中重新启用。

## 自动检查

| 项目 | 通过 | 失败 | 跳过 |
| --- | ---: | ---: | ---: |
| Rest Guard 1.4.0 | 57 | 0 | 0 |
| Save Before End Turn 1.1.0 | 70 | 0 | 0 |
| War Controls 0.5.1 | 87 | 0 | 0 |
| Garbage Time 0.1.4 | 70 | 0 | 0 |
| Resource Planner 1.0.0 | 16 | 0 | 0 |
| Fenhe 0.2.0-alpha | 24 | 0 | 0 |
| 合计 | 324 | 0 | 0 |

`scripts/check.mjs` 检查通过：7 个清单、452 个静态文件引用、97 个 JavaScript 文件；1 个用户生成地图文件按既有规则排除。

`CIV7_GAME_DIR` 指向本机 `.app/Contents/Resources`，因此存档适配测试实际读取了 Mac 版原生游戏 JavaScript，原生引擎桥接仍为测试模拟。首次运行有 1 项 Rest Guard 联动测试跳过；在临时目录映射仓库中的 Rest Guard 源码后，该项也通过。这不是游戏内存档读写或两个已启用模组的实机联动测试。

## 安装与启动检查

本机实际模组目录由游戏日志确认：

```text
~/Library/Application Support/Civilization VII/Mods/
```

已在原本为空的目录中安装以下五个模块，逐文件 SHA-256 对比通过，共 77 个文件；未替换已有模组：

- `civ7-before-end-turn`：15 个文件。
- `civ7-garbage-time`：15 个文件。
- `civ7-resource-planner`：10 个文件。
- `civ7-rest-guard`：25 个文件。
- `civ7-war-controls`：12 个文件。

14:59:15 的 `Modding.log` 将五个模块列入 `Target Mods`，14:59:16 记录 `Successfully reconfigured game`；`Startup.log` 在 14:59:18 记录 `AppStateMainMenu::Begin()`，屏幕也确认了 1.5.0 Metal 主菜单。这只证明发现和主菜单配置成功，不证明对局作用域脚本已运行。

操作期间曾出现 `AppHost initialized failed in 'WillFinishLaunching' Exit code: 1` 提示；后续已能读取正常主菜单，不能将该提示归因于本仓库模组。界面工具的点击仍报 `noWindowsAvailable`，未能完成附加内容操作或进入测试对局。主菜单同时提示更新后模组已停用。未修改游戏模组数据库来绕过界面。

## 明确的 Mac 兼容缺口

1. 安装入口以 PowerShell / Windows 路径为主，不能直接照 Windows 安装说明执行。
2. `mods/fenhe/tools/bridge.mjs:9` 默认调用 `path.join(process.env.USERPROFILE, ...)`。在没有 `USERPROFILE`、`FENHE_SAVES` 的 Mac 环境运行该入口，实际得到 `ERR_INVALID_ARG_TYPE`，在连接游戏前退出。
3. `mods/fenhe/tools/apply-plan.mjs:12` 使用 `LOCALAPPDATA` 拼接 Windows 的 Mods 路径；即使单独配置 `FENHE_SAVES`，仍需适配此处安装路径及 Python 调用方式。这一点为源码检查，未执行世界切换。

## 尚待实机验收

在游戏“附加内容”中确认启用五个模块及 Resource Re-sorts，然后使用新建单人测试对局：检查设置入口，验证过回合与外交前存档可重载、休息恢复顺序、战斗操作、自动化及资源分配。手柄和长期稳定性也未验证。分合需要先修复跨平台路径，再单独测试世界接入。

本次未修改模组运行代码，未提交或推送 GitHub。

## 同日工坊发布后的复查

- 战争操作 0.5.1、垃圾时间 0.1.4、资源规划 1.0.0 已公开发布，并使用发布者 Steam 账号订阅。下载包共 40 个文件，逐一与上传清单的 SHA-256 一致。
- 三个手动副本完整移至仓库 `backups/manual-mods-before-workshop-2026-10-18/`。重启后，游戏 `Mods.sqlite` 的扫描路径指向对应 Steam Workshop 目录，三个模块均 `Disabled=0`。Resource Re-sorts 也为 `Disabled=0`。
- 21:05:01 的 `Modding.log` 记录三个模块及新名称 Auto-save Before...，并完成配置；21:05:03 进入主菜单，屏幕再次确认。这仍不是 Mac 对局内功能验收。
- Auto-save Before... 的原工坊条目保持 3815596737、公开版本保持 1.0.2，本次只更新显示名、说明标题和封面；两份公开运行时 JavaScript 的哈希保持不变。仓库和本机手动开发版 1.1.0 同步显示名，尚未发布其新增功能。

### 后续更新：Auto-save Before... 1.1.0 已发布

用户确认一并发布新版后，工坊条目 3815596737 更新至 1.1.0，包含过回合与外交行动前两个存档槽。公开说明和封面同步更新；8 个下载运行文件的 SHA-256 全部匹配，清单版本为 1.1.0，包含 `ui/diplomacy-hook.js`。本模组 70 项测试再次通过，0 项跳过。此前“未发布外交功能”的记录描述的是较早一次仅改名的更新，当前已被本次发布取代。对局内新功能仍未完成独立验收。
