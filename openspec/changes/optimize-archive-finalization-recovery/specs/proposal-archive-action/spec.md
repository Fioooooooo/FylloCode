## MODIFIED Requirements

### Requirement: Archive completes 4-step git cleanup when worktreePath is non-empty

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
- **AND** archive ACP session SHALL report the failed step and recovery context
- **AND** archive ACP session MAY run the limited git recovery commands needed to resolve or continue rebase, retry fast-forward merge, remove the worktree, and delete the branch

#### Scenario: dirty workspace 时 agent 接手前必须保护现场

- **WHEN** archive ACP session 运行在 linked worktree
- **AND** OpenSpec archive 成功
- **AND** `merge-to-main` 失败后 tool 检测到 main workspace 或 linked worktree dirty
- **THEN** `archive-change` 返回 `state.workspace.recovery.required === "agent"`
- **AND** archive ACP session SHALL report that automatic recovery stopped because the workspace is dirty
- **AND** archive ACP session SHALL NOT run rebase or cleanup until it has protected or resolved the dirty workspace state

#### Scenario: invalid commit message 阻止 archive

- **WHEN** agent 调用 `archive-change`，传入 `confirm: true` 与非法 `commitMessage`
- **THEN** `archive-change` 返回失败 state
- **AND** OpenSpec archive 未执行
- **AND** workspace git finalization 未执行
- **AND** archive ACP session 报告必需的 `type(scope): summary` 格式

### Requirement: Archive skips git cleanup when worktreePath is empty

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

### Requirement: Archive system-reminder allows bounded agent recovery after tool finalization failure

archive system-reminder SHALL continue to require `mcp__fyllo_specs__archive-change` as the primary archive path. It SHALL NOT allow agent to invoke the OpenSpec CLI directly, manually move archive files, or bypass `archive-change` when `state.archive.ok === false`.

When `archive-change` returns `state.archive.ok === true`, `state.workspace.ok === false`, and `state.workspace.recovery.required === "agent"`, archive system-reminder SHALL allow the agent to execute bounded git recovery commands needed to finish workspace finalization from the returned recovery state.

The agent SHALL report:

- that OpenSpec archive already succeeded
- the failed workspace step
- completed `state.workspace.gitOps`
- the recovery kind and remaining steps
- any dirty workspace or conflict risk before running further commands
- final archive location, finalization status, and commit message used

#### Scenario: agent does not bypass failed archive

- **WHEN** `archive-change` returns `state.archive.ok === false`
- **THEN** archive ACP session SHALL NOT move files manually
- **AND** archive ACP session SHALL NOT run git finalization commands
- **AND** archive ACP session SHALL report the archive error or conflict

#### Scenario: agent continues after recovery-required workspace failure

- **WHEN** `archive-change` returns `state.archive.ok === true`
- **AND** `state.workspace.ok === false`
- **AND** `state.workspace.recovery.required === "agent"`
- **THEN** archive ACP session MAY run bounded git recovery commands derived from `state.workspace.recovery`
- **AND** archive ACP session SHALL NOT rerun OpenSpec archive
- **AND** archive ACP session SHALL continue toward fast-forward merge, worktree cleanup, and branch deletion when the recovery conditions are resolved

#### Scenario: archive commit message reflects changed files

- **WHEN** archive ACP session prepares `commitMessage` for `archive-change`
- **THEN** the first line SHALL match `type(scope): summary`
- **AND** the summary SHALL describe the archived change or affected capability, not merely repeat `archive <changeName>`
- **AND** optional body bullets SHALL be based on inspected changed files, synced specs, archived artifacts, or `state.archive.archiveRawOutput`
