# Civ VII：社区是否突破外网和完整存档读取限制

调查日期：2026-10-22。任务是查找现有实现，并核实代码实际运行在游戏内还是游戏外。本轮没有连接游戏、运行下载的代码或读写用户存档。

## 结论

在本轮检索并核对的公开项目中，尚未找到满足以下条件的成功案例：仅安装普通 Civ VII mod，就能直接调用任意外网 HTTPS，或取得任意未载入旧存档的完整文件内容，且不依赖外部程序、调试连接或额外安装配置。

社区确实做出了联网、解析存档和交换配置的功能，但其运行边界与“纯 mod 获得任意文件/网络权限”不同。不能把外部 Node、Python、Electron 或 Rust 代码中出现的网络和文件调用，当成游戏内脚本拥有这些能力。这也不是对所有版本、平台和未公开项目的“不可能”证明。

## 经过源码核对的代表案例

| 案例 | 实际路径 | 是否解决本需求的入口 |
| --- | --- | --- |
| PYDT Civ VII | mod 把自有回合状态写入 GameTutorial 属性，随存档保存；外部客户端读文件并联网 | 没有；可借鉴自有数据随存档保存 |
| civ7-playbycloud | mod 调原生保存，Rust 桌面客户端上传下载文件 | 没有；仍须客户端运行 |
| civ7-autopilot | Python 请求 AI，通过 FireTuner 控制游戏 | 没有；额外程序和调试配置 |
| Ghosts Random Civ Generator | 用户将网页生成的文本配置码粘贴进游戏文本框，mod 解析并调用 GameSetup | 有纯 mod 的文本输入实现；没有任意文件读取或联网 |

PYDT、playbycloud、autopilot 的固定版本、具体调用点和安装要求见[联网源码调查](civ7-community-network-access-2026-10-22.md)。其中 PYDT 的 [hotseat-curtain.js](https://github.com/pydt/civ7-pydt-mod/blob/200c5f3d223005c1278084d4e19fba0f8c9d5479/ui-next/screens/hotseat/hotseat-curtain.js#L184)记录的是它自己定义的数据，不是用于返回整份存档的文件接口。

另核对了 Chronicle 的跨局记录和原生组件入口线索，详见[文件访问与原生扩展调查](civ7-community-native-access-2026-10-22.md)。Chronicle 使用 `localStorage` 保存自身已追踪游戏的数据，不扫描任意旧档；本轮未找到符合普通 Workshop 安装条件的 DLL / dylib loader 或助手自动启动实现。

## 新的可借鉴实现：网页配置码 → 游戏内粘贴

核对版本：`ghost-ng/Civ7Generator`，commit `1027b43de158cf326803baa8a860927ebcf97ff9`。

- [import-panel.js](https://github.com/ghost-ng/Civ7Generator/blob/1027b43de158cf326803baa8a860927ebcf97ff9/Mod/ghostng-random-civ-generator/ui/import-panel.js#L175)创建 `fxs-textbox`，由用户粘贴文本后点击 Apply。
- 同文件调用 `GameSetup` 设置时代和玩家的领袖、文明；不是从游戏内请求网页。
- [import-parse.js](https://github.com/ghost-ng/Civ7Generator/blob/1027b43de158cf326803baa8a860927ebcf97ff9/Mod/ghostng-random-civ-generator/ui/import-parse.js#L24)解析单行 `C7L1` 格式，字段仅涵盖时代、玩家类型、领袖、文明。

这为本项目提供一个值得离线原型验证的备选：浏览器在用户选择文件后就地解析存档，生成配置码；用户把码粘贴回 mod。浏览器端解析原则上不要求上传服务器，也不要求安装客户端。**这是基于现有文本入口和我们已有 JS 解析器的方案推断，尚未实现或实机验证完整设置导入；也不等于用户原先要求的游戏内选存档一键完成。** 截图识别可另行评估浏览器端实现，不能从文本粘贴功能推断图像粘贴和 OCR 在游戏内可用。

## 没有构成突破的线索

- [Bruno AI 项目架构文档](https://github.com/Bruno-BRG/game-playing-ai-civilization-vii/blob/main/docs/architecture.md)的搜索缓存称用 `LocalStorage.sqlite` 与 Python companion 通信，原因是游戏 UI 阻止 loopback HTTP。其当前仓库/API/raw 访问返回 404，未取得实现代码，不能视为已核实可直接移植方案；文档流程仍要求单独运行 companion。详见联网调查的证据限制。
- [ElementalEngine/core-api-backend 的上传接口](https://github.com/ElementalEngine/core-api-backend/blob/435b32e0cf042c798fed412317380ced79121145/app/features/matches/router.py#L50)接收 FastAPI `UploadFile` 并读取内容。这证明有服务器端处理存档的项目，不能解决游戏 UI 如何取得并上传文件。
- [F1rstDan 的 Network API 汇总](https://github.com/F1rstDan/Civ7_API/blob/004ddc4e54a20f3792d6bb93606639139636d673/docs/api/network.md)列出游戏账号、多人连接、聊天和存档操作，未提供任意 URL 请求接口。其 [ReflectionArchives 汇总](https://github.com/F1rstDan/Civ7_API/blob/004ddc4e54a20f3792d6bb93606639139636d673/docs/api/reflection.md)描述当前游戏对象反射，未展示从磁盘路径打开任意旧档的方法。社区文档不代替实机验证。
- CivFanatics 的 [Getting player data and send them to an endpoint](https://forums.civfanatics.com/threads/mod-getting-player-data-and-send-them-to-an-endpoint.695948/)是 2025-02-22 的可行性提问；所读页面未见回复或实现，不能把标题视为已发布联网 mod。

## 对后续开发的影响

1. 目前的瓶颈仍是游戏内取得旧档完整内容的入口；已有 JS 解析器不因本次调查失效。
2. 可借鉴 PYDT 的存档属性机制，在未来新局中记录本 mod 自己的开局快照。这不能自动补齐安装前旧档，也尚需验证完整设置覆盖和读取时机。
3. 若坚持无辅助程序且覆盖旧档，网页就地解析加文本配置码是有社区输入端代码可参考的替代方案；需要用户离开游戏选文件和复制粘贴，不应称为一键路线已打通。
4. 原先本机 HTTPS 实测只适用于当时的 Mac/游戏版本。此次公开源码调查没有找到足以推翻该结果的正例，也未证明 Windows 必定相同。

## 检索与证据范围

查阅 GitHub 作者仓库、作者网站、CivFanatics 和 Workshop 线索，覆盖 Civ7 / Civilization VII 与 HTTP、HTTPS、WebSocket、fetch、XMLHttpRequest、localhost、save parser、native loader、DLL、AI bridge 等组合。没有访问私人 Discord 或联系作者。GitHub 仓库搜索主要检索名称和描述，不是全网全部源码的穷举。

根调查快照：`work/civ7-community-research-20261022/`，包含仓库元信息、固定 commit、下载文件清单及只读源码副本。分项联网调查：`work/community-network-research-20261022/`。下载源码仅供阅读，没有导入产品代码或执行。
