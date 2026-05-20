## 1. Workspace Runtime 工作区运行时

- [x] 1.1 创建 `mcp-servers/fyllo-specs/src/workspace-runtime/types.ts`，定义 `WorkspaceMode`、`WorkspaceInfo`、`ArchiveGitStep`、`ArchiveGitOpResult` 以及与 delta spec 匹配的结构化 workspace 错误类型。
- [x] 1.2 创建 `mcp-servers/fyllo-specs/src/workspace-runtime/git.ts`，实现一个小型命令 runner，用于捕获每次 git 操作的 `{ cwd, command, exitCode, stdout, stderr, ok }`，且非 0 退出码不直接 throw。
- [x] 1.3 创建 `mcp-servers/fyllo-specs/src/workspace-runtime/prepare-proposal-workspace.ts`，实现 `prepareProposalWorkspace({ mainProjectPath, changeName, workspaceMode })`，覆盖 non-git fallback 到 main workspace，以及在 `<mainProjectPath>/.worktrees/<changeName>` 创建 linked worktree。
- [x] 1.4 在 `workspace-runtime` 内实现 `.worktrees/` ignore 规则维护，确保 linked 模式创建 worktree 前 `.worktrees/` 已被忽略；失败时返回结构化错误，不再让 agent 通过 shell 命令恢复。
- [x] 1.5 创建 `mcp-servers/fyllo-specs/src/workspace-runtime/finalize-archive-workspace.ts`，实现 `finalizeArchiveWorkspace({ mainProjectPath, workspacePath, changeName, commitMessage })`，按 `commit`、`merge-to-main`、`worktree-remove`、`branch-delete` 顺序执行并支持失败短路。
- [x] 1.6 从 `mcp-servers/fyllo-specs/src/workspace-runtime/index.ts` 导出 workspace runtime functions。

## 2. create-proposal Tool 契约

- [x] 2.1 更新 `mcp-servers/fyllo-specs/src/tools/create-proposal.ts` 入参 schema，增加 `workspaceMode?: "linked" | "main"`，默认 `"linked"`，并保留必填 `targetPath`。
- [x] 2.2 修改 `createProposalTool()`：将 `targetPath` 视为 main project path，先调用 `prepareProposalWorkspace()`，再把 `workspace.path` 传给 `openspec-runtime#createChange`、`computeStatus` 和 `getInstructions`。
- [x] 2.3 在 `create-proposal` state 中增加 `workspace: { mode, path }` 与 `warnings: string[]`。
- [x] 2.4 更新 `mcp-servers/fyllo-specs/src/prompts/create-proposal.md`，要求 agent 在 `state.workspace.path` 下编辑 artifacts；只有用户明确要求 main workspace 时才传 `workspaceMode: "main"`。
- [x] 2.5 更新 `mcp-servers/fyllo-specs/__tests__/tools.test.ts`，覆盖默认 linked、显式 main、non-git fallback、以及返回的 `workspace.path`。

## 3. archive-change Tool 契约

- [x] 3.1 更新 `mcp-servers/fyllo-specs/src/tools/archive-change.ts` 入参 schema，增加 `commitMessage?: string`；仅当 `confirm === true` 时要求存在并校验。
- [x] 3.2 将 `archiveChangeTool()` state 重构为顶层 `{ changeName, status, archive, workspace }`，结构以 `openspec/changes/upgrade-fyllo-specs-workspace/specs/fyllo-specs-mcp/spec.md` 为准。
- [x] 3.3 确保 OpenSpec archive preview 模式让 `workspace.gitOps` 保持空数组，并且不要求 `commitMessage`。
- [x] 3.4 确保 `confirm: true` 在调用 OpenSpec archive 前校验 `commitMessage`；格式非法时不得 archive，也不得执行 git operations。
- [x] 3.5 OpenSpec archive 成功后调用 `finalizeArchiveWorkspace()`，并把失败映射到 `workspace.ok`、`workspace.failedStep`、`workspace.error.retryHint` 和 `status: "failed"`。
- [x] 3.6 更新 `mcp-servers/fyllo-specs/src/prompts/archive-change.md`，要求 agent 传入 `commitMessage`，检查 `state.archive` 与 `state.workspace`，并汇报已完成的 `workspace.gitOps` 与 `workspace.failedStep`。
- [x] 3.7 更新 `mcp-servers/fyllo-specs/__tests__/tools.test.ts`，并新增 workspace-runtime 单元测试，覆盖 preview 模式、非法 commit message、main commit-only finalization、linked 全成功、linked 在 merge 失败时短路。

## 4. System Reminder 模板

- [x] 4.1 更新 `electron/main/services/chat/system-reminder/templates/chat.txt`，移除手写 worktree shell 创建步骤，改为说明 `create-proposal.workspaceMode`、默认 linked 模式、main override、以及 `state.workspace.path`。
- [x] 4.2 更新 `electron/main/services/chat/system-reminder/templates/apply.txt`，说明已准备好的 workspace cwd 语义，并移除 worktree 生命周期命令。
- [x] 4.3 更新 `electron/main/services/chat/system-reminder/templates/archive.txt`，移除手写 git commit / merge / cleanup 命令，要求 agent 调用带 `commitMessage` 的 `archive-change`。
- [x] 4.4 更新 `electron/main/__tests__/services/chat/system-reminder/resolve.spec.ts`、`shared.spec.ts`、`archive.spec.ts` 的断言，使渲染后的 reminder 包含 tool contract 术语，且不再包含手写 git lifecycle 命令。

## 5. 现有 Proposal / Archive Runtime 集成

- [x] 5.1 检查 `electron/main/services/proposal/apply-run-service.ts`，确认 `ApplyRunMeta.worktreePath` 仍从 proposal list scan 推导，不需要新增 apply 参数。
- [x] 5.2 检查 `electron/main/ipc/proposal-apply.ts` 的 archive cwd 行为，保持 `runMeta.worktreePath ?? projectPath` 不变。
- [x] 5.3 更新仍然期望 system-reminder 文本负责 worktree cleanup 的 archive prompt 或 reminder 测试，改为期望 `archive-change` result handling。

## 6. MCP Server 发布元数据

- [x] 6.1 将 `mcp-servers/fyllo-specs/src/version.ts` 更新到 `0.4.0`。
- [x] 6.2 在 `mcp-servers/fyllo-specs/CHANGELOG.md` 增加 `0.4.0` 条目，概述 workspace runtime、`create-proposal.workspaceMode`、结构化 archive workspace 结果、`commitMessage`、以及 reminder contract 调整。

## 7. 验证

- [x] 7.1 运行 `pnpm test -- mcp-servers/fyllo-specs` 或最接近的现有 Vitest 目标，覆盖 MCP tools。
- [x] 7.2 运行 `electron/main/__tests__/services/chat/system-reminder/` 下的 system-reminder 相关测试。
- [x] 7.3 运行 `pnpm typecheck`，检查 shared type 与 tool schema 是否漂移。
- [x] 7.4 手动检查 `mcp-servers/fyllo-specs/src/openspec-runtime/` imports，确认它没有 import `workspace-runtime`。
