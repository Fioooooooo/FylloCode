## 1. 共享展示状态逻辑

- [x] 1.1 新增 `src/renderer/src/utils/proposal-display-status.ts`，定义 `ProposalDisplayStatus = ProposalStatus | "archiveReady" | "archiving"`、`proposalDisplayStatusConfig`、`getProposalDisplayStatus(proposal, runMeta, isArchiving)`，并确保 `archiveReady` / `archiving` 只作为 renderer UI 派生态存在。
- [x] 1.2 在同一工具中提供 `canArchiveProposal(proposal, runMeta, isArchiving)` 或等价纯函数，判定条件必须包含 `proposal.status === "applying"`、`runMeta?.status === "done"`、`runMeta?.changeId === proposal.id`、`isArchiving !== true`。

## 2. 组件接入

- [x] 2.1 修改 `src/renderer/src/components/chat/event/ChatProposalPanel.vue`，删除本地 `ProposalDisplayStatus`、`statusConfig`、`canArchive`、`isArchivingProposal`、`getDisplayStatus` 重复实现，改为复用 `src/renderer/src/utils/proposal-display-status.ts`，保持现有按钮展示与行为不变。
- [x] 2.2 修改 `src/renderer/src/components/proposal/ProposalDetailHeader.vue`，新增 `isArchiving` 或 `displayStatus` 所需 prop，使用共享 helper 渲染 badge，使 header 可显示“可归档”和“归档中”。
- [x] 2.3 修改 `src/renderer/src/components/proposal/ProposalDetailSlideover.vue`，将 `canArchive` 改为复用共享 helper 或补齐 `runMeta.changeId === currentProposal.id` 校验，并把 `proposalRunStore.isArchiving` 传给 header。

## 3. 测试验证

- [x] 3.1 更新 `test/renderer/src/components/chat/event/ChatProposalPanel.test.ts`，确认抽取 helper 后现有“可归档 / 归档中 / 其他 proposal 不匹配”逻辑仍通过；如缺少 mismatch 场景，补一条 `runMeta.changeId !== proposal.id` 时不显示“可归档”的测试，并断言普通 applying 文案为“实现中”。
- [x] 3.2 更新 `test/renderer/src/components/proposal-detail-header.spec.ts`，覆盖 header 在 matching done run 时显示“可归档”、archive running 时显示“归档中”、mismatched run 时仍显示“实现中”。
- [x] 3.3 更新 `test/renderer/src/pages/proposal-detail.spec.ts`，覆盖 `canArchive` 对 `runMeta.changeId` 的匹配要求：当前详情 proposal 与 runMeta 不匹配时不显示“归档”按钮。
- [x] 3.4 运行 `pnpm vitest run test/renderer/src/components/chat/event/ChatProposalPanel.test.ts test/renderer/src/components/proposal-detail-header.spec.ts test/renderer/src/pages/proposal-detail.spec.ts`。

## 4. 文档与规范检查

- [x] 4.1 检查 `guidelines/RendererProcess.md` 和 `guidelines/UiDesign.md`，本次只是复用既有 renderer/UI 模式，不需要更新 guidelines；若实现中引入新的跨组件状态模式，再补充对应 guideline。
- [x] 4.2 运行 `pnpm typecheck:web`，确认新增 helper 和组件 prop 类型正确。
