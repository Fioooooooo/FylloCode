## Why

草稿态下用户选 agent 后，session store 会 `ensureDraftProbe` 拿到 `configOptions` 并通过 `ConfigOptionsBar` 渲染在 `ChatPromptPanel` 的 footer。一旦发出第一条消息：渲染端在 `frontend/src/stores/chat.ts:259-271` 同步执行 `createSession` 后立即 `applyProbeUpdate(draftAgentIdSnapshot, null)` 删除 draft probe；与此同时 `chat-service.createSession` 不接受 `configOptions` / `acpSessionId` 入参，新建的 `SessionMeta` 与 `Session` 都不带 `config_options`。结果：从「draft 销毁」到「下一次 stream `config_options_update` chunk 到达」之间，`activeSession.configOptions` 为 `undefined`，`activeDraftProbe` 为 `null`，footer 的 config options bar 整体收起。许多 ACP agent 在 newSession 后的当前 turn 不会再推送 `config_options_update`，导致 bar 一直空到下一轮。

主进程链路对这一状态本可衔接：`ipc/chat.ts:228-245` 的 stream `takeFor` 路径已经会把 probe 的 `config_options` patch 进 `meta.json`，但只在「`stream:message` 入参带 `acpSessionId` 时」生效；`chat:createSession` 这条早于 stream 的路径并不会写入。本次变更把这条桥接前移到 `createSession`，让 footer 在 draft → session 交接、会话切换、关闭重开三个场景下都不丢配置。

## What Changes

- `chat:createSession` IPC 入参 SHALL 新增可选字段 `configOptions?: AcpSessionConfigOption[]` 与 `acpSessionId?: string`；service 与 main handler 在创建新 `SessionMeta` 时把这两个字段一并写入 `meta.config_options` 与 `meta.acpSessionId`，并通过返回值带给 renderer。**BREAKING（IPC 入参 schema）**：仅扩展可选字段，向后兼容老调用方，但 schema 校验需要同步放行新字段。
- 渲染端 `useChatStore` 在草稿态首条消息流程中：调 `createSession` 时透传当前 draft probe 的 `configOptions` 与 `acpSessionId`（仅当 `probeBeforeCreate.status === "ready"` 时传入），并把 `applyProbeUpdate(agentId, null)` 推迟到 `createSession` 返回的新 session 已经写入 `sessions.value` 之后再执行；`ConfigOptionsBar` 的 `sourceOptions` 在「draft 已删 / activeSession 已带 configOptions」之间不再出现空数组中间帧。
- `frontend/src/stores/session.ts` 的 `createSession` action 入参扩展为可选 `configOptions` / `acpSessionId`，透传到 IPC，并把响应通过 `normalizeSession` 变成带 `configOptions` 的 `Session` 写入 store。
- `electron/main/ipc/chat.ts` 的 stream `takeFor` 兜底路径保持不变；当 `chat:createSession` 已写入 `config_options` 时，stream handler 仍可幂等地再写一次（值相同），保留为兜底。
- 现有 stream `config_options_update` chunk 的双端持久化路径（`ipc/chat.ts:332-342` + `frontend/src/stores/chat.ts:165-167`）保持不动，作为后续主进程主动推送的统一通道。
- 新增 / 调整对应单元测试，覆盖：透传字段、首条消息不闪空、列表加载/选择会话回填 configOptions、可选字段缺失时兼容旧路径。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `session-management`：草稿态首条消息懒创建语义新增「new session 必须从 draft probe 继承 `configOptions` 与 `acpSessionId`」「draft probe 销毁须延迟到 new session 已带 configOptions」两条要求；同时在 Session 加载/选择路径上明确恢复 `configOptions` 的契约。
- `chat-session-probe`：`chat:createSession` 入参与生命周期新增 probe 数据透传契约（`configOptions` / `acpSessionId`）；`chat:stream:message` 的 `takeFor` 写入语义改为兜底，要求与 `createSession` 写入幂等共存。

## Impact

- IPC schema：`shared/schemas/ipc/chat.ts` 中 `createSession` 入参；`shared/types/ipc.ts` 中相关类型声明。
- 主进程：`electron/main/services/chat/chat-service.ts#createSession`、`electron/main/ipc/chat.ts` 的 createSession 处理器；stream handler 中 `takeFor` 段保持兼容。
- 持久化：`SessionMeta.config_options` 字段已存在（见 `session-meta-storage` spec），本次变更只是写入时机前移到 `createSession`，文件 schema 不变。
- 渲染端：`frontend/src/stores/session.ts`（`createSession` action、`activeSession` / `activeDraftProbe` 选择逻辑）、`frontend/src/stores/chat.ts`（首条消息流程）、`frontend/src/components/chat/prompt/ConfigOptionsBar.vue`（数据来源不变，但过渡帧消失）。
- 测试：`frontend/src/__tests__/stores/session.spec.ts`、`frontend/src/__tests__/stores/chat.spec.ts`、`frontend/src/__tests__/components/config-options-bar.spec.ts` 与对应 main 侧（如已有）服务测试。
- 不影响：archive / apply owner 的 ACP session 持久化（不走 `session-store`）；MCP server bundling；agent 进程启动逻辑。
