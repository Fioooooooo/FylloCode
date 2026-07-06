## Context

当前 `src/mcp-servers/fyllo-specs/src/tools/explore.ts` 在校验 `targetPath` 后直接调用 `listChanges(projectRoot)`。`listChanges()` 位于 `runtime-openspec/list.ts`，只是对 `openspec list --json` 的薄封装，因此只能看到传入 workspace 下的 `openspec/changes`。

FylloCode 的 `create-proposal` 已经默认通过 `runtime-workspace/prepare-proposal-workspace.ts` 创建 `.worktrees/<changeName>` linked worktree。系统提醒又要求 agent 默认把 main repo root 作为 `explore.targetPath`，于是 main workspace 没有 active change 时，`explore` 会返回空数组，即使 linked worktree 中存在正在应用的 change。

现有约束：

- `src/mcp-servers/fyllo-specs/src/tools/**` 不直接 spawn 进程，也不直接导入 OpenSpec，只能通过 runtime 层访问 CLI 或 workspace 能力。
- `src/mcp-servers/**` 不能依赖 `@main/*`，因此不能直接复用 `src/main/infra/proposal/openspec-reader.ts`。
- `apply-change` 和 `archive-change` 已经接受 main repo root 或 registered git worktree 作为 `targetPath`，所以 `explore` 需要把正确 workspace 暴露给 agent，而不是自动替后续工具改写输入。

## Goals / Non-Goals

**Goals:**

- 让 main repo root 调用 `explore` 时能展示 main workspace 和 linked worktree 中的 active change。
- 保持现有 `activeChanges` 条目的字段兼容，只追加 workspace metadata。
- 让 `currentChange` 能基于 change 所在 workspace 计算 artifact status，并暴露对应 workspace metadata。
- 将 git worktree 枚举、OpenSpec list/status 聚合放到 runtime 层，保持 tool 层只做编排。
- 对单个 worktree 的读取失败返回 warning，避免一个坏 worktree 隐藏所有可用 active change。

**Non-Goals:**

- 不改变 `explore`、`apply-change`、`archive-change` 或 `create-proposal` 的 MCP 输入 schema。
- 不改变 OpenSpec CLI 本身，也不直接扫描 CLI 内部数据结构。
- 不让 `fyllo-specs` MCP server 依赖 Electron main process 的 proposal reader。
- 不把 archived proposal 纳入 `explore.state.activeChanges`。
- 不改变 `/proposal` 或 overview 页面现有 worktree 展示逻辑。

## Decisions

### 1. 在 runtime-workspace 中新增只读 workspace 枚举

新增 helper，例如 `listReadableWorkspaces(mainProjectPath)`，内部复用 `runGit(mainPath, ["worktree", "list", "--porcelain"])` 获取 Git registered worktree。返回结构包含：

- `mode: "main" | "linked"`
- `path`: workspace 的绝对路径

选择 Git registered worktree 作为主来源，而不是单纯扫描 `.worktrees/*`，原因是 `validateTargetPath()` 和后续 apply/archive 已经以 Git registered worktree 作为合法 workspace 判断依据；这样可以避免 stale 目录或非 worktree 目录被误报。

当项目不是 Git repo，或者 `git worktree list` 失败但 `targetPath` 已通过 non-git fallback 校验时，返回 main-only workspace 并附带 warning。

### 2. 新增 workspace-aware active change 聚合 helper

在 `runtime-openspec` 或新的相邻 runtime 文件中新增 helper，例如 `listWorkspaceChanges(mainProjectPath)`：

1. 调用 workspace 枚举得到候选 workspace。
2. 对每个 workspace 调用现有 `listChanges(workspace.path)`。
3. 为每条 `ChangeSummary` 追加 `workspacePath`、`workspaceMode`。
4. 按 change name 去重，优先级为 linked worktree 高于 main workspace。
5. 汇总单个 workspace 的失败为 `warnings`，继续返回其他 workspace 的结果。

保留现有 `listChanges()`，避免影响只需要单 workspace OpenSpec CLI list 的调用点。

### 3. `explore` 的 `currentChange` 先定位 workspace 再 computeStatus

`exploreTool()` 不再直接在 `projectRoot` 上执行 `computeStatus(projectRoot, changeName)`。当传入 `changeName` 时：

- 先在聚合后的 active change 中查找同名 change。
- 找到时使用该条目的 `workspacePath` 调用 `computeStatus(workspacePath, changeName)`。
- 未找到时回退到当前 `projectRoot` 调用 `computeStatus()`，保持对手动指定 workspace 或新建但未出现在 list 中的场景兼容。
- `currentChange` 返回原有 `applyRequires`、`artifacts`、`schemaName`，并追加 `changeName`、`workspacePath`、`workspaceMode`。

### 4. 更新 explore instruction 的 artifact 路径规则

`src/mcp-servers/fyllo-specs/src/tools/instructions/explore.md` 需要明确：当 active change 或 currentChange 带 `workspacePath` 时，agent 读取 proposal/design/tasks/specs artifacts 必须以该 workspace 为根，而不是默认拼接 `state.projectRoot`。

### 5. 不复用 main process proposal reader

`src/main/infra/proposal/openspec-reader.ts` 已经能扫描 `.worktrees`，但它属于 Electron main infra，并且返回的是 renderer proposal metadata，不是 OpenSpec CLI 的 task/progress/status 视图。`fyllo-specs` 应在自己的 runtime 中实现只读聚合，维持 MCP server 独立边界。

## Risks / Trade-offs

- [Risk] 一个 worktree 中的 OpenSpec CLI list 失败会让用户看不到该 worktree 的 change。→ Mitigation：失败记录为 warning，其他 workspace 结果照常返回；warning 包含 workspace path 和简短错误信息。
- [Risk] 同名 change 同时存在于 main 和 linked worktree。→ Mitigation：优先返回 linked worktree 版本，因为 FylloCode 默认在 linked worktree 中继续 proposal/apply 生命周期；测试覆盖该优先级。
- [Risk] 追加 `workspacePath` 字段后 agent 仍使用 `state.projectRoot` 读取 artifact。→ Mitigation：更新 `explore.md` instruction，并在 state 中同时给 active change 和 currentChange 暴露 metadata。
- [Risk] Git registered worktree 与 `.worktrees` 目录扫描口径不同。→ Mitigation：MCP apply/archive 已以 registered worktree 为合法 targetPath，因此 explore 采用相同口径；renderer proposal list 的目录扫描保持不变。

## Migration Plan

该变更只影响 `fyllo-specs` MCP server 的返回 state 和 prompt instruction，无数据迁移。发布后，已有 main workspace proposal 继续显示；已有 linked worktree proposal 会在 main repo root 的 `explore` 调用中出现。
