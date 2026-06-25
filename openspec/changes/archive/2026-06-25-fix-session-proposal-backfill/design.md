## Context

`ChatSessionEventRail` 通过 `useSessionStore.sessionProposals` 展示当前 chat session 关联的 proposal。运行中创建 proposal 时，MCP server 写出 create-proposal 事件，主进程 lineage consumer 将 `sessionId -> changeId` 写入 lineage，并启动 `ProposalStatusService.watchProposal`。重启后 renderer 的内存态 `sessionProposals` 丢失，需要在进入 session 时通过 lineage 与 proposal 列表恢复。

现有 `useSessionStore.backfillSessionProposals(sessionId)` 已调用 `lineageApi.getBySession(projectId, sessionId)`，再用 lineage 中的 `LineageProposalLink.changeId` 去匹配 `useProposalStore.proposals`。问题在于 archived proposal 的 `ProposalMeta.id` 当前可能是 archive 目录名 `YYYY-MM-DD-<changeId>`，而 lineage 保存的是原始 `changeId`。主进程已有 `stripArchivePrefix` / `resolveChangeDirAnywhere` 等路径定位统一化，但 `proposal:list` 仍保留 archive 目录名作为 `ProposalMeta.id`，现有测试也覆盖了该行为。

## Goals / Non-Goals

**Goals:**

- 进入 session 时恢复展示 lineage 已记录的所有 proposal，包括 archived proposal。
- 保持 archived proposal 为终态展示，不为它重新开启 `proposal:watch`。
- 保持非 archived proposal 在回填后继续启动 watch，以便后续状态变化能推送到 renderer。
- 补齐 `lineage:getBySession` 的 IPC 规格，使 renderer 的恢复路径有明确契约。

**Non-Goals:**

- 不统一修改 `ProposalMeta.id` 的主进程返回格式；archive proposal 可继续以 `YYYY-MM-DD-<changeId>` 作为 id。
- 不新增 IPC channel，不改变 lineage 持久化结构。
- 不重构 `ProposalStatusService` 的 watcher key 策略。
- 不改变 `ChatProposalPanel` 的按钮、badge 或详情页导航语义。

## Decisions

1. 在 renderer 回填层做 `changeId` 等价匹配，而不是修改 `proposal:list`。
   - 选择：在 `src/renderer/src/stores/session.ts` 中新增局部 helper，将 proposal id 与 lineage changeId 视为等价，当 `proposal.id === changeId` 或 `proposal.id` 去掉 `YYYY-MM-DD-` 前缀后等于 `changeId`。
   - 理由：主进程列表行为已有测试断言保留 archive 前缀；直接改变 `ProposalMeta.id` 会影响 proposal 列表、详情路由、archive 后查找和 overview 等多个调用方，超出本次 bug fix 范围。
   - 替代方案：修改 `readProposalFiles()` 让 archived `ProposalMeta.id` 始终无前缀。拒绝，因为这是更大的行为变更，且现有测试明确覆盖了前缀保留。

2. watch 启动由匹配到的 `ProposalMeta.status` 决定。
   - 选择：`backfillSessionProposals` 回填 `matched` 后，只对 `proposal.status !== "archived"` 的项目调用 `ensureProposalWatched(proposal, sessionId)`。
   - 理由：archived proposal 已是终态，重新 watch 只会增加主进程 watcher 资源，不提供状态同步价值；active proposal 仍需要 watch 以接收 draft/applying/archived 变化。
   - 替代方案：对所有回填 proposal 都 watch。拒绝，因为它会对 archived 终态产生不必要监听，且与本次确认的产品边界冲突。

3. 保持 statusChanged 推送路径的防御性 watch 行为，但避免对 archived payload 重启 watch。
   - 选择：`handleProposalStatusChanged` 中如果收到未知 proposal 的 status push，可继续刷新 proposal store 并 upsert；但仅当 payload/status 对应 proposal 非 archived 时才需要补 watch。
   - 理由：status push 本身说明主进程已有 watcher 或刚处理事件。对 archived 继续 watch 没必要；对非 archived 保持既有防御逻辑。

## Risks / Trade-offs

- [Risk] Renderer 本地实现 archive 前缀剥离规则可能与主进程 `stripArchivePrefix` 未来变化不一致。→ Mitigation：使用同一正则语义 `^\d{4}-\d{2}-\d{2}-`，并通过 store 单测固定行为；若未来主进程规则变化，再同步调整 renderer helper。
- [Risk] 一个项目同时存在 active `foo` 和 archived `YYYY-MM-DD-foo` 时，回填可能匹配两个 proposal。→ Mitigation：这是现有 `readProposalFiles` 可返回的状态；回填展示 session lineage 关联的所有匹配项时应排序并保持去重，watch 只作用于非 archived 项。
- [Risk] `lineage:getBySession` 已在代码中存在但 spec 描述缺失，Apply 阶段可能只改 renderer。→ Mitigation：本 change 增加 `lineage-ipc` delta，明确该 channel 是恢复路径的依赖。
