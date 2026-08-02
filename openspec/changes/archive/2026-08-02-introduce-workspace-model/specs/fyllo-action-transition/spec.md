## MODIFIED Requirements

### Requirement: Renderer sends transition commands instead of full state

Renderer SHALL 通过 `transitionAction` 发送命令 `succeed`、`fail` 或 `cancel`，SHALL NOT 直接向 Main 提交包含 `status` 和 `updatedAt` 的完整 `FylloActionState`。

`transitionAction` IPC SHALL 携带 `workspaceId`、`sessionId`、`actionId`、`command`、`expectedRevision`，`fail` 命令可额外携带可选 `error` 字符串。

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

### Requirement: Batch transition updates multiple actions atomically

系统 SHALL 支持 `transitionActions` IPC，携带 `workspaceId`、`sessionId`、`actionIds`、`command` 和 `expectedRevisions`；`expectedRevisions` SHALL 是 `Record<string, number>`，以 `actionId` 为键、期望 revision 为值。

Main SHALL 在一次 Workspace-owned session meta patch 中完成所有指定 Action 的迁移；任一 Action 非法迁移或 CAS 失败时，整个 batch SHALL 不修改 session meta。

`transitionActions` 返回结果 SHALL 为 `Array<{ actionId: string; success: boolean; record?: FylloActionState; error?: string }>`，使 Renderer 能区分哪几个 Action 需要重试。

#### Scenario: Batch succeed clears multiple flags

- **WHEN** 用户确认一个 knowledge flag，触发同批所有 pending flags 的 capture
- **AND** durable message append 已成功
- **THEN** Renderer SHALL 调用 `transitionActions` 并传入当前 `workspaceId` 与所有对应 `actionIds`
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
