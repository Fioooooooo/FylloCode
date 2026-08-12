# fyllo-specs-archive Specification

## Purpose

定义 `fyllo-specs` Archive 阶段的提交信息与工具指引，使归档生成的 commit subject 描述 proposal 的实际交付内容，将 spec sync/archive 事实保留为归档报告或提交正文的辅助信息，并确保归档后的 Purpose 修复折叠进同一个交付 commit。

## Requirements

### Requirement: Archive commit guidance describes delivered proposal

`fyllo-specs` 的 `archive-change` tool SHALL 指导 agent 生成描述 proposal 实际交付内容的 `commitMessage`，而不是生成仅描述归档或同步动作的提交主题。

#### Scenario: Commit message schema describes delivery semantics

- **WHEN** agent 查看 `archive-change` 的 `commitMessage` 输入字段描述
- **THEN** 字段描述 SHALL 要求 first line 使用 `type(scope): summary`
- **AND** 字段描述 SHALL 要求 summary 基于当前 proposal、已修改文件和实际交付内容
- **AND** 字段描述 SHALL NOT 推荐或暗示仅描述 archive/sync action 的提交主题

#### Scenario: Tool instruction separates subject from archive reporting

- **WHEN** agent 读取 `archive-change` tool instruction
- **THEN** instruction SHALL 要求 commit subject 描述 proposal 的实际交付内容
- **AND** instruction SHALL 允许 archive/sync 事实出现在可选正文 bullet 或 archive 完成汇报中
- **AND** instruction SHALL NOT 要求 commit subject 描述 archive/sync action

#### Scenario: Archive stage reminder reinforces proposal-based subject

- **WHEN** agent 处于 Archive stage 并读取 FylloCode system reminder
- **THEN** Commit Rules SHALL 要求 commit subject 描述 proposal 的交付结果
- **AND** Commit Rules SHALL 保留 `type(scope): summary` 格式要求
- **AND** Commit Rules SHALL NOT 要求 subject 准确描述 archive/sync actions

#### Scenario: Tests do not reinforce archive-only subject examples

- **WHEN** maintainer 阅读 `archive-change` 相关测试中的成功归档样例
- **THEN** 测试 fixture 中的 `commitMessage` SHALL 使用描述 proposal 交付内容的 subject
- **AND** 测试 fixture SHALL NOT 使用 `chore(specs): archive ...` 或同等 archive-only subject 作为成功路径样例

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

### Requirement: Archive guidance updates generated spec Purpose

`fyllo-specs` 的 `archive-change` tool instruction SHALL 要求 agent 在归档同步产生新 main spec 时检查并替换 OpenSpec skeleton Purpose，避免正式 `openspec/specs/**/spec.md` 保留归档生成的 TBD 占位。

#### Scenario: Instruction targets specs created by the current archive

- **WHEN** agent 读取 `archive-change` tool instruction
- **AND** 当前 change 的 delta spec sync 会创建新的 `openspec/specs/<capability>/spec.md`
- **THEN** instruction SHALL 要求 agent 检查本次新增 main spec 的 `## Purpose`
- **AND** instruction SHALL 将检查目标限定为包含 `TBD - created by archiving change <change-name>. Update Purpose after archive.` 的 skeleton Purpose
- **AND** instruction SHALL NOT 要求 agent 在本次归档中重写无关历史 spec 的 Purpose

#### Scenario: Instruction defines the replacement rule

- **WHEN** agent 发现本次新增 main spec 仍包含 OpenSpec skeleton Purpose
- **THEN** instruction SHALL 要求 agent 将 Purpose 替换为一段描述 capability 职责、行为边界和主要契约来源的简洁文字
- **AND** 替换后的 Purpose SHALL 基于 proposal、delta spec requirements 或同步后的 main spec requirements 推导
- **AND** instruction SHALL 要求 agent 保留 `## Purpose` section
- **AND** 替换后的 Purpose SHALL 非空，并且至少包含 50 个字符
- **AND** 替换后的 Purpose SHALL 针对当前 spec 提供实质性内容，而不是通用占位、模板句或归档过程说明
- **AND** 替换后的 Purpose SHALL NOT 包含 `TBD`、`created by archiving change`、change 名称或 archive/sync 过程描述

#### Scenario: Archive summary reports Purpose placeholder handling

- **WHEN** agent 汇报 archive 完成结果
- **THEN** instruction SHALL 要求汇报本次新增 main specs 的 Purpose 占位检查结果
- **AND** instruction SHALL 要求 agent 不得在本次新增 main spec 仍保留 skeleton Purpose 时声称 archive 完成

#### Scenario: Runtime behavior remains unchanged

- **WHEN** `archive-change` tool 执行归档
- **THEN** runtime SHALL 保持现有输入字段、返回 state 结构、OpenSpec archive、spec sync、git finalization 和 commit message 格式校验不变
- **AND** runtime SHALL NOT 新增自动生成 Purpose、自动拒绝 skeleton Purpose 或自动修改 unrelated specs 的行为

### Requirement: Archive guidance keeps Purpose repair in one commit

`fyllo-specs` 的 `archive-change` tool instruction SHALL 要求 agent 将归档后产生的 Purpose 占位修复折叠进 archive tool 已生成的同一个交付 commit，最终不得保留独立的 Purpose 修复 commit。

#### Scenario: Archive commit remains current HEAD

- **WHEN** archive tool 完成 Git finalization 后，agent 修改本次新增 main spec 的 skeleton Purpose
- **AND** archive tool 生成的交付 commit 仍是 finalized repository 的当前 HEAD
- **THEN** instruction SHALL 要求 agent 只暂存本次 Purpose 修复文件
- **AND** SHALL 通过 amend 保留原提交信息并将修复折叠进该 archive commit
- **AND** SHALL 要求 agent 验证最终只存在一个 archive delivery commit

#### Scenario: Archive commit is no longer current HEAD

- **WHEN** agent 准备折叠 Purpose 修复时发现 finalized repository 的 HEAD 已变化
- **THEN** instruction SHALL 禁止盲目 amend 当前 HEAD
- **AND** 仅当 agent 能证明中间提交会被原样保留时，MAY 使用定向 fixup/autosquash 或等价 rebase 折叠修复
- **AND** 无法安全证明时 SHALL 停止并报告 blocker，不得重写无关历史

#### Scenario: Purpose repair commit remains separate

- **WHEN** Purpose 修复尚未折叠进 archive delivery commit
- **THEN** agent SHALL NOT 声称 Archive 完成
- **AND** 最终归档汇报 SHALL 包含 single-commit 检查结果

### Requirement: Archive guidance treats spec sync as automatic

`fyllo-specs` 的 `archive-change` tool instruction SHALL 将 delta spec sync 描述为 confirmed archive 的自动步骤，由 OpenSpec runtime 判断是否需要同步；instruction SHALL NOT 要求用户在同步后归档与不同步直接归档之间选择。

#### Scenario: Delta specs exist during archive preview

- **WHEN** archive preview 显示当前 change 包含 delta specs
- **THEN** instruction MAY 向用户展示待同步摘要
- **AND** SHALL 说明摘要仅用于了解影响
- **AND** SHALL NOT 提供 archive-without-syncing 选项

#### Scenario: Confirmed archive reports sync result

- **WHEN** agent 使用 `confirm: true` 执行 archive
- **THEN** OpenSpec runtime SHALL 自动判断并执行适用的 spec sync
- **AND** agent SHALL 使用 `state.archive.archiveRawOutput` 汇报实际同步结果

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
