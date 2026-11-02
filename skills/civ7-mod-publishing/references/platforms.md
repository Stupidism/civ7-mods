# Platform notes — verified experience, 2026-10-23

这些是本账号的操作经验；每次发布仍要查看当前规则与页面。

## Bilibili

写中文专栏/图文，一功能一章，原生图片上传后检查正文图片顺序与图注。已有 bilibili-mcp 安装经验，但先发现当前可用能力；不要假定工具能处理专栏或已登录。文章可能呈现在 opus 页面，也可能带 cv ID。导出正文不代表发布，必须查看最终文章。

案例：《文明7拯救计划》第一期：更好的手柄支持，司徒比特，UID 7247306。
公开页 https://www.bilibili.com/opus/1262385145689669638 （cv53577076）。
证据目录 `work/bilibili/better-controller-support/`；article-publish.md 为实际发布稿，screenshots.json/上传回执/发布核验互相对应。不要把专栏发布记作视频发布。

## CivFanatics

发布英文详细介绍，选择与状态匹配的 Civilization VII Mod 板块。已发布 Mod 的经验入口是 Released Mods；开发预告不能自动归为正式发行。采用原生附件，不依赖需要登录的外站图片。

XenForo 可使用 `[HEADING=2]`、`[B]`、`[I]`、`[URL="..."]`，成功上传后按实际附件 ID 插入 `[ATTACH type="full"]ID[/ATTACH]`。不要预造 ID。一次上传多图后核对数量和位置。

浏览器文件上传曾因扩展文件 URL 权限失败，改用原生 Chrome 文件选择器成功；不需要扩大扩展权限。提交前预览，提交后核对最终 URL 和待审核横幅。

案例 https://forums.civfanatics.com/threads/better-controller-support-for-civilization-vii.705221/ ，账号 Stupidism，2026-10-23 最近回执为**已提交待审核**。七个附件已插入；懒加载未加载的图片不能单凭 DOM loaded=false 判断丢失，需滚动核验。不要重复发帖。

## Reddit

短介绍，说明“I'm the author”，展示两三张关键实机图、功能和确切测试边界，给一个下载入口并邀请具体反馈。先读目标社区规则、近期同类作者帖及所需 flair；正文相关不等于自动豁免自推广规则。

r/CivVII 第 8 条在 2026-10-23 写有禁止自推广。用户要求核对实际 Mod 发帖惯例后发现：
- https://www.reddit.com/r/CivVII/comments/1ilji0e/ive_created_a_mod_that_keeps_diplomacy_banners/
- https://www.reddit.com/r/CivVII/comments/1vyox99/scythia_civilization_mod/

这些是同类帖的事实证据，不是版主明确许可。结合当轮用户授权、完整规则和同类惯例判断；若明确禁止该内容则遵守。不要无根据地把一切免费 Mod 分享都判为不能发，也不要据此保证不会被删除。版主询问是外发消息，需有用户授权，不能默默发送。

此前 AI 预检给过“可能违反 Rule 8”提示，页面允许正常继续提交；在已授权范围内提交成功。这种可选内容提示不同于验证码、封禁和强制审核，不得绕过后者。

重要经验：正文 fill 曾追加导致重复，提交前读回发现并修正。图片通过原生上传器成功；提交后核对永久帖只有一份正文和三张图。

案例 https://www.reddit.com/r/CivVII/comments/1xdenjj/i_made_a_controller_support_mod_for_civ_vii_map/ ，账号 PhysicalPackage4275；最近核验为公开帖，无移除/待审核提示。记录在 `work/civfanatics/better-controller-support/reddit-status.json`。

## Steam Workshop

本技能可写双语工坊说明、更新日志和订阅入口，不把内容发布授权扩大为二进制 Mod 上传/改可见性/修改依赖。发行包由对应开发流程处理。版本从回执和当前官方页面核对，源码新版本不代表订阅者已拿到。
