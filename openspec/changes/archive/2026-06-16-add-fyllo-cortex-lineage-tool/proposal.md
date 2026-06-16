## Why

Agent 在阅读或修改代码时需要能按 proposal changeId 或归档 commit hash 回溯这段工作来自哪个任务或聊天，以及当时关联的会话和 proposal 决策链。主进程已经收集并持久化项目 lineage，但目前没有一个 MCP tool 可以把这份权威数据暴露给 agent 使用。

## What Changes

- 在 bundled MCP server 启动 env 中新增 `FYLLO_PROJECT_DATA_DIR`，值为当前项目在 FylloCode userData 下的数据根目录，即 `<userData>/projects/<encodedProjectPath>`，由主进程通过现有 `projectDir(projectPath)` / `getDataSubPath` 路径体系计算。
- 在 `fyllo-cortex` MCP server 新增只读 `lineage` tool，支持：
  - `{ "mode": "trace-proposal", "changeId": "<openspec change id>" }`
  - `{ "mode": "trace-commit", "commitHash": "<full commit sha>" }`
- `lineage` tool 只读取 `FYLLO_PROJECT_DATA_DIR/lineage/index.json` 和 `FYLLO_PROJECT_DATA_DIR/lineage/subjects/<subjectId>.json`，把命中的 `Subject` 投影成固定 DTO。
- `lineage` tool 将 lineage index 视为权威反查入口：不扫描 `subjects/*.json` 重建 index，不写回 lineage，不做 Git fallback，不使用 `FYLLO_MCP_EVENT_DIR`。
- 未命中、index 缺失/损坏、subject 缺失/损坏时返回 `null`，输入非法或缺少必要 env 时返回工具错误。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `bundled-mcp-servers`: 内置 MCP server env 契约新增 `FYLLO_PROJECT_DATA_DIR`，用于让 MCP server 定位当前项目的 FylloCode 数据目录。
- `fyllo-cortex-mcp`: 新增 `lineage` tool 的输入、只读读取行为、响应结构和缺失返回语义。

## Impact

- 修改 `src/main/infra/mcp/bundled-mcp-servers.ts`，在每个 bundled MCP server spec env 中注入 `FYLLO_PROJECT_DATA_DIR`。
- 修改 `src/mcp-servers/fyllo-cortex/src/tools/**`，新增 `lineage` tool、读取/归一化/投影工具，并在工具注册入口加入该 tool。
- 复用 `src/shared/types/lineage.ts` 与 `src/shared/types/task.ts` 类型语义；MCP server 侧不得 import `@main/*`。
- 更新 `test/mcp-servers/fyllo-cortex/**` 与主进程 bundled MCP env 测试，覆盖 tool list、输入校验、proposal/commit 查询、缺失返回 `null`、chat 起源 `task: null` 和状态派生。
- 更新相关 guideline：`guidelines/Build.md` 的 bundled MCP env 说明应补充 `FYLLO_PROJECT_DATA_DIR`。
