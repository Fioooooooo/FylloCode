## Context

当前 `createProposalTool` 的流程是先通过 `runtime-workspace#prepareProposalWorkspace` 解析 main 或 linked workspace，再在 `workspace.path` 下调用 `runtime-openspec#createChange(projectRoot, changeName)`。`createChange` 当前直接调用 OpenSpec CLI `new change`，随后读取并改写新 change 的 `.openspec.yaml` 为 `status: creating`。

问题在于 OpenSpec CLI 的 `new change` 依赖目标目录已经具备 OpenSpec 项目结构。对于新项目、空模板项目或缺少 OpenSpec 初始化文件的 workspace，`createChange` 会在 proposal artifacts 生成前失败。用户明确要求这属于 OpenSpec CLI 能力补齐，应收敛在 `runtime-openspec` 内部，而不是散落在 tool 层或 workspace 层。

## Goals / Non-Goals

**Goals:**

- 在 `runtime-openspec#createChange(projectRoot, name)` 内部或其直接 helper 中执行 OpenSpec 最小初始化检查。
- 对缺失的 `openspec/changes/archive/`、`openspec/specs/`、`openspec/config.yaml` 做幂等补齐。
- 保持已有 `config.yaml` 不被覆盖，避免破坏项目自定义 schema、context 或 rules。
- 保持 `runtime-workspace` 与 `runtime-openspec` 的分层隔离：workspace 只负责 git/worktree，OpenSpec 初始化由 runtime-openspec 负责。
- 为 main workspace、linked workspace、已有配置不覆盖、目录缺失自动创建补充测试。

**Non-Goals:**

- 不调用或引入新的 OpenSpec CLI 初始化命令。
- 不修改 OpenSpec schema 语义，不新增 schema 类型。
- 不让 `explore`、`apply-change`、`archive-change` 在本变更中自动初始化项目。
- 不改变 `create-proposal` 的 workspace 选择、targetPath 校验、status 生命周期或 artifact 返回结构。

## Decisions

### Decision: 初始化逻辑放在 `runtime-openspec` 内部

`runtime-openspec` 已经是所有 OpenSpec CLI 交互的唯一适配层。把最小初始化放在 `createChange` 内部，能让 tool 层继续表达业务动作“创建 change”，而不需要知道 OpenSpec CLI 的项目结构前置条件。

备选方案是让 `tools/create-proposal.ts` 在调用 `createChange` 前自行检查目录。该方案会把 OpenSpec 项目结构知识泄漏到 tool 层，也会让未来其他创建 change 的入口重复实现，因此不采用。

### Decision: 幂等创建目录，缺失 config 才写默认模板

初始化 SHALL 使用 Node fs API 创建：

- `<projectRoot>/openspec/changes/archive/`
- `<projectRoot>/openspec/specs/`

并且仅当 `<projectRoot>/openspec/config.yaml` 不存在时写入默认内容。目录创建使用 recursive 语义；已有目录和已有 config 都视为成功。

### Decision: 默认 config 使用用户提供的完整模板

默认 `config.yaml` SHALL 写入以下内容，保持注释可读性，便于后续人工补充项目上下文或 artifact rules：

```yaml
schema: spec-driven

# Project context (optional)
# This is shown to AI when creating artifacts.
# Add your tech stack, conventions, style guides, domain knowledge, etc.
# Example:
#   context: |
#     Tech stack: TypeScript, React, Node.js
#     We use conventional commits
#     Domain: e-commerce platform

# Per-artifact rules (optional)
# Add custom rules for specific artifacts.
# Example:
#   rules:
#     proposal:
#       - Keep proposals under 500 words
#       - Always include a "Non-goals" section
#     tasks:
#       - Break tasks into chunks of max 2 hours
```

### Decision: `createChange` 保持对外 API 不变

实现应优先让 `createChange(projectRoot, name)` 在内部调用初始化 helper，再执行 CLI `new change`。这样 `createProposalTool` 不需要新增步骤，测试也能直接覆盖 runtime 行为。

如实现需要单独导出 helper 供测试使用，可以导出 `ensureOpenSpecProjectInitialized(projectRoot: string): void`，但 tool 层不应直接依赖它。

## Risks / Trade-offs

- 初始化写文件会让此前“缺少 OpenSpec 项目结构”的失败变成自动修复；这符合 create-proposal 目标，但需要测试确认不会覆盖已有 config。
- 如果 `openspec/config.yaml` 存在但内容无效，本变更不修复该文件；后续 CLI 或 `readProjectSchema` 仍按现有错误路径处理。这样可以避免猜测用户配置意图。
- linked workspace 是从 main repo 创建的 worktree，若 main repo 缺少 OpenSpec 初始化文件，初始化应发生在 linked workspace 内。这会把缺失文件作为 proposal 分支的一部分提交，符合 proposal workspace 隔离模型。
