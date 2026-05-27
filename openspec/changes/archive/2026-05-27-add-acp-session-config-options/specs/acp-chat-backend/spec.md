## ADDED Requirements

### Requirement: AcpSession 在 session 创建/恢复响应处发出 configOptions

`AcpSession` SHALL 在以下三类入口拿到 ACP 响应后，立即将响应中的 `configOptions` 字段（`Array<SessionConfigOption> | null | undefined`）映射成 `SessionEvent { type: "config_options_update"; options: AcpSessionConfigOption[] }` 并通过 `this.emit("event", ...)` 发出：

1. `recoverSession` 中调用 `connection.newSession({ cwd, mcpServers })` 成功返回时；
2. `recoverSession` 中调用 `connection.resumeSession({ sessionId, cwd, mcpServers })` 成功返回时；
3. `recoverSession` 中调用 `connection.loadSession({ sessionId, cwd, mcpServers })` 成功返回时。

`tryHandlePersistedSession` 走 direct prompt 分支不发起 session 创建/恢复请求，因此 SHALL NOT 在该分支主动发出 `config_options_update`；该路径下的 `configOptions` 来源依赖于 turn 进行中由 agent 推送的 `sessionUpdate: "config_option_update"`。

当响应中 `configOptions` 为 `null` / `undefined` 或长度为 0 时，系统 SHALL 仍发出一次 `config_options_update`，`options` 为空数组，使下游可以"显式知道 agent 不暴露任何 configOptions"。

`AcpSessionConfigOption` 类型由 `shared/types/acp-config.ts` 导出，结构为：

```ts
type AcpSessionConfigOptionValue = string;

interface AcpSessionConfigOptionValueItem {
  value: AcpSessionConfigOptionValue;
  name: string;
  description?: string;
}

interface AcpSessionConfigOptionGroup {
  group: string;
  name: string;
  options: AcpSessionConfigOptionValueItem[];
}

type AcpSessionConfigOptionCategory = "mode" | "model" | "thought_level" | string;

interface AcpSessionConfigSelect {
  type: "select";
  id: string;
  name: string;
  description?: string;
  category?: AcpSessionConfigOptionCategory;
  currentValue: AcpSessionConfigOptionValue;
  options: AcpSessionConfigOptionValueItem[] | AcpSessionConfigOptionGroup[];
}

interface AcpSessionConfigBoolean {
  type: "boolean";
  id: string;
  name: string;
  description?: string;
  category?: AcpSessionConfigOptionCategory;
  currentValue: boolean;
}

type AcpSessionConfigOption = AcpSessionConfigSelect | AcpSessionConfigBoolean;
```

主进程 SHALL 在归一化时丢弃 `_meta` 字段，把 `null` 归一为 `undefined`。SDK 类型 `SessionConfigOption` SHALL NOT 出现在 `shared/` 与 `frontend/` 任何文件的 import 列表中。

#### Scenario: newSession 响应包含 configOptions

- **WHEN** `AcpSession.start` 走到 `recoverSession` 的 fresh-newSession 分支，`connection.newSession(...)` 返回 `{ sessionId, configOptions: [<3 项>] }`
- **THEN** 系统在 emit `session_id_resolved` 之后，emit `{ type: "config_options_update", options: <归一化后的 3 项> }`
- **AND** 归一化结果不包含任何 `_meta` 字段
- **AND** `category` 为 `null` 的项被归一为 `undefined`

#### Scenario: resumeSession 响应包含 configOptions

- **WHEN** `recoverSession` 走 `resumeSession` 成功分支，响应包含非空 `configOptions`
- **THEN** 系统 emit `{ type: "config_options_update", options: <...> }`

#### Scenario: loadSession 响应包含 configOptions

- **WHEN** `recoverSession` 走 `loadSession` 成功分支，响应包含非空 `configOptions`
- **THEN** 系统 emit `{ type: "config_options_update", options: <...> }`
- **AND** `runtimeState.suppressReplay` 为 `true` 时仍 emit 该事件，不被 replay 抑制（参见 `acp-session-recovery#shouldSuppressDuringReplay` 白名单）

#### Scenario: 响应未携带 configOptions

- **WHEN** `connection.newSession` 返回的对象中 `configOptions` 为 `null`、`undefined` 或长度 0
- **THEN** 系统仍 emit 一次 `{ type: "config_options_update", options: [] }`

#### Scenario: direct prompt 分支不主动发 configOptions

- **WHEN** `AcpSession.start` 走 `tryHandlePersistedSession` 并 direct prompt 成功
- **THEN** 系统 SHALL NOT 因 direct prompt 成功而主动 emit `config_options_update`
- **AND** turn 进行中收到的 `sessionUpdate: "config_option_update"` 仍按映射规则透传

### Requirement: ACP sessionUpdate config_option_update 映射

`acp-mapper.ts` SHALL 处理 `sessionUpdate === "config_option_update"`，将 `update.configOptions: SessionConfigOption[]` 归一化为 `AcpSessionConfigOption[]`，产出 `SessionEvent { type: "config_options_update"; options }`。

归一化规则与"AcpSession 在 session 创建/恢复响应处发出 configOptions"中规定的相同：丢弃 `_meta`，`null`-to-`undefined`，保持 `select.options` 形态（平铺 vs 分组）。

`acp-session-recovery#shouldSuppressDuringReplay` SHALL 把 `config_options_update` 加入"loadSession replay 期间不抑制"的白名单，与 `available_commands_update`、`session_info_update` 同等待遇。

#### Scenario: server-push 推送 config_option_update

- **WHEN** ACP agent 在 turn 进行中推送 `sessionUpdate === "config_option_update"`，携带 `configOptions: [<5 项>]`
- **THEN** `acp-mapper` 产出 `SessionEvent { type: "config_options_update", options: <归一化 5 项> }`
- **AND** `acp-session.runPrompt` 内的 `sessionHandler` 通过 `this.emit("event", ev)` 透传该事件

#### Scenario: loadSession replay 期间不抑制

- **WHEN** 系统在 loadSession 恢复流中，`runtimeState.suppressReplay === true`
- **AND** mapper 产出 `config_options_update` event
- **THEN** event 不被 `shouldSuppressDuringReplay` 过滤
- **AND** `runtimeState.suppressedReplayEvents` 计数不递增

### Requirement: chat:stream:message handler 透传并持久化 config_options_update

`chat:stream:message` 主进程 handler SHALL 在 `AcpSession` emit `config_options_update` 事件时：

1. 通过 `session-event-mapper.toMessageChunk(ev)` 转换为 `MessageChunkData { kind: "config_options_update", options }`，再通过 `sink.sendChunk(chunk)` 推送给 renderer；
2. 通过 `enqueueSessionMetaPersist({ config_options: ev.options, updatedAt: new Date().toISOString() }, "[chat] failed to persist session config options update")` 调度字段级 session meta 持久化。

handler SHALL NOT 把该事件分派给 `MessageAssembler.apply`。当 `options` 为空数组时仍然发送 chunk 并持久化为空数组（与 `available_commands_update` 行为对齐）。

`proposal:stageStream` / `proposal:archive` handler SHALL 对 `config_options_update` 事件显式忽略：不调用 `MessageAssembler.apply`、不调用 `sink.sendChunk`、不写磁盘。

#### Scenario: chat 流透传 config_options_update

- **WHEN** `chat:stream:message` 的 `AcpSession` emit `config_options_update` 事件
- **THEN** handler 通过 sink 发送 `{ type: "chunk", data: { kind: "config_options_update", options } }`
- **AND** 通过 session-store 字段级更新写入 `config_options`
- **AND** 不进入 `MessageAssembler`

#### Scenario: 空数组也透传与持久化

- **WHEN** `AcpSession` emit `config_options_update` 且 `options.length === 0`
- **THEN** handler 仍发送 chunk
- **AND** 仍调度 `config_options: []` 持久化

#### Scenario: proposal 流忽略 config_options_update

- **WHEN** `proposal:stageStream` 或 `proposal:archive` 的 `AcpSession` emit `config_options_update`
- **THEN** handler 不调用 `MessageAssembler.apply`
- **AND** 不调用 `sink.sendChunk`
- **AND** 不写磁盘

### Requirement: chat:setConfigOption IPC 在主进程封装 setSessionConfigOption

系统 SHALL 在 `electron/main/services/chat/config-option-service.ts` 提供 `setConfigOption({ projectId, sessionId, configId, type, value })` 函数，其行为：

1. 通过 `resolveProjectPath(projectId)` 与 `loadSessionMeta(projectPath, sessionId)` 加载 session meta；若 meta 不存在或 meta 中 `acpSessionId` 为空，SHALL 抛出 `ipcError(IpcErrorCodes.VALIDATION_ERROR)`，`message` 表明 acpSessionId 缺失（草稿态本不可达，IPC 入参校验已要求 sessionId 对应已建立的 session）。
2. 从 `SessionMeta.config_options` 读取目标 `configId` 的 schema：
   - 若 schema 存在且 `type === "select"`，SHALL 校验 `value` 是否在 `options` 集合中（兼容平铺 `AcpSessionConfigOptionValueItem[]` 与分组 `AcpSessionConfigOptionGroup[]` 两种 shape）；不在集合中 SHALL 抛出 `ipcError(IpcErrorCodes.CONFIG_OPTION_INVALID_VALUE)`。
   - 若 schema 不存在，SHALL 跳过预校验直接发起 RPC（兜底由 agent 端错误处理）。
3. 通过 `getOrStartProcess(meta.agentId)` 获取 connection；若获取失败，SHALL 抛出 `ipcError(IpcErrorCodes.ACP_NOT_READY)`。
4. 调用 `connection.setSessionConfigOption({ sessionId: meta.acpSessionId, configId, ...payload })`，其中 `payload` 为 `type === "boolean" ? { type: "boolean", value: value as boolean } : { value: value as string }`。
5. 若调用因 ACP 协议错误码 `-32601`（method not found）或语义等价错误失败，SHALL 抛出 `ipcError(IpcErrorCodes.CONFIG_OPTION_NOT_SUPPORTED)`；其他错误归一为 `ipcError(IpcErrorCodes.ACP_ERROR)`。
6. 调用成功后，SHALL 通过 session-store 字段级更新接口将响应中的 `configOptions` 持久化到 `SessionMeta.config_options`，并把归一化后的 `AcpSessionConfigOption[]` 作为返回值返回。

`electron/main/ipc/chat.ts` SHALL 注册 `chat:setConfigOption` handler，签名为 `(input: { projectId: string; sessionId: string; configId: string; type: "select" | "boolean"; value: string | boolean }) => Promise<IpcResponse<{ configOptions: AcpSessionConfigOption[] }>>`，handler 函数体仅做 `validate(setConfigOptionInputSchema, input)` 与调用 service。

`shared/types/channels.ts` SHALL 在 `ChatChannels` 中新增 `setConfigOption: "chat:setConfigOption"`。

`shared/schemas/ipc/chat.ts` SHALL 导出 `setConfigOptionInputSchema`，校验：

- `projectId`: 非空字符串
- `sessionId`: 非空字符串
- `configId`: 非空字符串
- `type`: 字面量联合 `"select" | "boolean"`
- `value`: discriminated union（`type === "boolean"` ⇒ `z.boolean()`；`type === "select"` ⇒ `z.string().min(1)`）

`shared/constants/error-codes.ts` SHALL 新增 `CONFIG_OPTION_NOT_SUPPORTED` 与 `CONFIG_OPTION_INVALID_VALUE` 两个错误码。

`config-option-service.setConfigOption` SHALL NOT 通过 `sessionRegistry` 找到 `AcpSession` 并 `emit("event", ...)`。renderer 必须依赖 IPC 返回值更新 store。

#### Scenario: renderer 调 setConfigOption 成功

- **WHEN** renderer 调 `window.api.chat.setConfigOption({ projectId, sessionId, configId: "model", type: "select", value: "sonnet" })`
- **AND** session meta 中 `acpSessionId` 存在，`config_options` 含 id=`"model"` 的 select schema，`"sonnet"` 在其 options 集合
- **THEN** 主进程通过 `connection.setSessionConfigOption(...)` 调用 ACP
- **AND** 把返回的 `configOptions` 持久化到 session meta 的 `config_options` 字段
- **AND** 返回 `{ ok: true, data: { configOptions } }`

#### Scenario: value 不在 schema 中被预校验拦截

- **WHEN** session meta 的 `config_options` 中 id=`"model"` 的 options 集合不包含 `"gpt-4"`
- **AND** renderer 传入 `{ configId: "model", type: "select", value: "gpt-4" }`
- **THEN** 主进程在调用 ACP RPC 之前返回 `{ ok: false, error: { code: "CONFIG_OPTION_INVALID_VALUE" } }`
- **AND** 不调用 `connection.setSessionConfigOption`

#### Scenario: agent 不实现 setSessionConfigOption

- **WHEN** ACP RPC 返回方法未实现错误（JSON-RPC `-32601` 或语义等价）
- **THEN** 主进程返回 `{ ok: false, error: { code: "CONFIG_OPTION_NOT_SUPPORTED" } }`

#### Scenario: session 没有 acpSessionId（草稿态保护）

- **WHEN** renderer 传入的 `sessionId` 对应 session meta 不存在或其 `acpSessionId` 为空
- **THEN** 主进程返回 `{ ok: false, error: { code: "VALIDATION_ERROR" } }`
- **AND** 不调用 `connection.setSessionConfigOption`

#### Scenario: 分组 options shape 也支持

- **WHEN** session meta 的某 select schema 的 `options` 为 `AcpSessionConfigOptionGroup[]`
- **AND** renderer 传入的 `value` 出现在某个 group 的 `options` 项里
- **THEN** 预校验通过，正常发起 RPC

### Requirement: bundled MCP servers 注入路径不受影响

`config-option-service.setConfigOption` SHALL NOT 修改、注入或移除任何 `mcpServers` 配置。该接口只代理 ACP `session/set_config_option` 调用，与 bundled MCP 拼装无关。

#### Scenario: setConfigOption 不读 bundled MCP

- **WHEN** `config-option-service.setConfigOption` 被调用
- **THEN** 函数体内不调用 `getBundledMcpServers`
- **AND** 不引用 `FYLLO_DISABLE_BUNDLED_MCP` 环境变量
