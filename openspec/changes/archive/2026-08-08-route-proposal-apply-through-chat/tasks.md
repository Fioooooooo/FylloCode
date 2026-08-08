## 1. Proposal 详情入口收敛

- [x] 1.1 修改 `src/renderer/src/components/proposal/ProposalDetailHeader.vue`：让 draft、archive-ready、applying/archived 状态均不再渲染 workflow dropdown、“归档”或“查看运行历史”头部按钮；保留 title、owner、状态 badge、任务信息和运行状态条，并将旧模板与仅服务这些入口的 script 接线按设计注释保留，说明“待重构，方案确定后恢复或删除”。
- [x] 1.2 修改 `src/renderer/src/components/proposal/ProposalDetailSlideover.vue`：移除 Header 上旧生命周期事件的活动绑定；保留 `ProposalApplySidePanel`、run resume、状态展示和底层 store 使用；对因解绑而失去引用的 `startWithWorkflow()`、`archiveProposal()`、`viewRunHistory()` 及相关组件内接线仅做带解释的注释，不添加 TODO 或 feature flag。

## 2. Event Rail Apply 意图改造

- [x] 2.1 修改 `src/renderer/src/components/chat/event/ChatProposalPanel.vue`：将 draft Proposal 的 `UDropdownMenu` 替换为直接“开始实现”按钮，通过 `useChatStore().sendMessage([{ type: "text", text: ... }])` 发送 `Start applying proposal: <changeId> (folderId: <folderId>)`；不得调用 `proposalRunStore.startRun()`，并保留“查看详情”、archive-ready“归档”、状态和 metadata 展示。
- [x] 2.2 在 `ChatProposalPanel.vue` 中将不再活动的 workflow dropdown 构造、模板与 `startRun` 旧接线按设计注释保留，说明“待重构，方案确定后恢复或删除”；不引入运行时开关，不删除 workflow、Proposal run store 或 API 模块。
- [x] 2.3 移除 `ChatProposalPanel.vue` 中活动“开始实现”按钮的 play icon，并在组件测试中断言按钮不再接收 icon prop；消息发送行为保持不变。

## 3. Renderer 回归验证

- [x] 3.1 更新 `test/renderer/src/components/proposal-detail-header.spec.ts` 及必要的详情组件测试：断言 draft/applying/archived Slideover header 不显示“开始实现”“归档”“查看运行历史”，同时继续显示状态和运行状态条。
- [x] 3.2 更新 `test/renderer/src/components/chat/event/ChatProposalPanel.test.ts`：mock `useChatStore().sendMessage`，断言 draft 卡片无 workflow dropdown、点击“开始实现”只发送包含 `folderId` 与 `changeId` 的单个 text part且不调用 `startRun`，并保留“查看详情”和“归档”回归覆盖。
- [x] 3.3 运行聚焦 renderer 测试、`pnpm typecheck:web` 与 `pnpm lint`，确认注释保留未引入 unused、Vue template 或格式化错误。

## 4. Release Metadata

- [x] 4.1 将 `package.json` 应用版本从 `0.15.2-beta.5` 提升为 `0.15.2-beta.6`，不改 bundled MCP server 版本、changelog 或 tag。
