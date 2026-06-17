## Why

当前用户在 Chat 会话中与 Agent 协作时，Agent 调用 `create-proposal` 后会生成一个 OpenSpec change，但用户无法在 Chat 页面实时感知该 proposal 的状态变化（creating → draft → applying → archived），也无法从 Chat 上下文直接触发实现或归档操作。这导致用户必须频繁切换到 Proposal 列表/详情页才能跟踪进度，打断了以对话为中心的工作流。

本提案旨在把 proposal 的全生命周期状态嵌入 Chat 页面右侧的 `ChatSessionEventRail`，并允许用户在该 rail 内直接发起“开始实现”和“归档”，使 Chat 会话成为 proposal 工作流的可视化控制中心。

## What Changes

- **新增主进程 → 渲染进程推送通道**：当 proposal 状态变化时，主进程通过 Electron `webContents.send` 主动向 renderer 广播 `proposal:statusChanged` 事件，无需 renderer 轮询。
- **新增主进程 proposal 状态监听服务**：基于 `fs.watch` 监听 `.openspec.yaml` 文件内容变化；当文件被移动/删除时，回退查找 main worktree 与 linked worktree 的 `changes` 和 `changes/archive` 目录，推导出 archived 或 removed 状态。
- **扩展 mcp-event-consumer**：在消费 `create-proposal` 产生的 spool 事件并建立 `sessionId ↔ changeId` lineage 绑定后，启动对该 proposal 的状态监听。
- **扩展 renderer 状态管理**：`useSessionStore` 维护每个 session 关联的 proposal 列表；收到推送后增量更新状态。
- **扩展 ChatSessionEventRail**：新增 `ChatProposalPanel` 子组件，展示当前 session 的 proposal 列表、当前状态 badge，并对 `draft` 状态提供“开始实现”下拉菜单，对 `applying` 且 run 完成的状态提供“归档”按钮。
- **复用现有 apply/archive 流程**：从 rail 发起的实现/归档直接调用 `useProposalRunStore.startRun()` / `startArchive()`，复用现有 `proposal:apply` 与 `proposal:archive` IPC 及 MessagePort 流式机制，不在 rail 内展示执行日志。

## Capabilities

### New Capabilities

- `chat-event-rail-proposal-status`: Chat EventRail 实时展示当前会话关联的 proposal 状态，并支持从 rail 发起实现与归档操作。

### Modified Capabilities

- 无现有 spec 级行为变更。本提案新增的 IPC channel、preload API、store 字段均为新增能力，不修改现有 chat/proposal 模块的对外行为契约。

## Impact

- **IPC / 共享类型**：新增 `ProposalChannels.statusChanged`、`ProposalStatusChangedPayload`。
- **主进程**：新增 `ProposalStatusService`、扩展 `mcp-event-consumer`、扩展 `openspec-reader` 路径解析、在 `bootstrap/index.ts` 挂载 broadcast。
- **Preload**：`proposalApi` 新增 `onStatusChanged` 订阅方法。
- **Renderer**：`useSessionStore` 新增 `sessionProposals`；`ChatSessionEventRail` / `ChatContainer` / `pages/chat.vue` 扩展；新增 `ChatProposalPanel.vue`。
- **外部依赖**：无新增第三方依赖。
