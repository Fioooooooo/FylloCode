## ADDED Requirements

### Requirement: 主进程主动推送 proposal 状态变化

当 proposal 的 `.openspec.yaml` 中 `status` 字段发生变化，或 proposal 目录被移动/删除时，主进程 SHALL 通过 Electron IPC 向渲染进程推送一条状态变更事件。

#### Scenario: 创建 proposal 后状态从 creating 变为 draft

- **GIVEN** Agent 已调用 `create-proposal` 并写入 `openspec/changes/<changeId>/.openspec.yaml`（`status: creating`）
- **WHEN** MCP server 将 `.openspec.yaml` 更新为 `status: draft`
- **THEN** 主进程 SHALL 在 1 秒内向 renderer 广播 `proposal:statusChanged` 事件，payload 中 `status` 为 `draft`

#### Scenario: 用户发起实现后状态变为 applying

- **GIVEN** 一个 `draft` 状态的 proposal
- **WHEN** 用户点击“开始实现”并选择 workflow
- **THEN** 主进程 SHALL 在 `apply-run-service.ts` 更新 `.openspec.yaml` 后，广播 `proposal:statusChanged` 事件，payload 中 `status` 为 `applying`

#### Scenario: proposal 被归档

- **GIVEN** 一个 `applying` 状态且 run 已完成的 proposal
- **WHEN** archive 流程将 change 目录移动到 `openspec/changes/archive/<date>-<changeId>/`
- **THEN** 主进程 SHALL 检测到目录变化并广播 `proposal:statusChanged` 事件，payload 中 `status` 为 `archived`

#### Scenario: proposal 被删除

- **GIVEN** 一个被监听的 proposal
- **WHEN** 其 `.openspec.yaml` 在所有可能位置都不存在
- **THEN** 主进程 SHALL 广播 `proposal:statusChanged` 事件，payload 中 `removed` 为 `true`，renderer 从列表中移除该 proposal

### Requirement: 状态监听覆盖 main worktree 与 linked worktree

`ProposalStatusService` SHALL 能够定位并监听位于 main worktree 或任意 `.worktrees/*` 下的 proposal，并在目录跨 worktree 移动时正确推导新状态。

#### Scenario: proposal 在 main worktree 创建

- **GIVEN** project 路径为 `/project`，proposal 位于 `/project/openspec/changes/foo/`
- **WHEN** `ProposalStatusService.watchProposal('/project', 'foo', 'session-1')` 被调用
- **THEN** 服务 SHALL 监听 `/project/openspec/changes/foo/.openspec.yaml` 并解析其状态

#### Scenario: proposal 在 linked worktree 创建

- **GIVEN** project 路径为 `/project`，proposal 位于 `/project/.worktrees/wt-1/openspec/changes/foo/`
- **WHEN** `ProposalStatusService.watchProposal('/project', 'foo', 'session-1')` 被调用
- **THEN** 服务 SHALL 通过 `resolveChangeDirAnywhere` 在 linked worktree 中找到 `.openspec.yaml` 并开始监听

#### Scenario: proposal 从 active 目录移动到 archive

- **GIVEN** proposal 原路径为 `/project/openspec/changes/foo/.openspec.yaml`
- **WHEN** 该文件被移动到 `/project/openspec/changes/archive/2024-01-01-foo/.openspec.yaml`
- **THEN** 服务 SHALL 在原 watcher 失效后，在 archive 目录重新找到文件并继续监听，广播状态 `archived`

#### Scenario: proposal 在 linked worktree 中被归档

- **GIVEN** proposal 原路径为 `/project/.worktrees/wt-1/openspec/changes/foo/.openspec.yaml`
- **WHEN** 该文件被移动到 `/project/.worktrees/wt-1/openspec/changes/archive/2024-01-01-foo/.openspec.yaml`
- **THEN** 服务 SHALL 在 linked worktree 的 archive 目录重新找到文件并广播状态 `archived`

### Requirement: Chat EventRail 展示当前 session 的 proposal 列表

`ChatSessionEventRail` SHALL 展示与当前活跃 session 关联的所有 proposal，按创建时间倒序排列，并实时反映状态变化。

#### Scenario: 当前 session 有一个 draft proposal

- **GIVEN** 用户处于 `session-1`，该 session 已关联一个 `draft` proposal
- **WHEN** `ChatSessionEventRail` 渲染
- **THEN** rail SHALL 展示该 proposal 的标题、状态 badge 为“草稿”，并提供“开始实现”按钮

#### Scenario: proposal 状态实时更新

- **GIVEN** `ChatSessionEventRail` 已展示一个 `draft` proposal
- **WHEN** renderer 收到 `proposal:statusChanged` 事件，payload 中 `status` 变为 `applying`
- **THEN** rail 中对应 proposal 的状态 badge SHALL 立即更新为“实施中”，且“开始实现”按钮消失

#### Scenario: 切换 session 后展示不同 proposal 列表

- **GIVEN** `session-1` 关联 proposal A，`session-2` 关联 proposal B
- **WHEN** 用户从 `session-1` 切换到 `session-2`
- **THEN** `ChatSessionEventRail` SHALL 隐藏 proposal A，展示 proposal B

### Requirement: 从 Chat EventRail 发起实现

对于 `draft` 状态的 proposal，`ChatProposalPanel` SHALL 提供 workflow 选择入口，调用现有 apply 流程启动 run。

#### Scenario: 选择 workflow 开始实现

- **GIVEN** 一个 `draft` proposal 和已加载的 custom workflow 列表
- **WHEN** 用户点击“开始实现”并选择 workflow `wf-1`
- **THEN** `ChatProposalPanel` SHALL 调用 `useProposalRunStore().startRun(projectId, changeId, 'wf-1')`
- **AND** `apply-run-service.ts` SHALL 更新 `.openspec.yaml` 为 `applying`
- **AND** `ProposalStatusService` SHALL 广播 `applying` 状态

#### Scenario: workflow 列表未加载时点击按钮

- **GIVEN** workflow 列表尚未加载
- **WHEN** 用户点击“开始实现”
- **THEN** 按钮 SHALL 先触发 `useWorkflowStore().fetchTemplates()`，加载完成后展示下拉菜单

### Requirement: 从 Chat EventRail 发起归档

对于 `applying` 状态且 run 已完成的 proposal，`ChatProposalPanel` SHALL 提供“归档”按钮，调用现有 archive 流程。

#### Scenario: 实现完成后归档

- **GIVEN** 一个 `applying` 状态的 proposal，且 `proposalRunStore.runMeta?.status === "done"`
- **WHEN** 用户点击“归档”按钮
- **THEN** `ChatProposalPanel` SHALL 调用 `useProposalRunStore().startArchive(projectId, changeId)`
- **AND** archive 流程 SHALL 将目录移动到 archive
- **AND** `ProposalStatusService` SHALL 广播 `archived` 状态

#### Scenario: 实现未完成时不显示归档按钮

- **GIVEN** 一个 `applying` 状态的 proposal，但 `proposalRunStore.runMeta?.status !== "done"`
- **WHEN** `ChatProposalPanel` 渲染
- **THEN** 该 proposal SHALL 不显示“归档”按钮，仅显示“实施中”状态

### Requirement: 不展示执行日志

`ChatSessionEventRail` 和 `ChatProposalPanel` SHALL 不渲染 apply/archive 的流式消息、阶段详情或工具调用日志。

#### Scenario: apply 运行中

- **GIVEN** 一个 `applying` 状态的 proposal
- **WHEN** apply 正在流式执行
- **THEN** `ChatProposalPanel` SHALL 仅展示“实施中”状态 badge，不展示任何 chunk 消息或阶段进度条

#### Scenario: 用户需要查看详细日志

- **GIVEN** 一个 `applying` 状态的 proposal
- **WHEN** 用户点击 proposal 条目
- **THEN** 应用 SHALL 导航到 `/proposal/<changeId>`，在详情页 `ProposalApplySidePanel` 中展示完整日志
