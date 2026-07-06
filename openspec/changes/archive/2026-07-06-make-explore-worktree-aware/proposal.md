## Why

`fyllo-specs` 的 `explore` tool 当前只把 `targetPath` 交给 OpenSpec CLI 扫描一个 workspace。FylloCode 已经默认在 linked worktree 中创建 proposal，导致 agent 按系统提醒传 main repo root 调用 `explore` 时看不到 worktree 中真实存在的 active change。

## What Changes

- `explore` 在 `targetPath` 为 main repo root 时 SHALL 聚合 main workspace 与已注册 linked worktree 中的 active change，而不是只返回 main workspace 的 `openspec list --json` 结果。
- `state.activeChanges` SHALL 保留现有字段，并为每个条目增加 workspace metadata：`workspaceMode` 与 `workspacePath`；linked worktree 的具体路径由 `workspacePath` 表达，不再额外返回 `worktreePath`。
- 当传入 `changeName` 时，`explore` SHALL 先从聚合 active change 中定位该 change 所属 workspace，再在对应 workspace 上计算 `currentChange`。
- `state.currentChange` SHALL 暴露与该 change 对应的 workspace metadata，便于 agent 后续读取 artifact 或调用 apply/archive 时使用正确 `targetPath`。
- `explore` SHALL 对单个 worktree 的 OpenSpec list/status 失败做降级处理：保留可读取 workspace 的结果，并在 state 中返回 warning，而不是让整个 explore 失败。
- 不改变 MCP tool 输入 schema，不新增 renderer / preload / IPC 能力，不改变 `create-proposal`、`apply-change` 或 `archive-change` 的输入参数。

## Capabilities

### New Capabilities

- `fyllo-specs-explore`: 约束 `fyllo-specs` 的 `explore` tool 如何发现 main workspace 与 linked worktree 中的 active change，并如何在 state 中暴露 workspace metadata。

### Modified Capabilities

无。

## Impact

- 影响代码：`src/mcp-servers/fyllo-specs/src/tools/explore.ts`、`src/mcp-servers/fyllo-specs/src/runtime-openspec/**`、`src/mcp-servers/fyllo-specs/src/runtime-workspace/**`、`src/mcp-servers/fyllo-specs/src/tools/instructions/explore.md`。
- 影响类型：`src/mcp-servers/fyllo-specs/src/runtime-openspec/types.ts` 中的 explore/list 相关 state 类型。
- 影响测试：`test/mcp-servers/fyllo-specs/tools.test.ts`，必要时新增 runtime helper 单测。
- 不新增依赖，不改变 Electron main/preload/renderer IPC contract。
