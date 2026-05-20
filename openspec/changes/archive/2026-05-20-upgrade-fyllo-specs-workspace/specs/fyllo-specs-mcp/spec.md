## MODIFIED Requirements

### Requirement: create-proposal tool 返回 state

`create-proposal` tool SHALL 接收参数 `{ changeName: string, targetPath: string, workspaceMode?: "linked" | "main", includeInstruction?: boolean }`。`targetPath` 必填且 SHALL 表示主仓库路径；校验规则参见「所有 tool 入参必填 targetPath 并校验合法性」Requirement。`workspaceMode` 省略时 SHALL 默认为 `"linked"`，且仅影响本次调用，不持久化为项目级偏好。

tool SHALL 在执行 OpenSpec 创建前解析本次工作区：

- 当 `workspaceMode === "main"` 时，`workspace.path === path.resolve(input.targetPath)`，tool SHALL NOT 创建 linked worktree。
- 当 `workspaceMode === "linked"` 且 `targetPath` 是 git 项目时，tool SHALL 创建或复用 `<targetPath>/.worktrees/<changeName>` 作为 git linked worktree，并将 `workspace.path` 设为该绝对路径。
- 当 `workspaceMode === "linked"` 但 `targetPath` 不是 git 项目时，tool SHALL fallback 到 main workspace，返回 `workspace.mode === "main"` 与 `workspace.path === path.resolve(input.targetPath)`，并在 state warnings 中说明 non-git fallback。

tool 内部 projectRoot SHALL 取自 `workspace.path`，并在该路径下调用 `openspec-runtime#createChange(projectRoot, changeName)` 创建目录并写入初始 `.openspec.yaml { schema, status: "creating" }`。

返回 state 至少包含：

| 字段            | 类型                                                                | 说明                                                     |
| --------------- | ------------------------------------------------------------------- | -------------------------------------------------------- |
| `changeName`    | string                                                              | 当前目标 change                                          |
| `workspace`     | `{ mode: "linked" \| "main"; path: string }`                        | 本次 change artifacts 后续应读写的工作目录               |
| `schemaName`    | string                                                              | 如 `spec-driven`                                         |
| `applyRequires` | `string[]`                                                          | schema 定义的 apply 前置 artifacts                       |
| `artifacts`     | `{ id, status, outputPath, dependencies, template, instruction }[]` | 每个 artifact 的当前状态与创建所需的模板与指令           |
| `nextArtifact`  | string \| null                                                      | 下一个应被创建的 artifact id                             |
| `warnings`      | `string[]`                                                          | 非阻塞说明，例如 non-git fallback 或已存在 worktree 复用 |

#### Scenario: linked 模式创建 worktree 并返回 workspace

- **WHEN** 调用 `create-proposal` 传入不存在的 `changeName`、合法 git 项目 `targetPath`、且 `workspaceMode` 省略
- **THEN** tool 创建 `<targetPath>/.worktrees/<changeName>` linked worktree
- **AND** 在 `<targetPath>/.worktrees/<changeName>/openspec/changes/<changeName>/` 创建 OpenSpec change
- **AND** 返回 `state.workspace.mode === "linked"`
- **AND** 返回 `state.workspace.path === path.resolve(<targetPath>/.worktrees/<changeName>)`
- **AND** 返回 state 中 `changeName === <changeName>`

#### Scenario: main 模式直接在主仓库创建 proposal

- **WHEN** 调用 `create-proposal` 传入不存在的 `changeName`、合法 `targetPath`、且 `workspaceMode: "main"`
- **THEN** tool 不调用 `git worktree add`
- **AND** 在 `<targetPath>/openspec/changes/<changeName>/` 创建 OpenSpec change
- **AND** 返回 `state.workspace.mode === "main"`
- **AND** 返回 `state.workspace.path === path.resolve(<targetPath>)`

#### Scenario: agent 使用 workspace.path 填写 artifacts

- **WHEN** `create-proposal` 返回 state
- **THEN** tool instruction SHALL 指示 agent 在 `state.workspace.path` 下读取和修改 proposal artifacts
- **AND** 当 `workspace.path` 存在时，instruction SHALL NOT 让 agent 从 `targetPath` 自行推导 artifact 路径

#### Scenario: non-git linked fallback

- **WHEN** 调用 `create-proposal` 传入 non-git 项目 `targetPath` 且 `workspaceMode` 省略
- **THEN** tool 不尝试创建 linked worktree
- **AND** 返回 `state.workspace.mode === "main"`
- **AND** 返回 `state.workspace.path === path.resolve(targetPath)`
- **AND** `state.warnings` 包含 non-git fallback 说明

### Requirement: archive-change tool 返回 state 并执行归档动作

`archive-change` tool SHALL 接收参数 `{ changeName: string, targetPath: string, confirm?: boolean, commitMessage?: string, includeInstruction?: boolean }`。`targetPath` 必填，校验规则参见「所有 tool 入参必填 targetPath 并校验合法性」Requirement。tool 内部 projectRoot SHALL 取自 `path.resolve(input.targetPath)`。

默认（`confirm !== true`）SHALL 仅返回归档 preview 状态，不移动任何文件，不要求 `commitMessage`，不执行任何 git 操作。

当 `confirm === true` 时：

- `commitMessage` SHALL 必填。
- `commitMessage` 的第一行 SHALL 匹配 `type(scope): summary` 格式。
- tool SHALL 先执行 OpenSpec archive；OpenSpec archive 失败或冲突时 SHALL 不执行任何 git 操作。
- OpenSpec archive 成功后，tool SHALL 执行 workspace git finalization，并按步骤返回结果。

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
      step: "commit" | "merge-to-main" | "worktree-remove" | "branch-delete";
      cwd: string;
      command: string;
      exitCode: number | null;
      stdout: string;
      stderr: string;
      ok: boolean;
    }[];
    failedStep: "commit" | "merge-to-main" | "worktree-remove" | "branch-delete" | null;
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
- **AND** tool 不执行 git commit / merge / worktree remove / branch delete

#### Scenario: main workspace archive 只执行 commit

- **WHEN** 调用 `archive-change` 传入 `targetPath === FYLLO_PROJECT_PATH`、`confirm: true`、合法 `commitMessage`
- **AND** OpenSpec archive 成功
- **THEN** tool 执行 git commit step
- **AND** `state.workspace.mode === "main"`
- **AND** `state.workspace.gitOps` 仅包含 `step === "commit"` 的结果
- **AND** 不执行 `merge-to-main` / `worktree-remove` / `branch-delete`

#### Scenario: linked workspace archive 执行四步链

- **WHEN** 调用 `archive-change` 传入 registered linked worktree `targetPath`、`confirm: true`、合法 `commitMessage`
- **AND** OpenSpec archive 成功
- **THEN** tool 按固定顺序执行 `commit`、`merge-to-main`、`worktree-remove`、`branch-delete`
- **AND** `state.workspace.gitOps` 按执行顺序记录每一步的 `cwd`、`command`、`exitCode`、`stdout`、`stderr`、`ok`
- **AND** 全部成功时 `state.status === "done"`、`state.workspace.ok === true`、`state.workspace.failedStep === null`

#### Scenario: linked workspace git 失败时短路后续步骤

- **WHEN** linked workspace archive 的 `merge-to-main` step 失败
- **THEN** `state.status === "failed"`
- **AND** `state.archive.ok === true`
- **AND** `state.workspace.ok === false`
- **AND** `state.workspace.failedStep === "merge-to-main"`
- **AND** `state.workspace.gitOps` 包含成功的 `commit` step 和失败的 `merge-to-main` step
- **AND** `state.workspace.gitOps` 不包含 `worktree-remove` 或 `branch-delete`
- **AND** `state.workspace.error.retryHint` 提供合适的恢复提示

#### Scenario: 非法 commit message 作为 workspace 错误返回

- **WHEN** 调用 `archive-change` 传入 `confirm: true` 且 `commitMessage` 第一行不匹配 `type(scope): summary`
- **THEN** `state.status === "failed"`
- **AND** `state.archive.ok === false`
- **AND** `state.workspace.gitOps` 为空数组
- **AND** state errors 或 `archive.error` 明确说明 commit message 格式错误

## ADDED Requirements

### Requirement: workspace-runtime 封装 git 工作区操作

系统 SHALL 在 `mcp-servers/fyllo-specs/src/workspace-runtime/` 提供内部适配层，负责所有 git worktree 与 archive finalization 操作。

`workspace-runtime` SHALL 向 tool 层或 workflow 编排层暴露以下能力：

- `prepareProposalWorkspace(input: { mainProjectPath: string; changeName: string; workspaceMode: "linked" | "main" }): Promise<{ workspace: { mode: "linked" | "main"; path: string }; warnings: string[] }>`
- `finalizeArchiveWorkspace(input: { mainProjectPath: string; workspacePath: string; changeName: string; commitMessage: string }): Promise<{ mode: "linked" | "main"; path: string; ok: boolean; gitOps: ArchiveGitOpResult[]; failedStep: ArchiveGitStep | null; error?: WorkspaceRuntimeError }>`

`workspace-runtime` SHALL 负责直接调用 git 子进程完成：

- 检查 `mainProjectPath` 是否为 git repo
- 按需维护 `.worktrees/` ignore 规则
- 创建 linked worktree
- git commit
- `git merge --ff-only`
- `git worktree remove`
- `git branch -d`

`openspec-runtime` SHALL NOT import `workspace-runtime`，`workspace-runtime` SHALL NOT import `openspec-runtime`。两者只能在 tool handler 或很薄的 workflow module 中组合。

#### Scenario: runtime 模块保持分层隔离

- **WHEN** 检查 `mcp-servers/fyllo-specs/src/openspec-runtime/` 下的 imports
- **THEN** 没有文件 import `../workspace-runtime`
- **AND** 没有文件执行 `git worktree add`、`git merge`、`git worktree remove` 或 `git branch -d`

#### Scenario: tool 层组合 runtimes

- **WHEN** 检查 `mcp-servers/fyllo-specs/src/tools/create-proposal.ts`
- **THEN** 它先使用 `workspace-runtime` 解析 workspace，再调用 `openspec-runtime#createChange`
- **AND** 它将 `workspace.path` 传给 OpenSpec runtime calls

#### Scenario: archive tool 先 archive 再执行 workspace finalization

- **WHEN** 检查 `mcp-servers/fyllo-specs/src/tools/archive-change.ts`
- **THEN** 它先调用 `openspec-runtime#archiveChange`，再调用 `workspace-runtime#finalizeArchiveWorkspace`
- **AND** 当 OpenSpec archive 失败时，不调用 workspace finalization
