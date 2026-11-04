# 2026-11-05 六个 Mod 功能统测

本轮结束；不是全量验收完成。按48条功能/缺陷任务记录：已验收16条、待实机验收17条、待复测3条、部分验收12条。所有结论绑定下列测试构建；未发布任何 Mod。

游戏 1.5.0（1311346）Metal；游戏视口5120×2160、截图窗口5120×2100；采集时间为2026-11-05 03:20–03:49（Australia/Sydney，UTC+11）。使用隔离副本及原生UI、游戏引擎只读状态/原生输入；系统鼠标核对队列取消与休息菜单，实体手柄未验收。截图为实际画面，1920px预览可读，原图摘要见截图清单。

## 构建与离线检查

| Mod | 实际测试构建 | 离线通过 |
|---|---|---:|
| civ7-better-settlement-ui | 0.2.17-dev.1103-1153-0e404977 | 92 |
| civ7-better-policy-ui | 0.2.2-dev.1103-1153-1533bfdb | 16 |
| civ7-resource-planner | 1.4.2-dev.1103-2038-c953488d | 140 |
| civ7-rest-guard | 1.8.7-dev.1103-2223-9b620247 | 129 |
| civ7-war-controls | 0.6.3-dev.1102-2206-21d296ec | 416 |
| civ7-research-transfer | 0.3.1+1105-0315-fd11f517 | 56 |

另有共享行动模块100项通过，合计949项模块检查，0失败、0跳过，可能含共享重复覆盖，不等于949个实机场景。政策测试临时叠加最新提醒两文件，结束已恢复。Resource Planner使用现有Workshop目录内的开发构建，没有切换安装渠道。

## 新发现与版本变化

政策compact-layouts.js:24在载入期对缺少matches方法的节点抛错。已反馈开发会话，开发者离线复现并修复（8个新增回归、全包24项通过），见[修复任务](https://github.com/users/Stupidism/projects/5?pane=issue&itemId=293760562)。新补丁尚未安装实机复测；本轮政策截图属于修复前构建。其余受测模块源码变化见source-drift.json。

战斗专用样本停在原生加载末尾，同时出现WorldUI未定义；没有伪造就绪或绕过载入。开发者确认同摘要存档曾在同版游戏成功，因此根因未定，不能认定War缺陷或存档不兼容。商人占格专用样本尚缺。

## 分任务结果

### zhFKaKM · 不再来一回合：读档及等待开始被误算为连续游戏时长

**已验收**。测试构建：`1.8.7-dev.1103-2223-9b620247`。

本轮Rest启用且未用debug活动标记。等待开始阶段两次采样间隔2612ms，elapsed均0、loading=true；原生开始操作后地图就绪，loading=false、elapsed增长至13391ms，随后正常触发一分钟休息。

证据：[rest-wait-sample.json](rest-wait-sample.json)、[rest-clock-start.json](rest-clock-start.json)、[rest-clock-later.json](rest-clock-later.json)、[rest-after-continue.json](rest-after-continue.json)。

![不再来一回合：读档及等待开始被误算为连续游戏时长](截图/14-取消退出保留休息.png)

### zhFKaN0 · 不再来一回合：未完成和平谈判时强制休息无法打开设置

**待实机验收**。测试构建：`1.8.7-dev.1103-2223-9b620247`。

普通地图及夜间休息的原生菜单/选项通过，但未完成和平谈判或外交等待的专项复现，不外推为通过。

证据：[rest-menu-clock.json](rest-menu-clock.json)、[rest-confirm.json](rest-confirm.json)。

### zhFTmk4 · 生产队列的取消按钮被城市详情遮挡

**已验收**。测试构建：`0.2.17-dev.1103-1153-0e404977`。

T106 城市详情同时打开；原生队列输入完成左键提前、右键取消，实际系统鼠标点击取消后队列 7→6；全部可见行中心命中正确。限本轮 5120×2160 游戏视口。

证据：[queue.json](queue.json)、[queue-hit.json](queue-hit.json)、[queue-native-click.json](queue-native-click.json)。

![生产队列的取消按钮被城市详情遮挡](截图/02-队列实际点击取消通过.png)

### WAR-02 · 自动攻击后保留选中单位

**待实机验收**。测试构建：`0.6.3-dev.1102-2206-21d296ec`。

战斗副本载入停在末尾：Loading.isLoaded=false，WorldUI未定义，War运行入口未注册；未绕过原生就绪门槛。开发会话核对同摘要样本曾在同版游戏成功，不能判定存档不兼容或归因War。商人占格专用样本也未确认。

证据：[battle-after-start.json](battle-after-start.json)、[battle-ui-errors.txt](battle-ui-errors.txt)。

![自动攻击后保留选中单位](截图/10-战斗样本载入状态.png)

### WAR-03 · 加入军队后保留预期选中状态

**待实机验收**。测试构建：`0.6.3-dev.1102-2206-21d296ec`。

战斗副本载入停在末尾：Loading.isLoaded=false，WorldUI未定义，War运行入口未注册；未绕过原生就绪门槛。开发会话核对同摘要样本曾在同版游戏成功，不能判定存档不兼容或归因War。商人占格专用样本也未确认。

证据：[battle-after-start.json](battle-after-start.json)、[battle-ui-errors.txt](battle-ui-errors.txt)。

![加入军队后保留预期选中状态](截图/10-战斗样本载入状态.png)

### WAR-05 · 增援时用上键切换目标并用 Esc 返回镜头

**待实机验收**。测试构建：`0.6.3-dev.1102-2206-21d296ec`。

战斗副本载入停在末尾：Loading.isLoaded=false，WorldUI未定义，War运行入口未注册；未绕过原生就绪门槛。开发会话核对同摘要样本曾在同版游戏成功，不能判定存档不兼容或归因War。商人占格专用样本也未确认。

证据：[battle-after-start.json](battle-after-start.json)、[battle-ui-errors.txt](battle-ui-errors.txt)。

![增援时用上键切换目标并用 Esc 返回镜头](截图/10-战斗样本载入状态.png)

### POL-02 · 空政策槽关闭时延后并允许本回合跳过

**待复测**。测试构建：`0.2.2-dev.1103-1153-1533bfdb + 提醒模块 d9a12fb92781`。

受测旧构建：有空槽时长按跳过使按钮禁用、页面保持打开、三个已提交槽数组仍为空、回合不变。T2已无空槽，不能证明跨回合提醒恢复。统测发现观察器异常后开发会话已改源码，最新补丁未安装，旧实机结果不沿用。

证据：[policy-hold.json](policy-hold.json)、[policy-next-turn.json](policy-next-turn.json)。

![空政策槽关闭时延后并允许本回合跳过](截图/06-政策空槽提醒禁用状态.png)

### BSU-03 · 在项目栏按右列优先排列队列并支持跨列导航

**部分验收**。测试构建：`0.2.17-dev.1103-1153-0e404977`。

队列从 1→8 项，第八项进入左列；右列优先几何与鼠标命中通过，跨列实体手柄导航未测。

证据：[queue.json](queue.json)、[queue-hit.json](queue-hit.json)。

![在项目栏按右列优先排列队列并支持跨列导航](截图/02-队列实际点击取消通过.png)

### BSU-04 · 仅为跨时代建筑显示角标，隐藏奇观标签

**已验收**。测试构建：`0.2.17-dev.1103-1153-0e404977`。

粮仓、锯木场、港湾、渔场显示跨时代角标；摩索拉斯王陵墓、僧侣墩、吴哥窟没有该角标，原生重复标签隐藏。

证据：[city.json](city.json)。

![仅为跨时代建筑显示角标，隐藏奇观标签](截图/01-城市生产与队列.png)

### BSU-05 · 用鼠标在生产队列中上移或取消项目

**已验收**。测试构建：`0.2.17-dev.1103-1153-0e404977`。

T106 城市详情同时打开；原生队列输入完成左键提前、右键取消，实际系统鼠标点击取消后队列 7→6；全部可见行中心命中正确。限本轮 5120×2160 游戏视口。

证据：[queue.json](queue.json)、[queue-hit.json](queue-hit.json)、[queue-native-click.json](queue-native-click.json)。

![用鼠标在生产队列中上移或取消项目](截图/02-队列实际点击取消通过.png)

### BSU-06 · 关闭未完成建造后排尾或显式跳过当前城市

**部分验收**。测试构建：`0.2.17-dev.1103-1153-0e404977`。

空生产队列城市长按跳过 1.1 秒，在松手前关闭面板；队列仍空，回合仍106，未发送结束回合。普通关闭排尾及下回合恢复未完整覆盖。

证据：[skip-city.json](skip-city.json)。

### RP-02 · 应用实际可分配资源并核对完成结果

**已验收**。测试构建：`1.4.2-dev.1103-2038-c953488d`。

探索1回合资源未锁定，通过原生“按倾向分配”按钮，实际分配12→32份，与状态“装入20份、调整20份”一致；14个定居点没有超容量。

证据：[rp-examine.json](rp-examine.json)、[rp-run.json](rp-run.json)。

![应用实际可分配资源并核对完成结果](截图/08-资源实际分配完成.png)

### RP-03 · 分配失败时回滚资源变更

**待实机验收**。测试构建：`1.4.2-dev.1103-2038-c953488d`。

没有可自然复现的原生分配失败样本；未通过伪造 sendRequest 或改写引擎返回值冒充失败回滚实测。离线140项通过。

证据：[civ7-resource-planner.tap](civ7-resource-planner.tap)。

### RP-05 · 损坏资源不参与收益、分配和空槽提醒

**部分验收**。测试构建：`1.4.2-dev.1103-2038-c953488d`。

T106和探索T1均读取真实资源清单，但损坏样本数均为0；不将空集合检查视为损坏排除验收。

证据：[rp-damage.json](rp-damage.json)、[rp-exploration-inventory.json](rp-exploration-inventory.json)。

### RP-06 · 在定居点列表末尾重置资源倾向

**已验收**。测试构建：`1.4.2-dev.1103-2038-c953488d`。

修改倾向再滚至列表末尾点击重置，倾向改变并恢复；按钮可命中，所有定居点资源分配前后完全一致。

证据：[rp-reset.json](rp-reset.json)。

![在定居点列表末尾重置资源倾向](截图/05-资源页当前状态.png)

### RP-07 · 将资源选项贴底并标出空槽提醒的选中状态

**部分验收**。测试构建：`1.4.2-dev.1103-2038-c953488d`。

截图确认设置区贴底和提醒开启金框；本轮未完成开启/关闭全路径及实体手柄回归。

证据：[resource.json](resource.json)。

![将资源选项贴底并标出空槽提醒的选中状态](截图/05-资源页当前状态.png)

### RP-08 · 按合法空槽生成资源提醒并支持当回合跳过

**待实机验收**。测试构建：`1.4.2-dev.1103-2038-c953488d`。

分配成功路径已通过，但合法空槽提醒/跨回合跳过及仅剩盐等条件产能资源的定向样本未完成；不得由分配成功推断提醒正确。

证据：[rp-run.json](rp-run.json)、[civ7-resource-planner.tap](civ7-resource-planner.tap)。

### RES-01 · 改选研究时精确扣原节点并向新节点等额转点

**待实机验收**。测试构建：`0.3.1+1105-0315-fd11f517`。

旧自动转点/来源账本原型任务，当前0.3.1已改为显式卡片退款与暂存。任务验收标准不等同于现行实现，保留历史且不以新流程通过覆盖旧原型。

证据：[research-source.json](research-source.json)。

### RES-02 · 区分科技和市政的自付、赠点与溢出来源

**待实机验收**。测试构建：`0.3.1+1105-0315-fd11f517`。

旧自动转点/来源账本原型任务，当前0.3.1已改为显式卡片退款与暂存。任务验收标准不等同于现行实现，保留历史且不以新流程通过覆盖旧原型。

证据：[research-source.json](research-source.json)。

### RES-03 · 读档后恢复转点账本并保护来源未知的旧档

**待实机验收**。测试构建：`0.3.1+1105-0315-fd11f517`。

旧自动转点/来源账本原型任务，当前0.3.1已改为显式卡片退款与暂存。任务验收标准不等同于现行实现，保留历史且不以新流程通过覆盖旧原型。

证据：[research-source.json](research-source.json)。

### BSU-07 · 生产页顶部页签等分整行宽度

**已验收**。测试构建：`0.2.17-dev.1103-1153-0e404977`。

生产/购买两页签实测等宽 1688.8，覆盖当前行。限当前视口。

证据：[queue.json](queue.json)。

![生产页顶部页签等分整行宽度](截图/01-城市生产与队列.png)

### POL-03 · 政策页顶部页签等分整行宽度

**待复测**。测试构建：`0.2.2-dev.1103-1153-1533bfdb + 提醒模块 d9a12fb92781`。

受测旧构建三页签等宽1180.4；三页切换后跳过按钮始终为96×96，紧邻关闭按钮，图标57.6居中。随后开发会话修复观察器，最新补丁未安装/实机复测，不能沿用旧验收。

证据：[policy-input.json](policy-input.json)、[policy-exploration.json](policy-exploration.json)。

![政策页顶部页签等分整行宽度](截图/06-政策空槽提醒禁用状态.png)

### RP-09 · 资源页顶部页签等分整行宽度

**已验收**。测试构建：`1.4.2-dev.1103-2038-c953488d`。

T106资源三页签等宽1180.4；探索时代四页签截图正常铺满，限当前视口。

证据：[resource.json](resource.json)。

![资源页顶部页签等分整行宽度](截图/08-资源实际分配完成.png)

### POL-04 · 政策页跳过按钮跟随原生关闭按钮

**待复测**。测试构建：`0.2.2-dev.1103-1153-1533bfdb + 提醒模块 d9a12fb92781`。

受测旧构建三页签等宽1180.4；三页切换后跳过按钮始终为96×96，紧邻关闭按钮，图标57.6居中。随后开发会话修复观察器，最新补丁未安装/实机复测，不能沿用旧验收。

证据：[policy-input.json](policy-input.json)、[policy-exploration.json](policy-exploration.json)。

![政策页跳过按钮跟随原生关闭按钮](截图/06-政策空槽提醒禁用状态.png)

### RP-10 · 资源页跳过按钮跟随原生关闭按钮

**部分验收**。测试构建：`1.4.2-dev.1103-2038-c953488d`。

资源页跳过图标视觉紧邻关闭按钮；本轮未覆盖缩放/窗口变化和实体手柄。

证据：[resource.json](resource.json)。

![资源页跳过按钮跟随原生关闭按钮](截图/05-资源页当前状态.png)

### BSU-09 · 完工或覆盖建造后核对建筑净收益

**待实机验收**。测试构建：`0.2.17-dev.1103-1153-0e404977`。

本轮模块离线92项通过；尚缺完工/覆盖前后产出对照及损坏建筑修复样本，没有将预估值或旧截图作为实机通过。

证据：[civ7-better-settlement-ui.tap](civ7-better-settlement-ui.tap)。

### BSU-10 · 修复损坏建筑后更新生产与收益展示

**待实机验收**。测试构建：`0.2.17-dev.1103-1153-0e404977`。

本轮模块离线92项通过；尚缺完工/覆盖前后产出对照及损坏建筑修复样本，没有将预估值或旧截图作为实机通过。

证据：[civ7-better-settlement-ui.tap](civ7-better-settlement-ui.tap)。

### RG-03 · 在新休息构建回归夜间限制

**已验收**。测试构建：`1.8.7-dev.1103-2223-9b620247`。

用临时设置将当前本地时间纳入夜间窗口，真实夜间弹窗显示03:41–03:56、继续禁用；通过原生选项关闭夜间限制并确认后生效。未改系统时间。

证据：[rest-night.json](rest-night.json)、[rest-confirm.json](rest-confirm.json)。

### RG-04 · 在新休息构建回归回合阈值触发

**待实机验收**。测试构建：`1.8.7-dev.1103-2223-9b620247`。

已设每回合阈值1进行探测，但T106属于已付费/已计数token，提交后本样本未进入下一本地回合；不足以证明新的阈值触发。未强改内部计数。

证据：[rest-turn.json](rest-turn.json)、[rest-turn-next.json](rest-turn-next.json)。

### RG-05 · 在休息流程验证退出确认和取消

**已验收**。测试构建：`1.8.7-dev.1103-2223-9b620247`。

真实系统Esc打开“退出至桌面”原生确认框；通过原生取消按钮取消，确认框关闭、休息弹窗保留、T106不变且未提交回合。

证据：[dialog-state.json](dialog-state.json)、[rest-cancel.json](rest-cancel.json)。

![在休息流程验证退出确认和取消](截图/13-休息退出确认.png)

### zhFWS5M · 【不再来一回合】读档后已进入可操作地图，游玩时钟仍停在加载状态

**已验收**。测试构建：`1.8.7-dev.1103-2223-9b620247`。

本轮Rest启用且未用debug活动标记。等待开始阶段两次采样间隔2612ms，elapsed均0、loading=true；原生开始操作后地图就绪，loading=false、elapsed增长至13391ms，随后正常触发一分钟休息。

证据：[rest-wait-sample.json](rest-wait-sample.json)、[rest-clock-start.json](rest-clock-start.json)、[rest-clock-later.json](rest-clock-later.json)、[rest-after-continue.json](rest-after-continue.json)。

![【不再来一回合】读档后已进入可操作地图，游玩时钟仍停在加载状态](截图/14-取消退出保留休息.png)

### zhFWTyg · 【定居点界面】双列生产队列绘制在滚动区上方，取消按钮无法用鼠标命中

**部分验收**。测试构建：`0.2.17-dev.1103-1153-0e404977`。

T106 城市详情同时打开；原生队列输入完成左键提前、右键取消，实际系统鼠标点击取消后队列 7→6；全部可见行中心命中正确。限本轮 5120×2160 游戏视口。 原缺陷发生于1920×1080，本轮未复测该分辨率，Issue #12保持打开。

证据：[queue.json](queue.json)、[queue-hit.json](queue-hit.json)、[queue-native-click.json](queue-native-click.json)。

![【定居点界面】双列生产队列绘制在滚动区上方，取消按钮无法用鼠标命中](截图/02-队列实际点击取消通过.png)

### RES-04 · 点击取消研究退还整数点数，再用原版科技／市政卡片领取

**部分验收**。测试构建：`0.3.1+1105-0315-fd11f517`。

当前0.3.1离线56项通过。探索T2选择原生市政后暂存文化525→35、退出暂停；开局经济项目按产品边界不支持退款。未完成本轮卡片退款/未来轮次实机闭环；开发会话此前同构建证据单列，不替代本轮。

证据：[research-chosen.json](research-chosen.json)、[research-choose.json](research-choose.json)、[research.tap](research.tap)。

### zhFYgUA · 建造预览漏扣被替换改良和幸福度的负收益

**待实机验收**。测试构建：`0.2.17-dev.1103-1153-0e404977`。

本轮模块离线92项通过；尚缺完工/覆盖前后产出对照及损坏建筑修复样本，没有将预估值或旧截图作为实机通过。

证据：[civ7-better-settlement-ui.tap](civ7-better-settlement-ui.tap)。

### zhFZeI4 · 建筑回本预估先选毛产出最高地块，漏掉净收益更高的可建位置

**待实机验收**。测试构建：`0.2.17-dev.1103-1153-0e404977`。

本轮模块离线92项通过；尚缺完工/覆盖前后产出对照及损坏建筑修复样本，没有将预估值或旧截图作为实机通过。

证据：[civ7-better-settlement-ui.tap](civ7-better-settlement-ui.tap)。

### zhFaFnI · 休息弹窗显示手柄按键图标和当前按钮高亮

**部分验收**。测试构建：`1.8.7-dev.1103-2223-9b620247`。

原生DOM具备inline-accept/inline-sys-menu且继续按钮有焦点标记；实际鼠标截图下隐藏手柄提示符合输入设备状态。实体手柄与设备切换高亮未测。

证据：[rest-buttons.json](rest-buttons.json)。

![休息弹窗显示手柄按键图标和当前按钮高亮](截图/14-取消退出保留休息.png)

### zhFaFzc · 夜间禁玩期间可确认并应用新的夜间时段

**部分验收**。测试构建：`1.8.7-dev.1103-2223-9b620247`。

夜间强制休息下，真实鼠标打开原生菜单和选项；原生夜间开关产生草稿false，确认前持久值仍true，点击确认后持久值false、选项页关闭。已证明禁玩中确认生效，修改起止时段组合未测。

证据：[rest-options-change.json](rest-options-change.json)、[rest-confirm-inspect.json](rest-confirm-inspect.json)、[rest-confirm.json](rest-confirm.json)。

### zhFaKXU · 原生加载页的开始按钮可点击，休息弹窗等加载幕关闭后接管输入

**已验收**。测试构建：`1.8.7-dev.1103-2223-9b620247`。

本轮Rest启用且未用debug活动标记。等待开始阶段两次采样间隔2612ms，elapsed均0、loading=true；原生开始操作后地图就绪，loading=false、elapsed增长至13391ms，随后正常触发一分钟休息。

证据：[rest-wait-sample.json](rest-wait-sample.json)、[rest-clock-start.json](rest-clock-start.json)、[rest-clock-later.json](rest-clock-later.json)、[rest-after-continue.json](rest-after-continue.json)。

![原生加载页的开始按钮可点击，休息弹窗等加载幕关闭后接管输入](截图/14-取消退出保留休息.png)

### zhFarPc · 城镇购买区挤占重心列表，选项被城镇详情遮挡

**已验收**。测试构建：`0.2.17-dev.1103-1153-0e404977`。

首次打开城镇并打开重心后，购买双列宽度保持，重心面板位于购买区与右侧详情之间；可见选项命中正确，选择发展城镇后关闭重心面板且金币不变。

证据：[town.json](town.json)、[town-focus.json](town-focus.json)、[town-confirm.json](town-confirm.json)。

![城镇购买区挤占重心列表，选项被城镇详情遮挡](截图/04-城镇重心与详情不重叠.png)

### zhFbfk0 · 生产队列卡片高亮与实际点击范围错位

**已验收**。测试构建：`0.2.17-dev.1103-1153-0e404977`。

T106 城市详情同时打开；原生队列输入完成左键提前、右键取消，实际系统鼠标点击取消后队列 7→6；全部可见行中心命中正确。限本轮 5120×2160 游戏视口。

证据：[queue.json](queue.json)、[queue-hit.json](queue-hit.json)、[queue-native-click.json](queue-native-click.json)。

![生产队列卡片高亮与实际点击范围错位](截图/02-队列实际点击取消通过.png)

### zhFbnNg · 首次打开城镇时产出竖排，购买列表被页首挤出

**已验收**。测试构建：`0.2.17-dev.1103-1153-0e404977`。

首次打开劳加尔，产出横排、建筑/单位购买双列完整显示；没有页首挤占。

证据：[town.json](town.json)。

![首次打开城镇时产出竖排，购买列表被页首挤出](截图/03-城镇首次打开双列布局.png)

### zhFcAz4 · 暂停或强制休息期间可确认全部设置

**部分验收**。测试构建：`1.8.7-dev.1103-2223-9b620247`。

夜间强制休息中原生夜间设置确认路径通过；全部类别、所有开关/下拉并未穷举。

证据：[rest-confirm.json](rest-confirm.json)。

### zhFkz-M · 外交行动等待回应时可从休息弹窗打开设置并返回

**待实机验收**。测试构建：`1.8.7-dev.1103-2223-9b620247`。

普通地图及夜间休息的原生菜单/选项通过，但未完成和平谈判或外交等待的专项复现，不外推为通过。

证据：[rest-menu-clock.json](rest-menu-clock.json)、[rest-confirm.json](rest-confirm.json)。

### zhFmHVI · 休息弹窗移除重复的退出游戏按钮

**已验收**。测试构建：`1.8.7-dev.1103-2223-9b620247`。

一分钟休息弹窗只有“休息完成，继续”和“打开设置”两个按钮，没有重复退出按钮；退出通过Esc原生确认。

证据：[rest-buttons.json](rest-buttons.json)、[dialog-state.json](dialog-state.json)。

![休息弹窗移除重复的退出游戏按钮](截图/14-取消退出保留休息.png)

### RES-05 · 未来市政与未来科技：退还当前未完成轮次的进度

**部分验收**。测试构建：`0.3.1+1105-0315-fd11f517`。

当前0.3.1离线56项通过。探索T2选择原生市政后暂存文化525→35、退出暂停；开局经济项目按产品边界不支持退款。未完成本轮卡片退款/未来轮次实机闭环；开发会话此前同构建证据单列，不替代本轮。

证据：[research-chosen.json](research-chosen.json)、[research-choose.json](research-choose.json)、[research.tap](research.tap)。

### RES-06 · 退款后停止原研究，单回合或持续跳过科文并暂存点数

**部分验收**。测试构建：`0.3.1+1105-0315-fd11f517`。

探索T1科技原生快捷长按进入持续跳过(P_MODE=3)，市政按钮进入本回合跳过(P_MODE=2)；推进T2后真实BANK为科研357/文化525、暂存节点进度归0，选择市政后文化余额35。市政持续长按、重读档和跨时代迁移未完成，输入探针未触发不能直接定为产品缺陷。

证据：[research-after-hold.json](research-after-hold.json)、[research-both-confirmed.json](research-both-confirmed.json)、[research-next-turn.json](research-next-turn.json)、[research-chosen.json](research-chosen.json)。

![退款后停止原研究，单回合或持续跳过科文并暂存点数](截图/09-探索时代跨回合科文储存.png)

### RP-11 · 盐等条件产能资源的空槽提醒

**待实机验收**。测试构建：`1.4.2-dev.1103-2038-c953488d`。

分配成功路径已通过，但合法空槽提醒/跨回合跳过及仅剩盐等条件产能资源的定向样本未完成；不得由分配成功推断提醒正确。

证据：[rp-run.json](rp-run.json)、[civ7-resource-planner.tap](civ7-resource-planner.tap)。

### WAR-08 · 商人占格时快速转移

**待实机验收**。测试构建：`0.6.3-dev.1102-2206-21d296ec`。

战斗副本载入停在末尾：Loading.isLoaded=false，WorldUI未定义，War运行入口未注册；未绕过原生就绪门槛。开发会话核对同摘要样本曾在同版游戏成功，不能判定存档不兼容或归因War。商人占格专用样本也未确认。

证据：[battle-after-start.json](battle-after-start.json)、[battle-ui-errors.txt](battle-ui-errors.txt)。

![商人占格时快速转移](截图/10-战斗样本载入状态.png)

## 收尾

游戏已退出，所有控制命令已结束；479个原始存档文件及6个目录逐项大小/SHA-256恢复核验，清理3个隔离副本及本轮自动存档，恢复2个临时政策文件、Rest Guard原开关和原设置；4份本轮压缩备份已在恢复成功后删除，保留小型清单和回执。锁已释放。没有操作神图会话。

游戏内没有新完成建筑收益/损坏修复、分配失败回滚、商人占格及外交阻塞等样本，因此相关任务继续待验收。完整边界以逐项记录为准。
