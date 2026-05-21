## MODIFIED Requirements

### Requirement: archive-change tool 返回 state 并执行归档动作

`archive-change` tool SHALL 接收参数 `{ changeName: string, targetPath: string, confirm?: boolean, commitMessage?: string, includeInstruction?: boolean }`。`targetPath` 必填，校验规则参见「所有 tool 入参必填 targetPath 并校验合法性」Requirement。tool 内部 projectRoot SHALL 取自 `path.resolve(input.targetPath)`。

默认（`confirm !== true`）SHALL 仅返回归档 preview 状态，不移动任何文件，不要求 `commitMessage`，不执行任何 git 操作。

当 `confirm === true` 时：

- `commitMessage` SHALL 必填。
- `commitMessage` 的第一行 SHALL 匹配 `type(scope): summary` 格式。
- tool SHALL 先执行 OpenSpec archive；OpenSpec archive 失败或冲突时 SHALL 不执行任何 git 操作。
- OpenSpec archive 成功后，tool SHALL 执行 workspace git finalization，并按步骤返回结果。
- 若 workspace finalization 遇到 linked worktree `merge-to-main` fast-forward 失败，且 main workspace 与 linked worktree 均为 clean、proposal branch 存在、失败属于普通非快进分叉，tool SHALL 自动 rebase proposal worktree 到当前 main branch，重试 fast-forward merge，并在成功后继续 cleanup。
- 若自动恢复不安全或恢复过程中发生冲突，tool SHALL 停止后续 cleanup，返回结构化 recovery state，让 agent 从该中间态接手 workspace finalization。

返回 state SHALL 采用分层结构：

```ts
{
  changeName: string;
  status: "done" | "failed";
  archive: {
    ok: boolean;
    archiveTarget: string | null;
    archiveRawOutput: string | null;
    conflicts: string[];
    incompleteTasks: number;
    error?: {
      code: string;
      message: string;
      retryHint: string;
    };
  };
  workspace: {
    mode: "main" | "linked";
    path: string;
    ok: boolean;
    gitOps: {
      step:
        | "commit"
        | "merge-to-main"
        | "rebase-onto-main"
        | "merge-to-main-retry"
        | "worktree-remove"
        | "branch-delete";
      cwd: string;
      command: string;
      exitCode: number | null;
      stdout: string;
      stderr: string;
      ok: boolean;
      outcome?: "created" | "noop" | "failed";
    }[];
    failedStep:
      | "commit"
      | "merge-to-main"
      | "rebase-onto-main"
      | "merge-to-main-retry"
      | "worktree-remove"
      | "branch-delete"
      | null;
    recovery?: {
      required: "none" | "agent";
      kind:
        | "none"
        | "rebase-conflict"
        | "dirty-workspace"
        | "missing-branch"
        | "unknown-git-error";
      mainPath: string;
      workspacePath: string;
      mainBranch: string | null;
      proposalBranch: string;
      completedSteps: string[];
      remainingSteps: string[];
      instructions: string[];
    };
    error?: {
      code: string;
      message: string;
      retryHint: string;
    };
  };
}
```

`workspace.mode` SHALL 根据 `targetPath` 推导：

- 若 `targetPath` resolve 后等于 `FYLLO_PROJECT_PATH`，mode 为 `"main"`。
- 若 `targetPath` 是 `FYLLO_PROJECT_PATH` 下已注册的 linked worktree，mode 为 `"linked"`。

#### Scenario: preview 模式不要求 commitMessage

- **WHEN** 调用 `archive-change` 传入存在的 `changeName`、合法 `targetPath`、且不传 `confirm`
- **THEN** 返回 state 中包含 `archive.archiveTarget`
- **AND** `archive.archiveRawOutput === null`
- **AND** `workspace.gitOps` 为空数组
- **AND** 不校验 `commitMessage`
- **AND** 磁盘上该 change 目录位置不变

#### Scenario: OpenSpec archive 失败时不执行 git ops

- **WHEN** 调用 `archive-change` 传入合法 `targetPath`、`confirm: true`、合法 `commitMessage`
- **AND** OpenSpec archive 目标路径冲突或 CLI 失败
- **THEN** `state.status === "failed"`
- **AND** `state.archive.ok === false`
- **AND** `state.archive.error` 存在
- **AND** `state.workspace.gitOps` 为空数组
- **AND** tool 不执行 git commit / merge / rebase / worktree remove / branch delete

#### Scenario: main workspace archive commit 有 diff

- **WHEN** 调用 `archive-change` 传入 `targetPath === FYLLO_PROJECT_PATH`、`confirm: true`、合法 `commitMessage`
- **AND** OpenSpec archive 成功
- **AND** workspace 存在待提交 diff
- **THEN** tool 执行 git commit step
- **AND** `state.workspace.mode === "main"`
- **AND** `state.workspace.gitOps` 仅包含 `step === "commit"` 的结果
- **AND** commit op `outcome === "created"`
- **AND** 不执行 `merge-to-main` / `rebase-onto-main` / `merge-to-main-retry` / `worktree-remove` / `branch-delete`

#### Scenario: main workspace archive commit 无 diff 时成功 no-op

- **WHEN** 调用 `archive-change` 传入 `targetPath === FYLLO_PROJECT_PATH`、`confirm: true`、合法 `commitMessage`
- **AND** OpenSpec archive 成功
- **AND** `git add -A` 后没有可提交 diff
- **THEN** `state.status === "done"`
- **AND** `state.workspace.mode === "main"`
- **AND** `state.workspace.gitOps` 仅包含 `step === "commit"` 的结果
- **AND** commit op `ok === true`
- **AND** commit op `outcome === "noop"`
- **AND** 不把 `nothing to commit` 视为 archive failure

#### Scenario: linked workspace archive 直接完成全部 git steps

- **WHEN** 调用 `archive-change` 传入 registered linked worktree `targetPath`、`confirm: true`、合法 `commitMessage`
- **AND** OpenSpec archive 成功
- **AND** main 可以直接 fast-forward 到 proposal branch
- **THEN** tool 按固定顺序执行 `commit`、`merge-to-main`、`worktree-remove`、`branch-delete`
- **AND** `state.workspace.gitOps` 按执行顺序记录每一步的 `cwd`、`command`、`exitCode`、`stdout`、`stderr`、`ok`
- **AND** 全部成功时 `state.status === "done"`、`state.workspace.ok === true`、`state.workspace.failedStep === null`
- **AND** `state.workspace.recovery.required === "none"`

#### Scenario: linked workspace merge 失败后自动 rebase 并完成 cleanup

- **WHEN** linked workspace archive 的首次 `merge-to-main` 因非 fast-forward 失败
- **AND** `state.archive.ok === true`
- **AND** main workspace 与 linked worktree 均为 clean
- **AND** proposal branch 存在且 linked worktree 没有进行中的 rebase
- **THEN** tool 执行 `rebase-onto-main`
- **AND** rebase 成功后执行 `merge-to-main-retry`
- **AND** retry merge 成功后继续执行 `worktree-remove` 与 `branch-delete`
- **AND** `state.workspace.gitOps` 按顺序包含 `commit`、失败的 `merge-to-main`、成功的 `rebase-onto-main`、成功的 `merge-to-main-retry`、`worktree-remove`、`branch-delete`
- **AND** `state.status === "done"`
- **AND** `state.workspace.ok === true`
- **AND** `state.workspace.failedStep === null`
- **AND** `state.workspace.recovery.required === "none"`

#### Scenario: linked workspace rebase 冲突时要求 agent 接手

- **WHEN** linked workspace archive 的首次 `merge-to-main` 因非 fast-forward 失败
- **AND** tool 尝试 `rebase-onto-main`
- **AND** rebase 因内容冲突失败
- **THEN** `state.status === "failed"`
- **AND** `state.archive.ok === true`
- **AND** `state.workspace.ok === false`
- **AND** `state.workspace.failedStep === "rebase-onto-main"`
- **AND** `state.workspace.gitOps` 包含成功的 `commit`、失败的 `merge-to-main`、失败的 `rebase-onto-main`
- **AND** `state.workspace.gitOps` 不包含 `merge-to-main-retry`、`worktree-remove` 或 `branch-delete`
- **AND** `state.workspace.recovery.required === "agent"`
- **AND** `state.workspace.recovery.kind === "rebase-conflict"`
- **AND** `state.workspace.recovery.remainingSteps` 包含解决 rebase、重试 fast-forward merge、移除 worktree、删除 proposal branch

#### Scenario: linked workspace dirty 时不自动 rebase

- **WHEN** linked workspace archive 的首次 `merge-to-main` 因非 fast-forward 失败
- **AND** main workspace 或 linked worktree 存在未提交变更
- **THEN** tool 不执行 `rebase-onto-main`
- **AND** `state.status === "failed"`
- **AND** `state.archive.ok === true`
- **AND** `state.workspace.ok === false`
- **AND** `state.workspace.failedStep === "merge-to-main"`
- **AND** `state.workspace.recovery.required === "agent"`
- **AND** `state.workspace.recovery.kind === "dirty-workspace"`
- **AND** `state.workspace.error.retryHint` 指示 agent 先保护并清理 dirty workspace 后再继续 finalization

#### Scenario: 非法 commit message 阻止 archive

- **WHEN** 调用 `archive-change` 传入 `confirm: true` 且 `commitMessage` 第一行不匹配 `type(scope): summary`
- **THEN** `state.status === "failed"`
- **AND** `state.archive.ok === false`
- **AND** `state.workspace.gitOps` 为空数组
- **AND** state errors 或 `archive.error` 明确说明 commit message 格式错误

### Requirement: runtime-workspace 封装 git 工作区操作

系统 SHALL 在 `mcp-servers/fyllo-specs/src/runtime-workspace/` 提供内部适配层，负责所有 git worktree 与 archive finalization 操作。

`runtime-workspace` SHALL 向 tool 层或 workflow 编排层暴露以下能力：

- `prepareProposalWorkspace(input: { mainProjectPath: string; changeName: string; workspaceMode: "linked" | "main" }): Promise<{ workspace: { mode: "linked" | "main"; path: string }; warnings: string[] }>`
- `finalizeArchiveWorkspace(input: { mainProjectPath: string; workspacePath: string; changeName: string; commitMessage: string }): Promise<{ mode: "linked" | "main"; path: string; ok: boolean; gitOps: ArchiveGitOpResult[]; failedStep: ArchiveGitStep | null; recovery?: ArchiveWorkspaceRecovery; error?: WorkspaceRuntimeError }>`

`runtime-workspace` SHALL 负责直接调用 git 子进程完成：

- 检查 `mainProjectPath` 是否为 git repo
- 按需维护 `.worktrees/` ignore 规则
- 创建 linked worktree
- git commit 或 no-op commit
- `git merge --ff-only`
- `git rebase <mainBranch>` for safe linked archive recovery
- `git worktree remove`
- `git branch -d`

`runtime-openspec` SHALL NOT import `runtime-workspace`，`runtime-workspace` SHALL NOT import `runtime-openspec`。两者只能在 tool handler 或很薄的 workflow module 中组合。

#### Scenario: runtime 模块保持分层隔离

- **WHEN** 检查 `mcp-servers/fyllo-specs/src/runtime-openspec/` 下的 imports
- **THEN** 没有文件 import `../runtime-workspace`
- **AND** 没有文件执行 `git worktree add`、`git merge`、`git rebase`、`git worktree remove` 或 `git branch -d`

#### Scenario: tool 层组合 runtimes

- **WHEN** 检查 `mcp-servers/fyllo-specs/src/tools/create-proposal.ts`
- **THEN** 它先使用 `runtime-workspace` 解析 workspace，再调用 `runtime-openspec#createChange`
- **AND** 它将 `workspace.path` 传给 OpenSpec runtime calls

#### Scenario: archive tool 先 archive 再执行 workspace finalization

- **WHEN** 检查 `mcp-servers/fyllo-specs/src/tools/archive-change.ts`
- **THEN** 它先调用 `runtime-openspec#archiveChange`，再调用 `runtime-workspace#finalizeArchiveWorkspace`
- **AND** 当 OpenSpec archive 失败时，不调用 workspace finalization
