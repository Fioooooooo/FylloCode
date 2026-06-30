---
name: IPC
description: FylloCode 的主渲染通信契约、channel 规则、bridge 暴露与错误模型
keywords: [ipc, electron, preload, channels, contracts]
---

# IPC

## Purpose

定义主进程、预加载脚本和渲染进程之间的通信模型、channel 命名、payload 校验、响应格式和流式协议。任何涉及新增或修改 `window.api`、IPC channel、shared schema、错误码或 MessagePort 流程的工作，都必须先阅读本文档。

## Applicability

- 适用于 `src/main/ipc/**`、`src/preload/**`、`src/shared/types/channels.ts`、`src/shared/schemas/ipc/**`、`src/shared/types/ipc.ts`、`src/shared/constants/error-codes.ts`。
- 适用于 `src/renderer/src/api/**` 中对 `window.api.*` 的消费。
- 不覆盖主进程内部 service/domain/infra 分层；见 `guidelines/MainProcess.md`。

## Sources of Truth

- `src/shared/types/channels.ts`
- `src/shared/schemas/ipc/**`
- `src/shared/types/ipc.ts`
- `src/shared/types/stream-event.ts`
- `src/shared/constants/error-codes.ts`
- `src/shared/errors/ipc-error.ts`
- `src/main/ipc/**`
- `src/preload/api/**`
- `src/preload/index.d.ts`
- `src/renderer/src/api/**`
- `openspec/specs/ipc-protocol/spec.md`
- `openspec/specs/ipc-request-response/spec.md`
- `openspec/specs/ipc-streaming/spec.md`
- `openspec/specs/proposal-ipc/spec.md`
- `openspec/specs/workflow-ipc/spec.md`

## Rules

- MUST: 将所有 channel 名称定义在 `src/shared/types/channels.ts`，禁止在主进程、preload 或 renderer 中散落字符串字面量。
- MUST: 使用 `domain:action` 作为 channel 命名格式，其中 domain 表示功能领域，而不是页面入口或 UI 路由。
- MUST: 让每个 handle 型 channel 返回 `IpcResponse<T>`，错误分支返回 `IpcErrorInfo`，而不是抛出 renderer 侧难以消费的任意结构。
- MUST: 让主进程 handler 的入参通过 `src/shared/schemas/ipc/<domain>.ts` 中的 Zod schema 校验；渲染侧类型声明不能替代运行时校验。
- MUST: 让 preload 通过 `contextBridge` 暴露 `window.api`，渲染层只能消费这些公开 API，不得直接触碰 `ipcRenderer`。
- MUST: 让流式协议通过 `ipc/_kit/stream-channel.ts` 与 `MessagePort` 实现，chunk/done/error 消息结构遵循 `src/shared/types/ipc.ts`。
- MUST: 主进程 `SessionEvent`（`src/main/domain/chat/session-events.ts`）与跨进程 `MessageChunkData`（`src/shared/types/ipc.ts`）共享 `src/shared/types/stream-event.ts` 的 `StreamContentEvent` 子集——9 个跨进程同构成员只在此处单点定义；判别字段统一为 `kind`，工具类别字段统一为 `toolKind`（不得复用 `kind` 作工具类别）。`SessionEvent` 仅额外外挂主进程控制流变体（`done`/`error`/`session_id_resolved`），`MessageChunkData` 仅额外外挂渲染态变体（`user_message`/`status`）。`session-event-mapper.toMessageChunk` 只负责过滤控制流（对 `done`/`error`/`session_id_resolved` 返回 `null`）并对子集成员深拷贝透传一次，不得逐字段重建——新增流式字段时只改 `stream-event.ts` 一处。`stream-event.ts` 不得 import `@agentclientprotocol/sdk`。
- MUST: 让 `chat:stream:message` 的 MessagePort handoff 使用 preload 生成的 renderer-local `streamId` 关联每次调用；main 必须在 `chat:stream:port` payload 中回传同一个 `{ streamId }`，preload 必须用共享 dispatcher 和 pending registry 按 `streamId` 绑定 port。不得为每次 chat stream 注册无条件消费下一个 port 事件的 `ipcRenderer.once(...)`；未匹配 streamId 的 port 必须关闭。
- MUST: 让三个流式 handler（`chat:stream:message`、`proposal:stageStream`、`proposal:archive`）共用 `services/chat/acp-stream-driver.ts` 的 `driveAcpStream`，由它固化必须一致的解析契约：内容增量（`text_delta`/`reasoning_delta`/`tool_call_start`/`tool_call_update`）经 `MessageAssembler` + `toMessageChunk` 转发，`done`/`error`/`runner.cancel` 三个终止出口对称落盘已组装消息，并统一做 `sessionRegistry.unregister` 与 `mapAcpErrorCode` 错误码映射。任何非 `done` 的停止（agent 报错、用户 stop / port close）也必须 flush 当前 `MessageAssembler` 并持久化，否则重启后该轮部分回复丢失；去重依赖 `MessageAssembler.flush()` 的一次性所有权语义（首次取走 `currentMessage` 并置空、再次返回 `null`），不得引入额外布尔标志；落盘失败只记 `logger.error`，不阻断该出口既有的终止动作。各 handler 独有的差异通过 driver 的 hooks 注入（`persistMessage` 落盘目标、`onControlEvent` 控制事件、`onDone`/`onError` 终态副作用、`doneFailureCode` 终态失败码），driver 自身绝不擅自转发或持久化控制事件——不得新写第四份手写 `session.on("event")` switch。`driveAcpStream` 通过自定义 `StreamOutput` 接口接收 sink，不 import `ipc/_kit` 的 `StreamSink`，以保持 ipc → services 单向依赖。
- MUST: 将新增错误码登记到 `src/shared/constants/error-codes.ts`；不得返回未声明的错误码字符串。
- MUST: 在 `src/renderer/src/api/` 中为每个公开 bridge 方法提供对等薄封装，保持 renderer 对 IPC 的访问点可搜索、可替换、可测试。
- SHOULD: 让 `src/preload/index.d.ts` 与 `src/preload/api/**` 同步更新，避免桥接实现与类型声明脱节。
- SHOULD: 按业务域组织 schema 和 channel，例如 `chat`、`proposal`、`workflow`、`integration`，避免把所有通信契约塞进单个大文件。
- MAY: 为事件型 channel 在 preload 中提供 `onXxx` / `offXxx` 风格封装，但不要把订阅系统散落到业务组件层直接实现。

## Examples

- Good: 在 `src/shared/schemas/ipc/proposal.ts` 增加入参 schema，在 `src/main/ipc/proposal.ts` 里 `validate -> service -> return`，在 `src/preload/api/proposal.ts` 暴露 bridge，再由 `src/renderer/src/api/proposal.ts` 封装调用。
- Good: 使用 `IpcErrorCodes.PROJECT_NOT_FOUND` 这类集中登记的错误码，而不是字符串 `"PROJECT_NOT_FOUND"` 字面量。
- Good: `chat:stream:*`、`proposal:*:port` 一类流式通道通过 `MessagePort` 传递分块事件。
- Bad: 在 renderer 组件中直接 `ipcRenderer.invoke("proposal:list", input)`。
- Bad: 在 handler 内手写 `{ ok: false, error: { code: "UNKNOWN", ... } }` 并绕过共享错误码类型。

## Multimodal Prompt Channels

- `acp:ensureAgent`：入参 `{ agentId: string }`，返回 `IpcResponse<{ promptCapabilities: { image: boolean; audio: boolean; embeddedContext: boolean } }>`；用于懒启动 / 复用 ACP agent 并读取归一化 prompt capability。启动失败沿用 ACP 启动错误码，如 `ACP_NOT_READY`、`ACP_EXIT_GIVEUP`、`SPAWN_ERROR`、`ACP_ERROR`。
- `acp:loadCapabilitiesCache`：无入参，返回 `IpcResponse<Record<agentId, AcpPromptCapabilities>>`；用于 renderer 启动期读取 `<userData>/acp/agent-capabilities.json` 的内存快照。
- `chat:saveAttachment`：入参 `{ projectId, sessionId, fileName, mimeType, base64Data }`，其中 `base64Data` 解码后不得超过 25 MB；返回 `IpcResponse<{ uri: string; name: string; mimeType: string }>`，`uri` 为 `file://`。校验失败返回 `VALIDATION_ERROR`。
- `chat:readAttachmentDataUrl`：入参 `{ uri, mediaType }`，其中 `uri` 必须为 `file://`，`mediaType` 必须以 `image/` 开头；返回 `IpcResponse<{ dataUrl: string }>`，用于 renderer 将已持久化图片附件读取为 `<img src>` 可用的 data URL。本次读取接口不设置文件大小上限。
- `chat:stream:message` 的 `prompt` 字段为 `ChatPromptPart[]`；当 prompt part 与 agent capability 不匹配时，主进程返回 `PROMPT_CAPABILITY_MISMATCH`。

## Lineage Channels

- `lineage:ensureTaskSubject`：入参 `{ projectId, snapshot }`，其中 `snapshot` 为 `LineageTaskSnapshot`；主进程解析 projectId 为 projectPath 后调用 `lineage-service.ensureTaskSubject`，返回 `Subject`。发起任务讨论前必须先调用该 channel 创建或复用 task subject。
- `lineage:linkTaskSession`：入参 `{ projectId, taskRef, sessionId }`，调用 `lineage-service.linkTaskSession`，返回 `Subject | null`。该 channel 为尽力而为挂边能力；调用方必须能处理 `null`。
- `lineage:getByTask`：入参 `{ projectId, ref }`，返回 `IpcResponse<TaskDownstreamProjection | null>`，用于 renderer 从 lineage subject 快照读取任务标题与下游 session links。
- `lineage:createSessionTask`：入参 `{ projectId, sessionId, title, description? }`，返回 `IpcResponse<TaskItem>`。该 channel 由主进程一次性创建本地任务并回绑到当前会话 subject；创建任务失败必须返回错误，回绑失败只记录日志并返回已创建任务。
- `lineage:readPlan`、`lineage:savePlanBody`、`lineage:approvePlan`：入参均包含 `{ projectId, sessionId, slug }`，保存正文额外包含 `body`。`slug` 必须为完整 `yyyy-MM-dd-agent-slug`，主进程按 session plans 目录推导路径并限制在该目录内；renderer 不得传本地文件路径。`readPlan` 返回 `PlanDocument`，`savePlanBody` 只替换正文并保留 frontmatter，`approvePlan` 幂等地把 status 置为 `approved`。
- Lineage channel 必须通过 `LineageChannels` 声明，入参 schema 位于 `src/shared/schemas/ipc/lineage.ts`，handler 位于 `src/main/ipc/lineage.ts`，bridge 与 renderer 薄封装分别位于 `src/preload/api/lineage.ts` 与 `src/renderer/src/api/lineage.ts`。
- `chat:listSessions` 在解析 `projectId → projectPath` 后必须调用 `ensureLineageEventConsumer(projectPath)`，作为 MCP proposal 事件目录 consumer 的项目级懒触发点；consumer 创建本身必须幂等，handler 不承担文件扫描或 lineage 写入细节。

## Proposal Channels

- `proposal:list`、`proposal:readFile`、`proposal:apply`、`proposal:stageStream`、`proposal:archive`、`proposal:loadRun`、`proposal:loadArchive` 等请求-响应 channel 的入参 schema 位于 `src/shared/schemas/ipc/proposal.ts`，handler 位于 `src/main/ipc/proposal.ts`，bridge 与 renderer 薄封装分别位于 `src/preload/api/proposal.ts` 与 `src/renderer/src/api/proposal.ts`。
- `proposal:getSpecDeltas`：入参 `{ projectId, changeId }`，两个字段均为非空字符串；主进程解析 projectId 后使用 change 定位逻辑读取 `specs/*/spec.md`，返回 `IpcResponse<ProposalSpecDeltaOverview>`。该 channel 只返回 proposal capability delta DTO，不放宽 `proposal:readFile` 的顶层文件读取边界；共享类型位于 `src/shared/types/proposal.ts`，schema 位于 `src/shared/schemas/ipc/proposal.ts`，handler 位于 `src/main/ipc/proposal.ts`，bridge 与 renderer 薄封装分别位于 `src/preload/api/proposal.ts` 与 `src/renderer/src/api/proposal.ts`。
- `proposal:statusChanged` 是主进程主动向渲染进程推送的广播型 channel：当 `ProposalStatusService` 监听到 `.openspec.yaml` 的 `status` 变化、proposal 被归档或删除时，通过 `webContents.send(ProposalChannels.statusChanged, payload)` 发送 `ProposalStatusChangedPayload`。渲染进程通过 `proposalApi.onStatusChanged` 订阅并在 `useSessionStore` 中更新 `sessionProposals`。新增广播 channel 时必须同步更新 `src/shared/types/channels.ts`、`src/preload/index.d.ts` 与 `src/renderer/src/api/`。

## Overview Channels

- `overview:getProjectOverview`：入参 `{ projectId }`，主进程解析 `projectId → projectPath` 后调用 `overview-service.getProjectOverview`，返回 `IpcResponse<ProjectOverview>`。该 channel 是概览页的单一聚合入口，返回 `stats`、`activeChanges`、`recentLineages`、`governance` 四块数据。`recentLineages[].archiveCommitHash` 优先读取 lineage 中已持久化的 proposal commit hash；缺失时 overview 从当前 Git 历史查询归档提交 hash 并尽力写回 lineage。Git 不可用或归档锚点尚未提交时返回 `null` 且不写入。
- 入参 schema 位于 `src/shared/schemas/ipc/overview.ts`，要求 `projectId` 为非空字符串；DTO 类型位于 `src/shared/types/overview.ts`。handler 位于 `src/main/ipc/overview.ts`，bridge 与 renderer 薄封装分别位于 `src/preload/api/overview.ts` 与 `src/renderer/src/api/overview.ts`。
- 主进程内部允许 overview service 并行聚合仓库扫描、git 查询与 lineage 投影，但 IPC handler 仍只负责 `validate -> resolveProjectPath -> service`，不得把文件系统扫描、git 调用或 lineage 投影逻辑写在 handler 中。

## Specs Browser Channels

- `specs:getSpecsBrowser`：入参 `{ projectId }`，主进程解析 `projectId → projectPath` 后读取 `openspec/specs/*/spec.md`，返回 `IpcResponse<SpecsBrowserOverview>`。该 channel 是能力规约只读浏览页的数据入口，只返回 capability id、Purpose、源路径、更新时间、Requirement/Scenario 计数与解析后的 Requirement/Scenario 分组；不得返回 capability title、family、familyLabel 或 anchors。
- 入参 schema 位于 `src/shared/schemas/ipc/specs.ts`，要求 `projectId` 为非空字符串；DTO 类型位于 `src/shared/types/specs.ts`。handler 位于 `src/main/ipc/specs.ts`，bridge 与 renderer 薄封装分别位于 `src/preload/api/specs.ts` 与 `src/renderer/src/api/specs.ts`。
- 主进程 handler 只负责 `validate -> resolveProjectPath -> getSpecsBrowser`。目录扫描、markdown heading 解析、排序和 `spec.md` 缺失容错都属于 `src/main/services/specs/**`。

## Bundled MCP Env

- 主进程向 bundled MCP server 启动描述符注入 `FYLLO_MCP_EVENT_DIR = mcpEventsDir(projectPath)`，供 `fyllo-specs` 的 `create-proposal` 写出 proposal 事件文件。该目录按主项目 `projectPath` 计算，不随 linked worktree 变化。
- 当当前 ACP/chat session 已有 Fyllo session id 时，启动描述符必须额外注入 `FYLLO_SESSION_ID`；probe 起源 session 的 id 在 probe 阶段生成，转正时通过 `chat:createSession` 的可选 `fylloSessionId` 入参沿用。未提供 id 时不得注入 `FYLLO_SESSION_ID`。

## Session Config Options Channels

- `chat:setConfigOption`：入参 `{ projectId, sessionId, configId, type: "select" | "boolean", value: string | boolean }`，使用 zod discriminated union 校验 `value` 类型与 `type` 字面量匹配（`select` 仅接收非空 `string`，`boolean` 仅接收 `boolean`）。返回 `IpcResponse<{ configOptions: AcpSessionConfigOption[] }>`，主进程在调用 `connection.setSessionConfigOption` 成功后将全集 `configOptions` 写回 `SessionMeta.config_options`，再原样返回给 renderer。错误码集合：`VALIDATION_ERROR`（入参或 session 缺 `acpSessionId`）、`CONFIG_OPTION_INVALID_VALUE`（`value` 不在缓存的 select schema 中）、`CONFIG_OPTION_NOT_SUPPORTED`（agent 未实现 `session/set_config_option`，识别 ACP `-32601` 与语义等价错误）、`ACP_NOT_READY`、`ACP_ERROR`。
- `MessageChunkData` 新增 `{ kind: "config_options_update"; options: AcpSessionConfigOption[] }` 分支，语义为「全集替换」：覆盖 `Session.configOptions` 而非 patch 单项；与 `available_commands_update` / `session_info_update` 同位治理（`acp-session-recovery#shouldSuppressDuringReplay` 白名单），`loadSession` replay 期间也不被抑制。
- `AcpSessionConfigOption` 类型由 `src/shared/types/acp-config.ts` 导出，**不依赖** `@agentclientprotocol/sdk` 的 SDK 类型；主进程 `acp-mapper.normalizeAcpSessionConfigOptions` 负责剥除 `_meta`、把 `null` category/description 归一为 `undefined`，并保留 `select.options` 的平铺与分组两种形态。
- `proposal:stageStream` / `proposal:archive` 不向 `driveAcpStream` 传 `onControlEvent`，因此所有控制事件（`config_options_update` / `available_commands_update` / `usage_update` / `plan_update` / `session_info_update`）一律被忽略：不发 sink chunk、不写磁盘（内容增量仍由 driver 统一经 `MessageAssembler` 落盘）。仅 `chat:stream:message` 提供 `onControlEvent`，转发并持久化这些控制事件到 `SessionMeta`。注意 archive 与 apply 对齐后 `session_info_update` 也不再转发 title chunk。

## Verification

- `pnpm typecheck`
- `pnpm lint`
- `pnpm vitest run test/main/ipc/**/*.spec.ts`
- `pnpm vitest run test/preload/**/*.spec.ts`
- `pnpm vitest run test/shared/**/*.{test,spec}.ts`
- 若改动包含新 channel，检查 `src/shared/types/channels.ts`、`src/shared/schemas/ipc/**`、`src/preload/index.d.ts`、`src/renderer/src/api/**` 是否一并更新。

## Maintenance

- 当 channel 命名策略、bridge 暴露方式、共享响应结构、错误码来源或流式协议变化时，必须更新本文档。
- 当新增功能域引入一组新的 IPC 接口时，应补充 Rules/Examples 中的代表性路径，而不是把本文档扩写成完整 API 手册。
- 若 OpenSpec 中的 `ipc-*` capability 修改了行为契约，应先更新 spec，再同步本文档。
