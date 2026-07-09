## ADDED Requirements

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
