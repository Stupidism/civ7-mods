# GitHub Actions 自动发布 Steam Workshop 调查

调查日期：2026-10-22。仅查阅公开源码、GitHub API、作者自述和 Valve 官方文档；没有更改 CI、登录 Steam、上传或操作游戏。

## 结论

**有人这样做，而且有真实游戏模组的成功 workflow 记录。** 已找到 Wildermyth 模组在 GitHub Release 发布后自动上传 Workshop 的源码和成功 job。Civ VII 也有 tag 自动打包并发布 GitHub Release 的实例；本次没有找到可核验的 Civ VII「GitHub Actions → Workshop 内容上传」成功运行记录。因此，通用方案已被使用，Civ VII 全流程兼容性仍须单独验证。

## 真实项目证据

### Wildermyth：自动发布 Workshop，并有成功 job

[BoldestDungeon/wildermyth-drauven-pcs 的运行对应 workflow](https://github.com/BoldestDungeon/wildermyth-drauven-pcs/blob/a443bb37bbc4881e38c31d42fb5b9cffb74cc45b/.github/workflows/deployRelease.yml) 设置 `release: published` 和手动触发，在 Ubuntu 上运行 `workshopUpload`，调用 `BoldestDungeon/steam-workshop-deploy@V2.0.0`，传入账号、`configVdf` 会话、Wildermyth App ID `763890`、条目 `2810606541`、内容路径和更新说明。

2025-10-26 的 [run 18811944618](https://github.com/BoldestDungeon/wildermyth-drauven-pcs/actions/runs/18811944618) 是 release 事件，关联上述 commit；[workshopUpload job](https://github.com/BoldestDungeon/wildermyth-drauven-pcs/actions/runs/18811944618/job/53674516060) 返回 success。[GitHub jobs API](https://api.github.com/repos/BoldestDungeon/wildermyth-drauven-pcs/actions/runs/18811944618/jobs) 仍提供 job 结果，但 `steps` 数组为空。证据强度是**上传 job 成功**，不是此次重新下载核验其 Workshop 内容；不能声称拿到了逐步上传日志。特意使用运行时 commit，避免把当前分支的 action 版本误当成历史运行版本。

### Civ VII：自动打包到 GitHub Release

[craimasjien/civ7-craimasjiens-mod-pack 的 release.yml](https://github.com/craimasjien/civ7-craimasjiens-mod-pack/blob/main/.github/workflows/release.yml) 在 tag 推送时运行 Ubuntu，复制 modinfo、text 和 ui 内容，生成 ZIP，上传构建产物并调用 `softprops/action-gh-release`。该文件没有 Workshop 上传步骤；它证明现成打包配置存在，不证明 Workshop 发布成功。

## 可复用工具及版本核查

### steam-workshop-deploy

[BoldestDungeon fork README](https://github.com/BoldestDungeon/steam-workshop-deploy) 描述通过本地 SteamCMD 登录一次，再把 `config.vdf` 存入 GitHub secret；[action.yml](https://github.com/BoldestDungeon/steam-workshop-deploy/blob/main/action.yml) 和 [steam_deploy.sh](https://github.com/BoldestDungeon/steam-workshop-deploy/blob/main/steam_deploy.sh) 支持 configVdf 或账号密码/TOTP，生成 VDF，再调用 `workshop_build_item`。main 已实现 staging 和 `.deployignore`。

**版本容易混淆：** fork README 虽提到 v4，但 [BoldestDungeon tags API](https://api.github.com/repos/BoldestDungeon/steam-workshop-deploy/tags) 在调查时只返回 `v2`、`V2.0.0`、`v1.0.1`、`v1.0.0`；其 `/v4/action.yml` 返回 404。不能直接写 `BoldestDungeon/steam-workshop-deploy@v4`。真正存在 v4 的是上游 [m00nl1ght-dev/steam-workshop-deploy](https://github.com/m00nl1ght-dev/steam-workshop-deploy/tree/v4)，[tags API](https://api.github.com/repos/m00nl1ght-dev/steam-workshop-deploy/tags) 的 v4 指向 `7abf9c7628c3bc79229c9bca93f7a7296fa82428`。

README 提醒旧版上传仓库根目录可能把 `.git` 一并发布，v4 增加排除规则。实现时应上传明确的干净构建目录并固定已审查 commit，不能照抄旧实例的版本和 `path: .`。[上游 v4 action 定义](https://github.com/m00nl1ght-dev/steam-workshop-deploy/blob/v4/action.yml)

### buildalon/upload-steam

[官方仓库](https://github.com/buildalon/upload-steam) 和 [v2.1.0 action 定义](https://github.com/buildalon/upload-steam/blob/v2.1.0/action.yml) 支持 `workshop_item_id`、`app_id`、`content_root` 或自定义 `workshop_item` VDF。[upload.ts](https://github.com/buildalon/upload-steam/blob/v2.1.0/src/upload.ts) 确实走 SteamCMD `workshop_build_item`；不是只有游戏本体 depot 上传。调查时 [tags API](https://api.github.com/repos/buildalon/upload-steam/tags) 的 v2.1.0 / v2 指向 `d8cbca4f42fb606f93cf2185d5580f8e740e57f9`。

README 要求首次在 Steam Mobile 确认登录，之后尝试使用缓存凭证，偶尔仍需重新确认；[auth.ts](https://github.com/buildalon/upload-steam/blob/v2.1.0/src/auth.ts) 先检查缓存登录，再用用户名密码登录。因此不能承诺配置一次后永久无人值守。本次核实了实现能力，未找到该 action 用于 Civ VII 的成功运行证据。

## Civ VII 特殊点

[SLIM-AL/civ7-workshop-preview 作者源码说明](https://github.com/SLIM-AL/civ7-workshop-preview/blob/master/README.md) 区分游戏 Consumer App ID `1295660` 与开发工具 Creator App ID `3688890`。工具以开发工具身份初始化 Steam API，针对游戏条目调用 UGC，要求 Steam 客户端已运行、登录账号拥有条目和开发工具。**该项目只更新封面/标签，不上传模组内容，也不是现成 CI workflow。**

[Steam 社区的作者报告](https://steamcommunity.com/app/1295660/discussions/1/804596796626198613/) 描述 SteamCMD 内容上传能工作，但更新预览图遇到 Access Denied / LegacyCloud。应把这视为作者实际经历，不能扩展为所有 Civ VII 内容上传都失败，也不能扩展为任何 GitHub runner 已验证可用。

[Valve Workshop 官方文档](https://partner.steamgames.com/doc/features/workshop/implementation#SteamCmd) 给出了 VDF 和 `workshop_build_item`；更新现有条目需 appid 与 publishedfileid，并只列需要更新的字段。文档把 SteamCMD 这条路径定位为测试用途，因为它要求输入 Steam 凭据；这不等于 Valve 提供了正式的无人值守 CI 产品保证。同页 FAQ 明确允许独立编辑/发布工具 App 发布到游戏 Workshop，需要配置 App Publish Permissions；双方需有 cloud quota 才能存储预览图。该机制解释 creator/consumer 分离，但 Civ VII 数值来自专用工具和本机会话的验证，并非 Valve 通用文档硬编码。

本会话已有上下文报告：本机已登录 Steam，通过 Steamworks API、Creator App ID 3688890 上传本模组成功，随后下载校验了 8 个文件。此处仅记录本任务既有结果；本次调研未重新执行上传，因此它证明本机发布路径可用，不能替代云端 runner 验证。

## 对当前仓库的建议（推论，未实施）

1. 云端 CI 先做检查、测试、生成干净的发布目录与 ZIP、保存文件清单和哈希。这部分已有 Civ VII 同类工作流可参考。
2. 优先评估自托管 Mac runner 复用已验证的本机 Steamworks 上传器，显式保留 creator/consumer 区分，发布后下载并核对清单与哈希。机器与 Steam 会话必须可用；不能称为完全无运维。
3. 若要求全云端，再单独验证 SteamCMD 的 content-only 上传和会话恢复。封面/标签可以与内容发布分开处理。现有通用 actions 不是 Civ VII creator/consumer API 适配器，不能仅填两个 ID 就保证完整支持。
4. 发布触发应来自受信任 release/tag 或手动触发，上传身份只接触明确发布产物；PR 检查与带凭据发布分开。此为具体实现建议，本调查未新增任何审批流程或 CI。

## 检索范围与限制

调查检索了 GitHub Actions / Steam Workshop / Civilization VII 的公开网页、两类 action 的源码和 tags、Wildermyth 实际 workflow/run/jobs API，以及 Civ VII 自动打包和专用上传相关项目。主调查对 GitHub code search 执行 `1295660 path:.github/workflows` 与 `3688890 path:.github/workflows` 均返回空列表。搜索索引、命名与公开范围有限，**仅能说本次未找到可核验的 Civ VII 全云端 Workshop CI 成功案例，不能说没人做过**。

## 2026-10-24 定点复核

重新读取 GitHub 官方 API，[run 18811944618](https://api.github.com/repos/BoldestDungeon/wildermyth-drauven-pcs/actions/runs/18811944618) 仍返回 release 事件、commit `a443bb37bbc4881e38c31d42fb5b9cffb74cc45b` 和 success；[jobs API](https://api.github.com/repos/BoldestDungeon/wildermyth-drauven-pcs/actions/runs/18811944618/jobs) 仍明确返回 `workshopUpload: success`、`steps: []`。重新读取该 commit 的 workflow，确认上传 action 为 `BoldestDungeon/steam-workshop-deploy@V2.0.0`、游戏 `763890`、条目 `2810606541`。结论仍仅为配置存在且上传 job 报告成功，不包含逐步日志或 Workshop 下载验证。

重新读取 Civ VII 模组的 release.yml，仍是 tag → ZIP → artifact → GitHub Release，没有 Workshop 上传步骤。[固定版本源码](https://github.com/craimasjien/civ7-craimasjiens-mod-pack/blob/0390fb35ef861e9fe23e3829aad5b0778c2d344b/.github/workflows/release.yml)。本轮只复核这两处证据，没有重新做全网检索，也未执行 CI、Steam 发布或游戏操作。
