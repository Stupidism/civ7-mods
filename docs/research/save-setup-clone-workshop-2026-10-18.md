# 从存档复制开局设置：创意工坊调查 · 2026-10-18

## 结论

本次检索未找到已由作者说明确认能完整满足“选择任意普通游戏存档 → 提取原始开局全部设置 → 微调领袖、文明、纪念物或直接开始新局”的现成模组。这是当前调查范围内的结果，不是对整个工坊不存在此功能的断言。

最接近的两项分别是 **Trizian's Load & Go** 和 **Beanies Restart Button**：前者复用事先保存的配置文件，后者从当前多人对局重新建立大厅。两者都与需求有交集，但不能根据现有说明认定其支持从任选普通游戏存档完整恢复原始开局设置。[Load & Go 作者页](https://steamcommunity.com/sharedfiles/filedetails/?id=3733082965)、[Beanies Restart Button 作者页](https://steamcommunity.com/sharedfiles/filedetails/?id=3740101997)

## 相关模组核对

| 模组 | 作者明确说明的功能 | 与本次需求的差距 |
| --- | --- | --- |
| [Trizian's Load & Go](https://steamcommunity.com/sharedfiles/filedetails/?id=3733082965) | 把 Load Config 放到领袖选择页；加载后跳到 Overview，可开始游戏；可保留或重新随机地图与游戏种子；配置按名称排序；取消配置文件的 mod 集合一致性限制。 | 输入是预先保存的 configuration；作者明确区分它与普通 saved game，普通读档界面不受影响。没有宣称可从普通存档提取设置。作者 6 月 30 日回复表示纪念物仍需要手动选择相同组合，不能据此承诺自动、完整恢复纪念物。 |
| [Beanies Restart Button](https://steamcommunity.com/sharedfiles/filedetails/?id=3740101997) | 多人暂停菜单增加按钮，回主菜单后自动新建大厅；保留游戏选项和玩家选择的文明、领袖、纪念物。 | 说明提供的是当前多人对局入口，未说明从任选普通存档提取原始设置；先载入旧存档后能否使用也未验证。必定重新随机种子，并把 AI 的文明/领袖设为随机、清空队伍；超过两人的大厅按槽位而非用户保存选择，需要相同加入顺序。作者只在 6 月 25 日评论中确认 1.4.1 可用；本次未验证 1.5.0。 |
| [Tower Settings Keeper](https://steamcommunity.com/sharedfiles/filedetails/?id=3815023570) | 修复游戏本地设置存储的读取问题，使其他模组的选项能跨游戏进程重启保留；作者说明适用于 1.5.0。 | 保存对象是各 mod 的选项数据，不是某场游戏的原始开局配置，也没有从普通存档提取设置的功能声明。不能把这里的 settings persistence 视为“复制上次开局”。 |
| [Trizian's Better Saves](https://steamcommunity.com/sharedfiles/filedetails/?id=3747686574) | 定期把自动存档转为永久存档；在读档列表按领袖、文明交叉筛选。 | 处理存档保留和查找，没有宣称将存档转为新局配置。 |
| [Better Memento editor](https://steamcommunity.com/sharedfiles/filedetails/?id=3508036392) | 改进纪念物选择界面、排序和解锁信息，并调整开局流程以减少忘选纪念物；可选开启额外功能。 | 没有普通存档复制功能。说明中的收藏面板与按领袖收藏仍标注 NYI，不能当作已经实现的纪念物预设。本次读取的页面写有 Better Memento Editor 1.15.0、兼容游戏 1.5.0；本次未实测。 |

以上是作者描述及作者回复所支持的功能范围，不是安装后的实测结果；本次未订阅、安装或修改这些模组。

## 需要严格区分的对象

- **普通游戏存档（saved game）**：用于恢复一场已经开始的游戏；这是用户本次要求的输入。
- **已保存配置（saved configuration / config）**：事先保存的新游戏设置；Load & Go 的输入属于这一类，不能因为名称中有 load 就认定它也读取普通游戏存档。[作者说明](https://steamcommunity.com/sharedfiles/filedetails/?id=3733082965)
- **当前对局设置**：Beanies Restart Button 在多人对局暂停菜单中复用这类设置，还会主动改变种子、AI 和队伍。[作者说明](https://steamcommunity.com/sharedfiles/filedetails/?id=3740101997)
- **模组选项持久化**：Tower Settings Keeper 保留其他模组的设置，既不等于上次新游戏设置，也不等于指定存档的设置。[作者说明](https://steamcommunity.com/sharedfiles/filedetails/?id=3815023570)

## 对新模组定位的建议

可保留新模组方向：核心价值应明确为从已有普通存档复用开局设置，而不是再提供一个配置加载按钮。领袖、文明、纪念物完整恢复及编辑、AI 与队伍保留、种子保留或重新随机，都需要分别验证；在验证前不宣称支持“所有”设置。

若用户接受事先保存配置，Load & Go 值得优先试用；若需求其实是当前多人局快速换图，Beanies Restart Button 更贴近。它们可以作为交互与功能边界参考，但现有说明不足以替代用户提出的完整工作流。

## 检索范围和证据边界

调查日期：2026-10-18（Asia/Shanghai）。

1. 使用搜索引擎检索 Steam 原始作者页面，组合 Civilization VII 与 restart、load、save、configuration、duplicate、recreate、last configuration，以及中文“开局、存档、重开”等词。
2. 直接访问 Civilization VII（Steam App ID 1295660）[创意工坊](https://steamcommunity.com/app/1295660/workshop/)站内搜索，核对 restart、load、save、config、duplicate、复制、重开、设置的第一页结果；多数查询每页 30 项，config 的 20 项在同页。站内结果包含大量仅在说明中提及这些词的无关项目，未逐个安装验证，也未穷尽所有后续分页。
3. 以作者工坊描述和明确带作者标记的回复作为功能证据；Load & Go、Tower Settings Keeper、Beanies Restart Button 的说明另直接抓取原页复核。没有将用户评论中的单次报错直接写成模组整体不可用结论。
4. 搜索解析器在多张 Steam 页面中显示了通用“removed / incompatible”模板；这不足以确认实际下架或不兼容，因此本报告未用它判断发布状态或游戏版本兼容性。
5. 本次属于需求查重调查；未获取全部候选的完整源码，未进行存档转换、纪念物恢复或游戏内启动实测。

## 本机原版源码的初步核对

本机为 macOS Steam Civilization VII 1.5.0。以下路径相对于游戏安装包的 `CivilizationVII.app/Contents/Resources/Base/modules/`；仅记录接口证据，不分发原版代码。

| 来源 | 已确认的事实 | 对开发的意义 |
| --- | --- | --- |
| `core/ui/save-load/model-save-load.js:14`、`:227`、`:395` | 存档查询和加载明确区分 `GAME_STATE` 与 `GAME_CONFIGURATION`。默认存档列表元数据包括文明、领袖、当前时代、开始时代、地图类型/大小、速度、规则集与模组列表，但没有纪念物、地图/游戏种子和全部高级参数。 | 仅复制读档列表显示的信息不足以兑现“全部开局设置”；仍须验证引擎能否只读取完整配置，或是否需要先载入对局。 |
| `base-standard/ui-next/screens/pause-menu/pause-menu-model.js:323` | 原版在 `previousAgeCount > 0` 或 `isSavedGame` 等情况下禁用重开按钮。 | 新模组不能假定调用原版重开就能处理所有存档；跨时代存档尤其需要区分当前文明与最初文明。 |
| `core/ui-next/screens/create-game/memento-select-model.js:34`、`:76` | 纪念物通过玩家设置参数读取和修改；时代切换使用带 `AgeTransition` 前缀的参数名。 | 纪念物不是只刷新图标即可；恢复数据、界面显示和最终新局生效需要逐一核验。 |
| `core/ui-next/screens/create-game/create-game-hub.js:796`、`create-game-screen.js:87` | 新局概览已有加载配置入口和开始游戏流程。 | 若能可靠提取配置，可复用原生设置与概览，让用户微调或开始。 |

建议工作流：在读档列表选中存档 → “用此设置开新局” → 展示设置摘要，提供“调整设置”和“直接开始”。按本次“复制所有设置”的需求，默认保留两种种子，另提供重新随机选项。缺失的 DLC、模组或无法还原的设置应明确展示，不能悄悄以默认值代替后宣称完整复制。

下一阶段先验证普通存档的全量配置提取，再确定可支持的存档范围。本轮只新增调查记录，尚未实现模组。
