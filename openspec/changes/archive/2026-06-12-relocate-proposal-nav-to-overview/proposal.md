## Why

概览页（Overview）上线后已成为项目默认落地页，ActivityBar 的「提案」入口与概览页能力出现职责重叠：概览页「进行中」卡片已能直达提案详情，而 ActivityBar 的「提案」入口仅提供一个略显冗余的列表页跳转。同时，由于概览页「进行中」卡片直接打开 `/proposal/:id`，详情页返回按钮硬编码跳转 `/proposal` 列表页，导致用户从概览页进入详情后点击返回会被甩到列表页而非来路，形成导航来路丢失。

## What Changes

- **移除 ActivityBar 的「提案」导航入口**：从 `src/renderer/src/config/activity-bar.ts` 的 `activityBarItems` 注册表中删除 `id: "proposal"` 条目。提案区域不再占据主导航位置。
- **概览页「归档提案」统计卡成为 `/proposal` 入口**：将 `OverviewStatsBar.vue` 中 `key: "archives"` 的统计卡改为可点击，点击后路由跳转 `/proposal` 列表页。其余三张统计卡（能力规约、项目准则、溯源覆盖）保持纯展示，不变。
- **提案详情页返回行为改为回退来路**：`src/renderer/src/pages/proposal/[id].vue` 的 `backToList()` 从硬编码 `router.push("/proposal")` 改为 `router.back()` 回退到导航来路；当无历史记录可回退时（深链直达、刷新后首屏即详情页），兜底跳转 `/overview`。
- **路由保留**：`/proposal` 列表页（`pages/proposal/index.vue`）与 `/proposal/:id` 详情页（`pages/proposal/[id].vue`）的路由定义不变，二者仍受共享外壳与项目作用域约束保护。

无 **BREAKING**：所有路由保持可达，仅入口位置与返回目标调整。

## Capabilities

### New Capabilities

无。本次不引入新能力，均为对现有 spec 的要求调整。

### Modified Capabilities

- `app-shell-routing`: 新增要求——ActivityBar 主导航不再包含「提案」入口，提案区域改由概览页进入。
- `project-overview`: 新增要求——概览页「归档提案」统计卡提供 `/proposal` 列表页入口的点击交互。
- `proposal-detail`: 修改「Back navigation」场景——返回按钮由固定跳转 `/proposal` 改为回退来路，无历史时兜底 `/overview`。

## Impact

- **前端配置**：`src/renderer/src/config/activity-bar.ts`（移除 proposal 条目）。
- **前端组件**：`src/renderer/src/components/overview/OverviewStatsBar.vue`（归档卡点击交互）、`src/renderer/src/pages/proposal/[id].vue`（返回逻辑）。
- **测试**：`test/renderer/src/config/activity-bar.spec.ts`、`test/renderer/src/components/activity-bar.spec.ts`，以及概览 StatsBar、proposal 详情页相关测试需同步更新。
- **不影响**：主进程、IPC 通道、`overview:getProjectOverview` 取数口径、proposal 列表/详情路由定义、其余 ActivityBar 条目。
