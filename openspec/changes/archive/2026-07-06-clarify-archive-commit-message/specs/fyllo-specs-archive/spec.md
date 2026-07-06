## ADDED Requirements

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

`fyllo-specs` 的 `archive-change` commit guidance 更新 SHALL 不改变现有归档运行时行为。

#### Scenario: Runtime validation remains format-only

- **WHEN** `archive-change` 使用 `confirm: true` 和 `commitMessage` 执行
- **THEN** runtime SHALL 继续使用现有 `type(scope): summary` 格式规则校验 first line
- **AND** runtime SHALL NOT 新增基于自然语言语义的 archive-only subject 拒绝规则

#### Scenario: Archive workflow remains unchanged

- **WHEN** `archive-change` 确认归档成功
- **THEN** runtime SHALL 保持现有 archive、spec sync、git commit、merge、worktree cleanup 和 branch cleanup 顺序
- **AND** tool 输入字段与返回 state 结构 SHALL 保持不变
