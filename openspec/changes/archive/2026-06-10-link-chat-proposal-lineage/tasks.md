## 1. 共享类型与路径基础

- [x] 1.1 在 `src/main/infra/storage/project-paths.ts` 新增 `mcpEventsDir(projectPath: string): string`，返回 `join(projectDir(projectPath), "mcp-events")`，复用现有 `projectDir` 与 `encodeProjectPath`。验收：与 `lineageDir`/`sessionsDir` 同级；单测断言路径等于 `join(projectDir(p), "mcp-events")`。
- [x] 1.2 在 `src/shared/types/` 新增 MCP 事件文件类型（如 `mcp-event.ts`），定义 `McpProposalEvent = { server: "fyllo-specs"; tool: "create-proposal"; createdAt: string; sessionId: string; changeId: string }`，供 MCP 写出方与主进程消费方共用。验收：类型可被 `src/main/**` 与 `src/mcp-servers/fyllo-specs/**` import。

## 2. bundled-mcp-servers env 扩展（B 部分注入）

- [x] 2.1 修改 `src/main/infra/mcp/bundled-mcp-servers.ts`：`getBundledMcpServers` 入参由 `{ projectPath: string }` 扩为 `{ projectPath: string; fylloSessionId?: string }`；env 始终注入 `FYLLO_MCP_EVENT_DIR = mcpEventsDir(projectPath)`；当 `fylloSessionId` 非空时额外注入 `FYLLO_SESSION_ID = fylloSessionId`，否则不注入。验收：见 `bundled-mcp-servers` spec 的 env 场景；现有 `FYLLO_DISABLE_BUNDLED_MCP` 返回 `[]` 行为不变。
- [x] 2.2 更新 `test/main/infra/mcp/bundled-mcp-servers.test.ts`：覆盖「env 含 FYLLO_MCP_EVENT_DIR」「传 fylloSessionId 注入 FYLLO_SESSION_ID」「不传则不含 FYLLO_SESSION_ID」。验收：测试通过。

## 3. probe 阶段生成并注入 fylloSessionId（A 部分根治）

- [x] 3.1 修改 `src/main/services/chat/session-probe-registry.ts`：`ProbeEntry` 新增 `fylloSessionId: string`；`ProbeSnapshot`（`session-probe-service.ts`）新增 `fylloSessionId: string`；`toProbeSnapshot` 映射该字段。验收：见 `chat-session-probe` spec 的 MODIFIED `ProbeEntry` 场景。
- [x] 3.2 修改 `src/main/services/chat/session-probe-service.ts#ensureProbe`：写 `starting` 占位 entry 时用 `newSessionId()`（`@main/infra/ids`）生成 `fylloSessionId`；计算 `mcpServers` 时改调 `getBundledMcpServers({ projectPath, fylloSessionId: entry.fylloSessionId })`。验收：见 `chat-session-probe` spec「ensureProbe ... 注入 fylloSessionId」场景；probe newSession 的 MCP env 含正确 `FYLLO_SESSION_ID`。
- [x] 3.3 同步 `src/shared/types/chat-probe.ts`（`ProbeSnapshot` 类型来源）与相关 IPC/preload 类型，使 `fylloSessionId` 透传到 renderer。验收：`pnpm typecheck` 通过。
- [x] 3.4 更新 `test/main/services/chat/` 下 probe 相关测试：覆盖「占位 entry 即有 fylloSessionId」「ensureProbe 以该 id 调 getBundledMcpServers」。验收：测试通过。

## 4. createSession sessionId 双来源（A 部分接续）

- [x] 4.1 修改 `src/shared/schemas/ipc/chat.ts` 的 `createSessionInputSchema`：新增 `fylloSessionId: z.string().optional()`；同步 `src/preload/api/chat.ts` 中 `chatApi.createSession` 入参类型。验收：schema 校验通过含/不含该字段两种入参。
- [x] 4.2 修改 `src/main/services/chat/chat-service.ts#createSession`：入参新增 `fylloSessionId?: string`；`meta.sessionId` 取值改为「入参 `fylloSessionId` 非空则沿用，否则 `newSessionId()`」；`originTaskRef` write-once 写入逻辑保持不变；`fylloSessionId` 不作为独立字段持久化。验收：见 `session-meta-storage` spec 全部场景（probe 沿用 / 非 probe 新建 / 与 taskRef 并存 / 不独立持久化）。
- [x] 4.3 更新 `test/main/services/chat/` 下 createSession 测试：覆盖三条 sessionId 来源路径与「与 taskRef 并存」。验收：测试通过。

## 5. renderer 透传 probe fylloSessionId

- [x] 5.1 修改 `src/renderer/src/stores/chat.ts#sendMessage` 的 draft 分支：`carryProbe` 在原有字段外取出 probe 的 `fylloSessionId`；调用 `sessionStore.createSession` 时透传 `fylloSessionId`。验收：从已 ready probe 发首条消息时，createSession 入参含 probe 的 fylloSessionId。
- [x] 5.2 检查 `src/renderer/src/stores/session.ts` 的 `createSession` 包装与 `draftProbeByAgent` 类型，确保 `fylloSessionId` 沿调用链贯通。验收：`pnpm typecheck` 通过；手动验证场景 1（probe 后发消息）与场景 2（probe 后去任务页发起讨论复用 probe session）。

## 6. AcpSession 注入 fylloSessionId

- [x] 6.1 确认 `src/main/services/chat/acp-session.ts` 中 `getBundledMcpServers` 调用（`prepareStartContext`，约 `:131`）改为传入 `this.opts.fylloSessionId`；`recoverSession` 内 newSession/resume/load 使用的 `mcpServers` 同源。验收：非 probe 起源会话首次 newSession 的 MCP env 也含正确 `FYLLO_SESSION_ID`。
- [x] 6.2 确认 `src/main/services/chat/session-probe-service.ts` 之外，所有 `getBundledMcpServers` 调用点都已按需传 `fylloSessionId`（grep 全仓核对）。验收：无遗漏调用点仍用旧签名导致 sessionId 缺失。

## 7. create-proposal 写出事件文件（B 部分写出）

- [x] 7.1 修改 `src/mcp-servers/fyllo-specs/src/tools/create-proposal.ts`：在 `createChange` 成功后、`return` state 前，写出事件文件。仅当 `process.env.FYLLO_MCP_EVENT_DIR` 与 `process.env.FYLLO_SESSION_ID` 均非空时写；文件名 `<timestamp>-<nanoid>.json`（复用项目 nanoid 依赖）；内容为 `McpProposalEvent`，`changeId = input.changeName`；采用先写临时文件再 rename 的原子写；写失败吞掉/记日志不上抛。验收：见 `fyllo-specs-mcp` spec 全部场景；create-proposal state 返回结构不变。
- [x] 7.2 新增/更新 `test/mcp-servers/fyllo-specs/` 测试：覆盖「两 env 齐备写出且内容正确」「缺 FYLLO_SESSION_ID 跳过」「写失败不阻断返回」。验收：测试通过。

## 8. 主进程事件消费服务（B 部分消费）

- [x] 8.1 新增 `src/main/services/lineage/mcp-event-consumer.ts`：导出 `ensureLineageEventConsumer(projectPath: string): void`，内部 `Map<projectPath, FSWatcher>` 去重（仿 `acp-process-pool#getOrStartProcess` 幂等范式）。验收：见 `lineage-proposal-link` spec「幂等」场景。
- [x] 8.2 实现消费逻辑：首次创建时先 `readdir(mcpEventsDir(projectPath))` 全量消费残留，再 `fs.watch`；watch 事件仅触发「重新全量 readdir 扫描」。对每个事件文件：解析 → `recordProposal(projectPath, sessionId, changeId)`（`@main/services/lineage/lineage-service`）→ 返回 `null` 则 `ensureChatSubject(projectPath, sessionId)` 后重试 `recordProposal` → 成功后删文件；损坏文件跳过并记日志。验收：见 `lineage-proposal-link` spec「task 起源直接挂边」「纯 chat 起源兜底」「损坏文件跳过」「重启消费残留」「fs.watch 丢事件最终一致」场景。
- [x] 8.3 在消费服务模块以 `registerDisposable({ name: "lineage-mcp-event-consumer", dispose })`（`@main/bootstrap/lifecycle`）注册，`dispose` 关闭 `Map` 内全部 watcher。验收：`before-quit` → `disposeAll` 后无 watcher 句柄泄漏。
- [x] 8.4 在 `src/main/ipc/chat.ts` 的 `chat:listSessions` handler 内，解析 `projectPath` 后调用 `ensureLineageEventConsumer(projectPath)`。验收：调 `chat:listSessions` 后该 project 消费者存在；见 `lineage-proposal-link` spec「listSessions 触发」场景。
- [x] 8.5 新增 `test/main/services/lineage/mcp-event-consumer.spec.ts`：覆盖幂等、启动残留扫描消费、task 起源挂边、纯 chat 起源兜底建链、损坏文件跳过、dispose 关闭 watcher。验收：测试通过。

## 9. 集成验证与文档

- [x] 9.1 端到端验证三类 agent（claude / codex / gemini）各跑一次 chat 内 create-proposal：确认事件文件写出、sessionId 正确、lineage 中 `getBySession` 能查到该 changeId。验收：三类 agent 均关联成功（agent 无关性得证）。
- [x] 9.2 并发验证：两个会话相近时刻各创建一个 proposal，确认两条 proposal 边分别精确挂到各自 session，无错挂、无丢失。验收：`getByProposal` 对两个 changeId 分别反查到正确 session。
- [x] 9.3 崩溃恢复验证：写入事件文件后在消费前杀进程，重启后调 `chat:listSessions`，确认残留事件被消费、文件被删、边已挂。验收：重启后边正确建立。
- [x] 9.4 评估并更新本地 guidelines：检查 `guidelines/DataModel.md` 是否需补充「MCP 事件目录（`mcp-events`）与 lineage proposal 边消费链路」，`guidelines/IPC.md` 是否需补充「bundled MCP env 新增 `FYLLO_SESSION_ID` / `FYLLO_MCP_EVENT_DIR`」。验收：相关 guideline 文件已更新或明确记录「无需更新」的判断。
