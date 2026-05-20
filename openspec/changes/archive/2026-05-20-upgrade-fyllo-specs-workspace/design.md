## 背景

`fyllo-specs` 当前暴露四个 MCP tools，主要职责是封装 OpenSpec CLI。multi-worktree 编排目前通过阶段 system-reminder 注入详细 shell 命令实现。这保持了 `fyllo-specs` 的“薄封装”定位，但也让确定性的 git 操作依赖 agent 正确阅读并执行自然语言指令。

当前系统已经有部分 workspace 感知能力：

- Proposal list 通过扫描 `<projectPath>/.worktrees/*/openspec/changes/` 推导 `ProposalMeta.worktreePath`。
- 创建 Apply run 时，如果选中的 proposal 来自 linked worktree，会持久化 `ApplyRunMeta.worktreePath`。
- Apply 与 Archive ACP session 的 `cwd` 已经使用 `runMeta.worktreePath ?? projectPath`。

缺失的是稳定的 tool-level workspace 生命周期契约。

## 目标 / 非目标

**目标：**

- 保留 MCP server 名称 `fyllo-specs`，保留四个公开 OpenSpec-oriented tool name。
- 让 `create-proposal` 通过单次调用参数 `workspaceMode` 选择并准备 workspace。
- 返回唯一的 `workspace.path`，agent 必须用它读取和修改 proposal artifacts。
- 让 `archive-change` 在 tool 内部执行 archive git finalization，并返回逐步结果。
- 在 MCP server 内部保持 OpenSpec runtime 与 git workspace runtime 分层隔离。
- 简化 system-reminder，使其描述 tool 使用和结果处理，而不是 shell 命令序列。

**非目标：**

- 不新增公开 worktree MCP tool。
- 不建立 MCP server 到 Electron main process 的 runtime bridge。
- 不引入项目级默认 workspace 偏好。
- 第一版不处理 pnpm / vitest hydration 或依赖预热。
- 不改变 proposal list UI 语义，继续消费现有 `worktreePath` 行为。

## 决策

### D1: 保留 `fyllo-specs`，升级内部职责

继续使用 `fyllo-specs` 作为 bundled MCP server 名称，因为它能保留 FylloCode 对 OpenSpec 的可见性。内部职责从 OpenSpec CLI 薄封装升级为 OpenSpec-driven change workflow server。

考虑过的替代方案是改名为 `fyllo-change`。该方案被拒绝，因为它会弱化产品中对 OpenSpec 概念的显式露出。

### D2: 不暴露 worktree-specific tools

不新增 `prepare-worktree` 或 `cleanup-worktree` 这类公开 tool。agent 仍然只面对四个 workflow tools：

- `explore`
- `create-proposal`
- `apply-change`
- `archive-change`

这样避免把工具调用顺序重新交还给 prompt 与 agent。

### D3: 在 `openspec-runtime` 旁新增 `workspace-runtime`

新增 `mcp-servers/fyllo-specs/src/workspace-runtime/`，负责 git 和 workspace 文件系统操作，包括：

- 基于 `targetPath` 识别 main repo
- 维护 `.worktrees/` ignore 规则
- 创建 linked worktree
- archive commit
- fast-forward merge 回 main
- worktree remove
- branch delete
- 结构化记录 git 命令结果

`openspec-runtime` 不得 import `workspace-runtime`，`workspace-runtime` 也不得 import `openspec-runtime`。只有 tool handler 或很薄的 workflow 编排层可以组合两者。

### D4: `create-proposal` 一次性选择 workspace

`create-proposal` 接收：

```ts
workspaceMode?: "linked" | "main"
```

默认值是 `"linked"`。该参数是单次调用 override，不是持久化项目设置。

返回值包含：

```ts
workspace: {
  mode: "linked" | "main";
  path: string;
}
```

`workspace.path` 是 agent 读取和编辑 proposal artifacts 的规范路径。main 模式下它是主仓库路径；linked 模式下它是 `<mainRepo>/.worktrees/<changeName>`。

tool result 不同时暴露 `workspacePath` 与 `worktreePath` 给 agent；统一使用 `workspace.path` 可以减少混淆。

### D5: `archive-change` 拥有 git finalization，并接收 `commitMessage`

`archive-change` 在 `confirm: true` 时要求传入 `commitMessage`。tool 在执行 git 操作前校验 commit subject 格式，格式继续使用 `type(scope): summary`。

当 `confirm !== true` 时，preview 模式不要求 `commitMessage`，也不执行 git 操作。

### D6: Archive 结果拆成 `archive` 与 `workspace`

返回结果必须区分 OpenSpec archive 状态与 workspace git finalization 状态：

```ts
type ArchiveChangeResult = {
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
    gitOps: ArchiveGitOpResult[];
    failedStep: ArchiveGitStep | null;
    error?: {
      code: string;
      message: string;
      retryHint: string;
    };
  };
};
```

Git 操作记录为：

```ts
type ArchiveGitStep = "commit" | "merge-to-main" | "worktree-remove" | "branch-delete";

type ArchiveGitOpResult = {
  step: ArchiveGitStep;
  cwd: string;
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  ok: boolean;
};
```

如果 `archive.ok === false`，不得执行任何 git 操作，`workspace.gitOps` 必须为空数组。

如果某个 git step 失败，执行链必须短路。已经成功的步骤保留在 `workspace.gitOps` 中，后续未执行步骤不得出现在数组里。

## 风险 / 权衡

- **部分成功后重复 archive retry** -> Apply 实现必须定义幂等恢复行为，例如 commit 已成功但 merge 失败的情况。第一版可以在 active change 不存在时基于当前 git 状态继续 workspace finalization，但绝不能盲目重复 commit。
- **commit message 质量转移给 agent** -> tool 会校验格式，但 message 内容仍由 agent 生成。reminder 必须要求 agent 传入准确 message，并处理格式校验失败。
- **non-git 项目默认 linked 模式** -> `workspace-runtime` 必须在 linked worktree 不可用时 fallback 到 main workspace，或在 OpenSpec 写文件前返回结构化错误。本设计选择 non-git fallback 到 main，以保留既有 non-git 行为。
- **hydration 仍未解决** -> pnpm/vitest 环境预热问题不进入本 change。新增 `workspace-runtime` 会为后续 hydration 提供落点。
