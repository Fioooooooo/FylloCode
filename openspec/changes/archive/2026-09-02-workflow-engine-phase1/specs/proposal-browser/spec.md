# proposal-browser Specification Delta

## MODIFIED Requirements

### Requirement: Proposal 详情不直接提供生命周期操作入口

系统 SHALL 让 Proposal 详情 Slideover 保持只读浏览，不得在详情头部提供 workflow Apply、Archive 或查看旧运行历史的操作按钮，也不得挂载仅服务旧 `WorkflowStage` stage-stream 的运行 side panel。详情 SHALL 继续展示 Proposal 内容、owner、status badge、任务信息和由 Proposal metadata 派生的状态；Apply/Archive 的真实反馈由 Chat/tool result 和 Proposal watcher/status push 承担。

Chat Event Rail 的“开始实现”和“归档”按钮 SHALL 继续遵守本 capability 中已有的 Chat message 契约：按钮发送单个带完整 `ProposalRef` 的文字消息，组件不得直接调用已删除的 Proposal run store/API。任务完成度派生的 `archiveReady` 规则 SHALL 不依赖 Workflow Run 或旧 runMeta。

#### Scenario: 用户打开 draft Proposal 详情

- **WHEN** 用户打开状态为 `draft` 的 Proposal 详情 Slideover
- **THEN** 详情头部 SHALL 不展示“开始实现”按钮或 workflow dropdown
- **AND** 详情内容、owner、状态和任务信息 SHALL 继续展示
- **AND** SHALL 不加载旧 apply/archive run 或旧 WorkflowStage metadata

#### Scenario: 用户打开 applying 或 archived Proposal 详情

- **WHEN** 用户打开状态为 `applying` 或 `archived` 的 Proposal 详情 Slideover
- **THEN** 详情头部 SHALL 不展示“归档”或“查看运行历史”按钮
- **AND** SHALL 不显示 `ProposalApplySidePanel` 或旧 stage progress
- **AND** Proposal status、task progress 和文件内容 SHALL 继续按现有 browser/watcher 规则展示

#### Scenario: Chat Apply/Archive 正在由 Agent 执行

- **WHEN** Event Rail 已发送 Apply/Archive Chat 消息但 Proposal metadata 尚未变化
- **THEN** detail 与 Event Rail SHALL 保持 watcher 最近确认的状态
- **AND** SHALL 不通过旧 run store 乐观创建“运行中”或“归档中”状态
- **AND** Agent 的工具结果 SHALL 继续在 Chat 消息流中可见

#### Scenario: Apply 完成后可归档状态继续派生

- **WHEN** Proposal status 为 `applying`、totalTasks 大于零且 doneTasks 等于 totalTasks
- **THEN** detail 与 Event Rail SHALL 继续派生 `archiveReady`
- **AND** 该结果 SHALL 不要求 matching ApplyRunMeta、WorkflowStage 或旧 workflow engine
