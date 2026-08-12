## MODIFIED Requirements

### Requirement: Confirmed Archive persists archived status metadata

`fyllo-specs archive-change` SHALL仅在OpenSpec CLI输出确认archive成功后，将`archiveTarget/.openspec.yaml`的`status`写为`archived`。写回SHALL保留其他metadata字段和值，SHALL让ISO时间字符串保持为不带单引号或双引号的YAML plain scalar，并保持幂等；该规则只作用于此后通过`fyllo-specs archive-change`执行的归档，SHALL NOT批量修改历史archive。

#### Scenario: Main worktree archive writes status before commit

- **WHEN** main worktree Proposal的OpenSpec archive成功
- **THEN** `archiveTarget/.openspec.yaml` SHALL包含`status: archived`
- **AND**该写回SHALL在main worktree commit之前完成
- **AND**其他metadata字段和值SHALL保持不变
- **AND**原有`created` ISO时间值SHALL保持不变且不带单引号或双引号

#### Scenario: Linked archive carries status into main

- **WHEN** linked worktree Proposal的OpenSpec archive成功
- **THEN** linked archive中的`.openspec.yaml` SHALL先写为`status: archived`
- **AND** proposal branch commit SHALL包含该写回
- **AND** fast-forward merge后owner main archive中的同一文件SHALL包含`status: archived`
- **AND**归档metadata中的ISO时间值SHALL不带单引号或双引号

#### Scenario: Preview or unconfirmed archive does not write status

- **WHEN** `confirm`为false、archive target冲突、OpenSpec CLI失败、命中已知early-return signal或缺少success marker
- **THEN** runtime SHALL NOT写入`status: archived`
- **AND** active Proposal metadata SHALL保持执行前状态

#### Scenario: Metadata is already archived

- **WHEN** confirmed archive target的`.openspec.yaml`已经包含`status: archived`
- **THEN** metadata写回SHALL幂等成功
- **AND** SHALL NOT删除或重置其他metadata字段
- **AND** SHALL NOT改变现有ISO时间值的无引号表示
