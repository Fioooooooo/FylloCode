## MODIFIED Requirements

### Requirement: Archive commit guidance preserves runtime behavior

`fyllo-specs` 的 `archive-change` commit guidance更新 SHALL保持现有commit message格式校验、OpenSpec CLI调用、spec sync与Git finalization所有权。确认归档成功后的运行顺序 SHALL扩展为OpenSpec archive与spec sync、归档metadata写回、git commit、merge、worktree cleanup和branch cleanup；metadata写回之外不得改变既有步骤的相对顺序。

#### Scenario: Runtime validation remains format-only

- **WHEN** `archive-change`使用`confirm: true`和`commitMessage`执行
- **THEN** runtime SHALL继续使用现有`type(scope): summary`格式规则校验first line
- **AND** runtime SHALL NOT新增基于自然语言语义的archive-only subject拒绝规则

#### Scenario: Archive workflow writes metadata before Git finalization

- **WHEN** `archive-change`确认OpenSpec archive成功
- **THEN** runtime SHALL在归档目录内写回`status: archived`
- **AND** metadata写回SHALL发生在git commit、merge、worktree cleanup和branch cleanup之前
- **AND** commit、merge与cleanup既有相对顺序及执行所有权SHALL保持不变

#### Scenario: Successful tool state remains compatible

- **WHEN** OpenSpec archive、metadata写回与Git finalization全部成功
- **THEN** tool输入字段与既有成功state结构SHALL保持不变
- **AND** metadata写回SHALL NOT新增Proposal lifecycle status、IPC channel或Renderer run state

#### Scenario: Metadata failure extends recovery state

- **WHEN** OpenSpec archive已确认成功但归档metadata写回失败
- **THEN** tool SHALL在既有recovery kind union中增加`archive-metadata-update`
- **AND** SHALL使用既有archive、finalization error与recovery envelope报告部分成功
- **AND** SHALL NOT把该结果伪装成OpenSpec archive未发生

## ADDED Requirements

### Requirement: Confirmed Archive persists archived status metadata

`fyllo-specs archive-change` SHALL仅在OpenSpec CLI输出确认archive成功后，将`archiveTarget/.openspec.yaml`的`status`写为`archived`。写回SHALL保留其他metadata字段并保持幂等；该规则只作用于此后通过`fyllo-specs archive-change`执行的归档，SHALL NOT批量修改历史archive。

#### Scenario: Main worktree archive writes status before commit

- **WHEN** main worktree Proposal的OpenSpec archive成功
- **THEN** `archiveTarget/.openspec.yaml` SHALL包含`status: archived`
- **AND**该写回SHALL在main worktree commit之前完成
- **AND**其他metadata字段SHALL保持其原有值

#### Scenario: Linked archive carries status into main

- **WHEN** linked worktree Proposal的OpenSpec archive成功
- **THEN** linked archive中的`.openspec.yaml` SHALL先写为`status: archived`
- **AND** proposal branch commit SHALL包含该写回
- **AND** fast-forward merge后owner main archive中的同一文件SHALL包含`status: archived`

#### Scenario: Preview or unconfirmed archive does not write status

- **WHEN** `confirm`为false、archive target冲突、OpenSpec CLI失败、命中已知early-return signal或缺少success marker
- **THEN** runtime SHALL NOT写入`status: archived`
- **AND** active Proposal metadata SHALL保持执行前状态

#### Scenario: Metadata is already archived

- **WHEN** confirmed archive target的`.openspec.yaml`已经包含`status: archived`
- **THEN** metadata写回SHALL幂等成功
- **AND** SHALL NOT删除或重置其他metadata字段

### Requirement: Archive metadata failure preserves partial-success truth

OpenSpec archive确认成功后若`.openspec.yaml`读取或写回失败，tool SHALL保留目录移动与spec sync已经发生的事实，停止Git finalization，并返回无需重新执行OpenSpec archive的恢复信息。

#### Scenario: Metadata write fails after archive move

- **WHEN** success marker已经确认且archive target存在
- **AND** runtime无法将归档metadata写为`status: archived`
- **THEN**返回state的`archive.ok` SHALL为true
- **AND** `archive.archiveTarget`与`archive.archiveRawOutput` SHALL保留实际归档结果
- **AND**顶层status SHALL为failed且`finalization.ok` SHALL为false
- **AND** `finalization.gitOps` SHALL为空、`failedStep` SHALL为null
- **AND** recovery SHALL为`required: agent`与`kind: archive-metadata-update`

#### Scenario: Metadata recovery does not rerun archive

- **WHEN** agent读取`archive-metadata-update`恢复信息
- **THEN**恢复指引SHALL要求修复archive target内的`.openspec.yaml`
- **AND** SHALL明确禁止重新执行OpenSpec archive或再次移动归档目录
- **AND** SHALL说明metadata修复后从commit、merge与workspace cleanup继续

#### Scenario: Historical archive remains readable

- **WHEN**历史archive的`.openspec.yaml`仍包含`status: applying`
- **THEN**本次变更SHALL NOT批量回填该文件
- **AND** Proposal reader SHALL继续以archive目录位置将其识别为`archived`
