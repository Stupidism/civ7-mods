# 1.5.1 — 2026-11-09

- 修复只剩盐或损坏资源时的分配提醒；生产评分正确计入原生百分比加成，保留浪费区间与基础溢出规则；减少大帝国包含骆驼分配时的重复计算，分配规则不变。

English: Fix resource reminders when only Salt or damaged resources remain; include native production percentages while retaining the waste-interval and base-overflow policy; reduce redundant work in large allocations with Camels without changing allocation rules.

验证范围及性能数据见 docs/release-1.5.1-validation.md；完整实体手柄验收仍未完成。

---

# 1.5.0 — 2026-11-09

- 更名“更好的资源界面”，独立运行，不再要求另装 Re-sorts；保留 beezany 归属。
- 整理布局、排序／高亮图标和手柄四区导航；多选倾向／避免与可重置默认倾向。
- 定居点幸福度0／5、城市0／20目标；保留分配范围选项。
- 资源提醒排除损坏资源和当前无效的条件生产资源。
- 城市当前生产显示已投入／所需产能；城镇不显示“不生产单位”。
- 盐按当前生产条件估值；所有产能评分统一排除百分比浪费区间并保留基础溢出边际价值。
- 184项离线检查通过；最新完整实机及实体手柄验收仍未完成。

English: Renamed Better Resource UI; standalone commerce pages with retained beezany attribution. Updated layout, icon tools and controller areas; multi-select prefer/avoid, resettable defaults and happiness targets. Reminders exclude damaged and currently ineffective conditional resources. City headings show known exact production progress. Salt and all production scoring use current-item useful production plus base overflow. 184 offline checks passed; full latest-build live and physical-controller acceptance remains pending.

---

# 1.4.2 — 2026-11-03（开发版）

- 持续按住跳过按钮或页面跳过快捷键一秒即执行，松开不会再次执行。
- Holding the skip button or shortcut for one second activates it while still held.

# 待安装源码 — 2026-11-02

- 资源空槽提醒、分配范围与幸福度设置移至左栏底部。包含骆驼／已分配资源支持记住开关状态。

- 撤销顶部页签收窄，恢复整行宽度与页签等分空间。

# 1.4.1 — 2026-11-02（开发版，未发布）

- 正常关闭只延后未完成行动；无空槽或无可分配资源不追加提醒。
- 关闭旁统一“本回合跳过”，长按 X 一秒立即触发，下回合重新检查。
- 资源页增加可保存的空槽提醒开关，移除旧长按 B 暂缓入口。

# 1.4.0 — 2026-11-02（开发版，未发布）

接管合法资源空槽提醒，复用原有暂缓和关闭入口；独立管理提醒与结束回合守卫。 三者独立打包，不需要行动顺序调整；兼容旧 AO 残留去重。

