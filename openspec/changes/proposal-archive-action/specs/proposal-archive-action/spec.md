## ADDED Requirements

### Requirement: Proposal detail page can start archive after apply is complete

系统 SHALL 在 proposal 处于 `applying` 且当前 apply run 已完成时，允许用户触发归档流程。

#### Scenario: Apply run completed

- **WHEN** proposal.status 为 `applying` 且 apply run 的状态为 `done`
- **THEN** 用户可以触发归档流程

#### Scenario: Apply run not completed

- **WHEN** proposal.status 为 `applying` 但 apply run 尚未完成
- **THEN** 归档流程不可触发

### Requirement: Archive action resumes the completed apply session

系统 SHALL 在触发归档时，复用已完成 apply stage 的 ACP session id，并使用 `proposal-archive` stage type 构造归档 prompt：

`加载 skill fyllo-archive-change，归档 {changeId}，先同步主 spec 再完成归档。归档完成后将 worktree 的所有变更文件做一次 commit，commit message 模仿最近的 commit 记录`

归档流程 SHALL 使用与 stage stream 相同的 MessagePort 流式传输方式。

#### Scenario: Archive starts successfully

- **WHEN** 用户触发归档且存在已完成的 apply run
- **THEN** main process 恢复最后一个 completed apply stage 的 ACP session
- **AND** 发送 archive prompt 开始归档流
- **AND** renderer 收到 chunk、done 和 error 事件

#### Scenario: No completed apply run

- **WHEN** 用户触发归档但没有可复用的 completed apply run
- **THEN** 系统返回错误

### Requirement: Archive completion reflects archived filesystem state

系统 SHALL 在归档流完成后刷新 proposal 元数据，使详情页能够反映 `.openspec.yaml` 最终是否已变为 `archived`。

#### Scenario: Archive flow completes

- **WHEN** 归档流结束且文件系统中的 proposal 状态已更新
- **THEN** 详情页重新读取 proposal 元数据
- **AND** 页面显示 `archived` 状态
