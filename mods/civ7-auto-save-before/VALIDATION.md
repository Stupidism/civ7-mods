# 每回合独立保存实机记录

2026-11-02，开发构建 `1.1.1-dev.1101-2308-14a236b2`，对应工坊 1.1.3。T55 开启每回合独立保存后，游戏请求写入 `AutoSave_BeforeEndTurn_00_0055`，收到 `SaveComplete(result=0)` 后只调用一次 `sendTurnComplete`，随后进入 T56。原设置和存档已恢复。

同构建在 11 月 1 日验证了 T50、T51 各自生成独立文件，从自动保存列表重新加载 T50，以及关闭选项后恢复固定槽。发布时 86 项离线测试通过。跨战役、跨时代同名行为未在此次实机测试中重测。

[11 月 2 日统测原始记录 SAVE-01](https://github.com/Stupidism/civ7-mods/blob/f973d19bda6e8010cc3fac82fb6c0209b48760f3/docs/qa/2026-11-02/README.md#save-01) · [1.1.3 工坊发行回执](docs/release-1.1.3.json)
