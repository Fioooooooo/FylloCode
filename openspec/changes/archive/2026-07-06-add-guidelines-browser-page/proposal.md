## Why

overview 的 StatsBar 已经展示“项目准则”数量，但该卡片当前没有承接页面，用户无法从治理摘要继续查看具体准则内容。同时 overview 的准则数量只统计 `guidelines/` 顶层 `.md` 文件，和系统提醒、MCP guidelines 工具使用的 `guidelines/**/*.md` 递归扫描口径不一致。

## What Changes

- 新增只读项目准则浏览能力，提供 `/guidelines` 页面展示当前项目的 `guidelines/**/*.md` 准则列表和正文。
- 将 overview StatsBar 的“项目准则”卡片改为可点击入口，导航到 `/guidelines`；能力规约继续导航 `/specs`，归档提案继续导航 `/proposal`。
- 将 overview 的 `guidelinesCount` 统计口径改为递归统计 `guidelines/**/*.md`，与项目准则浏览页和系统提醒中的 guidelines index 保持一致。
- 复用现有 `scanGuidelines()` frontmatter 解析规则，避免 renderer 或新服务定义另一套准则元数据口径。
- 不新增项目准则编辑、创建、删除或 guideline 维护动作；本变更只提供浏览与导航。

## Capabilities

### New Capabilities

- `guidelines-browser`: 定义项目准则浏览页、准则浏览数据契约、加载/错误/空状态和列表详情阅读行为。

### Modified Capabilities

- `project-overview`: 更新治理健康区域中“项目准则”统计和导航行为，要求项目准则数量按 `guidelines/**/*.md` 递归统计，并让“项目准则”入口导航到 `/guidelines`。

## Impact

- 影响主进程准则浏览数据读取：新增 guidelines browser service、IPC handler、shared channel/schema/type、preload API 和 renderer API wrapper。
- 影响 renderer：新增 `src/renderer/src/pages/guidelines.vue`、对应 Pinia store，并更新 `OverviewStatsBar.vue` 的项目准则卡片交互。
- 影响 overview 主进程统计：`countGuidelines()` 需要从顶层统计改为递归统计，测试需要覆盖子目录。
- 影响测试：新增 main service/IPC 相关测试和 renderer 页面测试，并更新 overview 统计卡片导航测试。
