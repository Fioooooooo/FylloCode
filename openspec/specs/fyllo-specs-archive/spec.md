# fyllo-specs-archive Specification

## Purpose

定义 `fyllo-specs` Archive 阶段的提交信息与工具指引，使归档生成的 commit subject 描述 proposal 的实际交付内容，并将 spec sync/archive 事实保留为归档报告或提交正文的辅助信息。

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

`fyllo-specs` 的 `archive-change` commit guidance 更新 SHALL 不改变现有归档运行时行为。

#### Scenario: Runtime validation remains format-only

- **WHEN** `archive-change` 使用 `confirm: true` 和 `commitMessage` 执行
- **THEN** runtime SHALL 继续使用现有 `type(scope): summary` 格式规则校验 first line
- **AND** runtime SHALL NOT 新增基于自然语言语义的 archive-only subject 拒绝规则

#### Scenario: Archive workflow remains unchanged

- **WHEN** `archive-change` 确认归档成功
- **THEN** runtime SHALL 保持现有 archive、spec sync、git commit、merge、worktree cleanup 和 branch cleanup 顺序
- **AND** tool 输入字段与返回 state 结构 SHALL 保持不变

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
