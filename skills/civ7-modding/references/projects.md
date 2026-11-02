# 用户的项目上下文

以下是 2026-10-23 从本地源码与验证记录整理的导航，不是最新发行状态保证。所有路径相对 Civ7 仓库。版本和支持范围在工作时重新查对应 `.modinfo`、README、`VALIDATION*` 和 `docs/workshop.json`；不要把这些项目的特例强加到其他 Mod。

| 模块 | 基本能力与边界 | 优先参考 |
| --- | --- | --- |
| `civ7-resource-planner` 资源规划 | Resource Re-sorts (`bz-re-sorts`) 扩展；产出排序、城市/城镇/离网分组、幸福度补足、按定居点倾向分配。权重金/粮/科/文/锤/幸福为 1/2/4/4/4/8，幸福只计负值到零；骆驼扩槽须考虑本身占槽。稳定排序、点击/拖放修复已做离线验证，本地中英文实现已补齐（尚未发布）；不能宣称整个面板手柄已验收。 | `ui/rp-planner.js`、`rp-game-adapter.js`、`rp-controller.js`、`rp-ui.js`、`ui-next/screens/commerce/`、`tests/interaction.test.mjs` |
| `civ7-micromanagement-master-chiang-kai-shek` 微操大师 | 连续部署、自动进入合法选格、增援目标切换、原地集中火力。鼠标与手柄分别配置；B 不等价于“右键加入”。原地齐射涉及真实临时战斗力、移动力结算，每发需复核目标与参与者。 | `ui/tactical-controls.js`、`focus-bonus.js`、`focus-cost.js`、`settings-*`、`text/settings.xml`、`tests/live/`、`VALIDATION-zh-CN.txt` |
| `civ7-garbage-time` 垃圾时间 | 用户主动开启的单位、军队、定居点、宝藏、传教、科技、市政和资源自动化；仅本地单人活动回合，决策界面暂停，状态按玩家/时代隔离。资源自动化依赖资源规划。 | `README-zh-CN.txt`、`ui/` 的 model/automation/bridge 模块、`tests/` |
| `civ7-no-more-turn` 不再来一回合 | 回合、时间、空闲和夜间限制；休息时创建独立存档及限定清理自己的旧存档。中英文、原生字体、输入拦截和恢复范围都有独立回归。测试其他 Mod 时需显式暂停全部限制，结束恢复原状态。 | `ui/rest-model.js`、`rest-session.js`、`rest-runtime.js`、`rest-save.js`、`rest-retention.js`、`tests/locale-fixture.js`、`tests/font-render.test.js` |
| `civ7-auto-save-before` 行动前存档 | 结束回合、外交行动前分别写 `BeforeEndTurn` / `BeforeDiplomacy` 固定槽；确认保存成功后才继续。与 Rest Guard 挂钩顺序影响“先保存，再休息”。该产品的固定槽行为不替代开发时全 Saves 备份。 | `ui/save-gate.js`、`before-end-turn.js`、`diplomacy-hook.js`、`text/settings.xml`、`tests/save-gate.test.mjs` |
| `civ7-better-controller-support` 更好的手柄支持 | 轮盘直接打开地图工具、列表焦点与滚动、B 返回地图；已吸收旧 Controller Bridge 的 Mac 输入和菜单摇杆适配。可选 Map Trix / Detailed Map Tacks，缺失入口应隐藏；新版本有离线浏览器回归，不能沿用旧版本反馈声称全部实机通过。 | `README.md`、`VALIDATION.md`、`ui/`、`tests/browser.test.mjs`、`tests/controller-integration.test.mjs` |

## 复用前确认

- 原生 UI 同时存在旧 `fxs-*` / Controls / ContextManager 和新 Solid / Activatable / Slot / Hotkeys 栈；选目标页面实际使用的栈，不混用不兼容的焦点模型。
- 资源规划派生页面和模型必须兼容当前 Resource Re-sorts；检查依赖版本和覆写冲突，保留归属声明。
- 手柄合并、动作包装、存档挂钩的加载顺序是兼容性的一部分，不能仅按文件名判断哪个模块实际执行。
- 共享目录可能有其他会话未提交工作。改前读当前文件，局部修改；不还原整个文件来撤销自己的局部改动。
