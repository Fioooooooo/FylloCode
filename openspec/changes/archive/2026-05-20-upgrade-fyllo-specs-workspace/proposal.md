## Why

当前 multi-worktree 流程依赖很长的 system-reminder，让 agent 按正确顺序执行 git 命令。这个方式对小模型不稳定，每个阶段都会重复消耗大量 token，并且环境问题与恢复路径只能从 shell 输出里推断。

FylloCode 应继续通过 `fyllo-specs` MCP server 露出 OpenSpec 工作流，同时把确定性的 workspace 生命周期动作收拢到 MCP tool runtime 内部。

## What Changes

- 将现有 `fyllo-specs` MCP server 从 OpenSpec CLI 薄封装升级为 OpenSpec 驱动的 change workflow server。
- 保留 server 名称 `fyllo-specs`，并保留四个公开 tool：`explore`、`create-proposal`、`apply-change`、`archive-change`。
- 为 `create-proposal` 增加 `workspaceMode?: "linked" | "main"`；默认值为 `"linked"`，且该参数只对单次调用生效，不是项目级偏好。
- 为 `create-proposal` 返回值增加 `workspace: { mode: "linked" | "main"; path: string }`，让 agent 明确知道后续应在哪个目录填写和修改 proposal artifacts。
- 当 `workspaceMode === "linked"` 时，由 `create-proposal` 内部创建 linked worktree，而不是让 agent 通过 system-reminder 自己执行 `git worktree add`。
- 为 `archive-change` 增加 `commitMessage` 参数，并把 archive 后的 git finalization 收进 tool runtime。
- 将 `archive-change` 返回值重构为 `archive` 与 `workspace` 两个子对象，让 agent 能区分 OpenSpec archive 失败与 workspace/git 收尾失败。
- 调整 Chat / Apply / Archive 三个 system-reminder：移除 worktree shell 命令脚本，改为描述 MCP tool 契约与结果处理规则。reminder 不再要求 agent 手动执行 `git worktree add`、`git merge`、`git worktree remove` 或 `git branch -d`。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `fyllo-specs-mcp`：修改 `create-proposal` 与 `archive-change` tool 契约，使 tool 拥有 workspace 生命周期行为并返回结构化 workspace 结果。
- `system-reminder-injection`：移除 Chat / Apply / Archive reminder 中的 worktree shell 命令编排，改为 MCP tool 契约说明。
- `proposal-archive-action`：archive cleanup 由 `archive-change` tool 内部执行，不再由 archive reminder 指示 agent 执行 shell 命令。

## Impact

- 影响 `mcp-servers/fyllo-specs/src/` 下的 MCP server 实现，重点包括 `tools/create-proposal.ts`、`tools/archive-change.ts`、prompt 文件、测试，以及新增内部 `workspace-runtime/` 模块。
- 影响 Electron main reminder 模板：`electron/main/services/chat/system-reminder/templates/`。
- 影响 `fyllo-specs-mcp`、`system-reminder-injection`、`proposal-archive-action` 对应 OpenSpec specs 与测试。
- 不新增公开 Electron IPC channel，不新增 preload API。
