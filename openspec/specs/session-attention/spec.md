# session-attention Specification

## Purpose

定义会话提醒的聚合边界：通过 `getSessionAttention` 纯函数与 `useSessionAttention` composable 从 `Session` 派生 attentionCount，当前由 Fyllo Action 担任唯一 contributor，约定 `SessionItem` badge 的显示规则、aria-label、与 running pulse 的共存约束，以及共享状态谓词的复用要求。

## Requirements

### Requirement: Attention count is derived from session state

系统 SHALL 提供纯函数 `getSessionAttention(session: Session): SessionAttention`，从 `Session` 派生当前提醒数量，SHALL NOT 写入 session meta。

当前 SHALL 只注册 Fyllo Action contributor；contributor SHALL 统计 `session.actionStates` 中 `status` 为 `"ready"` 或 `"failed"` 的 Action 数量，以及 assistant message 中已解析但尚未持久化的 pending `ready` Action 数量。

未来新增 reminder 来源时，SHALL 在不改变 `getSessionAttention` 公共签名和 `SessionItem` props 的前提下新增 contributor。

#### Scenario: Ready action increases attention count

- **WHEN** 某 session 的 `actionStates` 包含一个 `status="ready"` 的记录
- **THEN** `getSessionAttention(session).count` SHALL 返回 1

#### Scenario: Failed action increases attention count

- **WHEN** 某 session 的 `actionStates` 包含一个 `status="failed"` 的记录
- **THEN** `getSessionAttention(session).count` SHALL 返回 1

#### Scenario: Succeeded and cancelled actions do not count

- **WHEN** 某 session 的 `actionStates` 只包含 `status="succeeded"` 和 `status="cancelled"` 的记录
- **THEN** `getSessionAttention(session).count` SHALL 返回 0

#### Scenario: Multiple actions aggregate

- **WHEN** 某 session 的 `actionStates` 包含 2 个 `ready` 和 1 个 `failed`
- **THEN** `getSessionAttention(session).count` SHALL 返回 3

### Requirement: useSessionAttention provides component-level aggregation

系统 SHALL 提供 `useSessionAttention(session: MaybeRefOrGetter<Session>)` composable，返回 `attentionCount: ComputedRef<number>`。

`getSessionAttention` selector 和 `useSessionAttention` composable SHALL 作为 `src/renderer/src/features/fyllo-action/` 的内部模块实现，并通过 feature 的 `index.ts` 公开导出；当前不创建独立的 `session-attention` feature。

`useSessionAttention` SHALL 是提醒来源的组件侧编排边界：它读取 session ref，调用 `getSessionAttention`，并在未来按 session ID 组合其他 reminder store。

`SessionItem` SHALL 在 setup 内调用 `useSessionAttention(toRef(props, "session"))`，SHALL 不新增 `attentionCount` prop，SHALL 不直接读取 Fyllo Action store 或 parser。

#### Scenario: SessionItem displays attention count

- **WHEN** `SessionItem` 渲染一个包含 `ready` Action 的 session
- **THEN** `useSessionAttention` SHALL 返回 count > 0
- **AND** SessionItem SHALL 展示 badge

#### Scenario: SessionItem prop remains unchanged

- **WHEN** ChatSidebar 渲染 SessionItem
- **THEN** ChatSidebar SHALL 只向 SessionItem 传递 `:session="session"`
- **AND** SessionItem SHALL 不接受 `attentionCount` prop

### Requirement: SessionItem badge follows display constraints

`SessionItem` 的 attention badge SHALL 满足：

- count <= 0 时不显示；
- 1 至 99 显示实际数字；
- 大于 99 显示 `99+`；
- 提供 aria-label，例如 `"3 项待处理"`；
- 不只依赖红色表达状态；
- 与现有 running pulse 分开显示；
- 不阻挡 hover menu 和点击会话行为。

#### Scenario: Single digit badge

- **WHEN** attentionCount 为 3
- **THEN** badge SHALL 显示 "3"
- **AND** aria-label SHALL 包含 "3 项待处理"

#### Scenario: Overflow badge

- **WHEN** attentionCount 为 150
- **THEN** badge SHALL 显示 "99+"

#### Scenario: Zero attention hides badge

- **WHEN** attentionCount 为 0
- **THEN** SessionItem SHALL 不展示 attention badge
- **AND** DOM 中 SHALL 不存在对应元素

#### Scenario: Running pulse coexists with badge

- **WHEN** 会话处于 running 状态且 attentionCount > 0
- **THEN** SessionItem SHALL 同时展示 running pulse 和 attention badge
- **AND** 两者 SHALL 不重叠或互相遮挡

### Requirement: Attention contributor uses shared predicates

所有 Inline、Rail、badge 和 batch collector SHALL 复用 `src/shared/fyllo-action/state.ts` 中的 `requiresFylloActionAttention` 和 `isFylloActionResolved` 谓词，SHALL NOT 各自使用“是否存在 state”或自定义状态判断。

#### Scenario: EventRail uses same predicate as badge

- **WHEN** EventRail 决定哪些 Action 展示在 pending 列表
- **THEN** 它 SHALL 调用 `requiresFylloActionAttention`
- **AND** 展示结果 SHALL 与 SessionItem badge 计数一致

#### Scenario: Inline node uses same predicate

- **WHEN** Inline Fyllo Action node 决定展示 ready/failed/succeeded UI
- **THEN** 它 SHALL 使用 shared state predicates 判断终态和 attention
- **AND** 该判断 SHALL 与 EventRail 和 badge 一致
