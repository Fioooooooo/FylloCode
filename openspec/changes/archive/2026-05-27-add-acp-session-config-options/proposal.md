## Why

ACP 协议在 `newSession` / `resumeSession` / `loadSession` 的响应里返回 `configOptions: SessionConfigOption[] | null`，并通过 `sessionUpdate: "config_option_update"` 在 turn 内推送变更，配套 `connection.setSessionConfigOption()` 让客户端切换值。FylloCode 当前完全没有消费这层信息，导致：

- 用户无法在 chat 面板上切换 ACP agent 暴露的 mode / model / thought_level（reasoning effort）等会话级开关，必须重新创建 session 或离开本应用配置。
- 主进程调用 `newSession` 等接口时直接丢弃响应中的 `configOptions`，无法将 agent 当前可用的配置告知 renderer。
- 当前没有任何 IPC 通道允许 renderer 修改正在进行的 session 的配置项。

为了把这层"会话内可调整能力"在 FylloCode 中真正接通，需要一次跨主进程、IPC、renderer 三层的能力建设。

## What Changes

- 在主进程 `AcpSession` 中捕获 `newSession` / `resumeSession` / `loadSession` 响应里的 `configOptions`，转成 `SessionEvent { type: "config_options_update", options }` 推送到上层。
- 在 `acp-mapper` 中处理 ACP 推送的 `sessionUpdate: "config_option_update"`，复用同一个 `SessionEvent` 类型，使主进程内部对"全集替换"语义只走一条通路。
- 扩展 `SessionEvent` 与 `MessageChunkData` 联合类型，在流式协议中新增 `config_options_update` chunk，让 renderer 能在 turn 内实时刷新选项与 currentValue。
- 新增 `chat:setConfigOption` 请求-响应 IPC，主进程内部转发到 `connection.setSessionConfigOption({ sessionId, configId, value, type })`，把 agent 返回的全集 `configOptions` 通过 IPC 返回值原路返回，由 renderer 统一替换内存态。
- `Session` 结构与 session-store 持久化新增 `config_options?: AcpSessionConfigOption[]` 字段，与 `available_commands` 同位治理，保证用户重新打开会话时可立即拿到最近一次的快照。
- Renderer 新增 `ConfigOptionsBar` 组件渲染在 `ChatPromptPanel` footer 中，按 `mode → model → thought_level → 其它` 的优先级排序，对未知 `category` 走通用 fallback；`type === "select"` 用下拉菜单，`type === "boolean"` 用开关；草稿态（尚未建立 `acpSessionId`）时整个 Bar 不渲染。
- 新增独立类型契约 `AcpSessionConfigOption`（脱 SDK 类型），跨主进程与渲染进程共享；`SessionConfigSelect.options` 兼容平铺数组与 `Array<SessionConfigSelectGroup>` 两种 shape。
- 新增错误码 `CONFIG_OPTION_NOT_SUPPORTED` 与 `CONFIG_OPTION_INVALID_VALUE`，分别用于 agent 未实现该能力与 value 不在 schema 中的两种失败路径。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `acp-chat-backend`: 新增 `configOptions` 在 session 创建/恢复响应处的捕获、`config_option_update` notification 的映射、`connection.setSessionConfigOption` 的封装；扩展 `SessionEvent` 联合类型新增 `config_options_update` 成员。
- `ipc-streaming`: `MessageChunkData` 联合类型新增 `config_options_update` chunk。
- `ipc-request-response`: 新增 `chat:setConfigOption` IPC，定义入参/出参/错误码。
- `session-meta-storage`: `SessionMeta` 新增可选 `config_options` 字段，落盘 key 与 `available_commands` 同位风格。
- `chat-interface`: renderer chat store 在流式 chunk 中处理 `config_options_update`，并在 `ChatPromptPanel` footer 渲染 `ConfigOptionsBar`，新增"草稿态隐藏 / 已建立 session 显示 / 未支持隐藏"的渲染契约。

## Impact

**主进程**

- `electron/main/services/chat/acp-session.ts`：在 `recoverSession` 三个分支与 `tryHandlePersistedSession` 后捕获并 emit `configOptions`。
- `electron/main/services/chat/acp-mapper.ts`：处理 `sessionUpdate: "config_option_update"`。
- `electron/main/services/chat/session-event-mapper.ts`：把 `config_options_update` event 映射成 chunk。
- `electron/main/services/chat/config-option-service.ts`（新文件）：封装 setSessionConfigOption。
- `electron/main/domain/chat/session-events.ts`：扩展联合类型。
- `electron/main/infra/storage/session-store.ts`：扩展 `SessionMeta`，提供 `available_commands`-style 字段更新通道。
- `electron/main/ipc/chat.ts`：新增 handler；扩展流式 chunk 转发逻辑。

**Shared 类型**

- `shared/types/acp-config.ts`（新文件）：定义 `AcpSessionConfigOption` 与子类型。
- `shared/types/chat.ts`：`Session.configOptions?` 与 `MessageMeta` 周边。
- `shared/types/ipc.ts`：扩展 `MessageChunkData`。
- `shared/types/channels.ts`：`ChatChannels.setConfigOption`。
- `shared/schemas/ipc/chat.ts`：新增 `setConfigOptionInputSchema`。
- `shared/constants/error-codes.ts`：登记两个新错误码。

**Preload / Renderer**

- `electron/preload/api/chat.ts` / `electron/preload/index.d.ts`：新增 bridge。
- `frontend/src/api/chat.ts`：新增 `setConfigOption` 薄封装。
- `frontend/src/stores/session.ts`：`setSessionConfigOptions` action。
- `frontend/src/stores/chat.ts`：`onChunk` 处理 `config_options_update`；新增 `setConfigOption` action（乐观更新 + 失败回滚）。
- `frontend/src/components/chat/prompt/ChatPromptPanel.vue`：footer 接入新组件。
- `frontend/src/components/chat/prompt/ConfigOptionsBar.vue`、`ConfigOptionItem.vue`（新文件）。

**Guidelines**

- `guidelines/IPC.md` 新增章节描述 `chat:setConfigOption` 与 `config_options_update` chunk。

**测试**

- 主进程：`acp-mapper.spec.ts` 增 `config_option_update` case；`session-event-mapper.spec.ts` 增 chunk 映射；`config-option-service.spec.ts`（新）覆盖 setSessionConfigOption 调用与错误码归一化；`acp-session.spec.ts` 增三种入口处的 emit 断言。
- IPC：`chat-ipc.spec.ts` 新增 `chat:setConfigOption` 的入参校验与成功/失败路径。
- Renderer：`stores/chat.spec.ts` 增 chunk 处理与乐观更新回滚；`ConfigOptionsBar` 的组件级测试覆盖三种渲染条件（草稿态隐藏、ready 渲染、空数组隐藏）。

**不在范围内**

- 提升 `ChatAgentSelect` 在 ChatPromptPanel 中的位置（用户后续会单独提案）。
- 草稿态预探测（probe newSession 提前拿 schema）。本次确认草稿态直接不渲染 Bar，等到首次 sendMessage 后由 `newSession` 响应触发首次渲染。
- 跨 agent 缓存 schema 到磁盘。configOptions 是单 session 行为，不持久化跨 session schema。
- `SessionConfigBoolean` 类型本期同时实现，但 ACP 当前主流 agent 几乎只下发 `select`，`boolean` 渲染会落到 `USwitch`，不做特殊视觉。
