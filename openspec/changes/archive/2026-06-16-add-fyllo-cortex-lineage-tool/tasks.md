## 1. Bundled MCP 环境变量

- [x] 1.1 修改 `src/main/infra/mcp/bundled-mcp-servers.ts`，在 `getBundledMcpServers()` 返回的每个 `McpServerSpec.env` 中加入 `FYLLO_PROJECT_DATA_DIR: projectDir(opts.projectPath)`；从 `@main/infra/storage/project-paths` 复用现有 `projectDir`，不要在该文件手写 `getDataSubPath` 或 `encodeProjectPath` 拼接。
- [x] 1.2 更新 bundled MCP server 相关测试（优先查找并修改现有 `test/main/infra/mcp/**` 或同等测试文件），断言 `FYLLO_PROJECT_DATA_DIR` 被注入所有 bundled server，且值等于 `projectDir(projectPath)`；同时保持 `FYLLO_MCP_EVENT_DIR` 与 `FYLLO_PROJECT_PATH` 既有断言。

## 2. fyllo-cortex lineage tool 实现

- [x] 2.1 创建 `src/mcp-servers/fyllo-cortex/src/tools/lineage.ts`，定义 strict discriminated union input schema：`{ mode: "trace-proposal", changeId }` 与 `{ mode: "trace-commit", commitHash }`；注册 tool 名称为 `lineage`，返回 `content: [{ type: "text", text }]`。
- [x] 2.2 创建 `src/mcp-servers/fyllo-cortex/src/utils/lineage-reader.ts`（或同等 utils 模块），实现只读读取：从 `process.env.FYLLO_PROJECT_DATA_DIR` 拼接 `lineage/index.json` 与 `lineage/subjects/<subjectId>.json`，从 `process.env.FYLLO_PROJECT_PATH` 读取 active change `.openspec.yaml` 状态；不得 import `@main/*`，不得使用 `FYLLO_MCP_EVENT_DIR`，不得扫描 `subjects/*.json` 重建 index。
- [x] 2.3 在 lineage reader 中实现防御性归一化，只接受 `LineageIndex.version === 1`、非空字符串反查表、`Subject.origin` 为 `"task" | "chat"`、合法 `links/proposals`；index 缺失/损坏、无 key、subject 缺失/损坏时返回 `null` 文本。
- [x] 2.4 实现固定 DTO 投影：`subjectId`、`origin`、`task` 摘要、`sessions[].proposals[].commitHash`（缺失输出 `null`）、`status`、`createdAt`、`updatedAt`；`task.url` 仅从 `task.snapshot.sourceMeta.url` 提取，缺失输出 `null`，不要返回完整 `TaskItem`。
- [x] 2.5 修改 `src/mcp-servers/fyllo-cortex/src/tools/index.ts`，在保留 `registerGuidelinesTool(server)` 的同时调用新的 `registerLineageTool(server)`；确保 `tools/list` 同时包含 `guidelines` 与 `lineage`。

## 3. 测试覆盖

- [x] 3.1 更新 `test/mcp-servers/fyllo-cortex/tools.test.ts`，把原先只期望一个工具的断言改为包含 `guidelines` 与 `lineage`，并覆盖 `lineage` strict schema 拒绝多余字段。
- [x] 3.2 在 `test/mcp-servers/fyllo-cortex/tools.test.ts` 或新增同目录测试文件中，为 `trace-proposal` 构造临时 `FYLLO_PROJECT_DATA_DIR/lineage/index.json` 与 `subjects/subject-1.json` fixture，断言响应 DTO 的 task 摘要、session/proposal 顺序、`commitHash: null` 与 `pending` 状态。
- [x] 3.3 增加 `trace-commit` 测试，fixture 中 `index.commitHashes[fullHash] = "subject-1"`，proposal link 带同一 `commitHash`，断言 tool 返回该 subject 且 proposal `status === "completed"`。
- [x] 3.4 增加 chat 起源测试，fixture subject 为 `origin: "chat"` 且 `task: null`，断言响应 `task === null`。
- [x] 3.5 增加 applying 状态测试，在临时 `FYLLO_PROJECT_PATH/openspec/changes/add-foo/.openspec.yaml` 写入 `status: applying`，proposal link 无 `commitHash`，断言响应 proposal `status === "applying"`。
- [x] 3.6 增加缺失/损坏路径测试：`index.json` 缺失、index 无 key、subject 文件缺失任一场景均返回文本 `null`，并断言不会因为 `subjects/` 下存在可扫描 subject 而返回结果。

## 4. 文档与验证

- [x] 4.1 更新 `guidelines/Build.md` 的 bundled MCP env 说明或示例，补充 `FYLLO_PROJECT_DATA_DIR` 的语义：由主进程通过 `projectDir(projectPath)` / `getDataSubPath` 计算，用于 MCP server 读取当前项目数据目录。
- [x] 4.2 如实现新增或调整 lineage DTO 类型且适合共享，更新 `src/shared/types/**`；若 DTO 仅为 MCP server 内部响应类型，则保持在 `src/mcp-servers/fyllo-cortex/src/**` 内，不新增跨进程共享类型。
- [x] 4.3 运行 `pnpm vitest run test/mcp-servers/fyllo-cortex/**/*.{test,spec}.ts`，验证 fyllo-cortex tool 行为。
- [x] 4.4 运行主进程 bundled MCP env 相关测试；若无法精准定位单测，运行 `pnpm vitest run test/main/**/*.{test,spec}.ts`。
- [x] 4.5 运行 `pnpm typecheck:node`，确保 main、shared 与 bundled MCP server 类型检查通过。
