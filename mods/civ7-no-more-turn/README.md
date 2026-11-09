# No More Turn（不再来一回合）

1.8.8（2026-11-06）：完全移除休息自动存档与保留清理及相关选项；休息面板只保留“继续游戏／打开设置”一排两个按钮，“打开设置”进入完整原版暂停菜单，可手动保存、修改选项或退出。加载、等待开始与主菜单不计入游戏时长；休息与夜间禁玩期间允许确认设置修改；休息面板提供手柄原生图标提示与焦点高亮。2026-11-06 已经用户实机验收，详见 [VALIDATION.txt](VALIDATION.txt)。

为《文明 VII》单人游戏加入按回合、按时间休息及夜间禁玩。三项功能独立开关，休息时可打开原版菜单手动保存。

**当前版本：1.8.8· Windows / Steam 1.5.0 接口 · 2026-11-06 用户实机验收通过**

[Steam 创意工坊](https://steamcommunity.com/sharedfiles/filedetails/?id=3815557333) · [下载发布版](https://github.com/Stupidism/civ7-rest-guard/releases) · [完整使用说明](README-zh-CN.txt) · [验证记录](VALIDATION.txt)

1.8.2 修复中文正文显示方框：使用游戏原生 `font-body` 随文字语言选择字体。新增离线浏览器回归检查，确认中文正文实际使用游戏中文字体；未启动游戏测试。

## 语言

界面跟随游戏内的文字语言设置，提供英文和简体中文，其他语言使用原生英文回退。休息弹窗、按钮、工具栏和设置说明全部使用游戏翻译系统，不读取操作系统或浏览器语言。名称保留“No More Turn（不再来一回合）”。[English guide](README-en.md)。

1.8.6 调整：默认回合间隔改为反向斐波那契数列 **13、8、5、3、2**。已有设置保持原值；新配置或恢复本 Mod 默认值时使用新间隔。

## 默认规则

### 按回合休息

在本次游戏会话的内存中累计结束回合次数，达到当前档位的间隔后休息，不再对游戏回合号求余数。重复的过回合请求只计一次；读档、跳到更晚的存档、回退或切换时代都不会补算回合，也不会清空已有累计。完整退出游戏后重新从零累计。

| 当前回合 | 默认休息间隔 |
| --- | --- |
| 1–20 | 每 13 回合 |
| 21–40 | 每 8 回合 |
| 41–60 | 每 5 回合 |
| 61–80 | 每 3 回合 |
| 81 及以后 | 每 2 回合 |

游戏当前回合只用于选择上表的间隔档位；每档间隔可以调整为 1–100 回合。跨档保留已有累计，按新间隔判断。关闭回合功能时暂停累计。

例如刚启动后读入第 1 回合存档，初始计数为 0，结束第 1–13 回合共 13 次时才触发休息。已经累计 2 次后读入其他存档，计数仍为 2。

### 按时间休息

- 连续游戏 **25 分钟**后强制休息 **5 分钟**，无需等到结束回合。
- 读档加载、加载完成后等待开始，以及主菜单等待期间暂停计时；保留此前实际游戏时间，进入游戏后继续累计，不因等待重置回合计数。
- 连续无操作 1 分钟后显示与强制休息相同样式的“主动休息”面板，以正计时显示已休息时长，“继续游戏”始终可点。
- 主动休息期间暂停连续游戏计时，鼠标移动或其他操作不会关闭面板。提前继续保留此前累计的游戏时长和回合间隔；满 5 分钟视为完成一次休息，两项间隔共同重置。
- 点击“继续游戏”才恢复计时，不会自动结束回合；离开更久不会重复弹出休息锁。也可按 Enter 或手柄确认继续。
- 完整退出游戏后，本次计时清零。关闭时间功能也会关闭空闲自动重置。

连续游戏上限可设为 1–240 分钟，休息时长可设为 0.1–120 分钟。

### 共同重置

两项默认同时开启，先到期的一项触发休息，同时到期只休息一次。完成强制休息或空闲休息后，游戏时间和下一次回合休息间隔一起重置。

例如已累计 3 回合后先完成时间休息，回合累计清零，下一次重新累计完整的间隔。刚休息完的当前回合放行，不再次计入新一轮；分档仍取游戏当前回合。

## 休息时手动保存

休息面板的“打开设置”进入原版暂停菜单，可手动保存、快速保存或打开选项。关闭菜单后回到休息面板，倒计时继续，不能提前继续或结束回合。时间、回合、主动和夜间休息均不再创建、查询或清理存档；旧版保存开关与保留数量设置已移除，旧配置中的值不再生效。已有存档不自动搬迁或删除。

搭配 Auto-save Before... 时，原有回合前存档仍由该 Mod 负责；No More Turn 不再创建额外的休息存档。

## 夜间禁玩

默认独立开启，按电脑本地时间在 **22:00（含）至次日07:00（不含）** 禁止游戏操作和结束回合。即使关闭按回合、按时间休息，夜间限制仍生效。到点或在时段内载入单人游戏会显示夜间休息界面，可打开设置或按 Esc 调出退出确认。

在“选项 → 附加内容 → No More Turn（不再来一回合）”可单独关闭“启用夜间禁玩”，或以15分钟为步长修改开始和结束时间。支持跨午夜和同一天的区间；起止相同表示不限制。夜间锁定期间可以退出，可点“打开设置”，在“选项 → 附加内容”调整夜间时段。

到结束时间解除夜间限制，不自动提交之前排队的回合。夜间休息达到设置的休息时长后会共同重置回合和连续游戏计数；很短的时段或提前关闭不会抹掉尚未完成的普通强制休息。

## 界面

休息入口位于右上角菜单区的左侧、原版时钟紧邻左边，使用时钟相同的字体和字号，没有独立背景或外框。用游戏自带的回合、时间图标与数字显示剩余量；悬浮查看完整文字，点击直接打开“选项 → 附加内容”，选中并滚动到“No More Turn（不再来一回合）”分组。原版菜单、百科和时钟仍保留在同一栏。

关闭开关会立即隐藏其相关选项，重新开启恢复原数值，不清除配置。共用休息时长与恢复默认始终可见可用。显示状态随草稿变化，确认才保存；取消变更恢复原配置。

设置按“回合开关→五档间隔”“时间开关→连续游戏时长”“夜间开关→起止时间”排列，后面集中放共用的休息时长及恢复默认。小组之间仅使用淡色细线，不重复Mod标题装饰。

设置已并入原生“附加内容”标签，使用原版开关、下拉框、标题及底部按钮。修改后点击“确认变更”保存，“取消变更”放弃；分组内的“恢复默认”只重置本模块的草稿。每20回合一档仍固定不可调整。主菜单和游戏内均能打开此设置。

主动休息面板与原生附加内容设置已于 2026-11-05 至 2026-11-06 实机验收（见 [VALIDATION.txt](VALIDATION.txt)）。以下只保留外观未改动的 1.3.0 强制休息弹窗历史图，不用旧工具栏或独立设置页代表新版本。

强制休息期间显示全屏倒计时，阻止游戏操作和过回合。倒计时结束后点击“休息完成，继续”。按回合触发时继续原来的过回合操作；按时间触发时恢复当前回合。主动休息使用同一套全屏遮罩、原生边框及进度条，显示已休息时长，随时可点“继续游戏”。

休息期间按 Esc 或手柄取消键可打开原生退出确认。确认框显示在休息面板上方，键盘、鼠标、触摸和手柄输入优先交给确认框；取消退出后仍保留原倒计时和待结束的回合，只有明确确认才退出到桌面。退出确认不会代替“继续”，也不会自动推进回合。

搭配 Auto-save Before... 1.1.1 并开启回合前存档时，顺序为“保存成功 → 强制休息 → 点击继续 → 结束回合”。保存失败先处理重试或取消，不进入回合休息；休息期间不会重复覆盖该存档。游戏禁止普通保存的特殊阶段仍沿用存档模组的提示及放行规则。

![第 5 回合结束触发休息](docs/screenshots/08-turn-rest.jpg)

历史截图中的短时参数仅用于验证，默认仍为25分钟游戏／5分钟休息。

## 安装

### Steam 创意工坊

1. [订阅 Mod](https://steamcommunity.com/sharedfiles/filedetails/?id=3815557333)，等待 Steam 下载并重启游戏。
2. 在游戏“附加内容”中启用“No More Turn（不再来一回合）”（原名“Rest Guard（休息一下）”）。
3. 在“选项 → 附加内容 → No More Turn（不再来一回合）”调整设置；游戏内也可点击时钟左侧的休息指标直达。

如果之前手动安装过同名 Mod，请先将本地 `Mods/civ7-rest-guard` 文件夹移出 Mods 目录，避免加载两份。

### Windows 手动安装

下载并解压发布版，退出游戏后双击 `install.cmd`。也可以克隆本仓库后双击该文件。

安装位置：

```text
%LOCALAPPDATA%/Firaxis Games/Sid Meier's Civilization VII/Mods/civ7-rest-guard
```

安装器会备份已有版本，并核对复制后的文件。游戏内已有设置会保留。手动卸载时退出游戏，再移出该 Mod 文件夹即可。

## 兼容性与数据

- 仅用于单人游戏；多人及热座不启用。
- 可以用于已有单人存档，不修改原版游戏文件；本 Mod 不创建或删除游戏存档。
- 设置及休息面板使用原版 `fxs-*` 控件，图标直接引用已安装游戏的资源。
- Mod 配置中长期只保存设置，不建立战役或回合历史。读档时使用一次性的临时交接状态，目标界面读取后清除。
- 这是游戏内休息控制，不是操作系统级的应用锁。
- 尚未验证其他平台或所有第三方界面 Mod 的组合。

## 开发与测试

无需安装 npm 依赖。使用支持内置测试运行器的现代 Node.js，在仓库根目录执行：

```sh
npm test
```

本次 1.8.8 改动的离线验证覆盖全部休息模式零存档调用、菜单输入放行、返回后恢复休息锁、倒计时与排队回合、中英文按钮及设置迁移；2026-11-05 开发构建已通过实机验收，发布前由维护者重跑离线检查。离线检查不能替代游戏 UI 验证；详见 [VALIDATION.txt](VALIDATION.txt)。

| 文件 | 职责 |
| --- | --- |
| `rest-guard.modinfo` | 游戏加载清单 |
| `ui/defaults.js` | 初始设置 |
| `ui/rest-model.js` | 固定回合分档与休息锁 |
| `ui/rest-session.js` | 双功能触发、空闲与共同重置 |
| `ui/rest-runtime.js` / `ui/rest-shell.js` | 游戏与主菜单间读档交接 |
| `ui/rest-store.js` | 设置保存与迁移 |
| `ui/rest-options.js` / `ui/rest-settings.js` | 原生附加内容设置、保存事务与分组直达 |
| `ui/rest-guard.js` | 游戏输入和过回合接入 |
| `ui/rest-view.js` / `ui/rest-guard.css` | 原生风格界面 |
| `tests/` | Node.js 回归测试 |

## English summary

A single-player Civilization VII mod with independent turn-based and time-based break triggers. Defaults are one break every 13/8/5/3/2 turns across fixed 20-turn stages, or after 25 minutes of continuous play, followed by a 5-minute rest. End-turn actions are counted in memory for the current session; the game turn only selects the interval stage. Loading never adds turns or resets accumulated progress. Duplicate requests count once. One idle minute opens a voluntary break panel with an elapsed timer and an always available Continue Game button. The play timer pauses during this break; resuming early preserves previous progress. Five idle minutes reset both counters. Loading, the start curtain and main-menu waits pause play time while preserving previous progress; exiting the game clears both session counters.

During a break, **Open settings** opens the native pause menu. Returning from the menu restores the break panel; the countdown continues and a required break cannot be skipped. This mod no longer creates, queries or deletes game saves in any break mode. Save-retention and voluntary-autosave settings have been removed; legacy values are ignored. Existing saves are not moved or deleted.

An independent night restriction is enabled by default from 22:00 to 07:00 in local computer time. Start and end are configurable in 15-minute steps; equal times mean no restriction. Exit remains available, and the night schedule can be changed through Open settings → Options → Additional Content. The restriction lifts without submitting a queued turn.

The compact top-right indicator and settings use native game controls. The current interface is Chinese. The native Options integration and the voluntary break panel passed in-game acceptance on 2026-11-05/06. This repository contains the mod source and tests; it does not redistribute the game's UI assets or SDK.

### 调试与录制期间自动暂停

本地录制或其他模组调试可通过 `scripts/with-game-activity.mjs recording|debug -- <命令>` 建立临时活动标记。模组识别标记后隐藏面板、暂停回合／计时／空闲／夜间拦截，保留原设置和计数。命令结束恢复，异常中断最迟 90 秒恢复；不会自动补交之前排队的回合。不要仅因调试端口开启就永久停用。普通第三方录屏器不会自动发出此标记，使用它们时仍须手动停用模组。测试本模组自身时不要启用该标记。
