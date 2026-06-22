## 1. 状态派生与渲染

- [x] 1.1 修改 `src/renderer/src/components/chat/event/ChatProposalPanel.vue`，新增局部展示态派生函数，例如 `getDisplayStatus(proposal: ProposalMeta)`，返回 `creating | draft | applying | archiveReady | archived`；`archiveReady` 判定必须同时满足 `proposal.status === "applying"`、`proposalRunStore.runMeta?.changeId === proposal.id`、`proposalRunStore.runMeta?.status === "done"`。
- [x] 1.2 修改 `ChatProposalPanel.vue` 的 badge 配置，使 `archiveReady` 显示文案“可归档”，颜色使用区别于“实施中”的语义色（优先使用 `warning` 或现有 Nuxt UI token），其余状态保持现有中文文案。
- [x] 1.3 修改 `ChatProposalPanel.vue` 操作区渲染逻辑，删除“归档”和“查看详情”的互斥关系：`creating` 不显示操作；`draft` 显示“开始实现”和“查看详情”；`applying` 显示“查看详情”；`archiveReady` 显示“归档”和“查看详情”；`archived` 只显示“查看详情”。
- [x] 1.4 修改 `ChatProposalPanel.vue`，新增 `archiving` 展示态；当 `proposal.status === "applying"`、`proposalRunStore.isArchiving === true` 且 `proposalRunStore.runMeta?.changeId === proposal.id` 时，badge 显示“归档中”，并隐藏“归档”按钮。

## 2. Archive 后状态同步

- [x] 2.1 修改 `ChatProposalPanel.vue#startArchive` 或抽出的 helper，在 `proposalRunStore.startArchive(projectId, proposal.id)` 成功 resolve 后调用 `useProposalStore().loadProposals()` 刷新完整 proposal 列表。
- [x] 2.2 在刷新后的 `proposalStore.proposals` 中定位归档后的 proposal：优先匹配 `id === previousChangeId`，否则匹配 `status === "archived"` 且 `id.endsWith(\`-${previousChangeId}\`)`；找到后调用 `sessionStore.upsertSessionProposal(activeSession.id, nextProposal)`。
- [x] 2.3 确保 archive 成功后当前 session 中旧的 applying proposal 不再继续显示“可归档”或“归档”按钮；如果刷新列表未找到归档 proposal，则保留现有 statusChanged 兜底路径，不新增 session meta 字段。

## 3. 测试

- [x] 3.1 扩展 `test/renderer/src/components/chat/event/ChatProposalPanel.test.ts`，覆盖 `applying + runMeta done + changeId 匹配` 时 badge 显示“可归档”，且同时显示“归档”和“查看详情”。
- [x] 3.2 扩展 `ChatProposalPanel.test.ts`，覆盖 `draft` 状态同时显示“开始实现”和“查看详情”，`creating` 状态不显示任何操作按钮，`archived` 状态只显示“查看详情”。
- [x] 3.3 新增或扩展测试，模拟点击“归档”后 `startArchive` 成功、`proposalStore.loadProposals()` 返回 archived proposal，并断言 `sessionStore.upsertSessionProposal` 使用 archived `ProposalMeta` 更新当前 session。
- [x] 3.4 扩展 `ChatProposalPanel.test.ts`，覆盖 archive stream 运行时 badge 显示“归档中”，不显示“归档”按钮，并保留“查看详情”按钮。

## 4. 验证

- [x] 4.1 运行 `pnpm vitest run test/renderer/src/components/chat/event/ChatProposalPanel.test.ts`。
- [x] 4.2 如修改 store 或新增 composable，运行 `pnpm vitest run test/renderer/src/**/*.{test,spec}.{ts,vue}`。（未修改 store 或新增 composable，不适用。）
- [x] 4.3 手动在 ChatEventRail 中验证：可归档 proposal 显示“可归档”；非 creating proposal 可直接查看详情；archive 完成后卡片显示“已归档”且不再显示“归档”按钮。
