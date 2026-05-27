# chat-session-probe Specification

## Purpose

TBD - created by archiving change add-draft-session-probe. Update Purpose after archive.

## Requirements

### Requirement: SessionProbeRegistry 在主进程维护按 agentId 索引的内存态

系统 SHALL 在 `electron/main/services/chat/session-probe-registry.ts` 中导出单例 `SessionProbeRegistry`，维护一个进程级别的纯内存 `Map<string, ProbeEntry>`，键为 `agentId`，值为 `ProbeEntry`。

`ProbeEntry` 类型 SHALL 定义为：

```ts
type ProbeStatus = "starting" | "ready" | "failed";

interface ProbeEntry {
  agentId: string;
  status: ProbeStatus;
  acpSessionId: string | null;
  configOptions: AcpSessionConfigOption[];
  error?: { code: string; message: string };
  startedAt: number;
  inflightEnsure?: Promise<ProbeEntry>;
}
```

`SessionProbeRegistry` SHALL 暴露以下方法：

- `get(agentId: string): ProbeEntry | undefined`
- `set(agentId: string, entry: ProbeEntry): void`
- `delete(agentId: string): ProbeEntry | undefined`
- `takeFor(agentId: string, expectedAcpSessionId: string): ProbeEntry | null`：仅当 `entry.acpSessionId === expectedAcpSessionId` 时移除并返回该 entry，否则返回 `null`，确保 promote 与 close 之间的原子性
- `keys(): string[]`：用于诊断和清理

`SessionProbeRegistry` SHALL NOT 落盘任何状态。进程退出时 entries 直接随进程释放，SHALL NOT 调用 `closeSession`（agent 进程会随主进程一并退出）。

#### Scenario: 首次 ensure 写入 starting entry

- **WHEN** `SessionProbeRegistry.set("claude-code", { status: "starting", ... })` 被调用，且原本 Map 中无该 agentId
- **THEN** Map 中新增该条目
- **AND** 后续 `get("claude-code")` 返回该 entry

#### Scenario: takeFor 在 acpSessionId 不匹配时返回 null

- **WHEN** Registry 中 `claude-code` 对应 entry 的 `acpSessionId` 为 `"sess-A"`
- **AND** 调用 `takeFor("claude-code", "sess-B")`
- **THEN** 返回 `null`
- **AND** Map 中该 entry 仍然存在

#### Scenario: takeFor 匹配成功后 entry 从 Map 移除

- **WHEN** Registry 中 `claude-code` 对应 entry 的 `acpSessionId` 为 `"sess-A"`
- **AND** 调用 `takeFor("claude-code", "sess-A")`
- **THEN** 返回该 entry
- **AND** Map 中不再包含该 agentId 的条目

### Requirement: SessionProbeService 提供 ensureProbe 与 closeProbe 操作

系统 SHALL 在 `electron/main/services/chat/session-probe-service.ts` 提供以下函数：

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
  error?: { code: string; message: string };
}
```

`ensureProbe` SHALL 满足：

1. 通过 `SessionProbeRegistry.get(agentId)` 检查现有 entry：
   - 若 entry 存在且 `status === "ready"`，直接返回其快照。
   - 若 entry 存在且 `status === "starting"`，返回 `inflightEnsure` 对应的 Promise（避免并发重复 newSession）。
   - 若 entry 不存在或 `status === "failed"`，进入新建流程。
2. 写入一条 `{ status: "starting", acpSessionId: null, configOptions: [], startedAt: Date.now() }` 占位 entry，并把当前 in-flight Promise 写入 `inflightEnsure`。
3. 通过 `getOrStartProcess(agentId)` 获取 `connection`；失败 SHALL 把 entry 状态更新为 `"failed"`，写入 `error`，并 reject 该 Promise（同时保留 entry 以便 renderer 显示失败态）。
4. 通过 `getBundledMcpServers({ projectPath })` 计算 `mcpServers`，调用 `connection.newSession({ cwd: projectPath, mcpServers })`。
5. 调用成功后：
   - 通过 `normalizeAcpSessionConfigOptions(response.configOptions)` 归一化 configOptions。
   - 把 entry 状态更新为 `{ status: "ready", acpSessionId: response.sessionId, configOptions: <归一化值> }`。
   - 通过 `SessionProbeBus.emit("update", { agentId, snapshot })` 推送给 renderer。
6. 失败时（含 newSession 抛错），把 entry 状态更新为 `"failed"`，emit 一次 `update` 让 renderer 同步状态；SHALL NOT 自动重试。

`closeProbe` SHALL 满足：

1. 通过 `SessionProbeRegistry.delete(agentId)` 取出并移除 entry。
2. 若 entry 不存在或 `status !== "ready"` 或 `acpSessionId === null`，直接返回。
3. 通过 `getOrStartProcess(agentId)` 获取 `connection`，调用 `connection.closeSession({ sessionId: entry.acpSessionId })`。失败仅 `logger.error` 记录，SHALL NOT 上抛。
4. 通过 `SessionProbeBus.emit("update", { agentId, snapshot: null })` 通知 renderer 清空对应内存。

`setProbeConfigOption` SHALL 满足：

1. 通过 `SessionProbeRegistry.get(agentId)` 取 entry；若 `status !== "ready"` 或 `acpSessionId === null`，抛 `ipcError(IpcErrorCodes.VALIDATION_ERROR, "probe 未就绪")`。
2. 在 `entry.configOptions` 中查找 `configId` 对应 schema：
   - 若 schema 存在且 `type === "select"`，校验 `value` 是否在 `options` 集合中（兼容平铺 `AcpSessionConfigOptionValueItem[]` 与分组 `AcpSessionConfigOptionGroup[]` 两种 shape）；不在集合中 SHALL 抛 `ipcError(IpcErrorCodes.CONFIG_OPTION_INVALID_VALUE)`。
   - 若 schema 不存在，跳过预校验。
3. 通过 `getOrStartProcess(agentId)` 获取 `connection`，调用 `connection.setSessionConfigOption({ sessionId: entry.acpSessionId, configId, ...buildPayload(type, value) })`，复用现有 `config-option-service.ts` 中的 `buildPayload` 与 `isMethodNotFoundError` 工具（必要时抽到独立模块共享）。
4. 调用成功后：
   - 把 `response.configOptions` 归一化后赋值到 `entry.configOptions`。
   - emit `update` 推送给 renderer。
   - 返回最新 snapshot。
5. ACP `-32601` / 等价错误 SHALL 抛 `CONFIG_OPTION_NOT_SUPPORTED`；其他 RPC 错误归一为 `ACP_ERROR`。

`SessionProbeService` SHALL NOT 调用 `loadSessionMeta`、`patchSessionMeta` 或任何 session-store 写入接口；probe 阶段不落盘。

#### Scenario: ensureProbe 首次启动

- **WHEN** renderer 调 `chat:probe:ensure { agentId: "claude-code" }`，Registry 中无该 agentId 条目
- **THEN** 主进程在 Registry 写入 `{ status: "starting" }` 占位
- **AND** 调用 `connection.newSession({ cwd, mcpServers })`，其中 `mcpServers` 为 `getBundledMcpServers({ projectPath })` 的返回值
- **AND** 成功后 entry 状态更新为 `{ status: "ready", acpSessionId, configOptions }`
- **AND** emit `chat:probe:update` 事件，带 snapshot
- **AND** IPC 返回 `{ ok: true, data: snapshot }`

#### Scenario: ensureProbe 并发去重

- **WHEN** Registry 中已存在 `{ status: "starting" }` 的 entry，且 `inflightEnsure` 是 in-flight Promise
- **AND** renderer 再次调 `chat:probe:ensure { agentId }`
- **THEN** 主进程 SHALL NOT 再次调 `connection.newSession`
- **AND** 复用 `inflightEnsure` 的结果作为本次返回值

#### Scenario: closeProbe 释放 ACP 端 session

- **WHEN** renderer 调 `chat:probe:close { agentId: "claude-code" }`，Registry 中存在 `{ status: "ready", acpSessionId: "sess-A" }`
- **THEN** 主进程从 Registry 移除该 entry
- **AND** 调用 `connection.closeSession({ sessionId: "sess-A" })`
- **AND** emit `chat:probe:update` 事件，snapshot 为 null
- **AND** IPC 返回 `{ ok: true }`，即使 closeSession 抛错也不影响返回值

#### Scenario: closeProbe 在 closeSession 抛错时不上抛

- **WHEN** `connection.closeSession` 抛出异常（agent 未实现该 RPC、agent 进程 crash 等）
- **THEN** 主进程 `logger.error` 记录
- **AND** Registry 中该 entry 仍被移除
- **AND** IPC 返回 `{ ok: true }`，不返回 error

#### Scenario: setProbeConfigOption 调整草稿态 model

- **WHEN** Registry 中 `claude-code` entry `status === "ready"`，`configOptions` 含 id=`"model"` 的 select schema，options 集合包含 `"sonnet"`
- **AND** renderer 调 `chat:probe:setConfigOption { agentId: "claude-code", configId: "model", type: "select", value: "sonnet" }`
- **THEN** 主进程调用 `connection.setSessionConfigOption({ sessionId: <probe acpSessionId>, configId: "model", value: "sonnet" })`
- **AND** 用响应的 `configOptions` 替换 entry 的 `configOptions`
- **AND** emit `chat:probe:update` 事件
- **AND** IPC 返回 `{ ok: true, data: snapshot }`

#### Scenario: probe 未就绪时 setProbeConfigOption 被拒

- **WHEN** Registry 中 entry `status === "starting"` 或 `acpSessionId === null`
- **THEN** IPC 返回 `{ ok: false, error: { code: "VALIDATION_ERROR" } }`
- **AND** 不调用 `connection.setSessionConfigOption`

### Requirement: chat:probe IPC 通道集

`shared/types/channels.ts` SHALL 在新 namespace `ChatProbeChannels` 中暴露：

```ts
export const ChatProbeChannels = {
  ensure: "chat:probe:ensure",
  close: "chat:probe:close",
  setConfigOption: "chat:probe:setConfigOption",
  update: "chat:probe:update",
} as const;
```

`shared/schemas/ipc/chat.ts` SHALL 暴露：

- `probeEnsureInputSchema`：`{ agentId: z.string().min(1), projectId: z.string().min(1) }`
- `probeCloseInputSchema`：`{ agentId: z.string().min(1) }`
- `probeSetConfigOptionInputSchema`：`{ agentId: z.string().min(1), configId: z.string().min(1), type: z.enum(["select", "boolean"]), value: z.union([z.string(), z.boolean()]) }` 等价于 `setConfigOptionInputSchema` 但去除 `projectId` 与 `sessionId`，新增 `agentId`

`electron/main/ipc/chat.ts` SHALL 在 `registerChatHandlers` 中：

- `ipcMain.handle(ChatProbeChannels.ensure, ...)` 调用 `sessionProbeService.ensureProbe(...)`，返回 `IpcResponse<ProbeSnapshot>`。`projectPath` 由 `resolveProjectPath(input.projectId)` 解析。
- `ipcMain.handle(ChatProbeChannels.close, ...)` 调用 `sessionProbeService.closeProbe(input.agentId)`。
- `ipcMain.handle(ChatProbeChannels.setConfigOption, ...)` 调用 `sessionProbeService.setProbeConfigOption(...)`。
- 在主进程模块加载阶段或首次 `ensureProbe` 调用时，订阅 `SessionProbeBus.on("update", ...)`，通过 `mainWindow.webContents.send(ChatProbeChannels.update, payload)` 广播。
- 该 update 事件 payload 类型为 `{ agentId: string; snapshot: ProbeSnapshot | null }`。

`electron/preload/api/chat.ts` SHALL 在 `chatApi` 中新增：

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

`electron/main/ipc/chat.ts` 中 `chat:stream:message` 的 handler `onReady` 钩子 SHALL 满足：

1. 解析入参 `{ sessionId, projectId, agentId, prompt, acpSessionId? }`。
2. 当 `acpSessionId` 非空时：
   - 调用 `SessionProbeRegistry.takeFor(agentId, acpSessionId)`：
     - 返回 `null` SHALL 抛 `ipcError(IpcErrorCodes.VALIDATION_ERROR, "probe acpSessionId 不匹配或已被 consume")`，stream 立即以该错误结束。
     - 返回 entry 后，使用 entry 的 `configOptions` 与 `acpSessionId`。
   - 通过 `patchSessionMeta(projectPath, sessionId, { acpSessionId, agentId, config_options: entry.configOptions, updatedAt: ... })` 把 probe 数据写入 SessionMeta（替代原本由 `AcpSession.persistResolvedSession` 在 newSession 后写入的字段）。
   - 构造 `AcpSession` 时传入 `presetAcpSessionId: acpSessionId`。
3. 当 `acpSessionId` 为空时，行为与现状完全一致（`AcpSession` 自行决定 newSession / resume / load 路径）。

handler SHALL NOT 在 `acpSessionId` 入参存在时再尝试调用 `connection.newSession` —— 该路径由 `AcpSession.start` 的 preset 分支保证跳过。

#### Scenario: handler 携带 acpSessionId 入参成功 promote

- **WHEN** renderer 调 `chat:stream:message` 入参含 `acpSessionId: "sess-A"`，agentId 为 `"claude-code"`，且 Registry 中 `claude-code` entry 的 `acpSessionId === "sess-A"`
- **THEN** 主进程调用 `SessionProbeRegistry.takeFor("claude-code", "sess-A")` 移除 entry
- **AND** 通过 session-store 字段级更新写入 `{ acpSessionId: "sess-A", agentId, config_options: entry.configOptions, updatedAt }`
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
