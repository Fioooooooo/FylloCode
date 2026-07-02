## Why

Proposal 详情 Slideover 目前只按 `ProposalMeta.status` 展示 badge，导致 apply run 已完成但尚未归档时仍显示基础运行态，与 Chat EventRail 中更准确的“可归档 / 归档中”状态不一致。用户从 EventRail 打开详情后会看到两个入口对同一个 proposal 给出不同状态判断。

## What Changes

- 让 Proposal 详情 Slideover header 复用 Chat EventRail 已采用的 UI 派生状态语义：`可归档` 与 `归档中`。
- 统一共享 helper 中的基础状态文案：`draft` 显示“已创建”，普通 `applying` 显示“实现中”。
- 保持持久化与 IPC 层的 `ProposalStatus` 不变，仍只有 `creating`、`draft`、`applying`、`archived`。
- 将“可归档 / 归档中”限定为前端展示态，由 `ProposalMeta.status`、当前匹配的 `ApplyRunMeta` 与 `proposalRunStore.isArchiving` 派生。
- 修正详情 Slideover 的归档入口判定：只有当前 proposal id 与 `runMeta.changeId` 匹配且 run 已完成时才显示归档入口。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `proposal-detail`: Proposal 详情 Slideover header 的状态 badge 和归档入口需要使用与当前 proposal 匹配的 apply/archive run 派生展示态。
- `chat-event-rail-proposal-status`: Chat EventRail proposal 卡片改为复用共享状态 helper，并采用统一后的 `draft` / `applying` badge 文案。

## Impact

- 影响渲染进程 UI：`src/renderer/src/components/proposal/ProposalDetailHeader.vue`、`src/renderer/src/components/proposal/ProposalDetailSlideover.vue`、`src/renderer/src/components/chat/event/ChatProposalPanel.vue`。
- 预计新增一个 renderer 纯工具模块，用于共享 proposal 展示状态类型、配置与派生函数。
- 影响测试：补充 Proposal Detail Header / Slideover 的派生状态测试，并保持 Chat EventRail 现有状态测试通过。
- 不改变共享类型、IPC payload、`.openspec.yaml` 状态模型或主进程服务。
