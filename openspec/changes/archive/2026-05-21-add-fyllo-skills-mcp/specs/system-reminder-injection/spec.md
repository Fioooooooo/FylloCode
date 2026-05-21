## ADDED Requirements

### Requirement: reminders route agents to the guidelines skill without embedding guideline content

System-reminder templates SHALL mention that a bundled MCP tool named `fyllo-skills.guidelines` is available for the project guidelines file contract and maintenance rules.

System-reminder templates SHALL NOT embed the full project guidelines document contract, guideline templates, or detailed authoring rules. Detailed guidelines content SHALL live in the `fyllo-skills.guidelines` tool instruction.

#### Scenario: reminders mention guidelines tool

- **WHEN** main process renders any owner system-reminder template
- **THEN** the rendered reminder mentions `fyllo-skills.guidelines`
- **AND** the rendered reminder describes it as the source for project guidelines file contract and maintenance rules

#### Scenario: reminders do not duplicate guidelines instruction

- **WHEN** main process renders any owner system-reminder template
- **THEN** the rendered reminder does not include full guideline document templates
- **AND** the rendered reminder does not include detailed `AGENTS.md` or `guidelines/*.md` section-by-section authoring instructions

## MODIFIED Requirements

### Requirement: chat reminder 编排 worktree 创建

`chat.txt` system-reminder 模板正文 SHALL 不再包含 shell-command worktree 编排序列。它 SHALL 指示 agent 在获得用户明确同意后调用 `mcp__fyllo_specs__create-proposal`，并依赖 tool 返回的 `state.workspace.path` 读取和修改所有 proposal artifacts。

reminder SHALL also lightly route project-guidelines behavior:

- It SHALL mention `fyllo-skills.guidelines` as the bundled tool for project guidelines file contract and maintenance rules.
- Before creating a proposal for a code, behavior, architecture, testing, workflow, or convention change, it SHALL instruct the agent to consider whether local repository guidelines should be created or updated.
- It SHALL keep detailed guidelines authoring rules out of the reminder.

reminder SHALL说明:

- `create-proposal.workspaceMode` 可取 `"linked"` 或 `"main"`。
- 省略 `workspaceMode` 时默认使用 `"linked"`。
- 如果用户明确要求直接在 main workspace 工作，agent SHALL 在本次 `create-proposal` 调用中传入 `workspaceMode: "main"`。
- `workspaceMode` 是单次调用参数，不是项目偏好。
- `create-proposal` 返回后，agent SHALL 使用 `state.workspace.path` 作为 proposal artifacts 的工作目录。
- agent SHALL NOT 在 Chat stage 手动执行 `git worktree add`。

`chat.txt` SHALL NOT 包含 `.gitignore` 维护、`git worktree add`、`git merge`、`git worktree remove` 或 `git branch -d` 的 shell 命令。

#### Scenario: chat reminder 不再包含 worktree shell 创建

- **WHEN** 主进程为 chat owner 渲染 system-reminder 文本
- **THEN** 文本包含 `workspaceMode`
- **AND** 文本包含 `state.workspace.path`
- **AND** 文本包含 `mcp__fyllo_specs__create-proposal`
- **AND** 文本不包含 `git worktree add`
- **AND** 文本不包含 `.worktrees/<changeName>` shell command sequence

#### Scenario: chat reminder 保留 consent 与 stage 约束

- **WHEN** 主进程为 chat owner 渲染 system-reminder 文本
- **THEN** 文本仍含 `<authority>` / `<context>` / `<rules>` / `<critical>` 段
- **AND** `<critical>` 段中 "MUST obtain explicit user consent before calling create-proposal" 约束仍存在
- **AND** 文本指示 agent 不得在用户进入 Apply 或 Archive stage 前调用 `apply-change` 或 `archive-change`

#### Scenario: chat reminder routes proposal planning to guidelines skill

- **WHEN** 主进程为 chat owner 渲染 system-reminder 文本
- **THEN** 文本包含 `fyllo-skills.guidelines`
- **AND** 文本 tells the agent to consider local guideline creation or updates before creating proposals for code, behavior, architecture, testing, workflow, or convention changes
- **AND** 文本 does not include full guideline document templates

### Requirement: apply reminder 暴露 worktreePath

`apply.txt` system-reminder 模板正文 SHALL 描述当前 stage workspace 已由 proposal workflow 准备完成。它 SHALL 使用 `{{worktreePath}}` / `{{mainProjectPath}}` 暴露当前 cwd 语义，但 SHALL NOT 指示 agent 创建、迁移、merge、remove 或删除 worktree。

reminder SHALL also lightly route project-guidelines behavior:

- It SHALL mention `fyllo-skills.guidelines` as the bundled tool for project guidelines file contract and maintenance rules.
- Before editing code, it SHALL instruct the agent to read applicable local repository guidelines.
- If implementation reveals guidelines are missing, stale, or inconsistent with repository facts, it SHALL instruct the agent to update the relevant guidelines as part of the same change.
- It SHALL keep detailed guidelines authoring rules out of the reminder.

reminder SHALL说明:

- 当前 stage cwd 已由 host 设置为 `runMeta.worktreePath ?? projectPath`。
- 空的 `{{worktreePath}}` 表示当前 stage 运行在 main workspace。
- 非空的 `{{worktreePath}}` 表示当前 stage 运行在 linked worktree。
- agent SHALL 使用当前 stage workspace path 作为 `targetPath` 调用 `mcp__fyllo_specs__apply-change`。
- 业务代码 commit 仍由 agent 负责；Archive 不会替 agent 创建业务代码 commit。

#### Scenario: apply reminder 不再包含 worktree lifecycle 命令

- **WHEN** 主进程为 apply owner 渲染 system-reminder 文本
- **THEN** 文本包含当前 stage cwd / workspace 说明
- **AND** 文本包含 `mcp__fyllo_specs__apply-change`
- **AND** 文本不包含 `git worktree add`
- **AND** 文本不包含 `git merge --ff-only`
- **AND** 文本不包含 `git worktree remove`
- **AND** 文本不包含 `git branch -d`

#### Scenario: apply reminder 仍暴露 main fallback

- **WHEN** ApplyRunMeta.worktreePath 为 `undefined`
- **THEN** apply reminder 渲染后的 `{{worktreePath}}` 为空字符串
- **AND** 文本明确说明空字符串代表 main workspace

#### Scenario: apply reminder routes implementation to local guidelines

- **WHEN** 主进程为 apply owner 渲染 system-reminder 文本
- **THEN** 文本包含 `fyllo-skills.guidelines`
- **AND** 文本 tells the agent to read applicable local repository guidelines before editing code
- **AND** 文本 tells the agent to update missing, stale, or inconsistent guidelines as part of the same change when implementation reveals that need

### Requirement: archive reminder 编排 worktree 4 步收尾

`archive.txt` system-reminder 模板正文 SHALL 不再指示 agent 手动执行 git commit / merge / worktree cleanup shell 命令。它 SHALL 指示 agent 调用 `mcp__fyllo_specs__archive-change`，传入 `confirm: true` 与匹配 `type(scope): summary` 的 `commitMessage`。

reminder SHALL also lightly route project-guidelines behavior:

- It SHALL mention `fyllo-skills.guidelines` as the bundled tool for project guidelines file contract and maintenance rules.
- Before final archive, it SHALL instruct the agent to check whether the completed change altered commands, architecture, tests, workflow, data contracts, or project conventions that should have updated local guidelines.
- It SHALL keep detailed guidelines authoring rules out of the reminder.

reminder SHALL说明:

- `archive-change` 内部执行 OpenSpec archive 与 workspace git finalization。
- agent SHALL 检查返回的 `state.archive` 对象以判断 OpenSpec archive 结果。
- agent SHALL 检查返回的 `state.workspace` 对象以判断 git finalization 结果。
- 失败时，agent SHALL 汇报失败发生在 `archive` 还是 `workspace`，列出已完成的 `workspace.gitOps`，在存在时指出 `workspace.failedStep`，并转述对应子对象的 `error.retryHint`。
- 除非用户明确要求脱离 MCP workflow 进行手动恢复，agent SHALL NOT 手动执行 `git commit`、`git merge --ff-only`、`git worktree remove` 或 `git branch -d`。

#### Scenario: archive reminder 不再包含手写 git cleanup 命令

- **WHEN** 主进程为 archive owner 渲染 system-reminder 文本
- **THEN** 文本包含 `mcp__fyllo_specs__archive-change`
- **AND** 文本包含 `commitMessage`
- **AND** 文本包含 `state.archive`
- **AND** 文本包含 `state.workspace`
- **AND** 文本不包含 `git -C {{worktreePath}} add -A`
- **AND** 文本不包含 `git -C {{mainProjectPath}} merge --ff-only`
- **AND** 文本不包含 `git -C {{mainProjectPath}} worktree remove`
- **AND** 文本不包含 `git -C {{mainProjectPath}} branch -d`

#### Scenario: archive reminder 保留 archive stage 约束

- **WHEN** 主进程为 archive owner 渲染 system-reminder 文本
- **THEN** 文本仍含 `<authority>` / `<context>` / `<rules>` / `<critical>` 段
- **AND** 文本仍要求使用 `mcp__fyllo_specs__archive-change` 作为主要 archive 路径
- **AND** 文本仍要求汇报 incomplete tasks、missing artifacts、conflicts、commit result 与最终 archive outcome

#### Scenario: archive reminder routes final guideline check

- **WHEN** 主进程为 archive owner 渲染 system-reminder 文本
- **THEN** 文本包含 `fyllo-skills.guidelines`
- **AND** 文本 tells the agent to check whether the completed change should have updated local guidelines
- **AND** 文本 keeps detailed guideline document templates out of the reminder
