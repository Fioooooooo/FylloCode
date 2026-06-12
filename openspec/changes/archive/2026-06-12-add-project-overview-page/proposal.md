## Why

项目打开后当前默认落地 `/chat`，用户无法快速了解一个项目的治理全貌：规范沉淀了多少、当前有哪些变更在进行、最近的讨论线索走到了哪一步。前端已在 main worktree 用静态 mock 把 `/overview` 概览页搭好（`pages/overview.vue` + `components/overview/*` + `stores/overview.ts`，activity-bar 已将 overview 设为默认项），现在需要补齐主进程真实数据供给，把 mock 替换为真实的 IPC 数据源，让概览页能回答"飞轮转了多少圈、当前在做什么、最近发生了什么"。

## What Changes

- 新增 `overview:getProjectOverview` 单一 IPC 通道：入参 `{ projectId }`，一次返回完整 `ProjectOverview` DTO（stats / activeChanges / recentThreads / governance）。
- 新增主进程 overview service 层（`src/main/services/overview/`），聚合三类数据源：
  - **仓库文件系统扫描**：specs 目录数、archive 目录数与本月新增、guidelines 文件数。
  - **git CLI 查询**：specs 存量的近 8 周趋势（`git ls-tree` 基数快照法）、guidelines 最近提交时间与最近 5 条变更记录。
  - **lineage 投影**：最近 10 条 subject 线索、任务驱动占比（origin === "task"）。
- 复用既有 `domain/proposal/openspec-reader.ts` 的 `readProposalFiles` 计算"进行中"变更，**不重写** change 扫描与 stage 推导逻辑。
- 新增 preload bridge `window.api.overview` 与 renderer 薄封装 `src/renderer/src/api/overview.ts`。
- 改造 `stores/overview.ts`：用真实 IPC 调用替换 `createMockOverview`/`loadMockData`，保留现有 DTO 类型与组件契约不变。
- 共享类型迁移：将 overview DTO 从 `stores/overview.ts` 提升到 `@shared/types/overview.ts`，供主/渲染进程共用。

不涉及破坏性变更；前端组件（4 个 overview 组件 + 页面）的 props 契约保持不变。

## Capabilities

### New Capabilities

- `project-overview`: 项目概览页的数据契约——定义 `overview:getProjectOverview` 通道的入参、`ProjectOverview` 聚合 DTO 的字段语义、各数据源的取数口径（仓库扫描 / git 查询 / lineage 投影）、stage 映射规则、空数据与容错的用户可见状态。

### Modified Capabilities

<!-- 无既有 spec 的行为契约变更。activity-bar 默认项切换已在 main worktree 落地，且属于实现层调整，不修改既有 app-shell-routing 的 SHALL 条款。 -->

## Impact

- **新增主进程代码**：`src/main/services/overview/`（overview-service、openspec-stats、git-stats）、`src/main/ipc/overview.ts`。
- **新增共享契约**：`src/shared/types/overview.ts`、`src/shared/types/channels.ts`（OverviewChannels）、`src/shared/schemas/ipc/overview.ts`。
- **新增桥接**：`src/preload/api/overview.ts`、`src/preload/index.ts`、`src/preload/index.d.ts`、`src/renderer/src/api/overview.ts`。
- **改造渲染层**：`src/renderer/src/stores/overview.ts`（去 mock，接真实 IPC）。
- **复用既有能力**：`domain/proposal/openspec-reader.ts`、`services/lineage/lineage-service.ts`（新增 `listRecentSubjects`）、`infra/storage/project-paths.ts`、`services/chat/chat-service.ts` 的 `resolveProjectPath`、`ipc/_kit/wrap-handler.ts` + `ipc/_kit/schema.ts`。
- **依赖**：git 查询使用既有 `cross-spawn`（遵循 MainProcess 约束），无新增 npm 依赖。
