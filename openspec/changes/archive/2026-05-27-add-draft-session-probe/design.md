## Context

FylloCode 当前的 chat 流程在草稿态（`activeSession === null`）不与 ACP agent 进程交互——`draftAgentId` 只是 renderer 内存态。`AcpSession` 仅在用户发送首条消息时通过 `chat:stream:message` 串行执行 `newSession + prompt`，由此带来：

1. 首条消息延迟较高（agent 启动 + newSession 握手 + prompt 串联）。
2. 草稿态没有 `acpSessionId` 与 `configOptions`，`ConfigOptionsBar` 无法显示，用户在发送前无法选模型/模式。
3. 切换 agent 没有"清理本地状态 + 重建会话"的明确路径。

ACP 协议层面：

- `connection.newSession({ cwd, mcpServers })` 不依赖 prompt，仅完成 session 握手并返回 `{ sessionId, configOptions }`。
- `connection.closeSession({ sessionId })` 用于显式释放 agent 端 session（用户实测可用），优于"什么都不做"。
- `connection.setSessionConfigOption({ sessionId, configId, ... })` 已经是已知 RPC，复用即可。

现状关键代码：

- `electron/main/services/chat/acp-session.ts` 把 `newSession`、`resumeSession`、`loadSession`、`prompt` 全部写在一个对象里；`AcpSession.start(parts)` 强绑定 prompt parts。
- `electron/main/infra/storage/chat-acp-session-store.ts` 通过 `loadAcpSessionId` / `persistAcpSessionId` 解耦 acpSessionId 持久化。
- `electron/main/services/chat/config-option-service.ts#setConfigOption` 强依赖 `meta.acpSessionId` 存在，否则返回 `VALIDATION_ERROR`——草稿态根本调不到，这套接口要在 probe 阶段被绕开。
- `frontend/src/stores/session.ts` 的 `draftAgentId` 只是 ref，没有 watcher，没有与主进程的 round-trip。
- `chat-interface` spec 现有 `ConfigOptionsBar` 渲染真值表第一行明确写 "`activeSession === null`（草稿态）→ 不渲染"，这条 SHALL 必须在本次 change 中改写。

## Goals / Non-Goals

**Goals:**

- 草稿态对当前 `draftAgentId` 提前完成 ACP `newSession` 握手，缓存 `acpSessionId` + `configOptions` 在主进程内存。
- 草稿态可见且可调整 `configOptions`，配置变更通过 ACP 的 `session/set_config_option` 落到 probe 的 acpSession。
- 切换 `draftAgentId` 时 UI **先清空** 旧 configOptions，再异步等待新 probe 到达；旧 probe 通过 `connection.closeSession` 释放。
- 用户发送首条消息时复用 probe 的 `acpSessionId`，跳过重复 `newSession`，但**仍要发送 system-reminder**（这是 fyllo session 的首条消息）。
- Probe 与现有 chat 流式 IPC 解耦——独立通道，独立服务，独立测试，**不修改流式恢复逻辑**。

**Non-Goals:**

- 不在重启后恢复 probe（probe 是会话前的预备资源，纯内存）。
- 不在 probe 期间发起 `connection.prompt`——probe 仅做握手与配置预览。
- 不改变已建立 fyllo session（`activeSession !== null`）下的 `setConfigOption` 既有路径——保留现有 `chat:setConfigOption` IPC 不动。
- 不引入 ACP `session/destroy` 这类标准协议外的 RPC——`closeSession` 已经够用。
- 不改 proposal-apply / proposal-archive 路径——它们不走 chat，也不走 probe。

## Decisions

### Decision 1：Probe 数据归属——纯内存 ProbeRegistry，不落盘

**选项：**

- A. 纯内存 `Map<agentId, ProbeEntry>`，主进程级别单例，不进 SessionMeta、不进 listSessions 视野
- B. Probe 阶段即创建 fyllo session meta，预占 `sessionId`

**选 A。** 理由：

- Probe 是"会话前的预备资源"，与"用户已开始的会话"在生命周期、可见性、持久化语义上完全不同。
- 选 B 会污染 `chat:listSessions` 返回值，导致草稿被取消后留下空 session 文件。
- 重启后 probe 是否仍然有效需要复杂校验；纯内存避免该复杂度。
- 选 A 的代价是新增一个数据结构 + 一个 IPC 通道集，可控。

`ProbeEntry` 结构：

```ts
type ProbeStatus = "starting" | "ready" | "failed";

interface ProbeEntry {
  agentId: string;
  status: ProbeStatus;
  acpSessionId: string | null; // status === "ready" 时为非空
  configOptions: AcpSessionConfigOption[]; // 默认 [] 直到 newSession 返回
  error?: { code: string; message: string }; // status === "failed" 时填充
  startedAt: number;
}
```

### Decision 2：Probe 的 close 实现——使用 `connection.closeSession({ sessionId })`

ACP 协议已暴露 `closeSession` RPC。close 失败仅 `logger.error` 不上抛——agent 进程崩溃或方法未实现都不应阻塞 renderer 切 agent。失败的 acpSessionId 仍从 ProbeRegistry 移除（防止泄漏到下一个 probe）。

### Decision 3：用户首条消息如何复用 probe 的 acpSessionId

**选项：**

- A. 给 `chat:stream:message` 增加可选入参 `acpSessionId`，handler 在创建 fyllo session（或更新 meta）后把它写入 SessionMeta，让 `AcpSession.start` 自然走 `tryHandlePersistedSession` 的 direct prompt 路径
- B. 为 `AcpSession` 增加 `presetAcpSessionId` 选项，绕过 `loadAcpSessionId` 的读盘步骤

**选 A + B 组合。** 选 A 提供 IPC 层入口；选 B 给 `AcpSessionOpts` 增加显式 `presetAcpSessionId` 字段，使主进程 handler 不必依赖"刚写完 SessionMeta 立刻能被 sessionStore 读到"的时序假设。具体落地：

1. `chat:stream:message` 入参新增 `acpSessionId?: string`。
2. handler 拿到 `acpSessionId` 后：
   - 在 ProbeRegistry 中查找 `agentId -> entry`，校验 entry 的 `acpSessionId` 与入参匹配；不匹配则 `VALIDATION_ERROR`（防御）。
   - 从 ProbeRegistry consume（`registry.takeFor(agentId)`）：删除 entry，避免后续被重复使用或被 closeSession 误关。
   - 把 `acpSessionId` 与 `configOptions` 通过 session-store 字段级更新写入 SessionMeta。
   - 构造 `AcpSession` 时传 `presetAcpSessionId: acpSessionId`。
3. `AcpSession.start` 读取 `presetAcpSessionId`：若存在，跳过 `connection.newSession`，但仍按"新 fyllo session 首条消息"语义注入 `system-reminder` 与执行 `await sessionStore.persistAcpSessionId(...)`。

### Decision 4：preset 分支的 reminder 注入语义

ACP-side 已经有 session（agent 进程内），但 fyllo-side 这是首条消息，agent 没有任何对话上下文。如果跳过 reminder，agent 不知道当前的 project / cwd / session-owner。**所以 preset 分支必须注入 reminder**，与 `newSession` 分支等价。

实现上，把 `AcpSession.runStartFlow` 的判断从"`createdNewSession === true` 时注入"改为"`createdNewSession === true || presetAcpSessionId !== undefined` 时注入"。`tryHandlePersistedSession`（已有 fyllo session 的续轮）保持现状不注入 reminder，与 `direct prompt 不注入 reminder` 的现有 SHALL 一致。

### Decision 5：切 agent 时的清理顺序——先清后取，UI 立即清空

用户态：

1. renderer 检测 `draftAgentId` 从 A → B
2. **立即** `draftProbe.value = undefined`（UI 在下一 tick 清空 ConfigOptionsBar）
3. 异步触发 `chat:probe:close(A)`（不阻塞）
4. 异步触发 `chat:probe:ensure(B)`，await 返回后写 `draftProbe.value = { agentId: B, configOptions: ... }`

**绝不允许步骤 4 先于步骤 2 完成。** 理由：用户已明确 `从 claude-code 切到 codex`，哪怕 codex 的 configOptions 晚 1 秒到，也比让用户看到"agent=codex, model=sonnet"的错位组合好。

### Decision 6：Probe 失败的 UX

`status === "failed"` 时：

- ConfigOptionsBar 不渲染（与"agent 显式声明无 configOptions"行为一致）。
- 用户仍可发送消息——sendMessage 检查 probe `status`，若不是 `"ready"` 就**不携带 acpSessionId 入参**，回退到现有"创建 fyllo session 后由 AcpSession 自行 newSession" 路径。
- 这保证 probe 是性能优化与 UX 增强，**不是**发送消息的强依赖。

### Decision 7：Probe 与 agent 进程崩溃的关系

监听 `acp-process-pool` 的 agent unavailable 信号，把对应 `agentId` 从 ProbeRegistry 移除。renderer 通过 `acp-agents` store 已有的 `agentUnavailable` 监听同步清空 `draftProbeByAgent[agentId]`。

### Decision 8：Probe 期间用户调整 configOptions

走 **新通道** `chat:probe:setConfigOption`，函数体逻辑与现有 `config-option-service.setConfigOption` 类似但**不读 SessionMeta**——直接从 ProbeRegistry 取 `acpSessionId`、`configOptions` schema。成功后更新 ProbeEntry 的 `configOptions` 并通过事件推送给 renderer。

不复用现有 `chat:setConfigOption` 是因为：

- 现有接口签名要求 `sessionId`（fyllo session id），probe 没有 fyllo sessionId。
- 现有接口要 `loadSessionMeta`，probe 没有落盘。
- 把分支判断塞进 `chat:setConfigOption` 会把"草稿/已建立"两态混入一个函数，得不偿失。

### Decision 9：promote 时 configOptions 是否落盘

handler 在 consume probe 后，会用 probe 的 `configOptions` 通过 session-store 字段级更新写入 SessionMeta（与 `enqueueSessionMetaPersist` 同样的接口）。这样：

- 第二次发送同一 fyllo session 时，`config-option-service.setConfigOption` 的 schema 预校验仍然有效。
- session 列表展示和后续 resume 也能反映该配置。

## Risks / Trade-offs

| Risk                                                                                     | Mitigation                                                                                                         |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Probe 启动失败导致首条消息额外延迟（renderer 无谓等待）                                  | sendMessage 不阻塞等 probe；只在 probe 已 ready 才透传 acpSessionId，否则走老路                                    |
| 切 agent 频繁导致大量 newSession 调用，增加 agent 进程负担                               | renderer watcher 加 200ms debounce；probe 启动时若该 agentId 已有 in-flight `starting` entry，直接 reuse promise   |
| ProbeEntry 内存泄漏（用户多次切 agent 但从不发送）                                       | 监听 agentUnavailable 清理；window blur / navigation away 时 closeAll；renderer disconnect 时主进程清理            |
| acpSessionId 在 promote 与 closeSession 间产生竞态（renderer 同时点切 agent + 发送）     | Registry 提供原子 `takeFor(agentId)`：consume 后无法再被 close/setConfigOption；同时存在则按到达顺序由先发起方拿到 |
| `connection.closeSession` 不被某些 agent 实现                                            | 失败仅 log，不影响 renderer 切 agent；ProbeEntry 仍移除                                                            |
| reminder 在 preset 分支注入会让 agent 见到两次 reminder（如果未来 ACP agent 自己也注入） | 现状下 ACP agent 不主动注入 fyllo 风格 reminder；保留 spec 的"newSession 路径必注入"语义最简单清晰                 |

## Migration Plan

无破坏性兼容问题。

- `chat:stream:message` 入参 `acpSessionId` 是可选字段，老 renderer 不传仍然兼容。
- `AcpSessionOpts.presetAcpSessionId` 可选，`proposal-apply` / `proposal-archive` handler 不传，行为不变。
- ConfigOptionsBar 在草稿态从"不渲染"变为"按 draftProbe.configOptions 渲染"，对老 session 已建立态无影响。
- 老 ConfigOptionsBar 真值表的"`activeSession === null` → 不渲染"这条 SHALL 由本次 spec delta 显式 MODIFIED。

## Open Questions

无。设计已收敛：

- Probe 内存归属、close 用 ACP `closeSession`、reminder 在 preset 分支注入、切 agent 先清后取、首条消息失败不回写 probe——均已确认。
