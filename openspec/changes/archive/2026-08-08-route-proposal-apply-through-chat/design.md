## Context

当前 Proposal 详情由 `ProposalDetailSlideover.vue` 组合 `ProposalDetailHeader.vue`、Markdown 内容和 `ProposalApplySidePanel.vue`。Header 为 draft/apply/archive 状态提供 workflow dropdown、归档按钮和运行历史按钮，Slideover 内的 `startWithWorkflow()`、`archiveProposal()`、`viewRunHistory()` 负责连接 `useProposalRunStore()`。Chat Event Rail 的 `ChatProposalPanel.vue` 也通过 workflow dropdown 直接调用 `proposalRunStore.startRun()`。

产品方向尚在重新评估，本次只调整可见入口和 Apply 意图的进入方式。底层 run store、API、workflow、状态投影和 side panel 仍可能被短期重构复用，因此不得随入口一起删除。项目规范同时要求 Proposal 定位使用完整 `ProposalRef { folderId, changeId }`，仅发送裸 `changeId` 会在 multi-root Workspace 中产生歧义。

## Goals / Non-Goals

**Goals:**

- 让 Proposal 详情 Slideover 不再提供直接启动 Apply、Archive 或打开运行历史的头部按钮。
- 让 Event Rail draft Proposal 的“开始实现”按钮通过当前 Chat 会话表达用户 Apply 意图，不再要求用户选择 workflow。
- 在消息文本中同时携带 `changeId` 与 `folderId`，使后续 Coding Agent 能构造完整 ProposalRef。
- 暂时保留被停用的组件内旧入口接线，并给未来 Coding Agent 留下“待重构，方案确定后恢复或删除”的解释。

**Non-Goals:**

- 不删除或重构 Proposal Apply/Archive store、renderer API、preload/IPC、Main services、MCP tools、workflow 模板或运行记录。
- 不改变 Event Rail 的“查看详情”和“归档”行为。
- 不移除 Slideover 的运行状态条、自动恢复逻辑或 `ProposalApplySidePanel.vue`。
- 不引入 feature flag、TODO 标记、新状态或持久化字段。

## Decisions

### 1. Apply 意图通过现有 Chat store 发送

`ChatProposalPanel.vue` 使用 `useChatStore()`，点击 draft Proposal 的“开始实现”后调用：

```ts
chatStore.sendMessage([
  {
    type: "text",
    text: `Start applying proposal: ${proposal.proposalRef.changeId} (folderId: ${proposal.proposalRef.folderId})`,
  },
]);
```

`chatStore.sendMessage` 会通过现有消息流水线创建并持久化 `role=user` 消息，组件不自行构造 message role、session ID 或流式请求。选择该方式是为了复用当前 Chat 的 turn 仲裁、持久化和 Agent 调度，并让用户消息构成进入 Apply 阶段的显式授权。

备选方案是继续调用 `proposalRunStore.startRun()` 或新增专用 IPC；前者继续固化旧 workflow 运行方式，后者扩大公共契约，均不符合本次短期收敛目标。

### 2. 消息携带 owner-qualified identity

消息固定使用 `Start applying proposal: <changeId> (folderId: <folderId>)`，不使用用户最初设想的裸 `<proposal-id>`。`changeId` 对应 Apply tool 的 `changeName`，`folderId` 对应 Proposal owner；两者共同满足 `repository-owned-proposals` 的完整身份约束。

### 3. 旧组件接线采用临时注释保留

因 Slideover 入口停用而不再使用的组件内 import、computed、handler、props/emits 或模板片段不直接删除。Script 中使用 `//`，Vue template 中使用 `<!-- -->` 注释保留，并在相邻位置用中文说明“待重构，方案确定后恢复或删除”。不添加 `TODO`，也不新增运行时开关。

保留范围仅限现有组件文件内与旧入口直接相关的接线；测试仍以当前可见行为为准。底层模块本来就保持不变，不需要通过复制或注释额外保存。

备选方案包括直接删除局部接线或添加 feature flag。直接删除不符合短期保留诉求；feature flag 会引入新的运行时分支和未知状态，因此不采用。

### 4. 保持其他 Proposal 展示与操作不变

`ProposalDetailHeader.vue` 继续显示 title、owner、日期、任务进度和状态 badge；进行中的状态条及 side panel 仍可按现有逻辑展示。`ChatProposalPanel.vue` 继续显示 Proposal metadata、状态、worktree badge、“查看详情”以及 archive-ready 时的“归档”按钮。

## Risks / Trade-offs

- [被注释代码可能随重构失效] → 注释明确其临时性质；方案确定后恢复或删除，不把它当作长期兼容层。
- [Chat 正在提交或流式响应时 `sendMessage` 可能返回 `false`] → 复用 `chatStore.sendMessage` 的现有 turn 仲裁，不在本次变更中创建第二套并发或重试机制。
- [英文消息文本成为 Agent-facing 协议提示] → 固定文本并由组件测试断言完整 `folderId + changeId`，避免后续无意退化为裸 change ID。
- [保留隐藏模板会降低局部可读性] → 只保留与旧入口直接相关的最小块，并提供单一中文解释，不引入开关或新的抽象。
