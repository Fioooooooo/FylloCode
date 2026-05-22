# fyllo-specs-mcp Specification

## Purpose

定义 `fyllo-specs` MCP server 的四个 tool（explore / create-proposal / apply-change / archive-change）的输入 schema、返回结构、prompt 独立文件约定，以及底层 runtime-openspec / runtime-workspace 适配层的职责边界与错误归一化行为。

## Requirements

### Requirement: MCP server 注册四个 tool

`fyllo-specs` MCP server SHALL 通过 `@modelcontextprotocol/sdk` 注册且仅注册以下四个 tool，tool name 与 skill 语义一一对应：

| Tool name         | 对应 skill             | 作用                                                        |
| ----------------- | ---------------------- | ----------------------------------------------------------- |
| `explore`         | `openspec-explore`     | 进入探索模式，帮助用户思考问题或调研代码                    |
| `create-proposal` | `fyllo-propose`        | 创建 change 并生成 proposal / design / specs / tasks 四件套 |
| `apply-change`    | `fyllo-apply-change`   | 读取指定 change 的 artifacts，按 tasks 推进实现             |
| `archive-change`  | `fyllo-archive-change` | 完成归档动作，将 change 目录移入 archive                    |

#### Scenario: tool 列表

- **WHEN** MCP client 调用 `tools/list`
- **THEN** 返回数组长度等于 4
- **AND** tool name 精确为 `explore`、`create-proposal`、`apply-change`、`archive-change`

### Requirement: tool prompt 正文以独立 md 文件维护

每个 tool 的 prompt 正文 SHALL 存放在 `mcp-servers/fyllo-specs/src/tools/instructions/<tool-name>.md`。TypeScript 代码 SHALL 不内嵌 prompt 文本 literal，只通过统一的 `loadPrompt(id)` 读取。构建阶段 SHALL 通过 esbuild `text` loader 将 md 内容内联进产物，最终产物为单文件 JS，无外部资源依赖。

#### Scenario: 四个 prompt md 文件存在

- **WHEN** 检查 `mcp-servers/fyllo-specs/src/tools/instructions/`
- **THEN** 存在且仅存在 `explore.md`、`create-proposal.md`、`apply-change.md`、`archive-change.md` 四个文件

#### Scenario: 代码不内嵌 prompt literal

- **WHEN** 在 `mcp-servers/fyllo-specs/src/tools/` 下搜索"Enter explore mode"、"Propose a new change" 等 prompt 开头短语
- **THEN** 不存在 TypeScript 文件包含这些 literal
- **AND** 所有 prompt 内容经由 `loadPrompt(id)` 动态加载

### Requirement: tool 响应为 prompt + state 双段文本

每个 tool 的响应 SHALL 为 `content: [{ type: "text", text }]` 结构，其中 `text` 默认包含两段 XML 样式标记：`<tool_instruction>...</tool_instruction>` 承载 prompt md 原文；`<state>...</state>` 承载 JSON 序列化的工作区 state。`state` 的 schema 由 tool 决定。

当传入 `includeInstruction: false` 时，响应 SHALL 仅返回 JSON 序列化的 state，不包装 `<tool_instruction>` 与 `<state>` 标签。此选项供已熟悉工作流的 agent 节省 token。

#### Scenario: 响应结构

- **WHEN** MCP client 调用任一 tool
- **AND** 调用成功
- **THEN** 响应 `content[0].type === "text"`
- **AND** 返回文本同时包含 `<tool_instruction>` 与 `<state>` 两段
- **AND** `<state>` 标签内为合法 JSON

#### Scenario: 省略 instruction 节省 token

- **WHEN** MCP client 调用任一 tool 且传入 `includeInstruction: false`
- **THEN** 响应 `content[0].type === "text"`
- **AND** 返回文本为合法 JSON，不包含 `<tool_instruction>` 与 `<state>` 标签
- **AND** JSON 内容等价于同参数 `includeInstruction: true` 时 `<state>` 标签内的内容

### Requirement: explore tool 返回 state

`explore` tool 接收参数 `{ changeName?: string, targetPath: string, includeInstruction?: boolean }`。`targetPath` 必填，校验规则参见「所有 tool 入参必填 targetPath 并校验合法性」Requirement。tool 内部 projectRoot SHALL 取自 `path.resolve(input.targetPath)`。

`explore` SHALL 只读，不得修改 proposal 文件、`.openspec.yaml` 状态或任何生命周期阶段。

返回 state 至少包含：

| 字段            | 类型                         | 说明                                                          |
| --------------- | ---------------------------- | ------------------------------------------------------------- |
| `projectRoot`   | string                       | 等于 `path.resolve(input.targetPath)`                         |
| `schemaName`    | string                       | 当前 `openspec/config.yaml` 的 schema（如 `spec-driven`）     |
| `activeChanges` | `{ name, status, schema }[]` | `<projectRoot>/openspec/changes/` 下非 archive 的 change 列表 |
| `currentChange` | object \| null               | 若入参或上下文命中某 change，返回其 artifact 完成状态         |

#### Scenario: 无入参列出 active changes

- **WHEN** 调用 `explore` 不传 `changeName`、传入 `targetPath` 为 main repo
- **THEN** `state.activeChanges` 为当前 `<targetPath>/openspec/changes/*`（排除 `archive/`）的列表
- **AND** `state.currentChange` 为 `null`
- **AND** `state.projectRoot === path.resolve(input.targetPath)`

#### Scenario: 传入 changeName 命中已有 change

- **WHEN** 调用 `explore` 传入存在的 `changeName`、传入合法 `targetPath`
- **THEN** `state.currentChange.artifacts` 列出该 change 各 artifact 的状态
- **AND** state 中所有路径均基于 `path.resolve(input.targetPath)`

### Requirement: create-proposal tool 返回 state

`create-proposal` tool SHALL 接收参数 `{ changeName: string, targetPath: string, workspaceMode?: "linked" | "main", includeInstruction?: boolean }`。`targetPath` 必填且 SHALL 表示主仓库路径；校验规则参见「所有 tool 入参必填 targetPath 并校验合法性」Requirement。`workspaceMode` 省略时 SHALL 默认为 `"linked"`，且仅影响本次调用，不持久化为项目级偏好。

tool SHALL 在执行 OpenSpec 创建前解析本次工作区：

- 当 `workspaceMode === "main"` 时，`workspace.path === path.resolve(input.targetPath)`，tool SHALL NOT 创建 linked worktree。
- 当 `workspaceMode === "linked"` 且 `targetPath` 是 git 项目时，tool SHALL 创建或复用 `<targetPath>/.worktrees/<changeName>` 作为 git linked worktree，并将 `workspace.path` 设为该绝对路径。
- 当 `workspaceMode === "linked"` 但 `targetPath` 不是 git 项目时，tool SHALL fallback 到 main workspace，返回 `workspace.mode === "main"` 与 `workspace.path === path.resolve(input.targetPath)`，并在 state warnings 中说明 non-git fallback。

tool 内部 projectRoot SHALL 取自 `workspace.path`，并在该路径下调用 `runtime-openspec#createChange(projectRoot, changeName)`。`runtime-openspec#createChange` SHALL 在执行 OpenSpec CLI `new change` 前确保该 `projectRoot` 已完成最小 OpenSpec 初始化，然后创建目录并写入初始 `.openspec.yaml { schema, status: "creating" }`。

在所有 required artifacts 完成后，`create-proposal` prompt SHALL 继续要求 agent 将同一 change 的 `.openspec.yaml` `status` 显式写回 `draft`，然后才结束创建工作流。

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

#### Scenario: creation workflow finalizes to draft

- **WHEN** agent 完成所有 required artifacts
- **THEN** prompt SHALL 要求写回同一 change 的 `.openspec.yaml`，将 `status` 设置为 `draft`
- **AND** 创建工作流仅在该写回完成后结束

#### Scenario: non-git linked fallback

- **WHEN** 调用 `create-proposal` 传入 non-git 项目 `targetPath` 且 `workspaceMode` 省略
- **THEN** tool 不尝试创建 linked worktree
- **AND** 返回 `state.workspace.mode === "main"`
- **AND** 返回 `state.workspace.path === path.resolve(targetPath)`
- **AND** `state.warnings` 包含 non-git fallback 说明

#### Scenario: create-proposal initializes missing OpenSpec project structure

- **WHEN** 调用 `create-proposal` 传入合法 `targetPath`
- **AND** 解析出的 `workspace.path` 下缺少 `openspec/changes/archive/`、`openspec/specs/` 或 `openspec/config.yaml`
- **THEN** `runtime-openspec#createChange` 在调用 OpenSpec CLI `new change` 前创建缺失的 `openspec/changes/archive/` 目录
- **AND** 创建缺失的 `openspec/specs/` 目录
- **AND** 当 `openspec/config.yaml` 缺失时写入默认 `schema: spec-driven` 配置模板，且模板的 `rules.tasks` 数组中包含默认的 guidelines-evaluation 英文规则
- **AND** 随后继续创建 `<workspace.path>/openspec/changes/<changeName>/`
- **AND** tool 返回正常 `create-proposal` state

#### Scenario: existing OpenSpec config is preserved

- **WHEN** 调用 `create-proposal` 传入合法 `targetPath`
- **AND** 解析出的 `workspace.path` 下已存在 `openspec/config.yaml`
- **AND** 文件文本中已包含默认 guidelines-evaluation 英文规则字面量
- **THEN** `runtime-openspec#createChange` SHALL NOT 覆盖或改写该文件内容
- **AND** 仍然创建缺失的 `openspec/changes/archive/` 与 `openspec/specs/` 目录
- **AND** 随后继续创建 `<workspace.path>/openspec/changes/<changeName>/`

#### Scenario: existing OpenSpec config is augmented with default guidelines rule

- **WHEN** 调用 `create-proposal` 传入合法 `targetPath`
- **AND** 解析出的 `workspace.path` 下已存在 `openspec/config.yaml`
- **AND** 文件文本中不包含默认 guidelines-evaluation 英文规则字面量
- **THEN** `runtime-openspec#createChange` SHALL 解析该文件，将默认规则字符串追加到 `rules.tasks` 数组（必要时创建 `rules` 与 `rules.tasks` 字段）
- **AND** SHALL 保留原文件中的其他 `rules` 条目、其他顶层字段（如 `schema`、`context`）
- **AND** SHALL 在 spawn OpenSpec CLI 前完成回写
- **AND** 仍然创建缺失的 `openspec/changes/archive/` 与 `openspec/specs/` 目录
- **AND** 随后继续创建 `<workspace.path>/openspec/changes/<changeName>/`

### Requirement: apply-change tool 返回 state

`apply-change` tool 接收参数 `{ changeName?: string, targetPath: string, includeInstruction?: boolean }`。`targetPath` 必填，校验规则参见「所有 tool 入参必填 targetPath 并校验合法性」Requirement。tool 内部 projectRoot SHALL 取自 `path.resolve(input.targetPath)`。

返回 state 至少包含：

| 字段           | 类型                                 | 说明                                                                                  |
| -------------- | ------------------------------------ | ------------------------------------------------------------------------------------- |
| `changeName`   | string                               | 目标 change（若未传入，为上下文中唯一的活跃 change；否则需在 prompt 指引 agent 选择） |
| `schemaName`   | string                               | 如 `spec-driven`                                                                      |
| `applyState`   | `"ready" \| "blocked" \| "all_done"` | apply 当前状态                                                                        |
| `contextFiles` | `Record<string, string[]>`           | artifact id → 绝对文件路径数组（基于 targetPath，供 agent Read）                      |
| `tasks`        | `{ line, text, done }[]`             | 解析自 `tasks.md` 的任务列表                                                          |
| `progress`     | `{ total, complete, remaining }`     | 任务进度摘要                                                                          |

tool 在 state 中一并更新 `<targetPath>/openspec/changes/<changeName>/.openspec.yaml` 的 `status: applying`（若原状态不是 `applying`）。

#### Scenario: contextFiles 路径基于 targetPath

- **WHEN** 调用 `apply-change` 传入合法 `targetPath`、存在的 `changeName`
- **THEN** `state.contextFiles` 中所有路径以 `path.resolve(input.targetPath)` 开头

#### Scenario: 全部 artifacts 已 done 时返回 all_done

- **WHEN** 调用 `apply-change` 指向一个 artifacts 全部 done 且 tasks 全部勾选的 change
- **THEN** `state.applyState === "all_done"`
- **AND** prompt 文本引导 agent 推荐 archive

#### Scenario: 有 artifact 未 done 时返回 blocked

- **WHEN** 调用 `apply-change` 指向仍有 artifact 处于 `ready` 或 `blocked` 的 change
- **THEN** `state.applyState === "blocked"`
- **AND** prompt 文本引导 agent 先补齐 artifact

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

### Requirement: runtime-openspec 适配层封装 CLI spawn

系统 SHALL 在 `mcp-servers/fyllo-specs/src/runtime-openspec/` 提供适配层，负责所有与 `@fission-ai/openspec` 的交互。适配层 SHALL 通过 spawn `@fission-ai/openspec` 随应用分发的 CLI（`bin/openspec.js`）并解析 `--json` stdout 实现 openspec 相关语义，SHALL 不以 `import`/`require` 形式引用 `@fission-ai/openspec` 的任何模块（因该包的 `package.json#exports` 未开放子路径；`dist/core/*` 属于内部实现不稳定）。

适配层对 tool 层暴露且仅暴露以下 5 个函数：

- `listChanges(projectRoot: string)`
- `computeStatus(projectRoot: string, changeName: string)`
- `getInstructions(projectRoot: string, changeName: string, artifactId: string)`
- `createChange(projectRoot: string, name: string)`
- `archiveChange(projectRoot: string, name: string, opts: { confirm?: boolean })`

`createChange(projectRoot, name)` SHALL 在 spawn OpenSpec CLI 前执行最小 OpenSpec 项目初始化检查。该检查 SHALL 确保：

- `<projectRoot>/openspec/changes/archive/` 存在；
- `<projectRoot>/openspec/specs/` 存在；
- `<projectRoot>/openspec/config.yaml` 存在；若不存在，写入默认 `schema: spec-driven` 配置模板，且该模板的 `rules.tasks` 数组中默认包含一条引导 agent 在生成 tasks.md 时评估本次 change 是否需要新增或修改 guidelines 文件的英文规则；若已存在，则在文件文本中检测该默认规则字面量，若未包含则解析-合并-回写以补齐 `rules.tasks`，若已包含则保持原文件字节不变。补齐时 SHALL 保留原文件中其他 `rules` 条目与其他顶层字段。

tool 层 SHALL 不直接 spawn CLI，也 SHALL 不直接 import `@fission-ai/openspec`；所有与 openspec 相关的行为 SHALL 经由 `import ... from "../runtime-openspec"`。

#### Scenario: tool 不直接引用 openspec

- **WHEN** 在 `mcp-servers/fyllo-specs/src/tools/` 任意文件中检查 import / require
- **THEN** 不存在 `from "@fission-ai/openspec"` 或 `from "@fission-ai/openspec/*"` 的 import
- **AND** 不存在直接调用 `child_process.spawn` / `execa` 启动 `openspec` 的代码
- **AND** 所有 openspec 语义经由 `import ... from "../runtime-openspec"`

#### Scenario: 适配层不以库形式 require openspec

- **WHEN** 在 `mcp-servers/fyllo-specs/src/runtime-openspec/` 下检查文件的 import / require
- **THEN** 不存在 `import ... from "@fission-ai/openspec"` 或 `require("@fission-ai/openspec/...")`
- **AND** 存在通过 `child_process.spawn`（或等价 API）启动 `bin/openspec.js` 的代码路径

#### Scenario: createChange initializes before spawning CLI

- **WHEN** `runtime-openspec#createChange(projectRoot, name)` 被调用
- **AND** `<projectRoot>/openspec/config.yaml` 不存在
- **THEN** runtime-openspec SHALL 在 spawn OpenSpec CLI 前写入默认 `config.yaml`
- **AND** 该默认 `config.yaml` 的 `rules.tasks` 数组包含默认的 guidelines-evaluation 英文规则
- **AND** 在 spawn OpenSpec CLI 前创建 `<projectRoot>/openspec/changes/archive/`
- **AND** 在 spawn OpenSpec CLI 前创建 `<projectRoot>/openspec/specs/`
- **AND** spawn OpenSpec CLI 创建 change

#### Scenario: createChange preserves existing config when default rule already present

- **WHEN** `runtime-openspec#createChange(projectRoot, name)` 被调用
- **AND** `<projectRoot>/openspec/config.yaml` 已存在且文件文本中包含默认 guidelines-evaluation 英文规则字面量
- **THEN** runtime-openspec SHALL NOT 覆盖该文件
- **AND** SHALL 在 spawn OpenSpec CLI 前补齐缺失目录
- **AND** spawn OpenSpec CLI 创建 change

#### Scenario: createChange augments existing config when default rule missing

- **WHEN** `runtime-openspec#createChange(projectRoot, name)` 被调用
- **AND** `<projectRoot>/openspec/config.yaml` 已存在但文件文本中不包含默认 guidelines-evaluation 英文规则字面量
- **THEN** runtime-openspec SHALL 解析该文件并将默认规则字符串追加到 `rules.tasks` 数组（必要时创建 `rules` 与 `rules.tasks` 字段）
- **AND** SHALL 保留原文件中其他 `rules` 条目与其他顶层字段（如 `schema`、`context`）
- **AND** SHALL 在 spawn OpenSpec CLI 前完成回写
- **AND** 在 spawn OpenSpec CLI 前补齐缺失的 `openspec/changes/archive/` 与 `openspec/specs/` 目录
- **AND** spawn OpenSpec CLI 创建 change

### Requirement: 禁用 openspec 遥测

MCP server SHALL 通过传递给子进程的 `env` 关闭 openspec 的 posthog 遥测。适配层 SHALL 在每次 spawn CLI 时合并以下 env 字段：`OPENSPEC_TELEMETRY=0`、`DO_NOT_TRACK=1`（二者均为 openspec README 文档化的遥测开关，并用以双保险）。MCP server 进程自身 SHALL 在任何代码运行前在入口处设置 `process.env.DO_NOT_TRACK = "1"`。

#### Scenario: spawn CLI 时环境变量齐备

- **WHEN** 适配层 spawn `openspec` CLI 子进程
- **THEN** 传入的 `env` 至少包含 `OPENSPEC_TELEMETRY=0` 与 `DO_NOT_TRACK=1` 两个键值

#### Scenario: MCP server 进程启动即无遥测

- **WHEN** fyllo-specs MCP server 进程启动并完成 stdio handshake
- **THEN** 不存在任何网络上报到外部遥测端点的行为

### Requirement: 错误内敛

MCP server SHALL 将所有 tool 执行的业务异常和 CLI 异常内敛到返回 state 的 `errors` 字段中，不再向外抛出 `McpError`。无论业务逻辑成功或失败，tool 响应 SHALL 始终包含完整的 skill prompt 与 state 双段文本。

返回 state 中的 `errors` 字段为数组，每个元素包含：

| 字段      | 类型   | 说明         |
| --------- | ------ | ------------ |
| `type`    | string | 错误类型标识 |
| `message` | string | 错误描述文本 |

工具层 SHALL 通过统一的 `runTool` 包装器实现错误内敛，确保 prompt 始终返回。`runTool` SHALL 在 catch 块中将异常转换为 `state.errors` 条目，并继续使用 `wrapState` 返回双段文本。

zod schema 校验失败（如入参类型错误）仍由 MCP SDK 在 `registerTool` 层面拦截并返回标准 `InvalidParams` 错误，这类错误不涉及 skill prompt 的丢失，SHALL 保持原行为不变。

#### Scenario: CLI 调用失败时返回错误 state

- **WHEN** 调用 `explore` 且 openspec CLI 执行失败（如 `OpenspecCliError`）
- **THEN** 响应仍包含 `<tool_instruction>` 与 `<state>` 两段
- **AND** `state.errors` 为包含 `{ type: "OpenspecCliError", message: ... }` 的非空数组

#### Scenario: 不存在的 change

- **WHEN** 调用 `apply-change` 传入不存在的 `changeName`
- **THEN** 响应包含 `<tool_instruction>` 与 `<state>` 两段
- **AND** `state.errors` 为包含 `{ type: "Error", message: "Change not found: ..." }` 的非空数组
- **AND** 响应 `isError` 为 `false`

#### Scenario: 目标冲突时拒绝归档

- **WHEN** 调用 `archive-change` 传入 `confirm: true`，目标路径已存在
- **THEN** `state.conflicts` 非空
- **AND** `state.errors` 为包含 `{ type: "Error", message: "Archive target exists: ..." }` 的非空数组
- **AND** 不执行任何移动
- **AND** 响应 `isError` 为 `false`

#### Scenario: 入参类型错误

- **WHEN** 调用 `create-proposal` 传入 `name: 123`（非字符串）
- **THEN** MCP SDK 拦截并返回 `isError: true`
- **AND** error code 等于 `InvalidParams`
- **AND** tool handler 不执行，不返回 skill prompt

#### Scenario: 超时错误内敛

- **WHEN** 调用任一 tool 且 openspec CLI 超时（`OpenspecTimeoutError`）
- **THEN** 响应仍包含 `<tool_instruction>` 与 `<state>` 两段
- **AND** `state.errors` 为包含 `{ type: "OpenspecTimeoutError", message: ... }` 的非空数组

### Requirement: 所有 tool 入参必填 targetPath 并校验合法性

`fyllo-specs` MCP 的 4 个 tool（`explore` / `create-proposal` / `apply-change` / `archive-change`）SHALL 全部把 `targetPath: string` 设为必填入参（zod schema 中无 `.optional()`、无 `.default(...)`）。

工具内部 SHALL 在执行任何 fs 副作用之前对 `targetPath` 进行合法性校验：

1. **绝对路径**：`path.isAbsolute(targetPath)` 必须为 `true`。
2. **是 main repo 的合法 worktree**：通过 `child_process.spawnSync("git", ["-C", FYLLO_PROJECT_PATH, "worktree", "list", "--porcelain"], { encoding: "utf8" })` 获取主仓库下所有已注册 worktree 的绝对路径集合（以 `worktree ` 开头的行后跟绝对路径）；`path.resolve(targetPath)` 必须出现在该集合中（main repo 自身在 `worktree list` 输出中亦算一条，因此 `targetPath === FYLLO_PROJECT_PATH` 总是合法）。
3. **non-git 项目兜底**：若 `git worktree list` 子进程退出码非 0（典型情况：`<FYLLO_PROJECT_PATH>/.git` 不存在，即 `template: "empty"` 项目），SHALL 退化为"`path.resolve(targetPath) === path.resolve(FYLLO_PROJECT_PATH)` 即合法"的旧规则。

校验失败时 tool SHALL：

- 不创建 change、不修改任何文件、不调用任何 git 子进程（除合法性校验本身的 `git worktree list`）。
- 在 `state.errors` 中追加 `{ type: "InvalidTargetPath", message }` 条目，message 中携带原始 `git worktree list --porcelain` stdout 供 agent 诊断。
- 仍然按 `runTool` 约定返回 `<tool_instruction>` + `<state>` 双段文本。

工具内部 projectRoot SHALL 取自 `path.resolve(input.targetPath)`，不再从 `resolveProjectRoot()`（`FYLLO_PROJECT_PATH` env）兜底。

#### Scenario: 4 个 tool 都拦截缺省 targetPath

- **WHEN** MCP client 调用 `explore` / `create-proposal` / `apply-change` / `archive-change` 任一，未传 `targetPath`
- **THEN** MCP SDK 在 zod schema 层拦截并返回 `isError: true`
- **AND** error code 等于 `InvalidParams`
- **AND** tool handler 不执行

#### Scenario: targetPath 为空字符串拦截

- **WHEN** MCP client 调用任一 tool 传入 `targetPath: ""`
- **THEN** zod schema 拦截（`.min(1)` 约束）并返回 `InvalidParams`
- **AND** tool handler 不执行

#### Scenario: targetPath 非绝对路径返回 InvalidTargetPath

- **WHEN** MCP client 调用任一 tool 传入相对路径如 `targetPath: "./.worktrees/foo"`
- **THEN** 响应仍含 `<tool_instruction>` 与 `<state>` 双段
- **AND** `state.errors` 包含 `{ type: "InvalidTargetPath", message }`
- **AND** message 文本说明 targetPath 必须是绝对路径
- **AND** 不调用 git 子进程
- **AND** 不修改任何文件

#### Scenario: targetPath 不在 worktree list 中返回 InvalidTargetPath

- **WHEN** 调用 `create-proposal` 传入 `targetPath: "/tmp/random-path"`
- **AND** `<FYLLO_PROJECT_PATH>/.git` 存在
- **AND** `/tmp/random-path` 不在 `git worktree list --porcelain` 输出中
- **THEN** `state.errors` 包含 `{ type: "InvalidTargetPath", message }`
- **AND** message 中包含 `git worktree list --porcelain` 的原始 stdout
- **AND** 不创建 change、不修改任何文件

#### Scenario: targetPath 等于 FYLLO_PROJECT_PATH 视为合法

- **WHEN** 调用任一 tool 传入 `targetPath` 等于 `FYLLO_PROJECT_PATH`（path.resolve 后）
- **AND** `<FYLLO_PROJECT_PATH>/.git` 存在
- **THEN** 视为合法（main repo 自身在 worktree list 中也是一条记录）
- **AND** 进入正常 tool 处理逻辑

#### Scenario: non-git 项目降级合法

- **WHEN** `<FYLLO_PROJECT_PATH>/.git` 不存在
- **AND** 调用任一 tool 传入 `targetPath` 等于 `FYLLO_PROJECT_PATH`
- **THEN** `git worktree list` spawn 退出码非 0
- **AND** 退化规则命中："targetPath === FYLLO_PROJECT_PATH 即合法"
- **AND** 进入正常 tool 处理逻辑

#### Scenario: non-git 项目传入其他路径仍 InvalidTargetPath

- **WHEN** `<FYLLO_PROJECT_PATH>/.git` 不存在
- **AND** 调用任一 tool 传入 `targetPath: "/tmp/elsewhere"`
- **THEN** `state.errors` 包含 `{ type: "InvalidTargetPath", message }`
- **AND** 不修改任何文件

#### Scenario: targetPath 路径规范化后比较

- **WHEN** 调用任一 tool 传入 `targetPath: <FYLLO_PROJECT_PATH> + "/"`（含 trailing slash）
- **THEN** 校验通过（path.resolve 剥离 trailing slash 后等于 main repo）

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

### Requirement: create-proposal must close creating state to draft

`create-proposal` tool SHALL keep `creating` as the initial intermediate state for a new change, but its prompt SHALL explicitly require the agent to update the corresponding `.openspec.yaml` `status` to `draft` after all required artifacts are complete. The agent SHALL perform that write-back inside the creation workflow and SHALL NOT depend on a second `create-proposal` invocation.

#### Scenario: proposal creation finishes

- **WHEN** the agent finishes all required artifacts for a change created through `create-proposal`
- **THEN** the agent writes `.openspec.yaml` with `status: draft` before stopping the creation workflow
- **AND** the resulting proposal can be treated as ready for implementation in proposal list and detail views

#### Scenario: creating is only transitional

- **WHEN** a proposal is still in `creating`
- **THEN** it SHALL NOT be treated as the final actionable state for implementation
- **AND** `create-proposal` prompt SHALL instruct the agent to complete artifacts first and then write back `draft`

### Requirement: explore is read-only

`explore` tool SHALL NOT modify proposal `.openspec.yaml` state and SHALL NOT perform any lifecycle transition. It only returns exploratory instructions and state.

#### Scenario: explore does not mutate status

- **WHEN** the agent calls `explore` in any phase of a proposal lifecycle
- **THEN** the call SHALL NOT change `creating` into `draft`
- **AND** the call SHALL NOT modify any proposal files

### Requirement: archive-change 通过 stdout 成功标记确认 OpenSpec 归档完成

`archive-change` tool 在 `confirm: true` 时 SHALL 将 OpenSpec CLI 的「归档成功」判定收紧为：CLI 子进程 exit code 等于 0 **且** stdout 命中真实归档完成标记。仅 exit code 为 0 不足以判定为成功。

「真实归档完成标记」定义为下列正则匹配（设输入 changeName 为 `<name>`，转义后为 `<escaped>`，并允许任意字符出现在前后）：

```
Change '<escaped>' archived as '\d{4}-\d{2}-\d{2}-<escaped>'\.
```

该标记来源于 `@fission-ai/openspec@1.3.1` 的 `dist/core/archive.js:268`，并且在 `archive.js` 内为唯一字面量来源。

判定为非成功时（含 exit code 非 0、exit 0 但未命中成功标记），`runtime-openspec#archiveChange` SHALL 抛出错误，由 tool 层 catch 路径转换为 `state.status === "failed"`，且 `state.workspace.gitOps` SHALL 保持空数组、不执行 `commit` / `merge-to-main` / `rebase-onto-main` / `merge-to-main-retry` / `worktree-remove` / `branch-delete` 任一 git step。

tool 层 SHALL 区分两类 archive 失败的 `error.code`：

- `openspec-archive-failed`：CLI 子进程 exit code 非 0，或 spawn / 超时异常。
- `openspec-archive-not-confirmed`：CLI 子进程 exit code 为 0 但 stdout 未命中成功标记。

`openspec-archive-not-confirmed` 错误 message SHALL 携带触发判定的信号（取自下表），并 SHALL 包含 stdout 前 800 字符的截断片段：

| signal 值                | 含义                             | 触发文本（stdout `includes`）                                |
| ------------------------ | -------------------------------- | ------------------------------------------------------------ |
| `validation-failed`      | OpenSpec delta spec 校验未过     | `Validation failed. Please fix the errors before archiving.` |
| `spec-update-aborted`    | 主 specs 重写或校验失败          | `Aborted. No files were changed.`                            |
| `no-change-selected`     | `--yes` 下无可选 change          | `No change selected. Aborting.`                              |
| `archive-cancelled`      | 用户取消（防御保留）             | `Archive cancelled.`                                         |
| `success-marker-missing` | 上述均未命中且无成功标记（兜底） | （兜底分支）                                                 |

`runtime-openspec` SHALL 通过纯函数 `parseArchiveOutcome(stdout: string, changeName: string)` 实现该判定，函数返回联合类型 `{ kind: "success" } | { kind: "known-failure"; signal } | { kind: "unknown" }`，其中 `signal` 取自上表。该函数 SHALL 不依赖 fs / spawn / 网络 I/O，可独立单元测试。

#### Scenario: exit 0 且 stdout 命中成功标记视为成功

- **WHEN** `runtime-openspec#archiveChange(projectRoot, "my-change", { confirm: true })` 调用 OpenSpec CLI
- **AND** 子进程 exit code 等于 0
- **AND** stdout 包含 `Change 'my-change' archived as '2026-05-22-my-change'.`
- **THEN** `runtime-openspec#archiveChange` 返回 `archiveRawOutput` 为完整 stdout
- **AND** `tools/archive-change.ts` 继续调用 `runtime-workspace#finalizeArchiveWorkspace`

#### Scenario: exit 0 但 stdout 未命中成功标记视为失败

- **WHEN** OpenSpec CLI 子进程 exit code 等于 0
- **AND** stdout 不包含与 `Change '<changeName>' archived as '<date>-<changeName>'.` 匹配的标记
- **THEN** `state.status === "failed"`
- **AND** `state.archive.ok === false`
- **AND** `state.archive.error.code === "openspec-archive-not-confirmed"`
- **AND** `state.archive.error.message` 包含触发的 signal
- **AND** `state.archive.error.message` 包含 stdout 前 800 字符截断
- **AND** `state.workspace.gitOps` 为空数组

#### Scenario: 校验失败信号被识别

- **WHEN** OpenSpec CLI 子进程 exit code 等于 0
- **AND** stdout 包含 `Validation failed. Please fix the errors before archiving.`
- **THEN** `state.archive.error.code === "openspec-archive-not-confirmed"`
- **AND** message 中的 signal 字段值为 `validation-failed`
- **AND** `state.workspace.gitOps` 为空数组

#### Scenario: spec 更新失败信号被识别

- **WHEN** OpenSpec CLI 子进程 exit code 等于 0
- **AND** stdout 包含 `Aborted. No files were changed.`
- **THEN** `state.archive.error.code === "openspec-archive-not-confirmed"`
- **AND** message 中的 signal 字段值为 `spec-update-aborted`
- **AND** `state.workspace.gitOps` 为空数组

#### Scenario: 未知未确认输出兜底失败

- **WHEN** OpenSpec CLI 子进程 exit code 等于 0
- **AND** stdout 既不包含成功标记也不包含任何已知失败信号
- **THEN** `state.archive.error.code === "openspec-archive-not-confirmed"`
- **AND** message 中的 signal 字段值为 `success-marker-missing`
- **AND** `state.workspace.gitOps` 为空数组

#### Scenario: changeName 含正则元字符不影响匹配

- **WHEN** `changeName` 含 `.`、`+`、`(` 等正则元字符
- **AND** stdout 形如 `Change '<changeName>' archived as '<date>-<changeName>'.`
- **THEN** `parseArchiveOutcome` 返回 `kind: "success"`
- **AND** 不抛出正则编译错误

#### Scenario: 成功标记中 changeName 不匹配视为未知

- **WHEN** 调用 `parseArchiveOutcome(stdout, "feature-a")`
- **AND** stdout 仅包含 `Change 'feature-b' archived as '2026-05-22-feature-b'.`
- **THEN** 返回 `kind: "unknown"`
- **AND** 不返回 `kind: "success"`

#### Scenario: spawn 异常仍归类为 archive-failed

- **WHEN** OpenSpec CLI 子进程 exit code 非 0
- **OR** spawn 抛出 `OpenspecCliError` / `OpenspecTimeoutError`
- **THEN** `state.archive.error.code === "openspec-archive-failed"`
- **AND** `state.workspace.gitOps` 为空数组
