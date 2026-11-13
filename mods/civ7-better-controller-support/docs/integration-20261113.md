# 2026-11-14 · 0.10.2-dev 主线集成与菜单／滚动候选记录

## 组合内容

- 保留本 PR 的三项设置存储修复：keyed 多键兼容、0.3.0 校准迁移、失败保存最终校验与回滚；`bridge-shared-storage.js`、`bridge-store.js` 和迁移工具在本轮未改动。
- 只把用户已安装目录中的两个权威运行文件按字节复制到候选源码：
  - `ui/menu-navigation-adapter.js`，SHA-256 `4757e2cb7c74258f9d65924c100b53cfef3caea47100ef4f9f419850bf6c79d0`
  - `ui/scroll-navigation.js`，SHA-256 `201438d88074b17623680bf09d2617af0cb1ca1317fc90566c500f61fd7b5f2a`
- 这两个文件的改动范围是：滚动提示接入原生 NavigationTray、只增删本 Mod 的持久项、弹出层通过 `civ7-controller-scroll` 取消输入或声明当前帧。没有新增页面布局、快捷键或业务功能。
- 合并 `origin/main` d682ae5，保留主线其他 Mod 更新；根目录 README 冲突保留本候选的 BCS `0.10.2-dev` 六功能描述，同时采用主线 No More Turn 1.8.8 描述。

## 测试适配

- 从已审查工作树选择性导入 `tests/helpers/native-navigation-tray.mjs`，直接执行本机游戏安装内的原生 NavigationTrayModel，而不是在测试里重写栈行为。
- `bridge-menu-adapter` 增加多导出解析检查；`bridge-menu-navigation` 使用原生 NavigationTray 实例；`scroll-hints-layout` 改为验证原生 tray 的幂等、外来项保留、单滚动区收缩、suspend／dispose 清理，并确认不再生成自定义 footer。
- `scroll-navigation` 的既有集成断言从自定义 hint 回调改为 NavigationTray 回调；新增纯逻辑 弹出层所有权测试，覆盖：
  1. 弹出层取消 `scroll-pan` 与 R3（`shell-action-3`）时各路由一次且不激活；
  2. 已持续滚动的后台输入在弹出层声明帧后立即停止；
  3. 弹出层释放后普通菜单滚动恢复；
  4. 弹出层监听器抛错不能中断导航；
  5. `active=false` 的输入既不分发给弹出层，也不滚动。

## 离线证据边界

- 源码整合与离线测试阶段只读取源码、测试、两个用户指定的已安装运行文件和本机游戏安装的只读原生模块；未启动游戏，未连接 CDP，未访问 Saves、LocalStorage、账号数据，未安装或替换任何文件，也未操作实体手柄。
- 复制已安装运行文件只是源码同步，不表示本候选已经安装、发布、被游戏加载或通过硬件／实机验收。
- 2026-11-09 存储修复记录中的 159 项结果属于当时候选；本次新增运行文件组合后必须以当前测试和后续带锁实机记录为准。

## 本轮命令结果

- 2026-11-14（Australia/Perth；保留既有 2026-11-13 文件名）独立复核后，仅加强纯逻辑 弹出层所有权测试：抛错路由使用抛错前的新 scrollTop 基线；`active=false` 立即清空 tray、track 状态与 thumb marker，并在无新 START 的情况下确认 held 输入不恢复；弹出层 probe 声明帧时同样验证完整清理、释放后旧手势不复活，以及新 START 才恢复滚动。
- Worker 沙箱命令：`/Users/sunmer/.nvm/versions/node/v24.22.1/bin/node --test --test-name-pattern='popup ownership' mods/civ7-better-controller-support/tests/scroll-navigation.test.mjs`；结果 1 test / 1 pass / 0 fail / 0 cancelled / 0 skipped。
- 本轮 worker 未启动浏览器或 Playwright；实机与浏览器验证仍由 supervisor 执行。supervisor 在加强断言前已取得 161/161 no-fail/no-skip；加强后的最终全量验证仍待完成，不能预填为通过。
- 本轮 worker 未修改运行时文件；`ui/menu-navigation-adapter.js` 与 `ui/scroll-navigation.js` 的 SHA-256 仍为 `4757e2cb7c74258f9d65924c100b53cfef3caea47100ef4f9f419850bf6c79d0`、`201438d88074b17623680bf09d2617af0cb1ca1317fc90566c500f61fd7b5f2a`。


## 监督复验结果（2026-11-14，Australia/Perth）

- 最终手柄专项：**162 通过、0 失败、0 跳过**，包含 Playwright 浏览器、安装版原生模型离线执行及设置存储故障回归。
- 对新增弹窗测试做三个内存变异：吞掉异常输入、非活动时不清理、弹窗接管时残留长按/标记；三个变异均触发断言失败，原运行实现全部通过。
- 源码检查通过：7 个 Mod、163 个清单引用、193 个 JavaScript 文件。相对 `origin/main` 的 PR 差异检查通过。
- 全仓离线回归中，微操大师有两项 `army-portraits` 原生夹具失败，错误为 `this.commanderContainer.addEventListener is not a function`。已从未加入本 PR 的 `origin/main` d682ae5 干净导出中复现完全相同的两个失败；不在本手柄任务中修改其他 Mod。全仓另有 32 项环境相关跳过；中文支持 10 项 Python 测试通过。
- GLM 两轮有界任务在收尾前到时终止；保留实际改动，以上结果由监督进程及独立审查复核，不以 worker 完成状态代替验收。
- 21 个运行文件均匹配预定来源：菜单/滚动两文件匹配安装基线，其余匹配原 PR a5a92e5。其他 Mod 文件与 main 一致（遵循仓库 CRLF 属性）。
- 本次只授权更新 PR 和安装开发构建，不合并 PR、不发布工坊。安装结果以独立安装回执为准；离线通过不表示实体手柄或游戏内验收。
- 本地证据目录：`work/bcs-integrate-20261113/`，最终专项 `final-tests.txt`，源码检查 `final-check.txt`，全仓 `supervisor-repo-tests.txt`，main 对照 `main-baseline-war-controls.txt`，运行文件来源 `runtime-verification.json`。
