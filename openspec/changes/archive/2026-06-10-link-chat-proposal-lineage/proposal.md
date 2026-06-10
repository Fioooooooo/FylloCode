## Why

用户在 chat 中创建 proposal 后，会话（sessionId）与所产出的 proposal（changeId）之间没有任何持久化关联，lineage 知识图谱因此缺失「一次讨论产出了哪些 proposal」这条核心边。直接观测 ACP `tool_call` 事件已被实测证伪——claude / codex / gemini 三类 agent 的 payload 结构各不相同，无法稳定识别工具身份与 `changeName`；而向 MCP 子进程注入 `sessionId` 又因 probe 阶段「fylloSessionId 尚未诞生」导致 probe-originated session 整个生命周期 env 缺失。本变更同时根治这两处，把 session ↔ proposal 关联做成 agent 无关、并发精确、崩溃可恢复的稳定入口。

## What Changes

- **fylloSessionId 时序前移到 probe 阶段（A 部分根治）**：`ensureProbe` 时即生成 fylloSessionId，并随 `getBundledMcpServers` 注入 MCP env；probe 转正为正式会话时沿用该 fylloSessionId（与 acpSessionId 一并）。这从根上消除「probe newSession 早于 sessionId 诞生」的时序错配，使 MCP 子进程在任何 turn 都能拿到当前会话的 fylloSessionId。**BREAKING**（sessionId 生成责任从 `createSession` 内部 `newSessionId()` 迁移为「probe 起源沿用、非 probe 起源新建」的双来源契约）。
- **MCP env 注入 sessionId 与事件目录**：`getBundledMcpServers` 新增注入 `FYLLO_SESSION_ID`（probe 起源会话的 fylloSessionId）与 `FYLLO_MCP_EVENT_DIR`（指向主项目 userData 下的事件目录，与 worktree 解耦）。**BREAKING**（bundled MCP env 契约扩展）。
- **create-proposal 写出 sidecar 事件**：`fyllo-specs` 的 `create-proposal` 工具在 `createChange` 成功后、返回结果前，向 `FYLLO_MCP_EVENT_DIR` 写入一个 `<timestamp>-<nanoid>.json` 事件文件（含 `server` / `tool` / `createdAt` / `sessionId` / `changeId`）；两个 env 缺一则跳过写入（降级、向后兼容）。
- **主进程消费事件并写入 lineage**：新增以 project 为维度的事件消费服务，`fs.watch` 监听事件目录，文件落定后读取 → 调 `recordProposal(projectPath, sessionId, changeId)` 挂边；若经 `index.sessions` 反查不到 subject（纯 chat 起源，未从任务页发起），先 `ensureChatSubject` 兜底建链再追加；消费成功后删除事件文件。
- **崩溃恢复**：消费服务启动时先 `readdir` 全量扫描并消费残留事件文件，再进入 `fs.watch`，使上次未消费的事件在重启后被重放。
- **watcher 懒创建且幂等**：消费服务对外暴露 `ensureLineageEventConsumer(projectPath)`，由 `chat:listSessions` 触发；内部以 `Map<projectPath, watcher>` 去重，重复调用为零成本 no-op（仿 `getOrStartProcess` 范式）。

## Capabilities

### New Capabilities

- `lineage-proposal-link`: 主进程侧「MCP 事件目录 → lineage proposal 边」的消费链路能力。覆盖事件文件 schema、`mcpEventsDir` 路径约定、project 级幂等懒创建 watcher、启动残留扫描（崩溃恢复）、消费时经 `recordProposal` 挂边并对纯 chat 起源 `ensureChatSubject` 兜底、消费后删文件，以及主进程单一 lineage 写入者不变量。

### Modified Capabilities

- `chat-session-probe`: probe 阶段新增生成并持有 fylloSessionId（`ProbeEntry` 扩字段），`ensureProbe` 经 `getBundledMcpServers` 注入该 sessionId；probe 转正时把 fylloSessionId 透传给 `createSession` 以沿用。
- `bundled-mcp-servers`: `getBundledMcpServers` 入参新增可选 `fylloSessionId`，env 新增注入 `FYLLO_SESSION_ID`（仅当传入时）与 `FYLLO_MCP_EVENT_DIR`（始终注入，值为主项目事件目录）。
- `session-meta-storage`: `createSession` 的 sessionId 来源从内部无条件 `newSessionId()` 改为「入参携带 fylloSessionId 时沿用、否则 `newSessionId()`」；`originTaskRef` write-once 唯一写入者契约不变，与 sessionId 双来源并存。
- `fyllo-specs-mcp`: `create-proposal` 工具在 `createChange` 成功后、返回前，向 `FYLLO_MCP_EVENT_DIR` 写出 proposal 创建事件文件（两个 env 齐备时）。

## Impact

- **共享类型 / 路径**：`src/main/infra/storage/project-paths.ts` 新增 `mcpEventsDir(projectPath)`；新增事件文件 JSON 结构类型（建议置于 `src/shared/types/`）。
- **主进程**：`src/main/infra/mcp/bundled-mcp-servers.ts`（入参 + env 扩展）、`src/main/services/chat/acp-session.ts`（传入 fylloSessionId）、`src/main/services/chat/session-probe-service.ts` 与 `session-probe-registry.ts`（生成/持有 fylloSessionId）、`src/main/services/chat/chat-service.ts`（createSession sessionId 双来源）、`src/main/ipc/chat.ts`（listSessions 触发 ensure、stream 透传）、新增 `src/main/services/lineage/` 下事件消费服务、`src/main/bootstrap/index.ts`（无需启动即建，改由 listSessions 懒触发）。
- **MCP server**：`src/mcp-servers/fyllo-specs/src/tools/create-proposal.ts`（写事件文件）。
- **渲染进程**：`src/renderer/src/stores/chat.ts` 与 `src/renderer/src/stores/session.ts`（draft probe carry fylloSessionId、createSession 透传）。
- **lineage 服务**：复用既有 `recordProposal` / `ensureChatSubject`（`src/main/services/lineage/lineage-service.ts`），不改其契约。
- **数据一致性模型**：事件文件为 MCP→main 单向持久化队列；lineage 仍由 main 单一写入；消费幂等 + 启动重放保证最终一致与崩溃恢复。
- **进程模型前提**：依赖 Electron「单 main 进程 + 多窗口」模型，事件目录消费者进程内唯一。
