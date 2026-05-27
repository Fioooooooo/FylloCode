## 1. 共享类型与 IPC schema

- [x] 1.1 在 `shared/types/channels.ts` 新增 `ChatProbeChannels`，导出 `ensure: "chat:probe:ensure"`、`close: "chat:probe:close"`、`setConfigOption: "chat:probe:setConfigOption"`、`update: "chat:probe:update"`
- [x] 1.2 在 `shared/types/chat-probe.ts`（新文件）导出 `ProbeStatus`、`ProbeSnapshot` 接口（结构见 specs/chat-session-probe/spec.md "ProbeEntry" 与 "ProbeSnapshot" 定义；ProbeSnapshot 不含 `inflightEnsure` 与 `startedAt`）
- [x] 1.3 在 `shared/schemas/ipc/chat.ts` 新增 `probeEnsureInputSchema`（`{ agentId: nonempty, projectId: nonempty }`）、`probeCloseInputSchema`（`{ agentId }`）、`probeSetConfigOptionInputSchema`（结构与 `setConfigOptionInputSchema` 对称但用 `agentId` 替换 `projectId+sessionId`）
- [x] 1.4 在 `shared/schemas/ipc/chat.ts` 修改 `streamMessageInputSchema`：新增可选字段 `acpSessionId: z.string().min(1).optional()`；维护现有 `prompt` discriminated union 不变

## 2. 主进程：SessionProbe 服务与注册表

- [x] 2.1 新建 `electron/main/services/chat/session-probe-registry.ts`：导出单例 `sessionProbeRegistry`，封装 `Map<string, ProbeEntry>`；提供 `get`、`set`、`delete`、`takeFor(agentId, expectedAcpSessionId)`、`keys` 五个方法。`takeFor` 仅在 `entry.acpSessionId === expectedAcpSessionId` 时移除并返回，否则返回 null
- [x] 2.2 新建 `electron/main/services/chat/session-probe-bus.ts`：使用 `EventEmitter` 单例，定义 `update` 事件 payload `{ agentId: string; snapshot: ProbeSnapshot | null }`
- [x] 2.3 新建 `electron/main/services/chat/session-probe-service.ts`：导出 `ensureProbe(agentId, projectPath)`、`closeProbe(agentId)`、`setProbeConfigOption(input)`、`getProbeSnapshot(agentId)`，逐项按 specs/chat-session-probe/spec.md 中 "SessionProbeService 提供 ensureProbe 与 closeProbe 操作" requirement 的步骤实现
  - 复用 `getOrStartProcess(agentId)` 获取 connection
  - 复用 `getBundledMcpServers({ projectPath })` 与 `toAcpMcpServerEnv` 计算 mcpServers
  - 复用 `normalizeAcpSessionConfigOptions`（来自 `electron/main/services/chat/acp-mapper.ts`）
  - `ensureProbe` 内部使用 `inflightEnsure` Promise 字段做并发去重
  - 失败时把 entry 状态更新为 `"failed"` 并 emit 一次 update 事件
- [x] 2.4 把 `electron/main/services/chat/config-option-service.ts` 中私有的 `buildPayload` 与 `isMethodNotFoundError` 抽到新文件 `electron/main/services/chat/acp-config-option-rpc.ts` 并 export，使 `setProbeConfigOption` 与 `setConfigOption` 共用；`config-option-service.ts` 改为 import
- [x] 2.5 在 `electron/main/infra/process/acp-process-pool.ts` 暴露 agent 进程不可用事件（如尚未存在）；在 `session-probe-service.ts` 模块顶层订阅，对每条 unavailable 事件调 `sessionProbeRegistry.delete(agentId)` 并 emit `{ agentId, snapshot: null }`
- [x] 2.6 单测：新建 `electron/main/__tests__/services/chat/session-probe-service.spec.ts`，覆盖 ensure 首次成功、ensure 并发去重、close 释放、close 在 closeSession 抛错时不上抛、setProbeConfigOption 成功与失败、agent unavailable 触发清理。Mock `getOrStartProcess` 与 `getBundledMcpServers`

## 3. 主进程：IPC handler 注册与 chat:stream:message 改造

- [x] 3.1 在 `electron/main/ipc/chat.ts` 的 `registerChatHandlers()` 内注册 `ChatProbeChannels.ensure`、`ChatProbeChannels.close`、`ChatProbeChannels.setConfigOption` 三个 `ipcMain.handle`，分别校验输入 schema 后调用 `sessionProbeService` 对应方法，结果包装为 `IpcResponse`
- [x] 3.2 在 `electron/main/ipc/chat.ts` 模块顶层（或专用 `setupProbeBroadcast(mainWindow)` 函数）订阅 `sessionProbeBus.on("update", ...)`，通过 `mainWindow.webContents.send(ChatProbeChannels.update, payload)` 广播。在 main 进程入口处把 `mainWindow` 传入这个 setup
- [x] 3.3 修改 `electron/main/ipc/chat.ts` 的 `chat:stream:message` handler：
  - 解析 input 时新增 `acpSessionId` 字段
  - 在 `onReady` 钩子内、调用 `loadSessionMeta` 之前判断 `acpSessionId`：若非空，调 `sessionProbeRegistry.takeFor(agentId, acpSessionId)`；返回 null 时通过 `sink.sendError(IpcErrorCodes.VALIDATION_ERROR, "...")` 并直接 `return`
  - 若 takeFor 成功，调 `patchSessionMeta(projectPath, sessionId, { acpSessionId, agentId, config_options: entry.configOptions, updatedAt })`
  - 构造 `AcpSession` 时根据该分支决定是否传 `presetAcpSessionId: acpSessionId`
- [x] 3.4 单测：修改 `electron/main/__tests__/ipc/chat.spec.ts`，新增 cases 覆盖 "携带 acpSessionId 命中 probe"、"acpSessionId 入参与 Registry 不匹配返回错误"、"不传 acpSessionId 走老路径"

## 4. 主进程：AcpSession presetAcpSessionId 分支

- [x] 4.1 修改 `electron/main/services/chat/acp-session.ts`：在 `AcpSessionOpts` 接口新增可选 `presetAcpSessionId?: string`；在 `AcpSession` 类内记录到 `private readonly presetAcpSessionId?: string`
- [x] 4.2 修改 `runStartFlow`：当 `presetAcpSessionId !== undefined` 时跳过 `tryHandlePersistedSession` / `recoverSession` 既有分支，进入新增的 `runPresetFlow(context, parts)`
- [x] 4.3 实现 `runPresetFlow`：
  - 设 `this.acpSessionId = this.presetAcpSessionId`
  - 调 `assertPromptCapabilities(context.entry.initializeResponse, parts)`
  - `await this.persistResolvedSession(this.presetAcpSessionId)`（保留现有 emit `session_id_resolved` 逻辑）
  - 调 `resolveReminderParts({ createdNewSession: true, recoveryHistoryReminder: null, ... })` 复用注入逻辑
  - 拼装 `promptParts = [...reminderParts.map(toAcpText), ...await toAcpPromptParts(parts)]`
  - 调 `runPrompt(...)`，捕获错误后按 specs/acp-chat-backend/spec.md "presetAcpSessionId direct prompt 失败时不进入 recovery" 要求直接报错
  - 不调用 `emitConfigOptions`
- [x] 4.4 单测：修改 `electron/main/__tests__/services/chat/acp-session.spec.ts`，新增 cases："preset 分支跳过 newSession"、"preset 分支注入 reminder"、"preset 分支不发 config_options_update"、"preset 分支 prompt 失败不进入 recovery"

## 5. Preload API

- [x] 5.1 修改 `electron/preload/api/chat.ts` 的 `chatApi`：
  - 新增 `probeEnsure({ agentId, projectId })`：调 `ipcRenderer.invoke(ChatProbeChannels.ensure, ...)`
  - 新增 `probeClose({ agentId })`：调 `ipcRenderer.invoke(ChatProbeChannels.close, ...)`
  - 新增 `probeSetConfigOption({ agentId, configId, type, value })`：调 `ipcRenderer.invoke(ChatProbeChannels.setConfigOption, ...)`
  - 新增 `onProbeUpdate(handler)`：注册 `ipcRenderer.on(ChatProbeChannels.update, ...)`，返回 unsubscribe 函数
  - 修改 `streamMessage` 签名加第六参数 `options?: { acpSessionId?: string }`，在 `ipcRenderer.invoke(ChatStreamChannels.streamMessage, payload)` 的 payload 中合并 `acpSessionId`
- [x] 5.2 单测：修改 `electron/main/__tests__/preload/api/chat.spec.ts`，覆盖新增方法与 streamMessage 新参数

## 6. 渲染进程：session store

- [x] 6.1 修改 `frontend/src/stores/session.ts`：
  - 新增 ref `draftProbeByAgent = ref(new Map<string, DraftProbeState>())`
  - 新增 computed `activeDraftProbe`：`draftAgentId.value ? draftProbeByAgent.value.get(draftAgentId.value) ?? null : null`
  - 新增 actions `ensureDraftProbe`、`closeDraftProbe`、`setDraftConfigOption`、`applyProbeUpdate`，逐项实现 specs/chat-interface/spec.md "useSessionStore 维护 draftProbeByAgent 内存态" requirement
  - `setDraftConfigOption` 通过 `useChatStore()` 暴露的 `markConfigOptionPending` / `clearConfigOptionPending` 复用 pending 集合
  - 在 `return` 中导出新增字段与 actions
- [x] 6.2 在 `frontend/src/stores/session.ts` 增加 watcher：监听 `draftAgentId` 变化（`{ immediate: true }`，在草稿态条件下）；旧值非空且与新值不同 → 同步调 `closeDraftProbe(prev)`；新值非空 → debounce 200ms 后调 `ensureDraftProbe(next, projectId)`。可借助 `@vueuse/core` 的 `useDebounceFn` 或自定义最小实现；watcher 仅在 `activeSessionId === null` 触发动作
- [x] 6.3 在 `frontend/src/stores/session.ts` 暴露 `subscribeProbeUpdates()`；在 `App.vue` 初始化阶段调用一次（与现有 `loadCapabilitiesCache` 同区域），返回值在 `onUnmounted` 调
- [x] 6.4 在 `useChatStore` 暴露的 actions 列表中显式导出 `markConfigOptionPending` 与 `clearConfigOptionPending`（如尚未导出），供 session store 调用
- [x] 6.5 单测：修改 `frontend/src/__tests__/stores/session.spec.ts`，覆盖 ensure/close/setDraft 路径与 draftAgentId watcher 的"先清后取"语义、debounce 行为、已建立 session 不触发 probe

## 7. 渲染进程：chat store sendMessage

- [x] 7.1 修改 `frontend/src/stores/chat.ts` `streamSessionMessage` 函数签名增加 `options: { acpSessionId?: string }`，在 `chatApi.streamMessage(...)` 调用中透传
- [x] 7.2 修改 `sendMessage`：在 `if (!activeSession)` 分支内、`createSession` 完成、`isCurrentStreamRun` 通过校验后：
  - 读 `sessionStore.draftProbeByAgent.get(draftAgentIdSnapshot)` 得 `probeBeforeCreate`
  - 计算 `streamOptions: { acpSessionId?: string }`，仅当 `probeBeforeCreate?.status === "ready" && probeBeforeCreate.acpSessionId` 时填入
  - 同步调 `sessionStore.applyProbeUpdate(draftAgentIdSnapshot, null)`
  - 把 `streamOptions` 传入 `streamSessionMessage(..., streamOptions)`
- [x] 7.3 已建立 session（`activeSession !== null` 进入 sendMessage）路径 SHALL 传 `streamOptions: {}`，与现状等价
- [x] 7.4 单测：修改 `frontend/src/__tests__/stores/chat.spec.ts`，覆盖 "草稿态 probe ready 时携带 acpSessionId"、"probe failed 时不携带"、"已建立 session 不读 draftProbe"、"applyProbeUpdate 在 streamMessage 调用前同步执行"

## 8. 渲染进程：ConfigOptionsBar

- [x] 8.1 修改 `frontend/src/components/chat/prompt/ConfigOptionsBar.vue`：把数据源从 `activeSession.configOptions` 改为 computed：`activeSession ? activeSession.configOptions : (activeDraftProbe.value?.status === "ready" ? activeDraftProbe.value.configOptions : [])`
- [x] 8.2 修改 `ConfigOptionItem` 的 setConfigOption 调用：根据 `activeSession === null` 决定走 `sessionStore.setDraftConfigOption` 还是 `chatStore.setConfigOption`
- [x] 8.3 单测：修改 `frontend/src/__tests__/components/config-options-bar.spec.ts`，覆盖 specs/chat-interface/spec.md 中 "草稿态 probe 就绪时渲染"、"草稿态 probe 启动中不渲染"、"草稿态 probe 失败不渲染"、"切换 agent 立即清空"、"草稿态调 setDraftConfigOption"、"已建立 session 调 chatStore.setConfigOption" 六个 scenario

## 9. 集成与回归

- [x] 9.1 在 `frontend/src/App.vue` 初始化阶段，新增 `sessionStore.subscribeProbeUpdates()` 调用，与现有 `acpAgentsStore.loadCapabilitiesCache` 同位置
- [x] 9.2 在 `frontend/src/stores/acp-agents.ts` 已有的 `agentUnavailable` 事件监听中：除了 `promptCapabilitiesByAgent.delete(agentId)`，再调 `useSessionStore().applyProbeUpdate(agentId, null)`，确保 renderer 与主进程清理同步
- [x] 9.3 跑 `pnpm typecheck` 与 `pnpm test`，所有相关单测通过；本地启动 `pnpm dev`，手动验证：
  - 草稿态选择 claude-code，等待 ConfigOptionsBar 出现
  - 切换到 codex，ConfigOptionsBar 立即清空，等待 codex 数据到达后重新渲染
  - 草稿态调整 model，发送首条消息，主进程日志显示 "preset path"，无 newSession 调用
  - 杀掉 agent 进程，UI ConfigOptionsBar 自动消失
- [x] 9.4 在 `guidelines/` 目录评估是否需要新增或更新文档：若决定增补，增加在 `guidelines/MainProcess.md` 与 `guidelines/RendererProcess.md` 中描述 SessionProbe 责任边界、IPC 通道、内存生命周期；若不需要，写入本任务备注理由
