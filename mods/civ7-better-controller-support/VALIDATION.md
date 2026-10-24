# 0.2.1 direct map-tool opening — 2026-10-23

Radial A now closes the wheel and invokes the existing tool button's semantic activation on the next frame, without focusing the minimap toolbar or requiring a second A. B closes the tool through its owner and clears focus back to the map; newer popups retain priority. Native icons and other radial entries are unchanged.

76 offline checks passed, zero skipped. The detached browser reads the installed native radial resolver and minimap button factory: one resolved/decorated radial activation invokes the wonder callback once, opens the list and focuses its first row. Closing returns to the map. Additional checks block deferred opens when a dialog, focus lock, device switch, view/mode change, disabled/missing button or disposal intervenes. This release does not run the game, connect CDP, load Saves or request physical controller testing.

Previous 0.2.0 native screenshot evidence: `work/bilibili/better-controller-support/validation/summary.json`. Physical map/R3 events and user menu feedback are distinguished from synthetic input screenshots. The observed list-return-to-toolbar issue motivated removing that intermediate step; the new return-to-map behavior remains offline-validated only. Settings storage/persistence remains a separate unresolved finding and is not changed by this patch.

---

# 0.2.0 integration — 2026-10-23

Absorbs runtime features from civ7-controller-bridge 0.1.5 (chat 01a14f2b-7b7b-7c82-b926-677bfcbac1d0). Keeps the existing civ7-map-tools-gamepad Mod ID and Workshop item 3825193325. The standalone mod is not edited.

75 offline checks passed with no skips: 55 carried controller checks, 13 existing map-tool checks, 6 integration/platform/settings checks and 1 combined bridge/menu/map-tool browser check. Original game dispatchers, plot/camera handlers, radial menu and slots are read locally for simulations; no game source is packaged.

The combined check routes stick input through bridge/menu hooks into the map toolbar and wonder list exactly once, verifies one activation, then verifies R3 dispatches center-plot-cursor after returning to the map. Other checks cover old-mod deferral, disabled/excluded old-mod cases, Windows/Mac defaults and Reset, preserved old settings, Confirm/Cancel, input guard priority and disposal.

Only the compatibility default depends on platform. BuildInfo.target is authoritative for Windows; Mac target labels, Metal and navigator provide Mac detection. Unknown hosts default off. Existing stored booleans override defaults. Old enabled mod detection uses native Modding.getInstalledMods().enabled and getModulesToExclude(); no old files are modified.

Validation is offline only. No game UI/CDP, loads, saves, launches, controller button presses or Rest Guard changes occurred for this release. Previous standalone map movement/RB and map-tool feedback does not prove the combined release. The source thread's main-menu/radial analog issue still needs native confirmation despite its HOLD-to-UPDATE regression coverage.

## Previous release evidence

# 0.1.2 名称更新 · 2026-10-23

用户反馈“这个 mod 可以了”，确定名称为“更好的手柄支持 · Better Controller Support”。本次仅更新中英文显示名称、说明和版本，保留内部 ID `civ7-map-tools-gamepad`、轮盘“地图工具”分类及所有操作行为。

XML 解析、清单文件、版本一致性与发行包内容校验通过。逻辑沿用 0.1.1 已通过的 13 项离线回归，本次纯文案修改不重复功能测试。用户反馈仅记为现有使用场景可用，不扩展为所有系统、设备及完整地图钉链路均已验收。

文件安装前完整备份并校验旧版，回执见 `docs/installation-0.1.2-2026-10-23.json`。本次没有游戏 UI/CDP 操作，未重启、加载或保存；存档和 Rest Guard 保持不变。

---

# 0.1.1 图标更新 · 2026-10-23

轮盘五项改为读取对应迷你地图按钮的实际背景图，使用相同图片，不再把纹理名称交给图标数据库解析。滤镜为望远镜、城市为楼群、单位为晋升箭头、奇观为金字塔、地图钉为原 Detailed Map Tacks 图钉。原按钮尚未生成时，使用其源码定义的相同图片地址；不复制第三方图片。

13/13 离线测试通过。原始游戏轮盘渲染的浏览器回放验证：五项均生成图标，其背景图片与五个原按钮完全一致，重复加载只注册一次适配。未连接游戏或进行实机验证。

更新前完整备份旧模组并校验相对文件列表、大小及 SHA-256；0.1.1 安装回执见 `docs/installation-0.1.1-2026-10-23.json`。没有操作游戏 UI、重启、加载或保存；Saves 与 Rest Guard 不变。

---

# 0.1.0 验证记录 · 2026-10-23

## 已执行

- 离线 Node / 独立 Chromium：**13/13 通过，0 跳过**。测试浏览器不连接游戏调试端口。
- 读取本机游戏 `panel-mini-map.js` 的原始 `createButton` 方法，验证激活会调用原回调；读取 `panel-radial-menu.js` 的原始轮盘解析类，验证菜单关闭后聚焦正确按钮。
- 完整仓库 `node scripts/test.mjs` 无失败。新增套件在默认环境通过 4 项逻辑测试、明确跳过 9 项需浏览器的测试；这 9 项已经单独配置浏览器执行并通过。
- 新增 JavaScript 语法检查、XML 解析、清单引用文件存在性检查通过。
- 打包工具核对 ZIP 的完整相对文件列表、文件大小及 SHA-256，发行包及清单放在仓库外 `~/Documents/Civ7-Mod-Releases/`。

## 回归覆盖

1. World 输入（Windows）与 Shell 导航事件（菜单及 Mac 桥接）的方向操作。
2. START/FINISH 只移动或激活一次；摇杆连续导航有初始延迟与重复节流，松开不额外跳项。
3. Map Trix 40 行奇观列表跟随焦点滚动，跳过隐藏/禁用行，列表重建后恢复焦点且不误激活新行。
4. 原生暂停菜单、对话框、焦点锁、Rest Guard 遮罩、鼠标操作优先。
5. 地图钉图标选择后，放置模式的地图输入重新交还游戏。
6. B 调用原迷你地图关闭方法，回到对应入口；关闭期间出现新弹窗时不抢焦点。
7. 滤镜确认与方向操作仍走原生控件；轮盘聚焦正确入口，缺失可选模组时隐藏相应入口，重复加载不重复注册。
8. Map Trix/Lens 面板的控制器输入临时切换为 Shell，切回鼠标或离开面板恢复原属性，后续弹窗的输入上下文不被覆盖。
9. 卸载时清理高亮、定时器、事件监听并恢复本模组仍持有的输入方法。

## 修正过的回归

原版与 Map Trix 按钮共用 `mini-map__lens-button` 类。最初的滤镜选择器过宽，关闭奇观时回到了滤镜；已将滤镜限制到按钮区首项，并以原始按钮创建方法验证返回奇观入口。

## 未执行与兼容边界

- **未启动、重启、加载或操作运行中的 Civilization VII，未使用游戏 UI/CDP，未执行实机测试。** 文件安装另有 `docs/installation-2026-10-23.json` 回执；存档与 Rest Guard 未读取、修改或暂停。
- Windows、macOS 的真实手柄、多人对局、不同分辨率及其他重写输入链的模组尚未实机验收。
- Detailed Map Tacks 图标选择的输入路径通过离线验证；地图钉完整放置/删除、预览和原模组其他快捷键不在本次验收范围。原第三方模组与游戏代码未打包、未改写。
- 软件依赖是游戏自身已能接收到手柄输入。Mac 地图输入失效的问题仍需 Mac Controller Support Fix；本模组不提供系统驱动或设备映射。

## 复现

在本模块目录运行 `npm test`。完整测试还需环境变量：

- `CIV7_PLAYWRIGHT_MODULE`：Playwright 模块路径。
- `CIV7_CHROMIUM_PATH`：可选，独立 Chromium 可执行文件路径。
- `CIV7_MODULES_DIR`：可选，游戏 `Base/modules` 目录；macOS 默认从本机 Steam 安装目录读取。

测试从本机读取游戏源文件，不在仓库分发源文件。后续实机验收必须先按仓库 AGENTS.md 取得游戏锁、完整备份并校验 Saves、暂停 Rest Guard 的全部限制，结束后恢复。
