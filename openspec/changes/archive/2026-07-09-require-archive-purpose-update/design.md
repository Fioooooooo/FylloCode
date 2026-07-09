## Context

当前项目使用 `@fission-ai/openspec@1.3.1`。当 `openspec archive <change> --yes` 同步 delta spec 且目标 `openspec/specs/<capability>/spec.md` 不存在时，OpenSpec 的 `buildSpecSkeleton()` 会创建 main spec skeleton，并写入：

`TBD - created by archiving change <change-name>. Update Purpose after archive.`

该文本足够长，能通过 OpenSpec 的非 strict validation；FylloCode 的 `archive-change` tool instruction 当前只要求同步 delta specs、归档、git finalization 和汇报，未要求 agent 替换 skeleton Purpose。因此问题不在 delta spec 内容，而在 Archive 指令缺少完成检查。

## Goals / Non-Goals

**Goals:**

- 让 `archive-change` tool instruction 明确要求 agent 检查本次归档新增的 main specs。
- 让 agent 按统一规则把 skeleton Purpose 替换为真实 capability Purpose。
- 让最终 Archive 汇报暴露 Purpose 占位检查结果，避免 agent 忽略正式 spec 中的 TODO。

**Non-Goals:**

- 不修改 `@fission-ai/openspec` 包源码或 OpenSpec CLI 行为。
- 不新增 `archive-change` runtime 自动扫描、自动改写或新的返回字段。
- 不改变 `confirm: true` 的 archive、spec sync、commit、merge、worktree cleanup 和 branch cleanup 顺序。
- 不把已有历史 spec 中的旧 TBD Purpose 一次性迁移；本变更只约束后续归档运行。

## Decisions

### Decision 1: 只补 tool instruction，不做 runtime 自动改写

本次只更新 `src/mcp-servers/fyllo-specs/src/tools/instructions/archive-change.md`。原因是用户明确要求“把要求写进 archive-change.md”，且当前问题源自 agent 未收到必须替换 Purpose 的指令。runtime 自动改写需要解析 proposal、delta requirements 与 main spec 内容来生成自然语言 Purpose，容易产生不透明或低质量文本，且会改变 `archive-change` 的执行语义。

替代方案：在 `archive-change` runtime 中扫描并拒绝 skeleton Purpose。放弃原因是运行时无法可靠生成合格 Purpose，也会改变工具失败模式和 recovery 边界。

### Decision 2: 检查对象限定为本次新增 main specs

指令应要求 agent 只处理本次归档同步创建的 main specs，识别方式以当前 archive run 的 change name 和 skeleton 文本为边界：`TBD - created by archiving change <change-name>. Update Purpose after archive.`。这样不会误改历史归档遗留的 TBD，也不会要求 agent 重写已存在 spec 的人工 Purpose。

替代方案：全库扫描所有 `openspec/specs/**/spec.md` 的 TBD Purpose。放弃原因是会把历史修复混入当前 archive，扩大变更面并制造额外提交风险。

### Decision 3: Purpose 规则写成可执行的人工生成标准

替换后的 Purpose 应是一段简洁文字，描述 capability 的职责、行为边界和主要契约来源；内容可从 proposal、delta spec requirements 和同步后的 main spec requirements 推导。Purpose 不得包含 `TBD`、`created by archiving change`、change 名称或 archive/sync 过程描述。

替代方案：要求固定模板，例如“定义 X 的行为”。放弃原因是不同 capability 的边界不同，固定模板会诱导空泛文本；规则应约束质量和禁用内容，而不是规定唯一句式。

## Risks / Trade-offs

- [Risk] `archive-change(confirm: true)` 当前会在一次工具调用里完成 OpenSpec archive 和 git finalization，agent 若在工具返回后才编辑 Purpose，可能产生归档提交之外的后续 diff。→ Mitigation：instruction 必须把 Purpose 检查作为 Archive 完成条件，并要求 agent 确保修正进入最终归档结果；如果实现阶段发现现有顺序无法保证这一点，应在指令中要求 agent报告未完成状态而不是声称 archive complete。
- [Risk] agent 生成的 Purpose 质量仍依赖上下文理解。→ Mitigation：指令明确来源、禁止内容和汇报要求，并用测试固定这些关键短语。
- [Risk] 指令文案过长会降低可读性。→ Mitigation：新增一个独立步骤或子步骤，避免改写已有 sync、conflict、recovery 和 commit guidance。
