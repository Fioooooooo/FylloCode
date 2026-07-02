## Context

当前 proposal 有两层状态：

- 直接状态：`ProposalMeta.status`，类型为 `creating | draft | applying | archived`，来自 OpenSpec metadata、`proposal:list` 和 `proposal:statusChanged`。
- UI 展示态：Chat EventRail 的 `ChatProposalPanel.vue` 已在本地派生 `archiveReady` 和 `archiving`，用于表达 `applying` proposal 在 apply run 完成后可归档，以及 archive stream 正在运行。共享 helper 统一 badge 文案：`draft` 为“已创建”，普通 `applying` 为“实现中”。

Proposal 详情 Slideover header 目前直接使用 `statusConfig[proposal.status]` 渲染 badge，因此无法显示“可归档 / 归档中”。同时 `ProposalDetailSlideover.vue` 的 `canArchive` 只判断 `currentProposal.status === "applying"` 和 `runMeta.status === "done"`，没有校验 `runMeta.changeId` 与当前 `currentChangeId` 匹配。由于 `useProposalRunStore` 是全局 store，详情页可能误用另一个 proposal 的 run 状态。

## Goals / Non-Goals

**Goals:**

- 让 Proposal 详情 Slideover header 的 badge 与 Chat EventRail 使用同一套派生状态规则。
- 让 Chat EventRail 与 Proposal 详情 Slideover 使用同一套状态文案，避免 `draft` / `applying` 基础文案分叉。
- 保持 `ProposalStatus` 直接状态模型不变，不新增持久化状态。
- 在详情 Slideover 的归档入口判断中加入当前 proposal id 匹配，避免全局 run store 误匹配。
- 将重复的展示状态配置从组件内抽到 renderer 纯工具，减少后续两处状态文案分叉。

**Non-Goals:**

- 不修改主进程 proposal 状态监听、apply run、archive run 或 IPC payload。
- 不改变 `.openspec.yaml` 中的 `status` 字段取值。
- 不改变 EventRail 中 apply/archive 操作入口的行为和按钮布局。
- 不重构 `useProposalRunStore` 的全局状态模型。

## Decisions

### 1. 抽取 renderer 纯工具承载展示态

新增 `src/renderer/src/utils/proposal-display-status.ts`，导出：

- `type ProposalDisplayStatus = ProposalStatus | "archiveReady" | "archiving"`
- `proposalDisplayStatusConfig`
- `getProposalDisplayStatus(proposal, runMeta, isArchiving)`
- 可选的 `canArchiveProposal(proposal, runMeta, isArchiving)` 与 `isArchivingProposal(proposal, runMeta, isArchiving)`

理由：`ChatProposalPanel.vue` 与 `ProposalDetailHeader.vue` 都需要同一套 badge 文案、颜色和优先级。放在 `utils/` 中能保持它是纯函数，不绑定 Pinia、overlay 或组件生命周期。

备选方案是在 `ProposalDetailHeader.vue` 内复制 EventRail 逻辑。该方案改动更少，但会继续保留两份状态判断，后续状态文案或优先级变更容易再次分叉。

### 2. “可归档 / 归档中”只作为 UI 派生值

不修改 `src/shared/types/proposal.ts` 的 `ProposalStatus`。`archiveReady` 和 `archiving` 不写入 `.openspec.yaml`、不进入 IPC payload，也不作为 `ProposalMeta.status` 返回。

理由：这两个值依赖运行态 store，而不是 proposal metadata 本身。把它们写进共享类型会混淆持久化状态和瞬时 UI 状态。

### 3. run 状态必须匹配当前 proposal id

详情 Slideover 的 `canArchive` 需要与 EventRail 一样校验：

- 当前 proposal status 为 `applying`
- `proposalRunStore.isArchiving === false`
- `proposalRunStore.runMeta?.status === "done"`
- `proposalRunStore.runMeta?.changeId === currentProposal.id`

`archiving` badge 也必须校验 `proposalRunStore.isArchiving === true` 且 `runMeta.changeId === currentProposal.id`。

理由：`useProposalRunStore` 是全局 store。用户可能先运行 proposal A，再打开 proposal B 的详情。没有 id 匹配时，proposal B 不应继承 proposal A 的“可归档”状态或归档按钮。

## Risks / Trade-offs

- [Risk] 抽出共享工具会触及 EventRail 和 Detail 两处组件，可能造成已有 EventRail 展示回归。→ Mitigation: 保留并扩展 `test/renderer/src/components/chat/event/ChatProposalPanel.test.ts`，同时新增 header/detail 测试覆盖。
- [Risk] Archive 过程中 `startArchive` 会临时把 `runMeta` 替换成 archive view，再在完成后恢复 previous meta。→ Mitigation: `archiving` 优先级高于 `archiveReady`，且必须依赖 `isArchiving` 与 matching `changeId`。
- [Risk] Slideover 当前 `currentProposal` 可能来自 fallback metadata。→ Mitigation: helper 只依赖传入的 `ProposalMeta | null` 和 `ApplyRunMeta | null`，调用侧继续使用现有 `currentProposal` 计算值即可。

## Migration Plan

这是纯前端 UI 行为调整，无数据迁移。
