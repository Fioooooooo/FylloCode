# workflow-proposal-review-ui Specification

## Purpose

定义 Renderer 中 workflow proposal 审阅入口、wake 与 interest-gated pull、完整 YAML 确认卡片及其与 workflow Run 视图的独立数据源和共享视觉骨架。

## Requirements

### Requirement: WorkflowProposalActivityEntry is an independent sibling of WorkflowRunActivityEntry

`ChatBackgroundActivityBar` SHALL 将 `WorkflowProposalActivityEntry` 与既有 `WorkflowRunActivityEntry`、`SpawnedSessionActivityEntry` 作为平级兄弟入口渲染。Proposal entry SHALL 使用独立的 `workflow-proposal` Pinia store、独立的 wake 订阅和独立的 interest 生命周期；SHALL NOT 从 `useWorkflowRunStore`、`useSpawnedSessionStore` 或它们的 wake/interest 状态派生。可见性 SHALL 由 workflow-proposal 数据决定，SHALL NOT 静默并入 Run 或 spawned entry。

系统 SHALL 允许同一 session 存在多个 `pending` proposal，SHALL NOT 引入强制单队列、置顶或任意 TTL。

#### Scenario: Proposal 与 Run 同时存在时分别展示

- **WHEN** 某 parent session 同时存在 `pending` proposal 和 active Run
- **THEN** `ChatBackgroundActivityBar` SHALL 同时展示 `WorkflowProposalActivityEntry` 与 `WorkflowRunActivityEntry`
- **AND** 两者的数据源、store 和 wake 订阅 SHALL 保持独立

#### Scenario: 多个 pending proposal 并存

- **WHEN** 同一 parent session 存在多个 `pending` proposal
- **THEN** 系统 SHALL 展示全部 proposal 而不强制单队列
- **AND** SHALL NOT 因数量超过阈值而自动隐藏或丢弃其中任何一个

### Requirement: Renderer uses wake plus interest-gated pull for proposal state

Renderer SHALL 维护 workflow-proposal 专属 store 与 interest 生命周期。收到 proposal wake 后，只有对应组件声明 active interest 时 store 才能调用 `getDetail`；detail response SHALL 按 `workspaceId/parentSessionId/proposalId` 更新 store。无 interest 时 SHALL 忽略 wake 或只记录待刷新标记，SHALL NOT 发起无观察者查询。Workspace、parent session 或 interest generation 改变后到达的迟到 response SHALL NOT 覆盖新的 store state。

#### Scenario: 已声明 interest 的组件收到 wake 后拉取详情

- **WHEN** `WorkflowProposalActivityEntry` 或确认卡片已声明某 proposal 的 interest 并收到 matching wake
- **THEN** store SHALL 拉取该 proposal 的最新 detail
- **AND** UI SHALL 更新状态、YAML 内容和 `handoffDelivered`

#### Scenario: 无观察者时收到 wake 不触发拉取

- **WHEN** Renderer 尚未挂载或已卸载所有对应观察组件
- **THEN** wake SHALL NOT 触发 `getDetail`
- **AND** 组件首次声明 interest 时 SHALL 能通过 list/detail 获取最新状态

### Requirement: Confirmation card displays the full proposal YAML without collapsing any field

确认卡片（审阅态）SHALL 完整展示对应 proposal YAML 的全部字段——包括 stage 拓扑、每个 `ActionOp` 的具体内容（`exec`/`webhook` 命令或 URL 原文）、`confirm`/`idempotencyKey` 等所有字段，SHALL NOT 折叠为摘要或额外生成自然语言总结。

审阅态 SHALL 对 `exec`/`webhook` 类型且 `confirm` 非 `true`（即显式 `false` 或未声明）的 stage 施加醒目标记（如"自动执行，不再确认"角标）；`confirm: true` 的 stage SHALL NOT 施加同等强度的标记。`mode: "update"` 的 proposal SHALL 在卡片上明确标注目标 workflow 名称与 `workflowId`。卡片底部 SHALL 固定展示"取消 / 仅本次执行 / 保存为可复用并执行"三个操作，SHALL NOT 随内容滚动。

#### Scenario: 完整展示 exec 命令原文

- **WHEN** proposal 包含一个 `ActionStage(op.type: exec)` stage
- **THEN** 确认卡片 SHALL 展示该 stage 的完整命令原文
- **AND** SHALL NOT 用摘要或自然语言总结替代原文展示

#### Scenario: `confirm: false` 的 exec 获得醒目标记

- **WHEN** proposal 中某个 `exec`/`webhook` stage 的 `confirm` 为 `false` 或未声明
- **THEN** 确认卡片 SHALL 对该 stage 展示醒目角标
- **AND** `confirm: true` 的 stage SHALL NOT 展示同等强度的角标

#### Scenario: `mode: update` 卡片标注目标 workflow

- **WHEN** proposal 的 `mode` 为 `"update"`
- **THEN** 确认卡片 SHALL 显示目标 workflow 的名称与 `workflowId`
- **AND** 用户 SHALL 能在确认前识别这是一次更新而非新建

#### Scenario: 操作栏固定在卡片底部

- **WHEN** proposal YAML 内容长度超出卡片可视区域
- **THEN** "取消 / 仅本次执行 / 保存为可复用并执行"三个操作 SHALL 保持可见
- **AND** SHALL NOT 要求用户滚动到内容末尾才能操作

### Requirement: Proposal and Run review states share visual skeleton but not data source types

审阅态（确认卡片）与运行态（Run 详情）SHALL 使用同一套竖向时间线视觉骨架，但 SHALL 使用不同的数据源类型：审阅态 SHALL 使用 `WorkflowProposalDetail`（来自 proposal YAML 解析），运行态 SHALL 使用既有 `WorkflowRunDetail`（来自 `WorkflowRunSnapshot`）。组件 SHALL 显式处理两种数据源的切换，SHALL NOT 假设两态共用同一个 `getDetail` 返回结构。

#### Scenario: 确认后切换到运行态视图

- **WHEN** 用户确认 proposal 后 `trigger_workflow` 创建了对应 Run
- **THEN** UI SHALL 从 `WorkflowProposalDetail` 数据源切换为 `WorkflowRunDetail` 数据源
- **AND** SHALL NOT 把 proposal 文件内容伪装成 `WorkflowRunSnapshot` 展示
