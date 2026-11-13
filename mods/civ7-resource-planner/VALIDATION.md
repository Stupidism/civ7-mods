## 2026-11-07 · 所有产能的浪费区间与基础溢出（未安装源码）

源码标识 `source-production-gap-e19972b5c39d`。用户确认：基础60、加成50%、剩余80时加2锤计0；剩余30时计2。所有资源产能评分统一为 min(加成后产能,剩余需求)+max(加成前基础产能−剩余需求,0)，比较前后差后再应用倾向；原始显示不变。补充跨浪费区间的有限组合试算。完整资源套件 184/184 通过、0 跳过；另128组独立参数及7组算例通过。未安装、未实机、未发布；不是实际游戏溢出机制的验证。证据：`work/resource-production-gap-20261107/验收记录.md`。下方条件盐单独截断的开发规则已被本次规则替代。

## 2026-11-07 · 盐的溢出锤评分（未安装源码）

完整资源套件 172/172 通过，0 跳过；另 144 组独立参数检查通过。条件产能只计当前队首剩余需求用得上的部分，多份盐共用上限，倾向在截断后应用，原始产能显示不变。单位类别原生基准使用已验证参数，具体子类加成仍未验证；无进度时回退估算。未安装、未实机、未发布。证据：`work/resource-overflow-20261107/验收记录.md`。

## 2026-11-07 · 数字生产进度（源码修改）

资源页当前训练、建造、项目状态旁新增原生产出图标和“已投入 / 所需”。可见值最多两位小数，悬浮保留完整数值；未知或不匹配的进度不显示为零。

完整资源套件 165 项通过、0 失败、0 跳过。实际 Solid 组件离线回放中英文和三种宽度通过。

证据：`work/production-progress-20261107/验收记录.md`。未安装、未操作游戏、未发布；截图为隔离浏览器回放，原生事件和实体手柄未实测。

## 2026-11-06 · 盐单位产能与定居点标题显示（源码离线）

- 范围：源码离线修改与验证。未安装、未操作游戏／CDP／UI、未发布；不代表实机通过。
- 公式：`effectsFor` 只取当前 `BuildQueue.getQueue()[0]`。单位队首且建造效果匹配时，`appliedYields` 按 `(基础 + 普通 flat) × 普通 percent × (1 + (固定 construction + 候选 construction)/100)` 估算。固定已分配盐进入 `city.construction`，候选盐按 `marginal` 的前后有效产出差计分；多份盐线性相加，不复利。快照关闭“包含已分配资源”时保留固定盐基线；`restoreAssignedResource` 供幸福度筛选移除已分配候选时恢复固定基线，避免重复或漏算。`improve` 与 `marginal` 共用 `appliedYields`。
- 显示：`currentProduction` 复用同一队首读取，返回原生单位旗帜图标与本地化名称；建筑、项目、空队列、城镇和未知数据分别显示明确状态。`productionReader` 由 commerce model 显式注入 ES `Icon`，不依赖全局。标题用原生 `Tooltip.Text`，标签不增加可聚焦控件。`CityProductionChanged`／`CityProductionQueueChanged` 只刷新 `production` 字段，不重排。
- 离线结果：新增 `tests/unit-production.test.mjs` 13 项全过；完整资源套件 159 项全过、0 失败、0 跳过。`resource-layout` 浏览器测试 2 项全过，原失败原因是 fixture 未提供 `ui/valuation/weights.js` 路由，补齐后通过，未跳过或删除测试。
- 数值回归：100 产能单位队首 +20 原始生产力（无倾向 80 分）；200 产能非单位为 0；固定盐 +100 产能 +10 普通产能由 120 变为 132（+12）；两份盐为 140；开启重排可把盐从建筑城移到单位城，移动后单位城为 120、原建筑城为 100；生产倾向 ×2 为 160，避免为 0；盐与普通金币资源各自落到正确城。
- 局限：真实引擎的百分比先后与叠加顺序未实测，上述为单位生产率估算，不声称原生产能公式精确；单位图标和标题布局未在运行游戏内检查；原生 `CityProductionChanged` 事件已按本地源码接线，但未做实机事件验证。离线浏览器标题 fixture 显示标题行无水平溢出、长单位名截断、capital/type 徽章仍可见，见 `work/resource-planner-unit-production-20261106/title-layout.png` 与 `title-layout.json`；该 fixture 使用产品 CSS 和标题结构，不是游戏内截图。真实浏览器回归见 `resource-layout-1.log`；完整套件 `tests-full-3.log`，专项 `unit-production-tests.log`。

## 2026-11-05 验收范围校正


按用户确定的已发布 **1.1.0 发行包**作为验收基线。RP-02 实际分配、RP-03 失败回滚归入已验收基线。本次新增或修改共 11 项，其中完整通过 4 项（36.4%）。

- RP-12 多选倾向与默认裸产出综合评分为部分验收。实际装入 20 份的结果覆盖分配执行，全部评分路径仍待核对。
- RP-13 独立资源操作区导航为部分验收。实体手柄与各项拾取、交换、分层返回路径按各自证据继续补测。
- 损坏资源、选项与焦点、空槽提醒与跳过、跳过箭头、条件产能资源的待测范围按逐项清单保留。

[中文增量验收依据](../../work/release-delta-qa-20261105/public/README.md)

## 2026-11-05 · 1.4.2-dev.1103-2038-c953488d · 原生分配实机通过

- RP-02 已验收。探索时代 T1，通过原生“按倾向分配”按钮将已分配资源从 12 份增加至 32 份。完成提示中的装入 20 份与 14 个定居点实读一致，各定居点均未超容量。
- RP-06 已验收。修改倾向后点击列表末尾重置，设置实际改变，资源分配前后相同。
- RP-09 已验收。当前视口的三页签等宽，探索时代四页签正常铺满。
- 本轮两个存档均无损坏资源样本。损坏排除保留 11 月 2 日对应构建的历史证据。本轮没有重测失败回滚。RP-03 按已发布 1.1.0 基线管理；仅剩盐等条件产能资源时的提醒、跨回合跳过仍待实机验收。
- 本构建资源套件 140 项离线通过。统测已恢复存档与设置并释放锁，发布状态为未发布。

[中文统测记录及截图](../../work/integration-test-20261105/验收记录.md#rp-02--应用实际可分配资源并核对完成结果)

## 2026-11-03 · 1.4.2 · 保留仅在生产特定项目时生效的资源

四份盐均未分配时，空槽提醒保持关闭，若有原生阻挡通知则只确认该通知。加入可分配的常驻收益资源后恢复提醒。资源损坏检查与共享行动组合共 50 项离线测试通过，零跳过。本轮游戏内待验收。[测试输出](../../work/resource-planner-salt-20261103/tests.log)

## 2026-11-03 · 1.4.2 · 长按一秒立即跳过

箭头和跳过快捷键从按下时独立计时。离线验证 999 毫秒未触发，满一秒触发一次，松开不重复。三个页面及共享模块完整离线回归 347 项通过，游戏内输入待复测。[中文记录](../../work/three-skip-hold-20261103/验收记录.md)

## 2026-11-02 T55 损坏资源与分配设置统测

受测开发版为 `1.4.1-dev.1102-1516-c765dfda` 加当日源码 `7e83a2da97b9`。以下结论对应这次组合构建。

- **损坏资源排除（RP-05，部分验收）**。31 份资源中，损坏的马、象牙、熏香、螃蟹均未进入未分配列表或规划候选。九座定居点的有效容量与引擎一致。本局缺少已入槽损坏卡及实际修复样本，保留原槽、修复后重新计入两条路径仍只有离线验证。
- **分配范围（RP-04，已验收）**。分别关闭“包含骆驼”和“包含已分配资源”后，关闭再打开页面，两项仍关闭。逐项恢复后，九座定居点的原分配均一致。
- **重置倾向与提醒开关（RP-06、RP-07，部分验收）**。在中文 1920×1080 界面滚到列表末尾可以重置倾向，九座定居点分配保持一致。左栏提醒开关的选中金框随开关消失、恢复。重置按钮的实体手柄导航待测。

[统测记录与截图](../../work/integration-test-20261102/验收记录.md#rp-05) · [资源套件离线结果（140 项通过）](../../work/integration-test-20261102/mods-civ7-resource-planner.tap)

## 2026-11-02 损坏资源排除（1.4.1 初次离线验证）

- 本轮脚本内容标识 `dc40fe4f658b`。损坏按资源所在地块逐份判定。已插槽的损坏卡保留警示并占用原槽，规划、未分配收益和资源提醒仅使用完好卡。
- 资源规划与共享提醒组合离线回归 188 项通过，零失败、零跳过。专项目例覆盖同类完好和损坏卡并存、地图与地图外资源编号相同、实际剩余容量、仅余损坏资源时不提醒，以及修复后重新计入。用户截图对应场景待游戏内复核。
- [离线测试原始输出](../../work/resource-planner-damage-20261102/tests.log)

## 2026-11-02 跳过箭头尺寸与居中修正

- 待安装源码样式标识 `4b39d3fea1d0`。三个页面统一使用居中箭头。定居点移除旧锤子图层留下的偏左缩放。
- 已使用游戏原版纹理在独立浏览器生成置灰箭头与关闭按钮并列预览。7 项布局和输入离线检查通过。当前修改尚未游戏内验收。
- 证据在 `work/skip-icon-scale-20261102/preview.png` 和 `checks.log`。

## 2026-11-02 已安装，等待用户亲自实测

- 已安装开发版 **1.4.1-dev.1102-1516-c765dfda**，44 个文件逐一核验，列表名称有“开发版”标记。
- 此构建已包含右上角跳过按钮的定位和置灰修复，定居点基于最新 0.2.4，资源规划器包含底部设置与列表末尾重置倾向调整。
- 三个包共 96 个文件核验一致。备份已核验，安装时游戏已关闭，待用户游戏内验证。回执 `work/skip-close-anchor-20261102/install/installation.json`。

## 2026-11-02 跳过按钮跟随原生关闭按钮（源码待安装）

- 1.4.1 定位相关源码标识 `fc19cf7e770a`。关闭按钮和跳过按钮使用同一父容器以及相同的原生角落、尺寸样式。关闭和跳过仍各自处理输入。
- 三页相关离线检查共 137 项通过。无待办时保留禁用入口，且不因此生成行动。独立浏览器覆盖政策和资源页浮层、大小屏与原生输入；定居点已有建造时通过模拟面板验证。三页最终游戏渲染尚待实机确认。
- 证据在 `work/skip-close-anchor-20261102/checks.log`。

## 2026-11-02 重置倾向移到定居点列表末尾

- 1.4.1 源码标识 `b3d283e5a287`，待安装、待实机。重置倾向与全部取消分配同排，手柄在倾向区访问；重置只重新计算倾向。
- 离线检查 25 项通过，覆盖设置重置、手柄分区、放置期间禁用、设备切换时保留列表末尾入口和中英文布局。日志 `work/resource-reset-footer-20261102/tests.log`。

## 2026-11-02 设置组底部对齐与空槽提醒金框（源码待安装）

- 受影响安装版为 1.4.1-dev.1102-1430-47db31b7。用户截图显示设置组下方仍有空白。现由可伸缩的间隔占用设置组上方余量，提醒沿用选项选中态。
- 1.4.1 修正源码标识 c0b7ef44f317 / 52875ea87738。独立浏览器 1100px 高时最后一项距栏底 9px，420px 高时可滚到底，提醒切换金框检查通过。另有 23 项资源、焦点、手柄及设置回归通过。游戏内最终显示待测。
- 证据在 `work/resource-bottom-align-20261102/`。

## 2026-11-02 已安装，等待用户亲自实测

- 已安装开发版 **1.4.1-dev.1102-1430-47db31b7**，44 个文件逐一核验，列表名称有“开发版”标记。
- 整行页签修复已到位；资源规划器同时包含底部设置和分配范围开关记忆修复。定居点已核验为包含修复的 0.2.2 开发版。
- 旧文件已备份。实机待用户测试，安装回执见 `work/resource-options-20261102/install/installation.json`。

## 2026-11-02 资源页左栏设置位置与分配范围保存

- 1.4.1 源码标识 `578d9cd77ea3`。左栏顶部放操作，底部放资源空槽提醒、分配范围、幸福度选项。「包含骆驼资源」「包含已分配资源」立即保存并分别恢复打开或关闭的状态。
- 139 项离线检查通过。持久化用例序列化配置后重新创建控制器，检查两项的开、关及其他设置。整理代码后定向复核 11 项通过。独立 Chromium 另验证两种高度下的布局，1100px 高度贴底，420px 高度可滚到底。未安装、未实机、未发布。
- 证据在 `work/resource-options-20261102/`，含源码哈希、检查日志和布局测量。

## 2026-11-02 页签整行宽度修正（源码待安装）

- 开发版本 1.4.1 的新增源码变更；样式 SHA-256：`b1745cf715369d4717b56803a7febf7778c34f086b7a998e6f02a26f913142d7`。不沿用此前安装构建的验收状态。
- 恢复顶部页签铺满可用行宽；保留页面卡片布局。三个页面共 12 项离线检查通过，0 失败、0 跳过。资源页覆盖中英、1366/1920/2560px 和字号 16/24px。
- 未安装、未操作游戏、未实机验证、未发布。证据：`work/full-width-tabs-20261102/checks.log`、`source-receipt.json`。

## 2026-11-02 已安装，等待用户亲自实测

- 已安装开发版 **1.4.1-dev.1102-1204-60b4b721**，44 个文件逐一核验，列表名称有“开发版”标记。
- 三个页面开发版一起安装；旧《行动顺序调整》已完整备份并移出扫描目录。各内部 ID 仅有一份；原订阅／安装位置保留。
- 本轮未启动或操作游戏，未访问 Saves、未改设置或 Rest Guard；不能记为实机通过。公共版本未改变。
- 安装准备时补充资源规划器的顶层 LocalizedText 注册，使停用时名称也可翻译；原运行 JS 未改。该元数据补充及依赖检查 11 项通过。
- 回执：`work/unified-action-close-20261102/install/installation.json`；完整旧安装压缩备份已校验。

# 2026-11-02 — 1.4.1 关闭／跳过统一：仅离线验证

- 结论：源码与离线包完成；未安装、未启动／连接游戏、未实机测试、未发布。无本构建实机截图。
- 348 项不同离线检查通过，0 失败、0 跳过：完整范围 342 项（test-fourth.log），追加无空槽条件后定向 20 项（其中 6 项新增，empty-slots.log）。总数为跨模块检查，不是本 Mod 的实机数量。
- 覆盖三页关闭排尾、一次性长按 X 满一秒、短按与取消、当前回合跳过、下一回合重置、单独／组合安装和旧 AO 24 种加载顺序。原生代码通过隔离夹具回放，非运行中的游戏。
- 覆盖政策／传统／危机满槽、资源满槽、无未分配卡、无合法分配位置时不追加行动；包括从有提醒变为已填满后关闭。
- 覆盖资源提醒开关保存和即时开关、保留其他 Mod 配置、损坏配置不覆盖，以及资源放置／排序／忙碌时输入优先级。
- 覆盖明确跳过建造仅影响已标记定居点，保留科技／单位／空槽提醒，异步存档后重新检查新阻挡。真实引擎是否接受留空建造推进仍须实机验证；自动推进遵守原版条件，使用手动下一回合入口。
- 独立 Chromium 覆盖中英提示、720/1366/1920px 与字号缩放、关闭旁等尺寸按钮、底部提示避让、原生鼠标／键盘确认处理。不等同于 Gameface 最终渲染或实体手柄验收。
- 证据：仓库 `work/unified-action-close-20261102/结果.md`、`source-receipt.json`、`packages.json`。

以下为历史版本记录，不继承为当前版本实机通过。

---

# 2026-11-02 — 1.4.0 行动功能归并：仅离线验证

运行代码已变更，历史实机结论不能作为本版本实机通过。尚未安装、实机验证或发布。本次检查与发行包记录见仓库 `work/action-order-distribution-20261102/结果.md`；覆盖领域独立性、原生面板调用链、加载顺序、资源守卫交接、异步保存与清理。

---

## 2026-11-01 集成统测回执（1.3.1 已安装，未公开发布）

本记录核对统测会话 `01a19609-982c-7712-9828-d7b27b8f7bdd` 的原始结果与截图后并入；本次接收回执未操作游戏。

- 三角居中／内收样式已随组合安装进入 1.3.1，替代此前“未安装”的当前状态。T53 中文实机通过原生焦点和输入事件切换食物为避免，警示红边框／下三角与金色焦点并存，绿色上三角居中且位于边框内。
- Cohtml 的伪元素 `getComputedStyle` 返回不可靠；三角几何位置依据真实截图及安装 CSS，不能单凭伪元素计算值判定。
- 资源页只有一个 `ResourceDefer`；行动顺序／旧 BCS 跳过控件均为零。原生激活后关闭页面并进入 `deferred` 状态，T53 不变。
- 与垃圾时间资源桥接实测返回“无需调整”，`error=false`；前后 7 个定居点资源分配相同。未提交重新分配；真实重分配、失败回滚及旧版缺失状态码分支仍未获得本轮实机覆盖。
- 平台 macOS ARM64，游戏 1.5.0，原生 UI/API/输入事件链；未连接物理手柄。963 项通过是跨 Mod 离线测试总数，不是资源规划单项或全部实机验收数。
- 按统测恢复回执，422 个原文件／6 个目录恢复核验完成，原设置与 Rest Guard 状态恢复，4 份恢复压缩包删除，游戏与控制进程退出并释放锁。
- [完整统测报告](../../work/integration-test-20261101/RESULTS.md)；原始证据：同目录 `resource-native-focus.json`、`resource-defer.json`、`garbage-resources.json`、`07-resource-markers-small.jpg`、`restoration.json`。

以下保留各轮当时的状态，不代表当前仍未安装。

## 2026-10-31 三角标记内收与居中（源码，未安装）

- 上／下三角完整移到边框内侧，顶部或底部偏移归零；略缩小标记，以显式水平变换居中，去掉负外边距。
- 离线检查覆盖居中与贴内沿、焦点下保留红绿标记；尚未安装或实机复测此微调。

## 2026-10-31 警示红、扁平焦点实机复测（已安装，未发布）

- 首轮发现链式 `:not(.disabled)` 焦点选择器在游戏内未产生金色填充，改为简单选择器及显式禁用覆盖；安装、重启、重新加载后确认生效，最终无临时样式。
- 五张最终截图逐张审阅：警示红避免／绿色倾向的聚焦、无框清除图标、排序焦点、操作按钮焦点。红绿边框与上下三角在焦点填充下保持可辨。
- 两项离线样式检查通过，最终五种实机计算样式检查通过；原生输入注入，非实体手柄验收。T21 锁定分配场景，无回合推进或资源分配变化。
- 游戏及控制命令结束，413 原存档与 6 个目录核验一致；恢复设置及 Rest Guard，移除测试副本并删除 3 份恢复压缩包。
- 证据：`work/resource-planner-flat-focus-live-20261031/RESULTS.md`、`visual-checks.json`、`cleanup.json` 及五张 `final-*-focus.png`。

# 2026-10-31 — 1.3.1 / Action Order extraction — source only

This paired source change is not installed, live-accepted or published. [Full offline evidence and limits](../civ7-action-order/VALIDATION.md) · [migration](../civ7-action-order/docs/migration.md). Earlier installation and acceptance records below describe their own versions.

---

## 2026-10-31 扁平焦点与倾向方向标记（源码，未安装）

- 去除规划按钮的原生立体焦点纹理，鼠标悬浮／键盘和手柄焦点均使用细框内柔和金色填充。
- 倾向淡绿边框、上缘绿色上三角；避免警示红边框、下缘红色下三角。焦点不覆盖偏好颜色，清除图标继续无框。
- 两项浏览器样式回归通过，无跳过；审阅六种普通／焦点／偏好组合的离线对比图。此图使用占位符，不代表实机图标或引擎验收。
- 未操作游戏、未安装、未发布。证据：`work/resource-planner-flat-focus-20261031/`。

## 2026-10-31 四区布局实机审阅（已本地安装，未发布）

- 四区：左侧主要操作、顶部排序／高亮、定居点左侧倾向、定居点右侧资源槽与未分配池（共用资源区）。上下三组保持，七种产出及清除按钮同排，资源槽在右。
- 实机发现并修复：按钮内容的百分比高度撑大区域入口与幸福度选项；分配锁定时主要操作区首按钮禁用导致焦点丢失；三态／选项的响应式 class 更新清掉焦点标记。原生按钮画面与选中边框分别表示焦点和选择。
- 最终安装包经重新启动、读取 T21 测试副本验证。原生输入事件注入覆盖左摇杆选择区域、A 进入、B 分层返回、LT／RT 切区、排序／高亮上下移动、定居点倾向上下左右移动与三态切换，以及进入已分配资源槽。截图经人工审阅；未使用实体手柄。
- 134 项离线检查通过，无失败／跳过。当前存档资源分配锁定、未分配池为空；本轮不声称交换、批量搬运、自动分配或幸福度实际分配通过。未推进回合或下达单位指令。
- 证据：`work/resource-planner-four-zones-live-20261031/`，包括 `final-nav.json`、`final-preferences.json`、`final-resources.json`、最终截图、安装哈希与收尾校验。下方保留历史记录。

## 2026-10-31 卡片左右布局、原生焦点与区域选择（源码，未安装）

- 保留上下三组，卡片内恢复左侧产出倾向／右侧资源槽；清除倾向移至产出旁，清除和重置使用原版 `resource_return_button_default.png`。
- 所有规划按钮使用原版 `fxs-button` 背景／焦点／按下图层，移除蓝色焦点和默认金色填充，选中项保留空心边框；按钮改名“按倾向分配”。
- 默认区域选择状态，左摇杆／方向键选择区域，确认进入，取消退回。左右扳机的原生 `navigate-input` 事件切区，消费释放事件防止多跳；拾取资源、繁忙时阻止切区。X／Y／右摇杆按下不再用于进入区域，已有资源操作快捷键保留。
- 133 项离线检查通过（无跳过）；另以原生 Activatable、焦点注册和空间导航完成浏览器夹具检查：区域选择后 A 进入、操作区到定居点、定居点上下往返、排序与高亮移动。检查图使用占位图标，不是实机截图；未连接游戏、未安装、未做实体手柄验收。
- 证据：`work/resource-planner-native-regions-20261031/`。

## 2026-10-31 恢复纵向分组（源码，未安装）

城市、城镇、未连入贸易网络恢复上下三组，每组占满定居点区域宽度。保留组内排序、卡片内容、资源操作和焦点逻辑。下方三栏相关记录为历史实现。 中英文离线渲染检查通过，覆盖 1366／1920／2560 宽度、两档字号，以及 BCS 样式加载顺序；未操作游戏。

# 验证记录

## 2026-10-30 资源界面职责迁移（仅源码，未安装）

- 从 Better Controller Support 移除 commerce 组件工厂包装、资源 DOM 标记和资源布局 CSS；城市／城镇／未连接三栏、紧凑卡片、内容宽度标签栏由资源规划器自身提供。保留左侧操作区、中央排序／定居点和右侧未分配区；鼠标与手柄共用布局。
- 保留原分组对象、模型索引和分配回调；初始焦点使用原始平铺列表索引，避免三个组各自的首卡同时申请焦点。资源／政策回合末提醒和跳过仍在 Better Controller Support 的统一行动排序中。
- 两个模块合计 252 项离线回归通过，无失败、无跳过；其中资源布局覆盖中英、1366／1920／2560 宽度、16／24px 字号、资源更新、输入设备切换、单独加载和两个 Mod 样式的两种加载顺序。截图为隔离浏览器的原生结构回放，使用占位图标，不是游戏截图或实体手柄验收。
- 此轮未申请游戏锁、未连接游戏、未更换安装目录、未修改 Saves／设置，未发布工坊。旧安装记录不覆盖本次迁移。源码基线、差异和测试日志见 `work/controller-ui-split-20261030/`。


## 2026-10-30 综合评分与默认倾向（离线回归，已本地安装）

已安装至工坊本地目录，完整旧版备份及 29 个安装文件的哈希均已验证。记录：`work/resource-planner-defaults-20261030/installation.json`。本轮未操作游戏、修改设置或存档，未发布。

- 主入口改为“自动按综合评分分配”；所有合法定居点参与，未标记项仍用基础权重，倾向×2／避免×0保持逐项加权。保留容量、合法性、幸福度补到0和整体不降分限制。
- 默认倾向取各产出正值最高的裸产出，并列都标记。基础值扣除已分配资源的直接产出，不计百分比加成；独立于“包含骆驼／已分配资源”的候选过滤。默认快照只读定居点，不进行资源合法性矩阵或规划。
- 未手动编辑时仅在打开面板、自动分配或明确重置时刷新；任何手动修改／清空都会持久化当前地图的 manual 状态，重开及分配不重算，清空全部也保持。旧版已有标记迁移为手动配置。重置替换标记并恢复 auto 状态，不发送分配。
- “一键整理”和“重置默认倾向”位于左侧倾向／分配区，手柄拾取或进入其他区时不可激活。顶部排序与高亮右对齐。中英文同步。
- 90 项离线回归通过，覆盖裸产出读取、候选过滤独立性、并列／零值、无标记综合分配、避免权重、旧配置迁移、手动清空后的重开／分配、重置不操作资源、其他地图设置保留和输入区隔离。中英各 3 张布局图检查无横向溢出、切区高度稳定、右对齐及按钮归属。
- 本轮未做游戏内验收；历史实机证据不覆盖本次默认倾向新逻辑。证据：`work/resource-planner-defaults-20261030/`。

## 2026-10-30 图标与文字统一（本地安装，布局检查）

- 左上分配、勾选项和幸福度填充统一为图标＋文字的操作网格，骆驼使用原生资源图标，城市／城镇使用原生定居点图标。顶部图标排序保持原样。
- 倾向和避免使用金色上箭头／红色禁止符号，配中英文名称和评分倍率；产出卡片下方有状态说明，定居点摘要带产出图标、名称及偏好说明。与原生绿色／红色产出增量分开显示；点击标记仍不发送资源分配。
- 地图工具 `card-reminders.js` 的“本回合跳过”向左预留 5.5rem，避开原生关闭按钮 4rem 范围；不改变跳过逻辑。1280／1920／2560 宽度 × 14／18／24px 根字号共 9 个最不利纵向重叠布局均无关闭按钮覆盖。
- 83 项资源规划回归、18 项地图工具提醒回归通过。使用游戏 Solid 与实际 UI 源码生成中英各 3 个区布局，检查无横向溢出、切区高度稳定、三态文字更新和完整翻译；图片采用占位资源图标，属于离线布局检查。
- 已按锁协议备份完整的两个安装目录，再替换 4 个 UI／文案文件并验证哈希。本轮未启动、重载或操作游戏，未改设置或 Saves，未发布。证据：`work/resource-planner-icon-polish-20261030/`。下面的实机记录属于本次样式微调之前的版本。

## 2026-10-30 1.3.0 Mac 实机回归（本地安装，未发布）

- 使用独立古典时代 T30 副本；中英文实际打开界面。原生控制器输入链路验证拾取后只保留合法定居点焦点，B 取消不关面板、再次确认实际放置；macOS 指针事件验证左键拾取、右键取消与放置。三态与多选标记不发送分配；英文明确分配 1 份资源收到引擎确认且顺序不变，快捷移除同样确认。
- 实机发现并修复 Map Tools 紧凑布局覆盖、Mac 手势图标缺少设备前缀，以及切区时旧按钮焦点失效。修正限定在资源页，关闭后恢复图标解析，检查第三方钩子所有权。原生 Coherent 不支持查询中的 `:not()`，改为 JavaScript 禁用过滤。
- 83 项离线测试通过，0 失败、0 跳过。最终安装版连续三轮切区共 16 个焦点检查通过，拾取／取消／方向导航／实际放置通过；两次 B 分层退出并关闭，重开默认倾向区，钩子清理通过。完整执行日志、截图、最终安装回归及收尾证据在 `work/resource-planner-zones-20261030/live/`，汇总见该目录的 `REPORT.md`。
- **限制：**实体手柄未验收；中键的系统注入没有产生可观察的游戏事件，未判通过；Shift 拖动和其他时代未完整复测。旧 `civ7-controller-bridge-v1` 独立存储键会遮蔽共享设置，测试中暂时隔离；第一次活动包装器写入前没有 SQL 原始共享值快照，因此不能宣称该原文逐字还原。有效原生读取值、原行快照、诊断和恢复说明均保留；原环境下持久化仍需单独处理。

## 2026-10-30 1.3.0 多选偏好与三区布局（离线，未安装）

- 多选三态：普通 → 倾向 ×2 → 避免 ×0；标记只保存，明确分配时才计算。原单项字符串按倾向 ×2 读取；空标记删除；保留其他定居点、地图和共享设置。按项倍率用于边际收益、整体收益及迭代／骆驼比较；避免不是强拆已有资源。
- 默认倾向区；另有资源区和顶部排序／高亮区。原生动作入口和实际设备图标提示，活动区描边；手柄只能导航当前区。B 分层取消拾取、退出卡槽编辑、退出大区，下一次才关闭；快捷操作沿用原生模型。将原生托盘 Provider 包住顶部与主体，避免顶部控件不在快捷动作的事件路径内。
- 左上分配与幸福度填充、右上图标排序／高亮、左下定居点（左产出／偏好，右卡槽）、右下未分配。排序读原生时代允许项，铁路／工厂限现代；高亮按当前生效的资源收益展开图标。失效的旧排序选择回退为幸福度。
- ARM64 Node v24.22.1：78 项离线测试通过，0 失败、0 跳过；31 个 JavaScript/测试文件语法通过，XML 与清单校验通过（25 处引用、24 个独立文件）。覆盖多选／旧设置迁移、不触发即时分配、混合资源逐项评分、避免和幸福度截断、实际输入回调、原生托盘入口、返回层级、资源完整身份与时代工具过滤。
- 独立 Chromium 使用本机游戏 Solid 运行库、实际 rp-ui 和原生 YieldDelta，替换引擎与资源图标，生成中英各三个区的布局检查图。1920×1080 下无横向溢出；切区保持工具栏高度及全部分配按钮。发现并修复提示区动态更新删除兄弟控件的问题。此 fixture 的卡槽是占位图，仅验证新组件响应式与布局，不能证明游戏事件路由或实体手柄焦点。
- 证据：`work/resource-planner-zones-20261030/tests.txt`、`checks.json`、`preview/report.json` 与六张带离线标识的布局图；开发包 `civ7-resource-planner-1.3.0-dev.zip`。未连接或操作游戏，未改存档、设置或安装版，未发布。安装版仍为先前供用户测试的 1.2.0；历史工坊回执保持原样。

## 2026-10-30 1.2.0 独立版与手柄工具区（离线）

- 移除 `bz-re-sorts` 依赖，整合资源、贸易、帝国资源、宝藏舰队的配套页面与样式；来源和导入基线哈希见 `docs/standalone-origin.json`，归属见 `NOTICE.md`。原 1.1.0 工坊发布回执未改。
- 顶部图标排序取代侧边六图标和原排序下拉框；保留全部 15 种排序条件及产出高亮筛选。手柄普通导航跳过工具区，专用工具动作进入，取消返回原控件；重建的资源控件按资源 ID、地图外标识及源城市恢复焦点。未选资源的定居点编辑路径保留。
- 一键整理仅整理资源图标，不移动资源或重新排列定居点。手柄快捷动作与鼠标中键共用快速填入／移除入口；已选资源时快捷动作批量移动同类资源，移除动作卸下源定居点的同类资源。
- 新的批量执行保留地图内／地图外身份，逐份等待确认，不并发发送。覆盖部分容量、单一定居点快速填充、取消、换回合、锁定、超时、重复激活和失效资源；已确认部分保留。运行时检查界面仍在最上层及 Rest Guard 遮罩；离开页面停止后续请求。
- ARM64 Node v24.22.1：66 项测试通过，0 失败、0 跳过；30 个 JavaScript/测试文件语法通过，XML 可解析，清单 25 处引用（24 个独立文件）存在，catalog 与清单版本及依赖一致。独立依赖测试仅使用打包源文件与本机原版游戏文件解析导入，不使用安装的 Re-sorts 文件。
- 新入口、提示和状态同时覆盖英文／简体中文，模拟其他语言英文回退通过。来源现有英文页面文案仍优先引用原生翻译键。
- 证据：`work/resource-planner-standalone-20261030/tests.txt`、`checks.json`；本轮未运行游戏、未安装到游戏目录、未修改 Saves、未发布。未验证真实游戏中的布局、事件路由或实体手柄手感；这些仍需后续授权实机验收。


## 2026-10-29 手柄资源放置焦点（仅仓库源码）

- 修复前新增两个离线用例均失败：选中资源后规划按钮仍可导航；确认定居点进入城内编辑而非放置。
- 手柄拿起资源后，倾向/清除倾向、自动分配、幸福度填充、规划选项及排序控件禁用；排序热键暂停。使用原生 Activatable 的 disabled 焦点过滤，定居点卡片直接确认放置，锁定或非法目标不发送操作。底部提示及空槽图标同步为确认放置。
- 取消选中或切回鼠标后恢复相应控件；未选资源时保留进入定居点挑选已有资源的路径。鼠标产出图标放置路径不变。
- ARM64 Node v24.22.1：`node --test mods/civ7-resource-planner/tests/*.test.mjs` 共 48 项通过，0 失败、0 跳过。覆盖控件随选中/取消/设备切换的禁用状态、直接放置/非法/锁定目标、真实模型回调构造的地图外资源请求、手柄底部提示及既有取消/排序/分配回归。3 个修改的运行时 JavaScript 文件语法检查通过。
- 仅离线组件与模型 fixture；没有启动或连接游戏，没有替换安装版、修改存档或发布工坊。实体手柄焦点移动和游戏内操作仍待实机验证。

## 2026-10-23 1.1.0 Mac 实机验收

- Civilization VII 1.5.0 (1311346) Metal，Resource Re-sorts 3.0.2；使用探索时代第 1 回合存档副本，14 个定居点。全程游戏锁和临时 Rest Guard debug 活动范围；每轮开始前完整备份并逐文件 SHA-256 校验 Saves。
- 原生鼠标左键拾取、右键取消后面板仍打开；空选中时右键正常关闭。通过城市产出区域放置骆驼，引擎确认实际新增资源且槽位 8 → 11，未误触倾向规划。
- 点击排序切换幸福度升降序；城镇幸福度填充实际装入 7 份，全部 14 个定居点顺序保持不变；关闭重开后顺序根据新产出重新计算。按既有生产力倾向实际装入 6 份资源。
- 通过游戏原生语言选项切换、重启，确认英文界面及状态为 “Done: assigned 7 resources; changed 7 assignments.”；中文按钮、提示、分组和完成提示正常。发现原生 `LOC_YIELD_*` 含图标标记，改为 `LOC_YIELD_*_NAME`，重启复查标签显示正常；离线语言 fixture 也保留了该差异。
- 41 项离线测试全部通过，0 失败、0 跳过。实机证据位于 `work/resource-planner-1.1.0/validation/`（本机开发记录，不随模组上传）。
- 未推进回合、未保存测试资源调整；原有 349 个存档路径、大小、SHA-256 保持一致。结束恢复简体中文及原有 Mod 偏好、移除临时活动范围。
- 这不是现代时代、多人、全部第三方资源兼容或完整实体手柄验收；未对所有地图做帧率基准测试。

## 2026-10-23 中英文本地化（离线）

- 新增 40 个中英文键，使用原生 `EnglishText` / `LocalizedText Language="zh_Hans_CN"`，通过游戏语言解析；主菜单及对局均加载文本。产出名称继续使用游戏原生键。
- 覆盖按钮、工具提示、无障碍名称、资源分类、分组计数、空态、倾向、进度、锁定、设置错误、取消原因、引擎拒绝和恢复提示。纯算法/设置层以稳定键报告错误，由 UI 层翻译。
- `node --test tests/*.test.mjs`：41 项通过，0 失败、0 跳过。中英键和参数一致；实际界面函数与控制器在英文、简体中文及模拟英文回退下通过；原有排序、分配、鼠标与手柄选中回归继续通过。
- 14 个 JavaScript 文件语法通过，XML 可解析，11 个清单引用存在。新增 `README-en.md`，更新本地工坊英文说明草稿；发行回执和版本未改。
- 未启动或连接游戏、未读取/修改存档、未替换安装版、未发布工坊。本轮没有实机英文布局或完整实体手柄验收；模拟语言解析及回退不是游戏运行时的实测证据。

## 2026-10-22 离线回归

- 本次遵照用户要求，仅修改仓库并运行离线测试；未实际操作游戏，未修改存档或已安装模组。
- 修复前运行 `node --test tests/interaction.test.mjs`：5 项失败，分别捕获地图外资源标识丢失、重复拖拽取消选中、换资源拖拽未建立新选中、取消事件未阻止关闭、收益变化自动重排。另一个新增失败用例捕获城市产出按钮抢占放置点击并启动倾向规划。
- 修复后验证点击排序和关闭重开、调整收益时保持顺序、分配完成不重排、实际分配请求保留资源 ID、拖拽选中、右键／Esc 取消、空选中时正常关闭、非法放置目标以及倾向图标的点击优先级。
- 本机全部 30 项离线测试通过，0 跳过；11 个 JavaScript 文件语法检查、ModInfo XML 和 8 个运行时文件引用检查通过。
- 这些测试只覆盖离线回调及响应式逻辑，不能替代游戏中的鼠标命中、事件路由、视觉布局和引擎确认测试。下列实机记录均为历史版本验证。

验证环境：2026-10-16，Windows，《文明 VII》1.5.0 (1311346) DX12；基础优化 Mod 为已安装并启用的 Resource Re-sorts 3.0.2。

## 已完成

- 在本机实机加载扩展；原工坊资源页 SHA-256 保持不变，安装文件与交付源码逐一核对一致。
- 默认幸福度降序、城市／城镇／未连接分组、组内排序、折叠与展开。
- 点击文化图标一次装入 4 份相关资源，倾向高亮及文字显示，重启后倾向仍保留。
- 两个开关重新打开面板时均默认关闭。
- 两个幸福度入口均成功执行。仅城镇入口装入 7 份资源，原城市的分配及幸福度保持不变。
- 最终骆驼计算：一次重排装入 13 份资源，其中 2 份骆驼将城市总槽数从 8 增至 14。该次调整后全体定居点实际六项产出的加权总分从 4385.168 增至 4549.250，增加约 164.082。
- 同一状态再次执行返回“无需调整”，没有重复搬动资源。
- 清除倾向后定居点名称、徽标及产出保持正常，测试倾向已经清空；结束时恢复到最新的第 66 回合存档，资源分配与载入时逐项一致。
- 16 项纯算法测试通过，全部 JavaScript 语法和 ModInfo XML 解析通过。

算法测试覆盖换算权重、幸福度饱和、百分比与仓库、城市城镇不同效果、最大权重匹配、保留等收益原分配、骆驼迁移、骆驼无空槽扩容、生产队列条件、幸福度优先级和容量、设置隔离与分组顺序。

## 范围

实际分配操作使用探索时代第 1 回合的已有存档，其他存档验证了资源锁定状态与较多定居点的面板。未推进回合，未保存测试分配，未覆盖用户存档。没有对现代时代、多人与所有第三方资源 Mod 作实机穷举；具体算法边界见 README。

同目录上一级的 `resource-planner-allocation.jpg` 和 `resource-planner-groups.jpg` 为实际游戏窗口截图。


## 2026-10-30 三列布局职责解耦（源码，未安装）

删除资源规划对 Map Tools 的 `.mtg-resource-columns`、`.mtg-resource-column`、`.mtg-resource-card-body` 的布局覆盖。卡片产出区的固定宽度只用于默认布局；外部紧凑布局生效时不再应用。保留评分、排序、资源动作、分区标记和焦点资格判断，未修改手柄 Mod。

- `node --test mods/civ7-resource-planner/tests/*.test.mjs`：90 项通过。
- 实际两份样式的离线浏览器组合检查：1920/2560 宽度 × 两种样式加载顺序，共 4 组通过；三列同排、卡片内部纵排、产出区不撑出卡片，鼠标切换恢复默认、再切手柄恢复三列。
- 证据：`work/resource-planner-layout-compat-20261030/report.json` 与 `tests.txt`。测试使用简化 DOM，不证明实机焦点导航或 Coherent 渲染通过。
- 本轮未安装、未操作游戏、未发布。


## 2026-10-30 手柄导航、占用槽交换与单份退回（已本地安装）

- 默认区导航：将原生 SpatialSlot 提升至资源页整体，包含顶部操作和定居点产出偏好，不修改卡片内部排列。原生空间导航算法的浏览器 fixture 验证单列／三列的向下与向上往返；尚未验证游戏内完整 FocusManager 路由。
- 满槽定居点可确认进入选择具体资源；有空位时仍可直接放置，或通过 Y（默认 Xbox）进入交换槽位选择。已拿起的资源保留地图／地图外完整身份。
- 交换优先使用原生交换请求，等待两个目标状态确认。原生双向交换不可用时逐步卸下目标、放入所选资源，再尝试把原目标资源放回来源；放不回时保留在未分配区。正向放入也失败时，仅尝试恢复本次移出的目标资源。取消／失焦／规则锁／上下文改变／超时后停止后续请求，已确认的调整保留。
- 已拿起的已分配资源：R3（默认 Xbox）卸下单份，底部使用实际设备图标及中英文动作文字；原先此快捷键卸下同类资源，现已改为单份。未分配来源按 B 即可放下选择。
- 103 项离线回归通过，含 11 项交换流程测试与手柄提示、单份退回、满槽入口回归。记录：`work/resource-planner-swap-20261030/tests.txt`、`navigation-report.json`。
- 安装文件已准备：`work/resource-planner-swap-20261030/prepared.json`，仅安装，不启动、重载或操作游戏。当前安装队列由游戏锁程序调度；尚无 `installation.json`，不能视为已安装。未操作游戏、设置或存档，未发布。

安装完成：`work/resource-planner-swap-20261030/installation.json`。完整原安装目录已备份并校验，7 个文件更新、全部 29 个安装文件校验通过。游戏保持退出，未操作设置或 Saves；无本轮实机验收或发布。


## 2026-10-30 B layout and happiness targets (offline only)

Implemented selected B layout with native icon calls, whole-button toggles, compact border-only preferences, two left-aligned sort/highlight rows and top-aligned resource pool. Added persisted settlement 0/5 and city 0/20 happiness targets, effective city max, and town-only city protection. New target regression plus existing exchange/input/localization tests pass. Detached Solid UI fixture checks both languages at 1366/1920, one/three-column styles and three controller zones (24 cases, eight screenshots); engine icons and input are mocked in this fixture. This does not prove Coherent rendering or physical-controller behavior. Evidence: work/resource-planner-layout-b-install-20261030. Installation only; no game interaction, settings/Saves changes or Workshop upload.


## 2026-10-31 Deferred resource reminder — source only

Moved zone-level hints to the native bottom tray and combined short Cancel/hold-one-second-and-release instructions. Added a mouse resource/hourglass button beside the native Close bounds and native tooltip. Normal cleanup dismisses the reminder for this turn; deferred cleanup preserves an in-memory turn-scoped request. Standalone native action-panel guards delay it until native blockers and unit movement are cleared; optional Better Controller Support consumes the same intent, puts policies before deferred resources, and suppresses its duplicate resource-page Skip UI. Explicit force-end-turn retains its original route.

Full offline run: 144 passed, zero failures/skips, including both native-shaped resource-column browser fixtures. Follow-up targeted run: 33 passed, including the additional real tab-object button test, hold interruption, resource-close intent, reminder order, and standalone/controller-provider ownership. XML/import/syntax checks pass. Native resource/hourglass and close artwork are referenced directly; actual in-game rendering and physical-controller behavior are not verified. Both resource and BCS compatibility source changes remain uninstalled/unpublished; no game, settings, or Saves interaction. Evidence: work/resource-planner-defer-20261031/validation.json.


## 2026-10-31 Current focus visibility — source only

Reproduced the invisible preferred-yield focus: before/after border color, background and shadow were identical in production CSS. Native Activatable, focus registration and spatial-navigation code in a detached browser successfully moved from the action rail right to yields, up/down between settlements, left/right among sort icons, down to highlighting, and activated a new sort through an engine-input Accept event. This establishes offline paths only; it does not rule out a live focus-entry/runtime issue.

Fixed current focus with a distinct pale cyan/white border, inset ring and tinted background; muted operation-zone outlines retain their meaning. Scoped focus tracking marks only the current enabled control, clears on device change/outside focus/unmount, and retains the existing delayed native-focus repair. Gold/red remain preference/avoidance markers when not focused. Repro turns green; controller-focus lifecycle and full Resource Planner tests pass. Native icons/audio/engine state are mocked in browser evidence; no live UI or physical controller validation, installation, or publication. Evidence: work/resource-planner-focus-20261031.
