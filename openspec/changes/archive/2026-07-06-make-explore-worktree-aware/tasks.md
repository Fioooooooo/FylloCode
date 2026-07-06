## 1. Workspace 发现与聚合 runtime

- [x] 1.1 在 `src/mcp-servers/fyllo-specs/src/runtime-workspace/` 新增只读 workspace 枚举 helper，例如 `listReadableWorkspaces(mainProjectPath: string)`；复用现有 `runGit()` 调用 `git worktree list --porcelain`，返回 main workspace 与 registered linked worktree 的 `{ mode, path }`，其中 linked worktree 的 `path` 就是对应 worktree 绝对路径，并在 non-git fallback 时返回 main-only 结果和 warning。
- [x] 1.2 在 `src/mcp-servers/fyllo-specs/src/runtime-workspace/types.ts` 增加 workspace 枚举所需类型，例如 `ReadableWorkspaceInfo` 与 warning 结构；保持现有 archive/finalize 类型不破坏。
- [x] 1.3 在 `src/mcp-servers/fyllo-specs/src/runtime-openspec/types.ts` 扩展 explore/list 相关类型：新增 workspace-aware active change 类型，保留 `ChangeSummary` 现有字段并追加 `workspacePath`、`workspaceMode`，不要再返回单独的 `worktreePath`。
- [x] 1.4 新增 workspace-aware list helper，例如 `listWorkspaceChanges(mainProjectPath: string)`；对每个 workspace 调用现有 `listChanges(workspace.path)`，为结果追加 workspace metadata，按 `name` 去重并优先保留 linked worktree 条目，单 workspace 失败时写入 warning 并继续返回其他 workspace 的结果。

## 2. Explore tool state

- [x] 2.1 修改 `src/mcp-servers/fyllo-specs/src/tools/explore.ts`：当 targetPath 校验通过后调用 workspace-aware list helper，使 main repo root 调用返回 main 与 linked worktree 的聚合 `activeChanges`。
- [x] 2.2 修改 `exploreTool()` 的 `changeName` 分支：先在聚合 `activeChanges` 中定位 change 所属 workspace，再使用该 `workspacePath` 调用 `computeStatus()`；未定位到时回退到当前校验后的 target workspace。
- [x] 2.3 让 `state.currentChange` 返回 `changeName`、`workspacePath`、`workspaceMode`，同时保留现有 `applyRequires`、`artifacts` 和 `schemaName`；不要再返回单独的 `worktreePath`。
- [x] 2.4 让 `state` 顶层返回 `warnings: string[]` 或等价结构；当没有 warning 时返回空数组，避免调用方需要区分字段缺失。
- [x] 2.5 更新 `src/mcp-servers/fyllo-specs/src/tools/instructions/explore.md`：明确读取 artifact 和调用后续 apply/archive 时优先使用 active change/currentChange 的 `workspacePath`，不要只使用 `state.projectRoot`。

## 3. 测试覆盖

- [x] 3.1 更新 `test/mcp-servers/fyllo-specs/tools.test.ts`，新增集成测试：main repo root 的 `openspec/changes` 没有 active change、`.worktrees/<change>` registered worktree 中有 active change 时，`explore({ targetPath: root })` 的 `state.activeChanges` 包含该 change，并包含 `workspacePath` 与 `workspaceMode: "linked"`，且不包含 `worktreePath`。
- [x] 3.2 新增或更新测试覆盖 main workspace active change：断言 main 条目包含 `workspacePath: root`、`workspaceMode: "main"`，且不包含 `worktreePath`。
- [x] 3.3 新增或更新测试覆盖同名 active change：main 与 linked worktree 同时存在同名 change 时，`state.activeChanges` 只返回 linked worktree 版本。
- [x] 3.4 新增或更新测试覆盖 `changeName`：main targetPath + linked worktree changeName 时，`state.currentChange` 使用 linked worktree 计算 status，并返回 linked workspace metadata。
- [x] 3.5 新增或更新测试覆盖单个 workspace list 失败：断言成功 workspace 的 active changes 仍返回，并且 `state.warnings` 包含失败 workspace path。

## 4. 验证

- [x] 4.1 运行 `pnpm exec vitest run --project main test/mcp-servers/fyllo-specs/tools.test.ts`。
- [x] 4.2 如新增 runtime helper 有独立测试文件，运行对应 `pnpm exec vitest run --project main <test-file>`。
- [x] 4.3 运行 `pnpm typecheck:node`，确认 MCP server 类型变更通过。
