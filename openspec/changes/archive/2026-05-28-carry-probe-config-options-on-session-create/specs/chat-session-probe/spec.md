## ADDED Requirements

### Requirement: chat:createSession 入参 SHALL 接受 probe 数据并写入 SessionMeta

`chat:createSession` IPC 入参 SHALL 在原有 `{ projectId, title, agentId }` 基础上新增可选字段 `configOptions?: AcpSessionConfigOption[]` 与 `acpSessionId?: string`，入参 schema 在 `shared/schemas/ipc/chat.ts` 的 `createSessionInputSchema` 中以 `.optional()` 标注；preload `electron/preload/api/chat.ts` 中 `chatApi.createSession` 的入参类型同步扩展。

主进程 `electron/main/services/chat/chat-service.ts#createSession` SHALL 在构造新 `SessionMeta` 时：

- 当入参 `configOptions` 为非 `undefined` 数组时，写入 `meta.config_options`；当为 `undefined` 时不设置该字段。
- 当入参 `acpSessionId` 为非空字符串时，写入 `meta.acpSessionId`；当为 `undefined` 时不设置该字段。
- 其余字段（`tokenUsage`、`turnCount`、`createdAt`、`updatedAt`、`title`、`agentId`）行为与现状一致。

主进程 IPC handler 通过现有 `toSession(meta, projectId)` 把 `meta.config_options` 映射为 `Session.configOptions` 返回 renderer；renderer `useSessionStore.createSession` 把响应通过 `normalizeSession` 写入 `sessions.value`。

#### Scenario: createSession 透传 configOptions 与 acpSessionId 写入 meta

- **WHEN** renderer 调 `chatApi.createSession({ projectId, agentId, title, configOptions: [<schema>], acpSessionId: "sess-A" })`
- **THEN** 主进程通过 `validate(createSessionInputSchema, input)` 不报错
- **AND** 新建的 session meta JSON 文件包含 `config_options: [<schema>]` 与 `acpSessionId: "sess-A"`
- **AND** IPC 响应 `Session.configOptions` 与 `Session.agentId` 与入参一致
- **AND** 该 session 的 `agentId` 与入参 `agentId` 一致

#### Scenario: createSession 不传 probe 字段时与现状一致

- **WHEN** renderer 调 `chatApi.createSession({ projectId, agentId, title })`，未传 `configOptions` 与 `acpSessionId`
- **THEN** schema 校验通过
- **AND** 新建的 session meta JSON 文件不含 `config_options` 与 `acpSessionId` 字段
- **AND** IPC 响应 `Session.configOptions` 为 `undefined`

#### Scenario: createSession 入参 configOptions 为空数组也持久化

- **WHEN** renderer 调 `chatApi.createSession` 时 `configOptions: []`
- **THEN** session meta 文件持久化 `config_options: []`
- **AND** IPC 响应 `Session.configOptions` 为 `[]`
- **AND** 后续 session-store 字段级更新不会因「空数组等同于缺失」误删该字段

## MODIFIED Requirements

### Requirement: chat:stream:message handler 在 acpSessionId 入参存在时 consume Probe 并写入 SessionMeta

`electron/main/ipc/chat.ts` 中 `chat:stream:message` 的 handler `onReady` 钩子 SHALL 满足：

1. 解析入参 `{ sessionId, projectId, agentId, prompt, acpSessionId? }`。
2. 当 `acpSessionId` 非空时：
   - 调用 `SessionProbeRegistry.takeFor(agentId, acpSessionId)`：
     - 返回 `null` SHALL 抛 `ipcError(IpcErrorCodes.VALIDATION_ERROR, "probe acpSessionId 不匹配或已被 consume")`，stream 立即以该错误结束。
     - 返回 entry 后，使用 entry 的 `configOptions` 与 `acpSessionId`。
   - 通过 `patchSessionMeta(projectPath, sessionId, { acpSessionId, agentId, config_options: entry.configOptions, updatedAt: ... })` 把 probe 数据写入 SessionMeta。该写入与 `chat:createSession` 阶段已经写入同名字段的情况下 SHALL 保持幂等：值相同时仅 `updatedAt` 被覆盖，其它字段值不变。
   - 构造 `AcpSession` 时传入 `presetAcpSessionId: acpSessionId`。
3. 当 `acpSessionId` 为空时，行为与现状完全一致（`AcpSession` 自行决定 newSession / resume / load 路径）。

handler SHALL NOT 在 `acpSessionId` 入参存在时再尝试调用 `connection.newSession` —— 该路径由 `AcpSession.start` 的 preset 分支保证跳过。

`SessionProbeRegistry.takeFor` 的契约不因 `chat:createSession` 也写入 probe 数据而改变：每个 ready entry 仍只能被 consume 一次。允许的工作流是「`createSession` 透传 + 同一轮 stream `takeFor` 消费」共存（前者写 meta，后者负责 promote 注册表条目并构造 `AcpSession`）。

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

#### Scenario: createSession 已写入 probe 数据后 takeFor 写入幂等

- **WHEN** 草稿态首条消息流程中，`chat:createSession` 已用入参 `configOptions` 与 `acpSessionId: "sess-A"` 写入 session meta
- **AND** 紧随其后的 `chat:stream:message` 入参也带 `acpSessionId: "sess-A"`，触发 `takeFor` 与 `patchSessionMeta`
- **THEN** 第二次写入只会更新 `updatedAt`，`config_options` / `acpSessionId` / `agentId` 字段值与第一次写入一致
- **AND** Registry 中对应 entry 仍被 `takeFor` 移除（消费 probe 内存槽位）
- **AND** `AcpSession` 仍以 `presetAcpSessionId: "sess-A"` 构造
