## Context

FylloCode 渲染进程使用 `vue-router/auto`（文件系统路由），ActivityBar 由 `src/renderer/src/config/activity-bar.ts` 的 `activityBarItems` 静态注册表驱动，`App.vue` 据此渲染主导航。概览页（`pages/overview.vue`）为项目默认落地页（`isDefault: true`），由四个子组件构成：`OverviewStatsBar`（统计条）、`OverviewActiveChanges`（进行中提案，已支持点击跳 `/proposal/:id`）、`OverviewRecentThreads`、`OverviewGovernance`。

当前事实（已核实）：

- `OverviewStatsBar.vue` 通过 `cards` computed 渲染四张卡片，其中 `key: "archives"` 即「归档提案」卡，目前为纯展示，无点击行为。
- `OverviewActiveChanges.vue` 的 `openChange()` 已用 `router.push('/proposal/${changeName}')` 直达详情。
- `pages/proposal/[id].vue` 的 `backToList()` 硬编码 `router.push("/proposal")`，由 `ProposalDetailHeader` 的 `@back` 触发。
- `proposal-detail` spec 的「Back navigation」场景明确要求返回按钮跳 `/proposal` 列表页——与本次需求冲突，需 MODIFIED。
- `app-shell-routing` spec 将 `/proposal`、`/proposal/:id` 登记为共享外壳 + 项目作用域路由；这些路由本次保留，不动。

## Goals / Non-Goals

**Goals:**

- 移除 ActivityBar「提案」入口，提案区域改由概览页进入。
- 概览页「归档提案」统计卡成为 `/proposal` 列表页入口。
- 提案详情页返回按钮回退到导航来路，无历史时兜底 `/overview`，消除「从概览进详情、返回却到列表」的来路丢失。

**Non-Goals:**

- 不删除 `/proposal` 列表页与 `/proposal/:id` 详情页路由。
- 不改动 `overview:getProjectOverview` IPC 取数口径或 `ProjectOverview` 数据结构。
- 不改动 `OverviewActiveChanges` 现有的直达详情行为。
- 不为其余三张统计卡（specs、guidelines、lineages）新增交互。

## Decisions

### 决策 1：移除 proposal 条目，而非隐藏

直接从 `activityBarItems` 数组删除 `id: "proposal"` 条目，而不是加 `hidden` 标记。理由：注册表是静态声明式配置，保留死条目会增加维护噪音；且 `isDefault` 校验逻辑（`activity-bar.ts:79-87`）只关心 default 数量，删除单个非 default 条目无副作用。

**备选**：保留条目但加可见性开关——被否决，引入无实际用途的状态字段。

### 决策 2：归档卡入口的交互形态

仅将 `key: "archives"` 一张卡改为可点击（包裹为可交互元素 / 加 `@click` 跳 `/proposal`），其余三张保持纯 `div`。理由：用户明确指向「归档提案」卡作为列表页入口，列表页本就以归档/全部状态为主要内容，语义契合。需保证可点击卡具备无障碍语义（如 `role`/键盘可达）与 hover 反馈，与现有 `OverviewActiveChanges` 卡片的 `hover:bg-accented` 视觉风格保持一致。

**备选**：在「进行中」标题旁加「查看全部 →」文字链接——被否决，用户已明确选择归档卡作为入口。

### 决策 3：详情页返回用 `router.back()` + 无历史兜底 `/overview`

`backToList()` 改为：先判断是否存在可回退历史，有则 `router.back()`，无则 `router.replace("/overview")`（或 `push`）。

无历史判定采用 vue-router 提供的 history state：检查 `router.options.history.state.back` 是否为 `null`/`undefined`。当用户深链直达 `/proposal/:id` 或刷新后首屏即详情页时，`state.back` 为空，此时 `router.back()` 会回退失败或退出应用，必须兜底。

**备选 A**：固定 `router.push("/overview")` 不回退——被否决，从列表页进入详情的用户期望回到列表，固定跳概览会破坏列表场景的来路。

**备选 B**：固定 `router.back()` 无兜底——被否决，深链/刷新场景下行为不可靠。

兜底目标定为 `/overview`（项目默认页）而非 `/proposal`，与「弱化提案列表作为主入口」的整体方向一致。

## Risks / Trade-offs

- [移除导航入口后用户找不到提案区] → 概览页「归档提案」卡作为显式入口，且「进行中」卡片仍直达详情；两条路径互补覆盖「看进行中」与「看全部/归档」。
- [`router.back()` 回退到非提案相关页面（如用户从 settings 误入详情）] → 来路回退本就是符合用户心智的「返回上一步」语义；只要不是无历史，回退到任何真实来路都比固定跳列表更自然。
- [`router.options.history.state.back` 在 hash/memory history 下的兼容性] → 项目使用 vue-router 标准 history，`state.back` 为官方支持字段；实现时以实际 router 配置为准验证。
- [测试断言依赖旧的固定跳转行为] → 同步更新 `activity-bar` 与 proposal 详情相关测试。

## Migration Plan

纯前端改动，无数据迁移、无 IPC 变更。部署即生效，回滚还原三处文件即可。
