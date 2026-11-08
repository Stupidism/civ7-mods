# 0.10.1 源码同步验证（2026-11-08）

本次将 GitHub 主分支的 0.3.0 更新为已发布的 0.10.1。沿用仓库目录 `mods/civ7-better-controller-support`，内部 Mod ID 仍为 `civ7-map-tools-gamepad`；开发目录曾使用后者作为目录名，这次不再新增重复副本。

29 个发行文件（含所有运行脚本、配置、本地化、清单和说明）逐一与 `release-0.10.1.json` 的大小及 SHA-256 比较，全部一致。运行行为没有在本次提交准备中改动。0.10.1 相对 0.10.0 是文档整理发行；本 PR 相对主分支则包含 0.3.0 之后的累计代码变更。

## 本次离线检查

- Node 24.22.1，系统原生 `/usr/bin/python3`。
- 手柄专项：136 项通过，0 失败，0 跳过，包含独立浏览器模拟。
- 全仓检查：7 个 Mod、128 个清单引用、137 个 JavaScript 文件通过。
- 全仓测试：793 项 JavaScript 测试通过，0 失败，32 项其他 Mod 测试因环境条件跳过；中文支持另有 10 项 Python 测试通过。跳过项不视为通过。
- 初次全仓测试因 PATH 中的 Python 架构不兼容中断，指定系统 Python 后完整通过。
- 未启动游戏、未操作实体手柄、未安装 Mod、未再次上传工坊。

复现命令（仓库根目录；环境变量指向本机可用运行时）：

```sh
node scripts/check.mjs
PYTHON=/usr/bin/python3 CIV7_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node scripts/test.mjs
```

测试原始输出见同目录 `source-sync-0.10.1-tests.txt`。浏览器与原生游戏资源相关用例在缺少本机依赖的 CI 中可能跳过，不能代替实机验收。历史实机证据和其适用范围保留在 `VALIDATION.md` 中。
