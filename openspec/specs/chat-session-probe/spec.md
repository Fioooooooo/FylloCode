# chat-session-probe 规范

## Purpose

定义草稿会话阶段的 ACP session probe 机制，包括主进程 ProbeRegistry/ProbeService、probe IPC、available commands 接收、SessionMeta 转正与 `FYLLO_SESSION_ID` 注入。

## Requirements

### Requirement: SessionProbeRegistry 在主进程维护按 agentId 索引的内存态

系统 SHALL 在 `src/main/services/chat/session-probe-registry.ts` 中导出单例 `SessionProbeRegistry`，维护一个进程级别的纯内存 `Map<string, ProbeEntry>`，键为 `agentId`，值为 `ProbeEntry`。

`ProbeEntry` 类型 SHALL 定义为：

```ts
type ProbeStatus = "starting" | "ready" | "failed";

interface ProbeEntry {
  agentId: string;
  status: ProbeStatus;
  fylloSessionId: string;
  acpSessionId: string | null;
  configOptions: AcpSessionConfigOption[];
  availableCommands: AcpAvailableCommand[];
  error?: { code: string; message: string };
  startedAt: number;
  inflightEnsure?: Promise<ProbeEntry>;
}
```

`fylloSessionId` 字段 SHALL 在 entry 创建（`starting` 占位）时即由 `newSessionId()` 生成并赋值，且在该 entry 生命周期内不变。`availableCommands` 字段 SHALL 与 `configOptions` 并列，类型为 `@shared/types/chat` 导出的 `AcpAvailableCommand[]`。占位（`status === "starting"`）与失败（`status === "failed"`）entry 的 `availableCommands` SHALL 初始化为空数组 `[]`。

`SessionProbeRegistry` SHALL 暴露以下方法：

- `get(agentId: string): ProbeEntry | undefined`
- `set(agentId: string, entry: ProbeEntry): void`
- `delete(agentId: string): ProbeEntry | undefined`
- `takeFor(agentId: string, expectedAcpSessionId: string): ProbeEntry | null`：仅当 `entry.acpSessionId === expectedAcpSessionId` 时移除并返回该 entry，否则返回 `null`，确保 promote 与 close 之间的原子性
- `keys(): string[]`：用于诊断和清理

`SessionProbeRegistry` SHALL NOT 落盘任何状态。进程退出时 entries 直接随进程释放，SHALL NOT 调用 `closeSession`（agent 进程会随主进程一并退出）。

`toProbeSnapshot(entry: ProbeEntry): ProbeSnapshot` SHALL 将 `entry.availableCommands` 与 `entry.fylloSessionId` 一并映射到 snapshot 对应字段。

#### Scenario: 首次 ensure 写入 starting entry

- **WHEN** `SessionProbeRegistry.set("claude-code", { status: "starting", ... })` 被调用，且原本 Map 中无该 agentId
- **THEN** Map 中新增该条目
- **AND** 后续 `get("claude-code")` 返回该 entry
- **AND** 该 entry 的 `availableCommands` 为空数组 `[]`
- **AND** 该 entry 的 `fylloSessionId` 为非空字符串

#### Scenario: takeFor 在 acpSessionId 不匹配时返回 null

- **WHEN** Registry 中 `claude-code` 对应 entry 的 `acpSessionId` 为 `"sess-A"`
- **AND** 调用 `takeFor("claude-code", "sess-B")`
- **THEN** 返回 `null`
- **AND** Map 中该 entry 仍然存在

#### Scenario: takeFor 匹配成功后 entry 从 Map 移除

- **WHEN** Registry 中 `claude-code` 对应 entry 的 `acpSessionId` 为 `"sess-A"`
- **AND** 调用 `takeFor("claude-code", "sess-A")`
- **THEN** 返回该 entry（含其 `availableCommands` 与 `fylloSessionId`）
- **AND** Map 中不再包含该 agentId 的条目

#### Scenario: toProbeSnapshot 映射 availableCommands 与 fylloSessionId

- **WHEN** `toProbeSnapshot` 接收一个 `availableCommands` 为 `[{ name: "init", description: "..." }]`、`fylloSessionId` 为 `"sess-P"` 的 entry
- **THEN** 返回的 snapshot 的 `availableCommands` 与该数组内容一致
- **AND** 返回的 snapshot 的 `fylloSessionId` 为 `"sess-P"`

### Requirement: SessionProbeService 提供 ensureProbe 与 closeProbe 操作

系统 SHALL 在 `src/main/services/chat/session-probe-service.ts` 提供以下函数：

- `ensureProbe(agentId: string, projectPath: string): Promise<ProbeSnapshot>`
- `closeProbe(agentId: string): Promise<void>`
- `setProbeConfigOption(input: { agentId: string; configId: string; type: "select" | "boolean"; value: string | boolean }): Promise<ProbeSnapshot>`
- `getProbeSnapshot(agentId: string): ProbeSnapshot | null`

`ProbeSnapshot` 类型 SHALL 定义为：

```ts
interface ProbeSnapshot {
  agentId: string;
  status: ProbeStatus;
  acpSessionId: string | null;
  configOptions: AcpSessionConfigOption[];
  availableCommands: AcpAvailableCommand[];
  error?: { code: string; message: string };
}
```

`ensureProbe` SHALL 满足：

1. 通过 `SessionProbeRegistry.get(agentId)` 检查现有 entry：
   - 若 entry 存在且 `status === "ready"`，直接返回其快照。
   - 若 entry 存在且 `status === "starting"`，返回 `inflightEnsure` 对应的 Promise（避免并发重复 newSession）。
   - 若 entry 不存在或 `status === "failed"`，进入新建流程。
2. 写入一条 `{ status: "starting", acpSessionId: null, configOptions: [], availableCommands: [], startedAt: Date.now() }` 占位 entry，并把当前 in-flight Promise 写入 `inflightEnsure`。
3. 通过 `getOrStartProcess(agentId)` 获取 `connection`；失败 SHALL 把 entry 状态更新为 `"failed"`，写入 `error`，并 reject 该 Promise（同时保留 entry 以便 renderer 显示失败态）。
4. **在调用 `connection.newSession` 之前**，向该 agent 进程的 `sessionHandlers` 注册一个 probe-only handler（见下文「ensureProbe 注册 probe-only session handler 接住异步 available_commands_update」requirement）。由于 ACP agent 在 `newSession` 响应返回后才异步推送 `available_commands_update`，handler 必须在 newSession 之前就位才能接住该 notification。
5. 通过 `getBundledMcpServers({ projectPath })` 计算 `mcpServers`，调用 `connection.newSession({ cwd: projectPath, mcpServers })`。
6. 调用成功后：
   - 通过 `normalizeAcpSessionConfigOptions(response.configOptions)` 归一化 configOptions。
   - 把 entry 状态更新为 `{ status: "ready", acpSessionId: response.sessionId, configOptions: <归一化值>, availableCommands: <当前累积值> }`。`availableCommands` 取 entry 上当前已由 probe-only handler 累积的值（newSession 同步返回时可能仍为空数组，命令稍后异步到达再二次 emit）。
   - 通过 `SessionProbeBus.emit("update", { agentId, snapshot })` 推送给 renderer。
7. 失败时（含 newSession 抛错），把 entry 状态更新为 `"failed"`，emit 一次 `update` 让 renderer 同步状态；SHALL NOT 自动重试。

`closeProbe` SHALL 满足：

1. 通过 `SessionProbeRegistry.delete(agentId)` 取出并移除 entry。
2. 注销该 agent 进程 `sessionHandlers` 中对应的 probe-only handler（若已注册），避免 handler 泄漏。
3. 若 entry 不存在或 `status !== "ready"` 或 `acpSessionId === null`，直接返回（注销 handler 步骤仍执行）。
4. 通过 `getOrStartProcess(agentId)` 获取 `connection`，调用 `connection.closeSession({ sessionId: entry.acpSessionId })`。失败仅 `logger.error` 记录，SHALL NOT 上抛。
5. 通过 `SessionProbeBus.emit("update", { agentId, snapshot: null })` 通知 renderer 清空对应内存。

`SessionProbeService` SHALL NOT 调用 `loadSessionMeta`、`patchSessionMeta` 或任何 session-store 写入接口；probe 阶段不落盘。

#### Scenario: ensureProbe 首次启动并接住异步命令

- **WHEN** renderer 调 `chat:probe:ensure { agentId: "claude-code" }`，Registry 中无该 agentId 条目
- **THEN** 主进程在 Registry 写入 `{ status: "starting", availableCommands: [] }` 占位
- **AND** 在 `connection.newSession` 之前注册 probe-only session handler
- **AND** 调用 `connection.newSession({ cwd, mcpServers })`，其中 `mcpServers` 为 `getBundledMcpServers({ projectPath })` 的返回值
- **AND** 成功后 entry 状态更新为 `{ status: "ready", acpSessionId, configOptions, availableCommands }`
- **AND** 当 agent 随后异步推送 `available_commands_update` 时，entry 的 `availableCommands` 被更新并再次 emit `chat:probe:update`

#### Scenario: ensureProbe 命中 ready entry 直接返回

- **WHEN** Registry 中已存在 `status === "ready"` 的 entry（含已抓取的 `availableCommands`）
- **AND** renderer 再次调 `chat:probe:ensure { agentId }`
- **THEN** 直接返回该 entry 快照，包含已抓取的 `availableCommands`
- **AND** SHALL NOT 重新注册 handler 或重复 newSession

#### Scenario: closeProbe 注销 probe-only handler

- **WHEN** renderer 调 `chat:probe:close { agentId: "claude-code" }`，且该 agent 已注册 probe-only handler
- **THEN** `SessionProbeRegistry.delete("claude-code")` 移除 entry
- **AND** 该 agent 进程 `sessionHandlers` 中的 probe-only handler 被注销
- **AND** renderer 收到 `chat:probe:update { agentId: "claude-code", snapshot: null }`

### Requirement: chat:probe IPC 通道集

`src/shared/types/channels.ts` SHALL 在新 namespace `ChatProbeChannels` 中暴露：

```ts
export const ChatProbeChannels = {
  ensure: "chat:probe:ensure",
  close: "chat:probe:close",
  setConfigOption: "chat:probe:setConfigOption",
  update: "chat:probe:update",
} as const;
```

`src/shared/schemas/ipc/chat.ts` SHALL 暴露：

- `probeEnsureInputSchema`：`{ agentId: z.string().min(1), projectId: z.string().min(1) }`
- `probeCloseInputSchema`：`{ agentId: z.string().min(1) }`
- `probeSetConfigOptionInputSchema`：`{ agentId: z.string().min(1), configId: z.string().min(1), type: z.enum(["select", "boolean"]), value: z.union([z.string(), z.boolean()]) }` 等价于 `setConfigOptionInputSchema` 但去除 `projectId` 与 `sessionId`，新增 `agentId`

`src/main/ipc/chat.ts` SHALL 在 `registerChatHandlers` 中：

- `ipcMain.handle(ChatProbeChannels.ensure, ...)` 调用 `sessionProbeService.ensureProbe(...)`，返回 `IpcResponse<ProbeSnapshot>`。`projectPath` 由 `resolveProjectPath(input.projectId)` 解析。
- `ipcMain.handle(ChatProbeChannels.close, ...)` 调用 `sessionProbeService.closeProbe(input.agentId)`。
- `ipcMain.handle(ChatProbeChannels.setConfigOption, ...)` 调用 `sessionProbeService.setProbeConfigOption(...)`。
- 在主进程模块加载阶段或首次 `ensureProbe` 调用时，订阅 `SessionProbeBus.on("update", ...)`，通过 `mainWindow.webContents.send(ChatProbeChannels.update, payload)` 广播。
- 该 update 事件 payload 类型为 `{ agentId: string; snapshot: ProbeSnapshot | null }`。

`src/preload/api/chat.ts` SHALL 在 `chatApi` 中新增：

```ts
probeEnsure(input: { agentId: string; projectId: string }): Promise<IpcResponse<ProbeSnapshot>>
probeClose(input: { agentId: string }): Promise<IpcResponse<void>>
probeSetConfigOption(input: { ... }): Promise<IpcResponse<ProbeSnapshot>>
onProbeUpdate(handler: (payload: { agentId: string; snapshot: ProbeSnapshot | null }) => void): () => void
```

`onProbeUpdate` 注册 IPC 监听器并返回 `unsubscribe` 函数（在 store unmount 或不需要时调用）。

#### Scenario: ensure IPC 返回最新 snapshot

- **WHEN** renderer 调 `chatApi.probeEnsure({ agentId, projectId })`
- **THEN** 主进程经 `validate(probeEnsureInputSchema, input)` 与 `resolveProjectPath` 后调用 `sessionProbeService.ensureProbe(agentId, projectPath)`
- **AND** 返回 `IpcResponse<ProbeSnapshot>`

#### Scenario: update 事件广播

- **WHEN** `sessionProbeService` 在 ensure 成功后 emit `update` 事件
- **THEN** 主进程通过 `mainWindow.webContents.send(ChatProbeChannels.update, { agentId, snapshot })` 广播
- **AND** renderer 通过 `chatApi.onProbeUpdate` 注册的 handler 收到该 payload
- **AND** snapshot 为 `null` 时表示对应 agent 的 probe 已被 close 或失效

#### Scenario: probe IPC 入参非法时被拒

- **WHEN** renderer 传入 `{ agentId: "" }`
- **THEN** zod 校验失败，返回 `IpcResponse<error: { code: "VALIDATION_ERROR" }>`
- **AND** 主进程不调用 service 层

### Requirement: agent 进程不可用时 SessionProbeService 自动清理

`session-probe-service.ts` SHALL 在主进程模块初始化时订阅 `acp-process-pool` 暴露的 agent unavailable 信号，对每条 unavailable 事件：

- 从 `SessionProbeRegistry` 中移除对应 `agentId` 的 entry（不调用 `closeSession`，agent 进程已死）
- emit `chat:probe:update` 事件，snapshot 为 `null`，使 renderer 同步清空 draftProbeByAgent

#### Scenario: agent 进程崩溃时 ProbeRegistry 自动清理

- **WHEN** `acp-process-pool` 检测到 `claude-code` 进程退出
- **THEN** `SessionProbeRegistry` 中 `claude-code` 对应 entry 被移除
- **AND** renderer 收到 `chat:probe:update { agentId: "claude-code", snapshot: null }`
- **AND** 主进程不调用 `connection.closeSession`

### Requirement: chat:stream:message handler 在 acpSessionId 入参存在时 consume Probe 并写入 SessionMeta

`src/main/ipc/chat.ts` 中 `chat:stream:message` 的 handler `onReady` 钩子 SHALL 满足：

1. 解析入参 `{ sessionId, projectId, agentId, prompt, acpSessionId? }`。
2. 当 `acpSessionId` 非空时：
   - 调用 `SessionProbeRegistry.takeFor(agentId, acpSessionId)`：
     - 返回 `null` SHALL 抛 `ipcError(IpcErrorCodes.VALIDATION_ERROR, "probe acpSessionId 不匹配或已被 consume")`，stream 立即以该错误结束。
     - 返回 entry 后，使用 entry 的 `configOptions`、`availableCommands` 与 `acpSessionId`。
   - 通过 `patchSessionMeta(projectPath, sessionId, { acpSessionId, agentId, config_options: entry.configOptions, available_commands: entry.availableCommands, updatedAt: ... })` 把 probe 数据写入 SessionMeta。该写入与 `chat:createSession` 阶段已经写入同名字段的情况下 SHALL 保持幂等：值相同时仅 `updatedAt` 被覆盖，其它字段值不变。
   - 构造 `AcpSession` 时传入 `presetAcpSessionId: acpSessionId`。
3. 当 `acpSessionId` 为空时，行为与现状完全一致（`AcpSession` 自行决定 newSession / resume / load 路径）。

handler SHALL NOT 在 `acpSessionId` 入参存在时再尝试调用 `connection.newSession` —— 该路径由 `AcpSession.start` 的 preset 分支保证跳过。

`SessionProbeRegistry.takeFor` 的契约不因 `chat:createSession` 也写入 probe 数据而改变：每个 ready entry 仍只能被 consume 一次。允许的工作流是「`createSession` 透传 + 同一轮 stream `takeFor` 消费」共存（前者写 meta，后者负责 promote 注册表条目并构造 `AcpSession`）。

#### Scenario: handler 携带 acpSessionId 入参成功 promote

- **WHEN** renderer 调 `chat:stream:message` 入参含 `acpSessionId: "sess-A"`，agentId 为 `"claude-code"`，且 Registry 中 `claude-code` entry 的 `acpSessionId === "sess-A"`
- **THEN** 主进程调用 `SessionProbeRegistry.takeFor("claude-code", "sess-A")` 移除 entry
- **AND** 通过 session-store 字段级更新写入 `{ acpSessionId: "sess-A", agentId, config_options: entry.configOptions, available_commands: entry.availableCommands, updatedAt }`
- **AND** 构造 `AcpSession` 时传入 `presetAcpSessionId: "sess-A"`
- **AND** SHALL NOT 触发 `connection.newSession`

#### Scenario: acpSessionId 与 Registry 不匹配时拒绝

- **WHEN** 入参 `acpSessionId === "sess-A"`，但 Registry 中 entry 已被 close 或 acpSessionId 变更
- **THEN** stream sink 立即发送 `{ type: "error", code: "VALIDATION_ERROR", message }` 并关闭 port
- **AND** SHALL NOT 构造 `AcpSession`
- **AND** SHALL NOT 修改 SessionMeta

#### Scenario: 不携带 acpSessionId 走老路径

- **WHEN** renderer 调 `chat:stream:message` 入参不含 `acpSessionId`
- **THEN** 主进程行为与本次 change 之前完全一致
- **AND** `AcpSession.start` 走 newSession / resumeSession / loadSession 路径

#### Scenario: createSession 已写入 probe 数据后 takeFor 写入幂等

- **WHEN** 草稿态首条消息流程中，`chat:createSession` 已用入参 `configOptions`、`availableCommands` 与 `acpSessionId: "sess-A"` 写入 session meta
- **AND** 紧随其后的 `chat:stream:message` 入参也带 `acpSessionId: "sess-A"`，触发 `takeFor` 与 `patchSessionMeta`
- **THEN** 第二次写入只会更新 `updatedAt`，`config_options` / `available_commands` / `acpSessionId` / `agentId` 字段值与第一次写入一致
- **AND** Registry 中对应 entry 仍被 `takeFor` 移除（消费 probe 内存槽位）
- **AND** `AcpSession` 仍以 `presetAcpSessionId: "sess-A"` 构造

### Requirement: draftAgentId watcher 响应 projectId 变化

`useSessionStore` 中监听 `effectiveAgentId` 的 watcher SHALL 将依赖项扩展为 `[effectiveAgentId, projectStore.currentProject?.id]` 元组，使得 projectId 从 null 变为有效值时也能触发 probe 发起。

具体行为：

- watcher 依赖 `() => [effectiveAgentId.value, useProjectStore().currentProject?.id ?? null] as const`
- 当 `nextAgentId` 与 `previousAgentId`（元组第一维的旧值）不同时，才触发 `refreshCapabilities` 和 `closeDraftProbe`（避免仅 projectId 变化时误关 probe）
- 当 `isDraft && nextAgentId && projectId` 均满足，且 `draftProbeByAgent.value.has(nextAgentId)` 为 false 时，才发起 `ensureDraftProbe`（防止 agent 切去切回时重复 probe）
- 若 `projectId` 为 null，直接 return，不发起 probe

#### Scenario: 启动后选择项目触发 probe

- **WHEN** 应用启动，`draftAgentId` 已就绪（第一个已安装 agent），但 `projectId` 为 null
- **AND** 用户选择一个项目，`projectId` 从 null 变为有效值
- **THEN** watcher 触发（projectId 维度变化）
- **AND** `ensureDraftProbe(draftAgentId, projectId)` 在 200ms 后被调用
- **AND** probe 就绪后 `ConfigOptionsBar` 正常渲染

#### Scenario: 仅 projectId 变化不触发 refreshCapabilities 和 closeDraftProbe

- **WHEN** `effectiveAgentId` 不变，仅 `projectId` 从 null 变为有效值
- **THEN** `refreshCapabilities` 不被调用（agent 未变）
- **AND** `closeDraftProbe` 不被调用（agent 未变）
- **AND** 仅 `ensureDraftProbe` 在条件满足时被调用

#### Scenario: agent 切去切回不重复 probe

- **WHEN** 草稿态下 `draftAgentId` 从 A 切到 B，再切回 A
- **AND** A 的 probe 已在 `draftProbeByAgent` 中（`has(A) === true`）
- **THEN** 切回 A 时 watcher 不重复调用 `ensureDraftProbe("A", projectId)`

### Requirement: chat:createSession 入参 SHALL 接受 probe 数据并写入 SessionMeta

`chat:createSession` IPC 入参 SHALL 在原有 `{ projectId, title, agentId }` 基础上新增可选字段 `configOptions?: AcpSessionConfigOption[]`、`availableCommands?: AcpAvailableCommand[]` 与 `acpSessionId?: string`，入参 schema 在 `src/shared/schemas/ipc/chat.ts` 的 `createSessionInputSchema` 中以 `.optional()` 标注；preload `src/preload/api/chat.ts` 中 `chatApi.createSession` 的入参类型同步扩展。

主进程 `src/main/services/chat/chat-service.ts#createSession` SHALL 在构造新 `SessionMeta` 时：

- 当入参 `configOptions` 为非 `undefined` 数组时，写入 `meta.config_options`；当为 `undefined` 时不设置该字段。
- 当入参 `availableCommands` 为非 `undefined` 数组时，写入 `meta.available_commands`；当为 `undefined` 时不设置该字段。
- 当入参 `acpSessionId` 为非空字符串时，写入 `meta.acpSessionId`；当为 `undefined` 时不设置该字段。
- 其余字段（`tokenUsage`、`turnCount`、`createdAt`、`updatedAt`、`title`、`agentId`）行为与现状一致。

主进程 IPC handler 通过现有 `toSession(meta, projectId)` 把 `meta.config_options` 映射为 `Session.configOptions`、`meta.available_commands` 映射为 `Session.availableCommands` 返回 renderer；renderer `useSessionStore.createSession` 把响应通过 `normalizeSession` 写入 `sessions.value`。

#### Scenario: createSession 透传 probe 数据写入 meta

- **WHEN** renderer 调 `chatApi.createSession({ projectId, agentId, title, configOptions: [<schema>], availableCommands: [{ name: "init", description: "..." }], acpSessionId: "sess-A" })`
- **THEN** 主进程通过 `validate(createSessionInputSchema, input)` 不报错
- **AND** 新建的 session meta JSON 文件包含 `config_options`、`available_commands: [{ name: "init", ... }]` 与 `acpSessionId: "sess-A"`
- **AND** IPC 响应 `Session.configOptions` 与 `Session.availableCommands` 与入参一致

#### Scenario: createSession 不传 probe 字段时与现状一致

- **WHEN** renderer 调 `chatApi.createSession({ projectId, agentId, title })`，未传 `configOptions`、`availableCommands` 与 `acpSessionId`
- **THEN** schema 校验通过
- **AND** 新建的 session meta JSON 文件不含 `config_options`、`available_commands` 与 `acpSessionId` 字段
- **AND** IPC 响应 `Session.configOptions` 与 `Session.availableCommands` 为 `undefined`

#### Scenario: createSession 入参 availableCommands 为空数组也持久化

- **WHEN** renderer 调 `chatApi.createSession` 时 `availableCommands: []`
- **THEN** session meta 文件持久化 `available_commands: []`
- **AND** IPC 响应 `Session.availableCommands` 为 `[]`
- **AND** 后续 session-store 字段级更新不会因「空数组等同于缺失」误删该字段

### Requirement: ensureProbe 注册 probe-only session handler 接住异步 available_commands_update

`ensureProbe` 在调用 `connection.newSession` 之前 SHALL 向该 agent 进程的 `sessionHandlers` 注册一个 probe-only handler。由于 `newSession` 响应返回时其 `sessionId` 尚未已知，handler 注册 SHALL 采用以下机制之一，使得无论 `available_commands_update` 在 newSession 返回前还是返回后到达均能被接住：

- 推荐：扩展 `acp-process-pool` 的 `sessionUpdate` 路由，使得对当前进程尚无精确 sessionId handler 的 notification，回退给该进程注册的「probe 待定 handler」；newSession 返回拿到 `sessionId` 后再将待定 handler 绑定到精确 sessionId。
- 或：在 newSession 返回后立即用其 `sessionId` 注册 handler，并由 `acp-process-pool` 对「sessionId 已知但 handler 尚未注册」的早到 notification 做有界缓冲回放。

实现 SHALL 在 design.md 中明确选定其中一种并说明取舍。无论哪种，目标 SHALL 一致：probe 阶段 agent 推送的 `available_commands_update` 不被静默丢弃。

probe-only handler SHALL 满足：

- 仅处理 session 级元数据事件：通过复用 `acp-mapper` 中对 `available_commands_update` 的归一化逻辑（当前为模块内 `normalizeAvailableCommands`，实现时 SHALL 将其导出以供 probe 复用，或调用 `mapSessionUpdate` 后筛选 `type === "available_commands_update"`），把命令归一化为 `AcpAvailableCommand[]`。
- 命中 `available_commands_update` 时，更新对应 `ProbeEntry.availableCommands`，并通过 `SessionProbeBus.emit("update", { agentId, snapshot })` 推送最新快照给 renderer。空数组命令 SHALL 原样写入并 emit（用于告知「agent 明确声明无命令」）。
- 对 `agent_message_chunk`、`agent_thought_chunk`、`tool_call`、`tool_call_update` 等消息流事件 SHALL NOT 做任何处理（草稿空闲期 agent 不会推送这些事件；即便收到也忽略，不进入任何消息组装通路）。
- SHALL NOT 调用 `patchSessionMeta` 或任何 session-store 写入接口。

#### Scenario: probe 期间接住 available_commands_update 并广播

- **WHEN** probe 已注册 probe-only handler，agent 在 newSession 返回后异步推送 `session/update { sessionUpdate: "available_commands_update", availableCommands: [...] }`
- **THEN** 该 notification 不被 `acp-process-pool` 静默丢弃
- **AND** 命令被归一化为 `AcpAvailableCommand[]` 并写入对应 `ProbeEntry.availableCommands`
- **AND** 通过 `SessionProbeBus` emit 一次 `update`，snapshot 携带最新 `availableCommands`
- **AND** renderer 通过 `chatApi.onProbeUpdate` 收到该 snapshot

#### Scenario: probe handler 忽略消息流事件

- **WHEN** probe-only handler 收到 `agent_message_chunk` 或 `tool_call` 等消息流事件
- **THEN** SHALL NOT 修改任何消息容器或调用 MessageAssembler
- **AND** SHALL NOT 写入 SessionMeta

#### Scenario: agent 声明无命令也广播空数组

- **WHEN** agent 推送 `available_commands_update` 且 `availableCommands` 为空数组
- **THEN** `ProbeEntry.availableCommands` 被设为 `[]`
- **AND** emit `update`，snapshot 的 `availableCommands` 为 `[]`

### Requirement: probe 阶段生成并持有 fylloSessionId 并在转正时沿用

`ProbeEntry`（`src/main/services/chat/session-probe-registry.ts`）SHALL 新增字段 `fylloSessionId: string`，在 `ensureProbe` 写入 `starting` 占位 entry 时即通过 `newSessionId()`（`src/main/infra/ids`）生成并赋值。`ProbeSnapshot`（`session-probe-service.ts`）SHALL 同步新增 `fylloSessionId: string` 字段，由 `toProbeSnapshot` 一并映射。

该 fylloSessionId SHALL 作为 `getBundledMcpServers` 的 `fylloSessionId` 入参注入 MCP env（见 `bundled-mcp-servers` spec 与本 spec「ensureProbe ... 注入 fylloSessionId」Requirement）。

renderer 侧 draft probe 携带（`carryProbe`，`src/renderer/src/stores/chat.ts`）SHALL 在原有 `acpSessionId`、`configOptions`、`availableCommands` 之外新增携带 probe 的 `fylloSessionId`；`sendMessage` draft 分支在调用 `sessionStore.createSession` 时 SHALL 把该 `fylloSessionId` 作为入参透传，使转正后的正式会话沿用 probe 阶段已注入 MCP env 的同一 fylloSessionId。

当某 agent 的 probe 被 `closeProbe` 或 agent-unavailable 清理（`SessionProbeRegistry.delete`）移除时，其 `fylloSessionId` SHALL 随 entry 一并丢弃，不落盘、不残留。

#### Scenario: probe 占位时即生成 fylloSessionId

- **WHEN** `ensureProbe("claude-code", projectPath)` 写入 `starting` 占位 entry
- **THEN** 该 entry 的 `fylloSessionId` 为经 `newSessionId()` 生成的非空字符串
- **AND** `toProbeSnapshot` 返回的 snapshot 携带该 `fylloSessionId`

#### Scenario: 转正时沿用 probe 的 fylloSessionId

- **WHEN** 草稿态下用户向已 ready 的 probe 会话发送首条消息
- **AND** `carryProbe` 取出 probe entry 的 `fylloSessionId` 为 `"sess-P"`
- **THEN** `sendMessage` 调用 `sessionStore.createSession` 时入参携带 `fylloSessionId: "sess-P"`
- **AND** 转正后的正式会话 sessionId 为 `"sess-P"`（与 probe 注入 MCP env 的 fylloSessionId 一致）

#### Scenario: 切 agent 丢弃 draft fylloSessionId

- **WHEN** probe entry 因 `closeProbe` 或 agent 进程不可用被 `SessionProbeRegistry.delete` 移除
- **THEN** 该 entry 的 `fylloSessionId` 随之丢弃
- **AND** 不写入任何持久化存储

### Requirement: ensureProbe 调用 newSession 时注入 entry 的 fylloSessionId

`ensureProbe`（`src/main/services/chat/session-probe-service.ts`）在计算 `mcpServers` 时 SHALL 调用 `getBundledMcpServers({ projectPath, fylloSessionId })`，其中 `fylloSessionId` 取自当前 `starting` 占位 entry 已生成的 `fylloSessionId`，从而使 probe 阶段 `connection.newSession` 启动的 MCP server 进程 env 即携带正确的 `FYLLO_SESSION_ID`。

此为对既有 `ensureProbe` 流程「步骤 5：通过 `getBundledMcpServers({ projectPath })` 计算 `mcpServers`」的精确化：入参从 `{ projectPath }` 变为 `{ projectPath, fylloSessionId }`，其余步骤行为不变。

#### Scenario: probe newSession 注入 FYLLO_SESSION_ID

- **WHEN** `ensureProbe` 进入新建流程，占位 entry 的 `fylloSessionId` 为 `"sess-P"`
- **THEN** 计算 `mcpServers` 时调用 `getBundledMcpServers({ projectPath, fylloSessionId: "sess-P" })`
- **AND** `connection.newSession({ cwd: projectPath, mcpServers })` 启动的 MCP server env 含 `FYLLO_SESSION_ID === "sess-P"`
