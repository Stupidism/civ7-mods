# 更好的手柄支持 0.7.0 安装与部分实机验收

2026-10-30，macOS。用户授权安装实测，使用 T30 独立测试副本，未推进回合、购买单位、建造、分配资源或改变政策。非实体手柄验收。

## 已验证与修复

- 0.7.0 安装，最终 41 个文件哈希与发行包一致，旧输入桥保持关闭。
- 真实游戏确认单行城市摘要、综合评分、回本沙漏、首行成本与回合、二态排序开关。
- 游戏 Coherent 不支持 CSS flex order，导致项目仍在第三栏；改为移动原生分类节点，退出手柄布局恢复原顺序。重启后实测 x 坐标为建筑 57.87、单位 478.40、奇观 898.93、项目 1319.47。
- 原生 fxs-nav-help 默认隐藏，新增提示缺少 trigger-nav-help；已修正并重启确认资源页 X 图标显示，跳过功能使用 blp:Action_Skip.png。
- 为紧凑提示显式设置横排与文字收缩，避免按键图标单独换行；该微调以真实界面临时样式验证后写入最终安装包，未再进行第三次冷启动。
- 长 Y 达阈值后显示松开说明，松开返回地图；长 X 显示本回合已跳过，未提交资源变动。上下卡片导航通过原生 InputAction 注入验证。
- 135 项离线测试全通过，无跳过。

## 尚未通过

- 城市输入上下文的原生按键图标返回未解析的 icon_button_top（原版导航图标亦受影响），资源 Shell 上下文能返回 blp:xb1_icon_button_left。未强行硬编码 Xbox 图片；城市页 Y 图标需要实体手柄输入进一步确认。
- 已请求实体手柄按方向键，收尾前未收到确认；不宣称物理按键／摇杆实测通过。
- 未执行强制结束回合；未验证单位累计购买持久化、地图钉实际布置与排序、危机空槽、Windows。

## 收尾证据

工作目录 work/controller-070-acceptance-20261030：production-final.png、resource-inline-final.png、production-final.json、resource-final.json、hold-y.json、release-y.json、resource-skip.json、installation.json、restoration.json、offline-tests.txt、operations.jsonl。

404 个原始存档路径、大小、SHA-256 全部保持不变。测试前、重启前、结束后均完整备份；测试副本移至备份目录。原始共享设置两行、73 个 Mod 启用状态及选项恢复，Rest Guard 恢复启用。游戏已退出，最终版保留安装，未发布工坊。
