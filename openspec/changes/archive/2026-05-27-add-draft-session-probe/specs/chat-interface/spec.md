## ADDED Requirements

### Requirement: useSessionStore 维护 draftProbeByAgent 内存态

`frontend/src/stores/session.ts` 的 `useSessionStore` SHALL 暴露：

- 状态：`draftProbeByAgent: Ref<Map<string, DraftProbeState>>`（响应式，pinia ref）
- getter：`activeDraftProbe: ComputedRef<DraftProbeState | null>`，返回 `draftProbeByAgent.value.get(draftAgentId.value)` 或 `null`（当 `draftAgentId.value` 为 `null` 时）
- action：`ensureDraftProbe(agentId: string, projectId: string): Promise<void>`
- action：`closeDraftProbe(agentId: string): Promise<void>`
- action：`setDraftConfigOption(input: { agentId: string; configId: string; type: "select" | "boolean"; value: string | boolean }): Promise<void>`
- action：`applyProbeUpdate(agentId: string, snapshot: ProbeSnapshot | null): void`（由 `chat:probe:update` 监听器调用）
- 启动钩子：`subscribeProbeUpdates(): () => void`，在 `App.vue` 初始化阶段调用一次，返回 unsubscribe（卸载时调用）

`DraftProbeState` 类型定义为：

```ts
type DraftProbeStatus = "starting" | "ready" | "failed";

interface DraftProbeState {
  agentId: string;
  status: DraftProbeStatus;
  acpSessionId: string | null;
  configOptions: AcpSessionConfigOption[];
  error?: { code: string; message: string };
}
```

`ensureDraftProbe(agentId, projectId)` 行为：

1. 调用 `chatApi.probeEnsure({ agentId, projectId })`。
2. 成功：把响应快照写入 `draftProbeByAgent.value.set(agentId, snapshot)`。
3. 失败：写入 `{ status: "failed", error }` 占位条目。
4. 不抛错；UI 通过 `activeDraftProbe.value.status` 决定渲染。

`closeDraftProbe(agentId)` 行为：

1. **立即** `draftProbeByAgent.value.delete(agentId)`（同步执行，UI 在下一 tick 反应）。
2. 异步调用 `chatApi.probeClose({ agentId })`，结果忽略（成功失败均不重写本地状态）。

`setDraftConfigOption({ agentId, configId, type, value })` 行为（与 `chat.setConfigOption` 对称的乐观更新逻辑）：

1. 找到 `draftProbeByAgent.value.get(agentId)` 的 `configOptions` 中 `id === configId` 的项，记录 `previousValue`。
2. 立即把 `currentValue` 更新为目标 `value`（乐观更新）。
3. 通过 `useChatStore` 的 `markConfigOptionPending(configId)` 标记 pending（复用现有 pendingConfigIds Set，不引入新结构）。
4. 调 `chatApi.probeSetConfigOption({ agentId, configId, type, value })`：
   - 成功：把响应 `configOptions` 替换到当前 entry。
   - 失败：把 `currentValue` 回滚为 `previousValue`；用 `useToast()` 提示错误。
5. `finally` 调 `clearConfigOptionPending(configId)`。

`applyProbeUpdate(agentId, snapshot)` 行为：

- `snapshot === null` SHALL `draftProbeByAgent.value.delete(agentId)`。
- 否则 SHALL `draftProbeByAgent.value.set(agentId, snapshot)`。

`subscribeProbeUpdates()` 行为：

- 注册 `chatApi.onProbeUpdate(handler)`，handler 内部调 `applyProbeUpdate`。
- 同时监听 `useAcpAgentsStore` 的 `agentUnavailable` 事件，对应 agentId 调 `applyProbeUpdate(agentId, null)`。
- 返回 unsubscribe，撤销 IPC 监听与事件监听。

#### Scenario: ensureDraftProbe 写入 ready snapshot

- **WHEN** 调用 `ensureDraftProbe("claude-code", projectId)`，IPC 返回 `{ ok: true, data: { status: "ready", acpSessionId: "sess-A", configOptions: [...] } }`
- **THEN** `draftProbeByAgent.value.get("claude-code")` 存在
- **AND** 该 entry 的 `acpSessionId === "sess-A"`，`configOptions` 与响应一致

#### Scenario: closeDraftProbe 立即清空本地态

- **WHEN** `draftProbeByAgent` 中存在 `claude-code` 的 entry，调用 `closeDraftProbe("claude-code")`
- **THEN** 同步调用结束后 `draftProbeByAgent.value.has("claude-code") === false`
- **AND** UI 在下一 tick 不再渲染 claude-code 的 configOptions
- **AND** 异步 IPC `chat:probe:close` 已发起（不阻塞）

#### Scenario: setDraftConfigOption 乐观更新与回滚

- **WHEN** `draftProbeByAgent` 中存在 `claude-code` 的 entry，含 `id="model", currentValue="haiku"` 的 configOption
- **AND** 调用 `setDraftConfigOption({ agentId: "claude-code", configId: "model", type: "select", value: "sonnet" })`
- **THEN** 该 configOption 的 `currentValue` 立即变为 `"sonnet"`
- **AND** chat store 的 `pendingConfigIds` 含 `"model"`
- **AND** IPC 失败时 `currentValue` 回滚为 `"haiku"`，并 `useToast()` 提示错误
- **AND** `pendingConfigIds` 移除 `"model"`

#### Scenario: applyProbeUpdate snapshot 为 null 时清空对应 entry

- **WHEN** 主进程通过 `chat:probe:update` 推送 `{ agentId: "claude-code", snapshot: null }`
- **THEN** session store 调 `applyProbeUpdate("claude-code", null)`
- **AND** `draftProbeByAgent.value.has("claude-code") === false`

### Requirement: draftAgentId 变化时先清后取

`useSessionStore` SHALL 在 `draftAgentId` 变化时执行"先清后取"动作：

1. 获取上一个 `previousAgentId`（来自 watcher 的 oldValue）。
2. 若 `previousAgentId` 非空且与新值不同，**同步**调用 `closeDraftProbe(previousAgentId)`（先于任何 ensure）。
3. 若新值（`currentAgentId`）非空，**异步**调用 `ensureDraftProbe(currentAgentId, projectId)`。
4. `projectId` 取自 `useProjectStore().currentProject?.id`；若为空则不发起 ensure（无项目无法 probe）。

watcher SHALL 通过 `watch(() => sessionStore.draftAgentId, (next, prev) => ..., { immediate: true })` 实现，初次执行（prev === undefined）时不触发 close，仅根据 next 触发 ensure。

watcher SHALL 实现 200ms debounce，避免用户快速切 agent 时的雪崩 newSession 调用：debounce 仅作用于 ensure，close 不 debounce（保持 UI 立即清空的语义）。

watcher SHALL 仅在 `activeSessionId === null`（草稿态）时执行 close/ensure。`activeSessionId !== null` 时（用户处于已建立 session）`draftAgentId` 即便变化也 SHALL NOT 触发 probe 相关动作。

#### Scenario: 用户从 claude-code 切到 codex

- **WHEN** 草稿态下 `draftAgentId` 从 `"claude-code"` 变为 `"codex"`
- **THEN** session store 同步调 `closeDraftProbe("claude-code")`，`draftProbeByAgent` 立即移除 claude-code entry
- **AND** ConfigOptionsBar 在下一 tick 不再渲染任何 configOptions（因为新 codex probe 还未到达）
- **AND** 200ms 后 session store 调 `ensureDraftProbe("codex", projectId)`，IPC 完成后 `draftProbeByAgent` 写入 codex 的 ready snapshot
- **AND** UI 渲染 codex 的 configOptions（如有）

#### Scenario: 用户在 200ms 内连续切多次

- **WHEN** 草稿态下 `draftAgentId` 在 50ms 内从 A → B → C
- **THEN** A 与 B 的 close 各自同步执行（`draftProbeByAgent` 中均不存在）
- **AND** ensure 仅对最终的 C 在 200ms 后触发一次

#### Scenario: 已建立 session 切 agent 不触发 probe

- **WHEN** `activeSessionId !== null`，用户改 `agent` 触发 `setSessionAgent(...)`
- **THEN** session store SHALL NOT 调 `closeDraftProbe` 或 `ensureDraftProbe`
- **AND** `draftProbeByAgent` 内容不变

### Requirement: chat store sendMessage 在草稿态首条消息携带 probe acpSessionId

`frontend/src/stores/chat.ts` 的 `sendMessage(parts)` SHALL 在草稿态创建 fyllo session 后、调用 `streamSessionMessage` 之前，根据 `useSessionStore().activeDraftProbe` 决定是否携带 `acpSessionId`：

1. 拿到草稿态对应的 `draftAgentIdSnapshot`（与 `createSession` 入参一致）。
2. 读取 `useSessionStore().draftProbeByAgent.get(draftAgentIdSnapshot)` 得到 `probeBeforeCreate`。
3. 调 `streamSessionMessage(activeSession, projectId, parts, sessionStore, streamRunId, options)`，其中 `options.acpSessionId` 仅当 `probeBeforeCreate?.status === "ready" && probeBeforeCreate.acpSessionId` 时传入。
4. **不要在 `streamSessionMessage` 启动后再读 probe**——`createSession` 与 stream 之间存在异步窗口，必须使用 `probeBeforeCreate` 的快照。
5. **必须**在写入 `chatApi.streamMessage(...)` 之前**同步**调用 `useSessionStore().applyProbeUpdate(draftAgentIdSnapshot, null)` 清空对应 draftProbe 内存态——主进程 handler 会 `takeFor` consume，renderer 不应再认为它存在。

`streamSessionMessage` 函数签名 SHALL 改为：

```ts
function streamSessionMessage(
  activeSession: Session,
  projectId: string,
  parts: ChatPromptPart[],
  sessionStore: ReturnType<typeof useSessionStore>,
  streamRunId: number,
  options: { acpSessionId?: string }
): void;
```

`chatApi.streamMessage(...)` 调用 SHALL 把 `options.acpSessionId` 透传到第六个参数。

#### Scenario: 草稿态发首条消息，probe 已 ready

- **WHEN** 草稿态 `draftAgentId === "claude-code"`，`draftProbeByAgent` 中 claude-code entry `status === "ready", acpSessionId === "sess-A"`
- **AND** 用户调 `sendMessage([{ type: "text", text: "hi" }])`
- **THEN** chat store 创建 fyllo session
- **AND** 调 `chatApi.streamMessage(..., { acpSessionId: "sess-A" })`
- **AND** 同步调 `applyProbeUpdate("claude-code", null)`，`draftProbeByAgent` 移除 claude-code entry

#### Scenario: 草稿态发首条消息，probe 失败或未就绪

- **WHEN** 草稿态 `draftAgentId === "claude-code"`，`draftProbeByAgent` 中 claude-code entry `status === "failed"` 或 `status === "starting"` 或不存在
- **AND** 用户调 `sendMessage([...])`
- **THEN** chat store 调 `chatApi.streamMessage(...)` 不带 `acpSessionId`
- **AND** SHALL NOT 调 `applyProbeUpdate(..., null)`（保留 failed/starting 态供后续重试或 UI 显示）

#### Scenario: 已建立 session 发消息不读 draftProbe

- **WHEN** `activeSessionId !== null`，用户发消息
- **THEN** chat store 调 `streamSessionMessage` 不传 `acpSessionId`
- **AND** SHALL NOT 读 `draftProbeByAgent`

## MODIFIED Requirements

### Requirement: ChatPromptPanel 在 footer 渲染 ConfigOptionsBar

系统 SHALL 在 `frontend/src/components/chat/prompt/ChatPromptPanel.vue` 的 `UChatPrompt#footer` slot 左侧动作区中，紧随 `ChatAgentSelect` 之后渲染 `ConfigOptionsBar` 组件，用于呈现 ACP agent 暴露的 session 级配置选项（mode / model / thought_level 等）。

`ConfigOptionsBar` 的数据源 SHALL 按下述真值表选择：

| 状态                                                                                         | 数据源                           |
| -------------------------------------------------------------------------------------------- | -------------------------------- |
| `activeSession !== null`                                                                     | `activeSession.configOptions`    |
| `activeSession === null` 且 `activeDraftProbe?.status === "ready"`                           | `activeDraftProbe.configOptions` |
| `activeSession === null` 且 `activeDraftProbe?.status` 为 `"starting"` / `"failed"` / `null` | `[]`（不渲染）                   |

`ConfigOptionsBar` 渲染条件 SHALL 严格按照下述真值表决定：

| 状态                           | 渲染   |
| ------------------------------ | ------ |
| 数据源为 `undefined` 或 `null` | 不渲染 |
| 数据源为空数组（`[]`）         | 不渲染 |
| 数据源 `length > 0`            | 渲染   |

`ConfigOptionsBar` 出现/消失时 SHALL 使用 150ms 的 ease-out 淡入位移过渡（opacity + translate-y-1），不使用 skeleton/placeholder。

切换 `draftAgentId`（草稿态）时，UI 渲染数据源 SHALL **立即**变为新 agent 对应的 `activeDraftProbe`（其值受 `closeDraftProbe` 与 `ensureDraftProbe` 控制）。已被 `closeDraftProbe` 移除的 agent 对应 configOptions SHALL NOT 出现在 UI 中——即便新 agent 的 probe 还未到达。

`ConfigOptionItem` 的 setConfigOption 调用 SHALL 按当前态分派：

- `activeSession !== null` 时 SHALL 调 `chatStore.setConfigOption({ sessionId, configId, type, value })`（既有路径，IPC `chat:setConfigOption`）
- `activeSession === null` 时 SHALL 调 `sessionStore.setDraftConfigOption({ agentId: draftAgentId, configId, type, value })`（IPC `chat:probe:setConfigOption`）

#### Scenario: 草稿态 probe 就绪时渲染 ConfigOptionsBar

- **WHEN** 用户处于草稿态（`activeSession === null`），`draftAgentId === "claude-code"`，`activeDraftProbe.status === "ready"`，`activeDraftProbe.configOptions.length === 3`
- **THEN** `ConfigOptionsBar` 渲染 3 个选择器，数据源为 `activeDraftProbe.configOptions`
- **AND** footer 左侧顺序：`+`、`/`、`ChatAgentSelect`、`ConfigOptionsBar`

#### Scenario: 草稿态 probe 启动中不渲染

- **WHEN** 用户处于草稿态，`activeDraftProbe.status === "starting"`
- **THEN** `ConfigOptionsBar` 不渲染

#### Scenario: 草稿态 probe 失败不渲染

- **WHEN** 用户处于草稿态，`activeDraftProbe.status === "failed"`
- **THEN** `ConfigOptionsBar` 不渲染

#### Scenario: 切换 agent 立即清空 ConfigOptionsBar

- **WHEN** 草稿态从 `claude-code`（probe ready，configOptions 3 项）切到 `codex`（probe 启动中）
- **THEN** ConfigOptionsBar 在下一 tick 立即不渲染（不显示 claude-code 的旧数据）
- **AND** 当 codex probe ready 后 ConfigOptionsBar 渲染 codex 的 configOptions

#### Scenario: 已建立 session 但 agent 未回传 configOptions

- **WHEN** session 已建立（`activeSession.acpSessionId` 已存在），但 `activeSession.configOptions === undefined`
- **THEN** `ConfigOptionsBar` 不渲染

#### Scenario: agent 显式声明无 configOptions

- **WHEN** chat store 收到 `config_options_update` chunk，`options` 为空数组并替换 `activeSession.configOptions`
- **THEN** `ConfigOptionsBar` 不渲染

#### Scenario: configOptions 非空时渲染（已建立 session）

- **WHEN** `activeSession.configOptions` 长度为 3，分别为 mode、model、effort
- **THEN** `ConfigOptionsBar` 渲染 3 个选择器
- **AND** 视觉位置位于 `ChatAgentSelect` 之后、ContextUsageRing 之前

#### Scenario: 草稿态 ConfigOptionItem 调 setDraftConfigOption

- **WHEN** 用户处于草稿态，在 ConfigOptionsBar 中切 `model` 为 `"sonnet"`
- **THEN** 组件调 `sessionStore.setDraftConfigOption({ agentId, configId: "model", type: "select", value: "sonnet" })`
- **AND** SHALL NOT 调 `chatStore.setConfigOption`

#### Scenario: 已建立 session ConfigOptionItem 调 chatStore.setConfigOption

- **WHEN** 用户处于已建立 session，在 ConfigOptionsBar 中切 `model` 为 `"sonnet"`
- **THEN** 组件调 `chatStore.setConfigOption({ sessionId, configId: "model", type: "select", value: "sonnet" })`
- **AND** SHALL NOT 调 `sessionStore.setDraftConfigOption`
