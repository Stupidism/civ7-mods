# 中英文与游戏原生本地化

新功能和翻译任务默认同时维护英文、简体中文。遵循 Rest Guard、War Controls、Auto-save Before 的已有做法：

- `text/*.xml` 使用 `<Database><EnglishText>...` 提供默认英文；`<LocalizedText>` 的相同键加 `Language="zh_Hans_CN"` 提供中文。其他语言交给游戏原生英文回退。
- 键加 Mod 独有前缀，例如 `LOC_RP_*`；显示使用 `Locale.compose(key, ...args)` 或当前 UI 栈的原生本地化组件。不要读取 `navigator.language`、系统语言或新增 Mod 语言开关。
- 在需要的 `.modinfo` ActionGroup 中通过 `UpdateText` 加载。对主菜单可见的名称、说明和设置，检查 `scope="shell"`；对局页面检查 `scope="game"`。只有 ImportFiles 不会把 XML 加入语言数据库。
- 按钮、工具提示、无障碍名称、分组/空态、进度、错误、恢复提示、设置、Mod 名称和描述一起检查。复用原版资源/产出/城市名称的原生键，不翻译内部 ID 或设置键。
- 动态消息用完整句子的 `{1}`、`{2}` 参数，不拼接“无法”+“装入/卸下”等片段。错误与取消原因也要翻译；纯规则层可抛稳定错误码/本地化键，在 UI 边界解析，不为算法引入游戏运行时依赖。
- 在渲染或调用时解析语言，不在模块导入时永久缓存中文。游戏要求重建页面时遵循原生生命周期，勿宣称无需重载即可动态切换所有已有字符串。
- 保留中文正文的原生字体类（如 `font-body`），不要强制只有拉丁字符的字体。允许英文按钮和说明合理换行；复核面板宽度、焦点边框、计数、长城市名和错误消息。
- README 给出语言说明与英文使用指南；需要工坊英文文案时先保存可审阅的本地稿。完成翻译不等于已经更新工坊。

## 离线回归

1. XML 可解析，同一语言无重复键，中英键集合与参数索引/次数一致。
2. 扫描实际引用（含动态键选择），确保两种翻译齐全；模拟原生英文回退。不把测试假实现的回退当成游戏实测。
3. 以中英文分别运行实际 UI/控制器路径，包括完成、无可用操作、锁定、失败、超时、取消及恢复失败。确认英文没有遗留中文文案或裸 `LOC_*`，参数已替换；用户城市名本身可以含中文。
4. 语言切换不改设置命名空间、资源标识、分配结果或输入行为。必要时用独立浏览器和原生字体检查布局，明确这不是游戏实机验收。

参考：`mods/civ7-war-controls/text/settings.xml`、`tests/localization.test.mjs`；`mods/civ7-rest-guard/tests/locale-fixture.js`、`font-render.test.js`；`mods/civ7-before-end-turn/before-end-turn.modinfo` 的 shell/game 文本加载。
