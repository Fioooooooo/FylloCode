# proposal-archive-action 规范

## Purpose

定义 proposal 在 apply 完成后的归档能力，包括归档触发条件、复用已完成 apply session 的归档执行，以及归档完成后的页面状态刷新。

## Requirements

### Requirement: Proposal 详情页在 apply 完成后可发起 archive

系统 SHALL 在 proposal 处于 `applying` 且当前 apply run 已完成时，允许用户触发归档流程。

#### Scenario: Apply run 已完成

- **WHEN** proposal.status 为 `applying` 且 apply run 的状态为 `done`
- **THEN** 用户可以触发归档流程

#### Scenario: Apply run 未完成

- **WHEN** proposal.status 为 `applying` 但 apply run 尚未完成
- **THEN** 归档流程不可触发

### Requirement: Archive action 复用已完成的 apply session

系统 SHALL 在触发归档时，复用已完成 apply stage 的 ACP session id，并使用 `proposal-archive` stage type 构造归档 prompt。归档 prompt SHALL 仅指明归档目标，不在 prompt 文本中重复编排具体步骤：

`归档 {changeId}`

具体的 sync 主 spec / archive-change 文件移动 / git commit / merge 进 main / worktree cleanup 等操作 SHALL 由 `archive-change` MCP tool 内部执行，并由 archive system-reminder 约束 agent 读取 tool 的 `archive` 与 `workspace` 分层结果。归档 prompt SHALL NOT 出现 "提交代码" / "merge" / "worktree" / "commit" 等编排关键词。

归档流程 SHALL 使用与 stage stream 相同的 MessagePort 流式传输方式。归档 ACP session 的 cwd SHALL 为 `runMeta.worktreePath ?? projectPath`（P1 通路）。

#### Scenario: Archive 成功启动

- **WHEN** 用户触发归档且存在已完成的 apply run
- **THEN** main 进程恢复最后一个已完成 apply stage 的 ACP session
- **AND** 发送的 archive prompt 文本严格等于 `归档 {changeId}`
- **AND** prompt 文本不含 `提交代码` / `merge` / `worktree` / `commit` 字符串
- **AND** ACP session cwd 等于 `runMeta.worktreePath ?? projectPath`
- **AND** renderer 收到 chunk、done 和 error 事件

#### Scenario: 不存在已完成 apply run

- **WHEN** 用户触发归档但没有可复用的 completed apply run
- **THEN** 系统返回错误（沿用现有 `APPLY_RUN_NOT_READY` 错误语义）

### Requirement: Archive 完成后反映文件系统归档状态

系统 SHALL 在归档流完成后刷新 proposal 元数据，使详情页能够反映 `.openspec.yaml` 最终是否已变为 `archived`。

#### Scenario: Archive 流程完成

- **WHEN** 归档流结束且文件系统中的 proposal 状态已更新
- **THEN** 详情页重新读取 proposal 元数据
- **AND** 页面显示 `archived` 状态

### Requirement: worktreePath 非空时 Archive 完成 4 步 git 收尾

archive 阶段完成 OpenSpec 文件归档移动后，workspace git finalization SHALL 优先在 `archive-change` MCP tool 内部执行，而不是由 archive system-reminder 指示 agent 预先执行 shell 命令。

对于 main workspace archive，`archive-change` SHALL 在 OpenSpec archive 成功后只执行 `commit` git step；当无可提交 diff 时，该 commit step SHALL 作为 no-op success 记录。

对于 linked workspace archive，`archive-change` SHALL 在 OpenSpec archive 成功后按以下主路径顺序执行：

1. `commit`
2. `merge-to-main`
3. `worktree-remove`
4. `branch-delete`

若 `merge-to-main` 因非 fast-forward 失败，且 main workspace 与 linked worktree 均为 clean，`archive-change` SHALL 在 tool 内部执行工程化恢复：

1. `rebase-onto-main`
2. `merge-to-main-retry`
3. `worktree-remove`
4. `branch-delete`

每一步 SHALL 在 `state.workspace.gitOps` 中记录 `cwd`、`command`、`exitCode`、`stdout`、`stderr` 与 `ok`。tool SHALL 在无法安全自动恢复或恢复失败时停止后续 cleanup，并在 `state.workspace.recovery` 中提供 agent 接手所需的上下文。

#### Scenario: main workspace archive 只执行 commit

- **WHEN** archive ACP session 运行在 main workspace
- **AND** agent 调用 `archive-change`，传入 `confirm: true` 与合法 `commitMessage`
- **AND** OpenSpec archive 成功
- **THEN** `archive-change` 返回 `state.archive.ok === true`
- **AND** `state.workspace.mode === "main"`
- **AND** `state.workspace.gitOps` 只包含一个名为 `commit` 的 step
- **AND** `state.workspace.ok === true`

#### Scenario: linked workspace archive 完成直接 git steps

- **WHEN** archive ACP session 运行在 linked worktree
- **AND** agent 调用 `archive-change`，传入 `confirm: true` 与合法 `commitMessage`
- **AND** OpenSpec archive 成功
- **AND** main 可以 fast-forward 到 proposal branch
- **THEN** `archive-change` 返回 `state.archive.ok === true`
- **AND** `state.workspace.mode === "linked"`
- **AND** `state.workspace.gitOps` 按顺序包含 `commit`、`merge-to-main`、`worktree-remove`、`branch-delete`
- **AND** `state.workspace.ok === true`
- **AND** `state.workspace.failedStep === null`

#### Scenario: linked workspace merge 失败后由 tool 自动 rebase 恢复

- **WHEN** archive ACP session 运行在 linked worktree
- **AND** OpenSpec archive 成功
- **AND** `merge-to-main` 因 main 本地提交导致非 fast-forward 失败
- **AND** main workspace 与 linked worktree 均为 clean
- **THEN** `archive-change` 在 linked worktree 中执行 `rebase-onto-main`
- **AND** rebase 成功后执行 `merge-to-main-retry`
- **AND** retry merge 成功后执行 `worktree-remove` 与 `branch-delete`
- **AND** `state.workspace.gitOps` 按顺序包含 `commit`、`merge-to-main`、`rebase-onto-main`、`merge-to-main-retry`、`worktree-remove`、`branch-delete`
- **AND** `state.workspace.ok === true`
- **AND** `state.workspace.failedStep === null`

#### Scenario: rebase 冲突时 agent 接手推进 finalization

- **WHEN** archive ACP session 运行在 linked worktree
- **AND** OpenSpec archive 成功
- **AND** `archive-change` 自动执行 `rebase-onto-main`
- **AND** rebase 出现内容冲突
- **THEN** `archive-change` 返回 `state.status === "failed"`
- **AND** `state.archive.ok === true`
- **AND** `state.workspace.ok === false`
- **AND** `state.workspace.failedStep === "rebase-onto-main"`
- **AND** `state.workspace.recovery.required === "agent"`
- **AND** archive ACP session SHALL 报告失败 step 与恢复上下文
- **AND** archive ACP session MAY 运行有限的 git 恢复命令，用于解决或继续 rebase、重试 fast-forward merge、移除 worktree 并删除 branch

#### Scenario: dirty workspace 时 agent 接手前必须保护现场

- **WHEN** archive ACP session 运行在 linked worktree
- **AND** OpenSpec archive 成功
- **AND** `merge-to-main` 失败后 tool 检测到 main workspace 或 linked worktree dirty
- **THEN** `archive-change` 返回 `state.workspace.recovery.required === "agent"`
- **AND** archive ACP session SHALL 报告自动恢复因 workspace dirty 而停止
- **AND** archive ACP session SHALL NOT 在保护或解决 dirty workspace 状态前运行 rebase 或 cleanup

#### Scenario: 非法 commit message 阻止 archive

- **WHEN** agent 调用 `archive-change`，传入 `confirm: true` 与非法 `commitMessage`
- **THEN** `archive-change` 返回失败 state
- **AND** OpenSpec archive 未执行
- **AND** workspace git finalization 未执行
- **AND** archive ACP session 报告必需的 `type(scope): summary` 格式

### Requirement: worktreePath 为空时 Archive 跳过 linked git cleanup

archive 阶段在 `runMeta.worktreePath` 为空字符串或 `undefined` 时，`archive-change` MCP tool SHALL 将 workspace 视为 main mode。它 SHALL 跳过 linked-worktree finalization steps，并在 OpenSpec archive 成功后只执行 archive commit step。若 commit step 没有可提交 diff，它 SHALL 记录 no-op success。这样既保留 main-workspace 行为，也把 commit 操作移入 MCP tool runtime。

archive system-reminder SHALL 说明空的 `{{worktreePath}}` 表示 main workspace，但 SHALL NOT 指示 agent 在调用 `archive-change` 前手动执行 git cleanup commands。

#### Scenario: 非 git 项目 archive

- **WHEN** `<projectPath>/.git` 不存在
- **AND** runMeta.worktreePath 为 `undefined`
- **AND** 用户触发 archive
- **THEN** archive ACP session cwd 等于 projectPath
- **AND** archive system-reminder 渲染后的 `{{worktreePath}}` 为空字符串
- **AND** agent 调用 `archive-change`，传入 `targetPath === projectPath`、`confirm: true` 与合法 `commitMessage`
- **AND** `archive-change` 返回 `state.workspace.mode === "main"`
- **AND** `state.workspace.gitOps` 只包含 `commit`
- **AND** 不尝试 merge / rebase / worktree remove / branch delete step

#### Scenario: 旧 ApplyRunMeta archive

- **WHEN** runMeta 为旧版本持久化的 JSON（不含 worktreePath 字段）
- **AND** 用户触发 archive
- **THEN** runMeta.worktreePath 反序列化为 `undefined`
- **AND** archive ACP session cwd 等于 projectPath
- **AND** archive 行为遵循 main workspace mode
- **AND** 不尝试 linked worktree cleanup step

### Requirement: Archive system-reminder 允许 tool finalization 失败后的受限 agent 恢复

archive system-reminder SHALL 继续要求以 `mcp__fyllo_specs__archive-change` 作为主要归档路径。当 `state.archive.ok === false` 时，它 SHALL NOT 允许 agent 直接调用 OpenSpec CLI、手动移动 archive 文件或绕过 `archive-change`。

当 `archive-change` 返回 `state.archive.ok === true`、`state.workspace.ok === false` 且 `state.workspace.recovery.required === "agent"` 时，archive system-reminder SHALL 允许 agent 基于返回的恢复状态执行完成 workspace finalization 所需的受限 git 恢复命令。

agent SHALL 报告：

- OpenSpec archive 已成功
- 失败的 workspace step
- 已完成的 `state.workspace.gitOps`
- 恢复类型与剩余步骤
- 运行后续命令前的 dirty workspace 或冲突风险
- 最终 archive 位置、finalization 状态与使用的 commit message

#### Scenario: agent 不绕过失败的 archive

- **WHEN** `archive-change` 返回 `state.archive.ok === false`
- **THEN** archive ACP session SHALL NOT 手动移动文件
- **AND** archive ACP session SHALL NOT 运行 git finalization commands
- **AND** archive ACP session SHALL 报告 archive error 或 conflict

#### Scenario: workspace 失败且需要恢复时 agent 继续收尾

- **WHEN** `archive-change` 返回 `state.archive.ok === true`
- **AND** `state.workspace.ok === false`
- **AND** `state.workspace.recovery.required === "agent"`
- **THEN** archive ACP session MAY 运行从 `state.workspace.recovery` 派生的受限 git 恢复命令
- **AND** archive ACP session SHALL NOT 重新运行 OpenSpec archive
- **AND** 当恢复条件已解决时，archive ACP session SHALL 继续执行 fast-forward merge、worktree cleanup 与 branch deletion

#### Scenario: archive commit message 反映变更文件

- **WHEN** archive ACP session 为 `archive-change` 准备 `commitMessage`
- **THEN** 第一行 SHALL 匹配 `type(scope): summary`
- **AND** summary SHALL 描述已归档 change 或受影响 capability，而不只是重复 `archive <changeName>`
- **AND** 可选正文 bullet SHALL 基于已检查的变更文件、已同步 specs、已归档 artifacts 或 `state.archive.archiveRawOutput`
