# fyllo-action-transition Specification

## Purpose

TBD - created by archiving change stabilize-fyllo-action-architecture. Update Purpose after archive.

## Requirements

### Requirement: Fyllo Action state machine is enforced by Main

系统 SHALL 在 Main 中维护以下合法迁移：

- 不存在 → `ready`
- `ready` → `succeeded` | `failed` | `cancelled`
- `failed` → `succeeded` | `failed` | `cancelled`
- `succeeded` → 终态（不可再迁移）
- `cancelled` → 终态（不可再迁移）

`running` 是 Renderer runtime 临时状态，SHALL NOT 持久化；`dismissed` 不改变 `ready` 持久化状态。

#### Scenario: Ready can transition to succeeded

- **WHEN** Main 收到 `transitionAction` 命令 `succeed`，且当前状态为 `ready`
- **THEN** Main SHALL 将状态更新为 `succeeded`
- **AND** 递增 `revision`
- **AND** 更新 `updatedAt`

#### Scenario: Failed can retry

- **WHEN** Main 收到 `transitionAction` 命令 `succeed`，且当前状态为 `failed`
- **THEN** Main SHALL 将状态更新为 `succeeded`
- **AND** 递增 `revision`

#### Scenario: Terminal state rejects transition

- **WHEN** Main 收到 `transitionAction` 命令，且当前状态已为 `succeeded` 或 `cancelled`
- **THEN** Main SHALL 返回非法迁移错误
- **AND** 现有状态 SHALL 保持不变

#### Scenario: Succeeding an already succeeded action is rejected

- **WHEN** Main 收到 `transitionAction` 命令 `succeed`，且当前状态已为 `succeeded`
- **THEN** Main SHALL 返回非法迁移错误
- **AND** 该行为 SHALL 被视为非法迁移，而非幂等成功

### Requirement: Renderer sends transition commands instead of full state

Renderer SHALL 通过 `transitionAction` 发送命令 `succeed`、`fail` 或 `cancel`，SHALL NOT 直接向 Main 提交包含 `status` 和 `updatedAt` 的完整 `FylloActionState`。

`transitionAction` IPC SHALL 携带 `projectId`、`sessionId`、`actionId`、`command`、`expectedRevision`，`fail` 命令可额外携带可选 `error` 字符串。

Renderer 在发送 transition 前可进行乐观更新，但 IPC 失败后 SHALL 回滚到 Main 返回的 authoritative record 或提供重试入口。

#### Scenario: Renderer succeeds a ready action

- **WHEN** 用户确认一个 `ready` Action
- **THEN** Renderer SHALL 调用 `transitionAction` 并传入 `command="succeed"`
- **AND** 该调用 SHALL 携带当前本地 `revision` 作为 `expectedRevision`

#### Scenario: Renderer fails an action

- **WHEN** Action 业务副作用失败
- **THEN** Renderer SHALL 调用 `transitionAction` 并传入 `command="fail"`
- **AND** 可选地携带 `error` 字符串
- **AND** Main 应用迁移后 SHALL 将 `error` 写入 `FylloActionState.error`
- **AND** 该 `error` SHALL 随 session meta 持久化
- **AND** `error` 长度超过 1000 个 UTF-16 code unit 时 SHALL 被截断或拒绝

#### Scenario: Renderer cancels an action

- **WHEN** 用户取消一个 `ready` Action
- **THEN** Renderer SHALL 调用 `transitionAction` 并传入 `command="cancel"`

### Requirement: Main enforces revision CAS

Main 在应用 `transitionAction` 前 SHALL 校验 `expectedRevision` 与当前 record 的 `revision` 一致；不一致时 SHALL 返回 CAS 冲突，SHALL 不修改状态。

Main 生成新的 `revision` 和 `updatedAt`；`updatedAt` SHALL 由 Main 产生，SHALL NOT 接受 Renderer 提供的时间戳；`fail` 命令的 `error` 经 Main 校验为可选字符串后写入 record。

#### Scenario: Concurrent transition detected

- **WHEN** Renderer 提交的 `expectedRevision` 小于当前 record 的 `revision`
- **THEN** Main SHALL 返回 CAS 冲突
- **AND** 返回当前 authoritative record

#### Scenario: Successful CAS updates revision

- **WHEN** `expectedRevision` 与当前 `revision` 一致
- **THEN** Main SHALL 应用迁移
- **AND** `revision` SHALL 递增 1
- **AND** `updatedAt` SHALL 更新为 Main 当前时间

### Requirement: Batch transition updates multiple actions atomically

系统 SHALL 支持 `transitionActions` IPC，携带 `projectId`、`sessionId`、`actionIds`、`command` 和 `expectedRevisions`；`expectedRevisions` SHALL 是 `Record<string, number>`，以 `actionId` 为键、期望 revision 为值。

Main SHALL 在一次 session meta patch 中完成所有指定 Action 的迁移；任一 Action 非法迁移或 CAS 失败时，整个 batch SHALL 不修改 session meta。

`transitionActions` 返回结果 SHALL 为 `Array<{ actionId: string; success: boolean; record?: FylloActionState; error?: string }>`，使 Renderer 能区分哪几个 Action 需要重试。

#### Scenario: Batch succeed clears multiple flags

- **WHEN** 用户确认一个 knowledge flag，触发同批所有 pending flags 的 capture
- **AND** durable message append 已成功
- **THEN** Renderer SHALL 调用 `transitionActions` 并传入所有对应 `actionIds`
- **AND** Main SHALL 在一次 patch 中将它们全部更新为 `succeeded`
- **AND** attentionCount SHALL 一次性减少

#### Scenario: Partial CAS failure rolls back entire batch

- **WHEN** `transitionActions` 中某个 `actionId` 的 `expectedRevision` 与当前 record 不一致
- **THEN** Main SHALL 不修改任何指定 Action 的状态
- **AND** Main SHALL 返回包含具体失败项的错误

#### Scenario: Batch does not affect unspecified actions

- **WHEN** `transitionActions` 只传入部分 Action IDs
- **THEN** Main SHALL 只更新这些 Action
- **AND** 其他 Action 的状态 SHALL 保持不变

### Requirement: Unknown action types SHALL NOT be processed

系统 SHALL 只处理当前 registry 中已启用的 Action type；对 storage 中已存在的未知 type 记录，Main 在读取 session meta 时已经过滤，因此不会进入 transition 流程。

#### Scenario: Disabled action type record is not transitioned

- **WHEN** session meta 中存在一个当前已禁用 Action type 的 `ready` 记录
- **THEN** 读取时该记录 SHALL 被过滤
- **AND** Renderer 不会收到该记录的 state
