## Why

当前草稿态（`activeSession === null`）下，FylloCode 与 ACP agent 之间没有任何握手，`ConfigOptionsBar` 完全不渲染，用户必须发送第一条消息后才能看到当前 agent 暴露的 mode/model/thought_level 等会话级配置。这导致两个问题：

1. **配置不可见，无法预设**：用户在草稿态无法知道当前 agent 支持哪些 model 或 mode，更无法在发送之前调整。
2. **切换 agent 时存在错位窗口**：将来即使把 ConfigOptionsBar 提前渲染，如果数据不"先清后取"，用户切到 codex 时可能短暂看到 claude code 的旧配置（如 `agent=codex, model=sonnet` 这种荒谬组合），破坏信任。

为此，我们引入 **DraftSession Probe**：在草稿态主动通过 `connection.newSession({ cwd, mcpServers })` 与 agent 完成会话握手，提前拿到 `acpSessionId` 与 `configOptions`；用户切换 agent 时立即清理本地渲染并 close 旧 probe、new 新 probe；用户首次发送消息时把已 probe 的 `acpSessionId` 通过 `chat:stream:message` 入参传入，复用已建立的 ACP session，跳过 `connection.newSession` 调用。

## What Changes

- **新增 SessionProbe 主进程服务**：`electron/main/services/chat/session-probe-service.ts`，维护纯内存 `Map<agentId, ProbeEntry>`（含 `acpSessionId`、`configOptions`、`status`），不落盘。负责调用 `connection.newSession`、`connection.closeSession`，并通过事件向 renderer 推送 `configOptions`。
- **新增 IPC 通道（独立于现有 chat 流式通道）**：
  - `chat:probe:ensure` — 给定 `agentId` 启动 probe（已存在则复用），返回 `{ acpSessionId, configOptions }`
  - `chat:probe:close` — 关闭指定 `agentId` 的 probe，调用 `connection.closeSession({ sessionId })`，从 Map 移除
  - `chat:probe:setConfigOption` — 草稿态下对 probe 的 `configOptions` 调用 ACP `session/set_config_option`
  - `chat:probe:event`（renderer 订阅）— 主动推送 `{ agentId, configOptions }` 增量
- **修改 `chat:stream:message`**：入参新增可选 `acpSessionId?: string`。主进程在 handler 内 consume 对应 ProbeEntry → 调用 `sessionStore.persistAcpSessionId(acpSessionId)` 写入 fyllo session meta → 让 `AcpSession.start` 走 `tryHandlePersistedSession` 的 direct prompt 路径。
- **修改 AcpSession reminder 注入语义**：`AcpSessionOpts` 新增 `presetAcpSessionId?: string` 标记。当 turn 由 probe 复用 acpSessionId 转入正式会话时，**仍需注入 system-reminder**（这是 fyllo session 的首条消息，agent 之前没有 reminder 上下文）；同时跳过 `connection.newSession` 调用。
- **修改前端 session store**：新增 `draftProbeByAgent: Map<agentId, DraftProbeState>` 内存态、`ensureDraftProbe(agentId)`、`closeDraftProbe(agentId)`、`setDraftConfigOption` actions。watch `draftAgentId` 变化触发"先清后取"。
- **修改 `ConfigOptionsBar` 渲染规则**：草稿态从"不渲染"改为"以 `draftProbe.configOptions` 为数据源渲染"；当 `draftAgentId` 切换时，UI **立即清空旧数据**（不显示过渡态）再等待新 probe 数据到达。
- **修改 `chat-service.ts createSession`**：接受可选 `acpSessionId`，写入 SessionMeta 时把它一并落盘（避免后续 `chat:stream:message` 还得二次写）。
- **修改 chat store sendMessage**：sendMessage 拼装 IPC 入参时若 `draftProbe.status === "ready"`，把 `draftProbe.acpSessionId` 透传给 `chat:stream:message`。

## Capabilities

### New Capabilities

- `chat-session-probe`：DraftSession Probe 的生命周期、IPC 协议、ACP newSession/closeSession 调用、ProbeRegistry 内存态语义、agent 切换时的清理顺序、错误恢复策略。

### Modified Capabilities

- `acp-chat-backend`：扩展 `chat:stream:message` 入参以接受可选 `acpSessionId`；`AcpSessionOpts` 新增 `presetAcpSessionId?: string`；定义 preset 分支的 reminder 注入与 newSession 跳过语义；定义 IPC handler 在 stream 发起前 consume Probe 的握手协议。
- `chat-interface`：`ConfigOptionsBar` 在草稿态下以 `draftProbe.configOptions` 为数据源渲染；切换 `draftAgentId` 时立即清空旧 UI；渲染条件真值表更新。

## Impact

**主进程**

- 新增 `electron/main/services/chat/session-probe-service.ts`
- 新增 `electron/main/services/chat/session-probe-registry.ts`（内存 Map 封装）
- 修改 `electron/main/ipc/chat.ts`（注册 probe 通道、`chat:stream:message` consume probe）
- 修改 `electron/main/services/chat/acp-session.ts`（`presetAcpSessionId` 分支）
- 修改 `electron/main/services/chat/chat-service.ts`（`createSession` 接受可选 acpSessionId）
- 修改 `shared/types/channels.ts` 增加 `ChatProbeChannels`
- 修改 `shared/schemas/ipc/chat.ts` 增加 probe 输入 schema、`streamMessageInputSchema` 增加 `acpSessionId?`

**渲染进程**

- 修改 `frontend/src/stores/session.ts` 增加 draftProbe 内存态与生命周期
- 修改 `frontend/src/stores/chat.ts` `sendMessage` 透传 `acpSessionId`
- 修改 `frontend/src/components/chat/prompt/ConfigOptionsBar.vue` 数据源切换
- 修改 `frontend/src/components/chat/prompt/ChatPromptPanel.vue`（如需暴露 draftProbe 给 Bar）
- 新增 `frontend/src/api/chat.ts` 中 probe IPC 封装

**Preload**

- 修改 `electron/preload/api/chat.ts` 暴露 probe 通道与事件订阅

**测试**

- 新增 `electron/main/__tests__/services/chat/session-probe-service.spec.ts`
- 修改 `electron/main/__tests__/ipc/chat.spec.ts`（覆盖 acpSessionId 入参）
- 修改 `frontend/src/__tests__/stores/session.spec.ts`、`chat.spec.ts`
- 修改 `frontend/src/__tests__/components/config-options-bar.spec.ts`
