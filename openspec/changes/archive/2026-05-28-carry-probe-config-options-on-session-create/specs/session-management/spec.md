## ADDED Requirements

### Requirement: 草稿态首条消息懒创建时携带 probe configOptions 与 acpSessionId

系统 SHALL 在用户从草稿态发送第一条消息触发 `createSession` 时，把发送瞬间已 `ready` 的 draft probe 的 `configOptions` 与 `acpSessionId` 一并写入新建的 `SessionMeta`，并通过 `chat:createSession` 的返回值带回 renderer，使新 `Session.configOptions` 在被加入 `useSessionStore.sessions` 时已具备完整内存态。

具体行为：

- 渲染端 `useChatStore.streamMessage` 在调用 `useSessionStore.createSession` 时 SHALL 透传 `configOptions: probeBeforeCreate.configOptions` 与 `acpSessionId: probeBeforeCreate.acpSessionId`，仅当 `probeBeforeCreate?.status === "ready"` 且 `acpSessionId` 非空时透传；否则不传，行为退化到不带这两个字段的老路径。
- `useSessionStore.createSession` SHALL 在 action 入参中扩展可选字段 `configOptions?: AcpSessionConfigOption[]` 与 `acpSessionId?: string`，并透传给 `chatApi.createSession`。
- 主进程 `chat-service.createSession` SHALL 在构造 `SessionMeta` 时把入参 `configOptions` 写入 `meta.config_options`、把 `acpSessionId` 写入 `meta.acpSessionId`；缺省时这两个字段在 `meta.json` 中保持 `undefined`，不出现在文件中。
- 主进程 `chat:createSession` IPC handler SHALL 通过 `toSession(meta, projectId)` 返回包含 `configOptions` 与 `acpSessionId` 的 `Session` 对象。
- 渲染端 `applyProbeUpdate(draftAgentIdSnapshot, null)` SHALL 在 `useSessionStore.createSession` 的 Promise resolve 后、`activeSession` 已切到新 session 时再调用；SHALL NOT 在 `createSession` 之前或与之并行执行，以避免出现 `activeSession.configOptions === undefined` 与 `activeDraftProbe === null` 同时成立的中间帧。

#### Scenario: 草稿态首条消息后 ConfigOptionsBar 不出现空帧

- **WHEN** 用户在草稿态选定 agent，draft probe 状态为 `ready` 且 `configOptions` 非空
- **AND** 用户发送第一条消息触发 `createSession`
- **THEN** `useSessionStore.createSession` 返回的 `Session.configOptions` 与 draft probe 的 `configOptions` 等值
- **AND** `useSessionStore.sessions` 中新条目就位的同一帧，`activeSession.configOptions` 已为该值
- **AND** `applyProbeUpdate(draftAgentIdSnapshot, null)` 在该帧之后调用
- **AND** `ConfigOptionsBar.sourceOptions` 在整个过渡过程中始终非空数组

#### Scenario: 透传字段写入新建 SessionMeta

- **WHEN** `chat:createSession` IPC 入参包含 `configOptions: [...]` 与 `acpSessionId: "sess-A"`
- **THEN** 新建的 session meta JSON 文件包含字段 `config_options: [...]` 与 `acpSessionId: "sess-A"`
- **AND** 已有的 `tokenUsage` 初始化为 `{ used: 0, size: 0 }`，`turnCount` 为 `0`，`title` 为入参 `title`
- **AND** IPC 返回的 `Session` 对象 `configOptions` 与入参一致

#### Scenario: 不携带 probe 字段时退化到老路径

- **WHEN** `chat:createSession` IPC 入参不含 `configOptions` 与 `acpSessionId`（恢复型创建、测试或 probe 未就绪）
- **THEN** 新建的 session meta 文件不包含 `config_options` / `acpSessionId` 字段
- **AND** IPC 返回的 `Session.configOptions` 为 `undefined`
- **AND** 后续 stream `chat:stream:message` 的 `takeFor` 兜底路径行为不变

#### Scenario: createSession 失败不丢 draft probe

- **WHEN** 用户从草稿态发送第一条消息，但 `useSessionStore.createSession` 抛错
- **THEN** `useChatStore.streamMessage` SHALL NOT 调用 `applyProbeUpdate(draftAgentIdSnapshot, null)`
- **AND** `draftProbeByAgent` 中 `draftAgentIdSnapshot` 对应 entry 保持 `ready` 与原 `configOptions`
- **AND** 用户再次发送时复用同一 draft probe

## MODIFIED Requirements

### Requirement: Session 加载恢复可用命令

系统 SHALL 在从磁盘 session meta 加载 session 列表或 session 信息时，恢复持久化的 agent 可用命令列表与 ACP session 级 `configOptions`。主进程读取 session meta 的 `available_commands` 与 `config_options` 字段后 SHALL 通过 IPC 返回为 `Session.availableCommands` 与 `Session.configOptions`，renderer SHALL 在 `normalizeSession` 后保留这两个字段；缺失字段时返回 `undefined`，renderer 不抛错。

#### Scenario: Session 列表加载时恢复 availableCommands

- **WHEN** 项目内某 session meta 包含 `available_commands: [{ name: "review", description: "Review code" }]`
- **THEN** `chat:listSessions` 返回的对应 `Session.availableCommands` 为同一命令列表
- **AND** `useSessionStore.loadSessions` 后该 session 对象保留 `availableCommands`

#### Scenario: 选择 session 后命令回显

- **WHEN** 用户选择一个已经从 session meta 恢复 `availableCommands` 的 session
- **THEN** `activeSession.availableCommands` 为该 session 自身字段
- **AND** ChatContainer 的 slash 命令按钮和菜单按该字段回显

#### Scenario: 缺失字段保持兼容

- **WHEN** 历史 session meta 不包含 `available_commands`
- **THEN** `chat:listSessions` 返回的对应 `Session.availableCommands` 为 `undefined`
- **AND** renderer 加载与选择该 session 不抛错

#### Scenario: Session 列表加载时恢复 configOptions

- **WHEN** 项目内某 session meta 包含 `config_options: [{ id: "model", type: "select", currentValue: "sonnet", ... }]`
- **THEN** `chat:listSessions` 返回的对应 `Session.configOptions` 为同一 schema 数组
- **AND** `useSessionStore.loadSessions` 后该 session 对象保留 `configOptions`
- **AND** 用户选择该 session 时 `ConfigOptionsBar` 立即按 `activeSession.configOptions` 渲染，不需要等任何 stream chunk

#### Scenario: 缺失 config_options 字段保持兼容

- **WHEN** 历史 session meta 不包含 `config_options`
- **THEN** `chat:listSessions` 返回的对应 `Session.configOptions` 为 `undefined`
- **AND** `ConfigOptionsBar.sourceOptions` 通过 `?? []` 回落为空数组，组件因 `hasConfigOptions === false` 不渲染条目，不抛错
