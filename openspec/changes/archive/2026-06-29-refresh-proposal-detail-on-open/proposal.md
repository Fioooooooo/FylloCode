## Why

Proposal 详情 Slideover 当前会在 `useProposalStore.proposals` 已有数据时跳过元数据刷新，导致每次重新打开详情后 header 里的任务数量可能仍是旧的 `doneTasks/totalTasks`。用户需要打开详情时立即看到已有信息，同时后台刷新最新的 proposal 元数据并自动更新页面。

## What Changes

- Proposal 详情 Slideover 每次打开时先使用 store 中已有 `ProposalMeta` 渲染 header，不阻塞首屏。
- Slideover 打开后立即通过现有 `proposal:list` 路径刷新 `useProposalStore.proposals`，不新增 `proposal:detail` IPC。
- Header 在元数据刷新期间显示一个旋转的 loading icon；刷新完成后隐藏该 icon。
- 刷新完成后 store 自动更新，详情 header 中的标题、状态、日期和任务数量随 `currentProposal` 响应式更新。
- Markdown 文件读取仍走现有 `proposal:readFile`，Specs delta 仍走现有 `proposal:getSpecDeltas`。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `proposal-detail`: 新增详情 Slideover 每次打开时后台刷新 proposal 元数据并在 header 展示刷新状态的行为。

## Impact

- 前端组件：`src/renderer/src/components/proposal/ProposalDetailSlideover.vue`、`src/renderer/src/components/proposal/ProposalDetailHeader.vue`。
- 前端 store：复用 `src/renderer/src/stores/proposal.ts` 的 `loadProposals()`，不改变 store 对外类型。
- API / IPC：复用 `src/renderer/src/api/proposal.ts` 的 `list/readFile/getSpecDeltas`，不新增 channel、schema、preload bridge 或共享 DTO。
- 测试：更新 `test/renderer/src/pages/proposal-detail.spec.ts`，覆盖打开详情时刷新元数据、刷新 icon 状态、刷新后 header 自动更新。
