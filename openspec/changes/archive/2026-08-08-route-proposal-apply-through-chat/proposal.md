## Why

FylloCode 正在重新评估 Proposal 的运行方式，现有详情 Slideover 直接启动 Apply、Archive 和运行历史的入口会过早固化交互流程。短期内应将 Apply 意图收敛到 Chat 用户消息，同时保留底层运行能力，避免在后续重构方向尚未确定时贸然删除实现。

## What Changes

- 从 Proposal 详情 Slideover 的头部移除“开始实现”“归档”“查看运行历史”等生命周期操作入口，但保留现有状态展示、运行 side panel 和底层 Proposal run 能力。
- 将 Chat Event Rail Proposal 卡片的“开始实现”从 workflow dropdown 改为直接按钮；点击后通过 `chatStore.sendMessage` 发送包含完整 owner 信息的用户消息：`Start applying proposal: <changeId> (folderId: <folderId>)`。
- 保留 Event Rail Proposal 卡片现有的“查看详情”和“归档”行为。
- 暂时将因入口停用而不再执行的组件内旧接线注释保留，并说明“待重构，方案确定后恢复或删除”；不添加 TODO、feature flag，也不删除 Proposal store、API、workflow、side panel 或运行记录实现。
- 更新 renderer 组件测试，覆盖 Slideover 不再展示生命周期按钮、Event Rail 不再展示 workflow dropdown，以及点击“开始实现”发送 owner-qualified 用户消息。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `proposal-browser`：调整 Proposal 详情 Slideover 与 Chat Event Rail 卡片上的生命周期操作入口及 Apply 意图发送方式。

## Impact

- Renderer 组件：`src/renderer/src/components/proposal/ProposalDetailHeader.vue`、`src/renderer/src/components/proposal/ProposalDetailSlideover.vue`、`src/renderer/src/components/chat/event/ChatProposalPanel.vue`。
- Renderer 测试：`test/renderer/src/components/proposal-detail-header.spec.ts`、`test/renderer/src/components/chat/event/ChatProposalPanel.test.ts`，以及受组件 props/emits 影响的详情测试。
- 不改变 `ProposalRef`、IPC/preload API、Apply/Archive run store、持久化格式、workflow 模板或 Main/MCP 执行能力。
