## Why

Proposal 详情当前作为独立页面打开，会让用户离开 Overview 或 Chat 的工作上下文；同时详情只展示 proposal/design/tasks 三个 markdown 文件，无法直接查看 change 内的 capability delta。将详情改为编程打开的 Slideover 后，用户可以在当前页面内完成浏览、apply/archive 与运行日志查看，并把 specs delta 纳入同一个详情面板。

## What Changes

- **BREAKING**: 移除 `/proposal/:id` 独立详情路由；proposal 详情不再通过路由深链访问。
- 将 `pages/proposal/index.vue` 迁移为顶层 `pages/proposal.vue`，删除只渲染 `RouterView` 的 `pages/proposal.vue` 空壳和详情子页面。
- 新增独立 `ProposalDetailSlideover` 组件，并通过 `useOverlay().create(...)` 以编程方式从 proposal 列表、Overview 进行中变更、Chat EventRail 的“查看详情”入口打开。
- Slideover 允许 ESC 和遮罩关闭；调用方只 await overlay result，不需要为 dismiss 场景补额外关闭状态处理。
- Proposal 详情保留现有 header、Proposal/Design/Tasks tab、apply/archive 操作、运行历史 SidePanel 与 applying 自动恢复行为。
- Proposal 详情新增 Specs tab，展示当前 proposal `specs/<capability>/spec.md` 中的 capability delta，而不是完整 capability spec。
- 新增受控 proposal specs delta 读取 IPC，返回解析后的 delta DTO，不放宽现有 `proposal:readFile` 的顶层文件读取边界。
- Specs delta UI 复用 `/specs` 浏览页的信息架构，但简化为左侧 capability delta 列表、右侧 requirement/scenario delta 内容，并用 ADDED/MODIFIED/REMOVED/RENAMED badge 表达 delta 类型。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `proposal-detail`: proposal 详情从独立路由改为 Nuxt UI Slideover，并新增 Specs delta tab。
- `proposal-list`: proposal 列表点击行为从路由跳转改为打开详情 Slideover，并调整 `/proposal` 文件系统路由结构。
- `proposal-ipc`: 新增 proposal specs delta 读取 IPC 与共享 DTO。
- `app-shell-routing`: 移除 `/proposal/:id` 作为项目作用域路由的契约，保留 `/proposal` 列表页。
- `chat-event-rail-proposal-status`: Chat EventRail 的详情入口改为打开详情 Slideover，不再导航到详情页。
- `project-overview`: Overview 进行中变更入口改为打开详情 Slideover，`ActiveChange.id` 语义调整为打开详情所需 changeId。

## Impact

- Renderer: `src/renderer/src/pages/proposal.vue`、`src/renderer/src/pages/proposal/index.vue`、`src/renderer/src/pages/proposal/[id].vue`、`src/renderer/src/components/proposal/**`、`src/renderer/src/components/chat/event/ChatProposalPanel.vue`、`src/renderer/src/components/overview/OverviewActiveChanges.vue`、相关 composable 与测试。
- Main / preload / shared IPC: `src/shared/types/channels.ts`、`src/shared/types/proposal.ts`、`src/shared/schemas/ipc/proposal.ts`、`src/main/ipc/proposal.ts`、`src/main/services/proposal/**`、`src/preload/api/proposal.ts`、`src/preload/index.d.ts`、`src/renderer/src/api/proposal.ts`。
- Specs parsing: 复用 `src/main/services/specs/specs-markdown-parser.ts` 的 requirement/scenario 解析思路，但增加 OpenSpec delta section 识别。
- Tests: 更新旧详情页路由测试，新增 Slideover 打开/关闭、proposal specs delta 解析与 IPC、入口组件行为测试。
