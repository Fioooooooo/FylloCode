## 1. Renderer 回填修复

- [x] 1.1 修改 `src/renderer/src/stores/session.ts`：为 `backfillSessionProposals(sessionId)` 增加 proposal id 与 lineage changeId 的等价匹配 helper，匹配 `proposal.id === changeId` 或 `proposal.id` 去掉 `YYYY-MM-DD-` 前缀后等于 `changeId`；保持 `ProposalMeta.id` 原值不改写。
- [x] 1.2 修改 `src/renderer/src/stores/session.ts`：回填 `matched` proposal 后，只对 `proposal.status !== "archived"` 的 proposal 调用 `ensureProposalWatched(proposal, sessionId)`；archived proposal 只写入 `sessionProposals` 用于展示。
- [x] 1.3 检查 `handleProposalStatusChanged(payload)` 的未知 proposal 防御逻辑：保持刷新 `useProposalStore().loadProposals()` 与 `upsertSessionProposal`，但避免为 `status === "archived"` 的 proposal 重新调用 `ensureProposalWatched`。

## 2. 测试

- [x] 2.1 修改 `test/renderer/src/stores/session.spec.ts` 的 `@renderer/api/lineage` mock，补充 `getBySession` mock，并在 `beforeEach` 中提供默认返回值。
- [x] 2.2 在 `test/renderer/src/stores/session.spec.ts` 新增场景：选择 session 后，`lineageApi.getBySession(projectId, sessionId)` 返回 `changeId: "fix-login"`，`useProposalStore.proposals` 含 `{ id: "fix-login", status: "draft" }` 时，`sessionProposals[sessionId]` 包含该 proposal，且 `proposalApi.watch` 被调用一次。
- [x] 2.3 在 `test/renderer/src/stores/session.spec.ts` 新增场景：`lineageApi.getBySession` 返回原始 `changeId: "fix-login"`，`useProposalStore.proposals` 含 `{ id: "2026-06-25-fix-login", status: "archived" }` 时，`sessionProposals[sessionId]` 包含该 archived proposal，且 `proposalApi.watch` 不被调用。
- [x] 2.4 在 `test/renderer/src/stores/session.spec.ts` 新增场景：`lineageApi.getBySession` 返回 `null`、错误响应或抛错时，`selectSession` 不抛错，`sessionProposals[sessionId]` 保持空数组，且不调用 `proposalApi.watch`。

## 3. 规格与文档同步

- [x] 3.1 确认 `openspec/changes/fix-session-proposal-backfill/specs/chat-event-rail-proposal-status/spec.md` 中的回填、archive id 匹配、archived 不 watch 场景与最终实现一致。
- [x] 3.2 确认 `openspec/changes/fix-session-proposal-backfill/specs/lineage-ipc/spec.md` 中 `lineage:getBySession` 的 channel 描述与 `src/shared/types/channels.ts`、`src/shared/schemas/ipc/lineage.ts`、`src/main/ipc/lineage.ts`、`src/renderer/src/api/lineage.ts` 的现有实现一致。
- [x] 3.3 无需更新 `guidelines/RendererProcess.md`：其中 “Chat Session Proposals” 已描述从 proposal store 与 lineage 回填历史 proposals；本 change 只是补充 OpenSpec 与测试中的精确场景。

## 4. 验证

- [x] 4.1 运行 `pnpm vitest run test/renderer/src/stores/session.spec.ts`。
- [x] 4.2 运行 `pnpm vitest run test/renderer/src/components/chat/event/ChatProposalPanel.test.ts test/renderer/src/components/chat-session-event-rail.spec.ts`，确认 proposal rail 展示行为未回退。
- [x] 4.3 运行 `pnpm typecheck:web`，确认 renderer 类型仍通过。
