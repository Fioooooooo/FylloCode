## Context

主进程 `services/lineage`（`src/main/services/lineage/lineage-service.ts`）已实现 `recordProposal(projectPath, sessionId, changeId)`：经 `index.sessions[sessionId]` 反查 subject 后在对应 session link 的 `proposals` 追加 changeId。但它有两个未被满足的前提，导致「chat 创建 proposal 时关联 session 与 changeId」一直无法落地：

1. **谁来触发 `recordProposal`、用什么 sessionId 和 changeId**——proposal 在独立的 `fyllo-specs` MCP 子进程内创建，main 进程的事件闭包（`src/main/ipc/chat.ts` 的 `session.on("event")`）虽持有 fylloSessionId，但无法稳定识别「这是 create-proposal」与其 `changeName`。
2. **纯 chat 起源会话的 `index.sessions[sessionId]` 为空**——只有从任务页发起讨论（`task-chat-bridge` 已接入 `linkSession`）的会话才在 index 中；直接开聊创建的会话从未 `ensureChatSubject`，`recordProposal` 会返回 `null`。

本次讨论已逐一证伪/否决了若干路线（见 Decisions），最终收敛到「fylloSessionId 时序根治 + MCP sidecar 事件文件」方案。

约束（均经源码核实）：

- ACP agent 进程按 `agentId` 池化复用（`src/main/infra/process/acp-process-pool.ts` 的 `pool = Map<agentId, AgentProcess>`），但 MCP server 的 env 在每次 `newSession` / `resumeSession` / `loadSession` 随 `mcpServers` 参数下发（`acp-session.ts` 各恢复分支均调 `getBundledMcpServers`）。
- probe 阶段 `ensureProbe`（`session-probe-service.ts`）在用户发首条消息「之前」就 `newSession`，此刻 fylloSessionId 尚不存在；其产物 acpSessionId 经 `presetAcpSessionId` 被后续会话复用，而复用路径（`acp-session.ts` 的 `runPresetFlow` / `tryDirectPrompt`）直接 `runPrompt` 不再 `newSession`，故 env 在该会话生命周期内不再刷新。
- `createSession`（`chat-service.ts:59`）当前内部无条件 `newSessionId()` 生成 fylloSessionId；它同时是 `originTaskRef` 的 write-once 唯一写入者（`session-meta-storage` spec）。
- `create-proposal` 工具的 `createChange(projectRoot, input.changeName)` 不改写 changeName，故事件文件中的 changeId 可直接取 `input.changeName`（`fyllo-specs-mcp` spec 已确立 workspace/createChange 契约）。
- 事件目录路径由 main 在 session start 注入，基于 `mcpEventsDir(mainProjectPath)`（userData 下），即使 linked-worktree 模式下 proposal 落在 `.worktrees/<changeName>`，事件文件仍写回主项目目录。

## Goals / Non-Goals

**Goals:**

- 让 MCP 子进程在任意 turn 都能拿到当前会话的 fylloSessionId（根治 probe 时序错配）。
- 把 session ↔ proposal 关联做成 agent 无关（不依赖 `tool_call` 事件形状）、并发精确归属、崩溃可恢复的链路。
- 纯 chat 起源会话创建 proposal 时，自动 `ensureChatSubject` 兜底建链后再挂边。
- 主进程保持 lineage 的唯一写入者；MCP 侧只产出事件文件，不直接写 lineage。

**Non-Goals:**

- 不提供跨 MCP / main 的事务原子性（事件文件队列为最终一致 + 可重建）。
- 不改 `recordProposal` / `ensureChatSubject` 的现有契约（仅作为消费侧调用方）。
- 不接管 ACP `tool_call` 事件用于关联（已证伪，彻底放弃）。
- 不在本次实现「从 session metas 回填 lineage 边」的 rebuild 增强。
- 不为「多 app 实例共享同一 userData」这一非常规进程模型预留跨进程锁。

## Decisions

### 决策 1：放弃观测 ACP `tool_call` 事件，改用 MCP 侧 sidecar 事件文件

实测三类 agent 的 `tool_call` payload：codex 工具身份在 `rawInput.tool`、claude 在 `_meta.claudeCode.toolName` 且 pending 阶段 `rawInput` 为空、gemini 无明确工具身份。叠加源码事实：`tool_call_update` 的 `SessionEvent` 结构（`src/main/domain/chat/session-events.ts`）根本不带 toolName 字段。结论：跨 agent 无法稳定取得「工具身份 + changeName + 完成态」三件套。

改为：`create-proposal` 工具内部（我们完全控制的代码）在创建成功后写一个事件文件。changeId = `input.changeName`，sessionId = env `FYLLO_SESSION_ID`，二者均不经过 agent，agent 无关。

**否决的替代**：

- (a) main 观测 tool 事件 + 跨 `toolCallId` 维护状态机 —— 被实测 payload 差异证伪。
- (b) 全局 `.worktrees/` 目录 diff —— 并发创建 proposal 时无法归属，会挂错 session（脏数据，比边缺失更糟）。

### 决策 2：fylloSessionId 时序前移到 probe 阶段（A 部分根治）

MCP env 在 `newSession` 时固化；probe 的 `newSession` 早于 fylloSessionId 诞生，导致 probe-originated session 整个生命周期 `FYLLO_SESSION_ID` 缺失（而非仅首条消息缺失）。这命中默认「选 agent 即预热」路径，缺失率高，不能当边角降级处理。

解法：`ensureProbe` 阶段即生成 fylloSessionId（存入 `ProbeEntry.fylloSessionId`），注入 `getBundledMcpServers({ projectPath, fylloSessionId })`；probe 转正时（renderer `carryProbe`）把该 fylloSessionId 透传给 `createSession`，会话沿用同一 id。切 agent → probe 关闭（`closeProbe` / agent-unavailable 清理已删 registry entry），draft fylloSessionId 随之丢弃，无残留。

**否决的替代**：

- 仅注入稳定的 `FYLLO_MCP_EVENT_DIR`、sessionId 不进事件文件、归属交回 main —— 等于没解决归属问题。
- 让 agent 把 sessionId 作为工具入参透传 —— 回到 agent 不可控，否决。
- 发首条消息时丢弃 probe session 重新 newSession 注入正确 env —— 牺牲 probe 复用价值；前移方案更彻底，选前移。

### 决策 3：`createSession` 的 sessionId 双来源，与 `originTaskRef` write-once 并存

`createSession` 现为 `originTaskRef` 唯一 write-once 写入者；本次让其 sessionId 来源分叉：入参携带 fylloSessionId（probe 起源）时沿用，否则 `newSessionId()`（非 probe 起源）。两个契约同改一个函数，必须在 spec 中显式协调：sessionId 来源变化 SHALL NOT 影响 `originTaskRef` 的 write-once 时机（仍在构造 meta 时一次写入）。

场景 2（用户点 + 号 probe 后、未发消息即去任务页发起讨论并复用 probe session）证实：同一次 `createSession` 调用可同时携带 `taskRef`（→ originTaskRef）与 probe 起源 fylloSessionId，二者在此函数交汇，需一并支持。

### 决策 4：事件文件 schema 与原子写

事件文件名 `<timestamp>-<nanoid>.json`，确保并发多 session 写同一目录互不覆盖（一文件一事件）。内容：

```json
{
  "server": "fyllo-specs",
  "tool": "create-proposal",
  "createdAt": "<ISO8601>",
  "sessionId": "<fylloSessionId>",
  "changeId": "<changeName>"
}
```

写入 SHALL 采用「先写临时文件再 rename」的原子写，使消费侧不会读到半写文件（与 lineage-store 既有原子写一致）。仅当 `FYLLO_SESSION_ID` 与 `FYLLO_MCP_EVENT_DIR` 均存在时写入；任一缺失则跳过（向后兼容 / 降级，不报错）。

### 决策 5：project 级幂等懒创建 watcher，触发点为 `chat:listSessions`

main 进程无干净的「进入项目」单次事件（`getById` 语义太泛、`listSessions` 非严格单次）。故不追求单次触发点，改为「触发点会重复调 + 创建本身幂等」，仿 `getOrStartProcess`：

- 消费服务暴露 `ensureLineageEventConsumer(projectPath)`，内部 `Map<projectPath, watcher>` 去重，命中即 no-op（成本仅一次 `Map.has`）。
- 触发点选 `chat:listSessions` handler（`src/main/ipc/chat.ts`），它是「进入项目聊天区」的可靠信号且不必每 session 校验。
- 首次创建时：先 `readdir(mcpEventsDir)` 全量消费残留（崩溃恢复），再 `fs.watch` 监听。
- `fs.watch` 不可靠（跨平台丢/重事件），故 watch 事件到达只作为「尽快触发」信号，实际消费仍 `readdir` 全量处理目录，保证丢事件也能被下次任何触发或启动扫描兜底。

### 决策 6：watcher 生命周期随 `disposeAll` 统一回收，不在「离开项目」时关闭

每个 watcher 仅占一个 fs 句柄，项目数量级有限。消费服务模块 `registerDisposable({ name, dispose })`（`src/main/bootstrap/lifecycle.ts`），`dispose` 关闭 `Map` 内所有 watcher，`before-quit` 时由 `disposeAll` 统一回收。不追踪「离开项目」事件，避免反复创建/销毁。

### 决策 7：进程模型前提——单 main + 多窗口

Electron 标准模型为单 main 进程 + 多 BrowserWindow（多 renderer），现有 `acp-process-pool` 等 module 级单例已依赖此前提。「未来一项目一窗口」仍是多 renderer 共享同一 main，事件目录消费者进程内唯一，sidecar「单消费者删文件」语义不被破坏。仅「多 app 实例共享 userData」会破坏它，但该形态本身违背 Electron 单实例惯例，不在本次范围。

## Risks / Trade-offs

- **sessionId 双来源增加 `createSession` 复杂度** → 通过 spec 显式钉死两条分支与 `originTaskRef` write-once 不变量，并补充单测覆盖「probe 起源沿用」「非 probe 起源新建」「probe + taskRef 合流」三种路径。
- **`fs.watch` 丢/重事件** → 消费以 `readdir` 全量为准，watch 仅作触发；消费幂等（`recordProposal` / `ensureChatSubject` 均幂等）+ 启动扫描，丢事件最终被兜底。
- **「已 record 未删文件」崩溃窗口** → 重启扫描会重新消费该文件，因 `recordProposal` 幂等不产生重复边，删文件后收敛。
- **MCP 侧无法拿到 env 时静默跳过** → 事件不写出，proposal 边缺失（良性，可后续 rebuild 补齐），SHALL NOT 阻断 proposal 创建本身。
- **事件目录与 worktree 解耦依赖注入值正确** → `FYLLO_MCP_EVENT_DIR` 由 main 基于 mainProjectPath 注入，已核实 `AcpSession.projectPath` 源自 `resolveProjectPath(projectId)`（主项目维度），不会指向 worktree。

## Migration Plan

- `ProbeEntry`、`SessionMeta` 均为增量字段扩展；旧 session 无影响。
- 事件目录为新目录，首次消费前不存在则视为空，不报错。
- bundled MCP env 扩展向后兼容：旧版 `create-proposal` 不读新 env 时仅不写事件（功能降级，不破坏 proposal 创建）。
- 无回滚顾虑：移除本变更后，新写入的事件文件与 lineage proposal 边保留为良性数据，sessionId 双来源回退为单一 `newSessionId()`。

## Open Questions

- 无阻塞性未决项。事件文件保留策略（消费成功即删；解析失败的损坏文件如何处理——建议跳过并记日志，不阻断其余文件，与 lineage-store「损坏文件跳过」一致）在 specs 中明确。
