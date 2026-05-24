## Why

当前 chat prompt 通道只能发单个 `string`，主进程把它包成一个 ACP `text` part。前端虽然有附件选择 UI（PromptActionMenu / AttachmentList），但 attachments 是纯静态展示，发送时被丢弃，无法把图片或文件随消息送给 ACP agent。

ACP `InitializeResponse.agentCapabilities.promptCapabilities` 已经声明了每个 agent 对 `image` / `audio` / `embeddedContext` 的支持情况，进程池在 initialize 时已收到该信息但没有传出 main process。我们需要把能力暴露到渲染端，让 UI 按 agent 能力动态启用 / 禁用附件入口；同时把 prompt 通道从单 string 改成 `ChatPromptPart[]`，使图片以 ACP `image` part（base64）发送、文件以 `resource_link` part（`file://` URI）发送。

## What Changes

- **BREAKING**：`chat:stream:message` IPC 的 `prompt` 字段从 `string` 改为 `ChatPromptPart[]`（至少包含一个 `text` part）。`chatApi.streamMessage(...)` 第四参数从 `prompt: string` 改为 `parts: ChatPromptPart[]`。`AcpSession.start(...)` 入参类型同步改造。
- **BREAKING**：jsonl 中持久化的 user message `parts` 从 `[{ type: "text", text }]` 单条扩展为可包含 `text` / `file`（AI SDK `FileUIPart`）混合数组。assistant 端不变。
- **新增 IPC** `acp:ensureAgent(agentId)`：懒启动 ACP 进程并返回该 agent 的 `promptCapabilities`；同时把结果写入磁盘缓存 `<userData>/acp/agent-capabilities.json`。
- **新增 IPC** `acp:loadCapabilitiesCache()`：渲染端启动期同步读取磁盘缓存，避免冷启动 capability 盲区。
- **新增 IPC** `chat:saveAttachment(projectId, sessionId, fileName, mimeType, base64Data)`：把附件文件落盘到 `<userData>/projects/<encoded(projectPath)>/sessions/<sessionId>/attachments/<uuid>.<ext>`，返回 `file://` URI。
- **`chat:removeSession`** 在删除 `<sessionId>.json` / `.messages.jsonl` 同时递归清理 `attachments/` 目录。
- **新增前端 store 字段** `useAcpAgentsStore.promptCapabilitiesByAgent: Map<agentId, AcpPromptCapabilities>`，由磁盘缓存 + `acp:ensureAgent` 异步刷新维护。
- **`ChatPromptPanel`**：watch 当前 `agentId` 触发 `acp:ensureAgent`；按 capability 启用/禁用 `PromptActionMenu` 中的图片项（绑 `image`）与文件项（绑 `embeddedContext`）；切换到不兼容 agent 后已选不被支持的附件，发送时拦截 + toast 并阻止发送。
- **新增 Audio 入口**：`UChatPromptSubmit` 左侧新增 `i-lucide-audio-lines` icon 按钮，disabled 由 `promptCapabilities.audio === true` 控制，启用态点击触发 toast `"即将开放"`，**不发送任何内容**。
- **`handleSubmit` 组装规则**：固定顺序——先 push `text` part（即使 `input.value` 为空且存在附件，也要 push 一个空字符串占位的 text part），再依次 push 附件 part；所有附件统一调 `chat:saveAttachment` 落盘后取 `file://` URI；jsonl 持久化与 part 发送均走该 URI（图片 part 发送时由主进程从磁盘读出并 base64 编码为 ACP `image` part）。
- **新增前端 helper** `frontend/src/utils/chat-message-parts.ts` 暴露 `isUserImagePart` / `isUserFilePart`，`UIMessageList` user 分支使用它们渲染图片缩略图卡片与文件名片。
- **磁盘缓存 schema**：`<userData>/acp/agent-capabilities.json` 形如 `{ version: 1, agents: { <agentId>: { promptCapabilities: { image, audio, embeddedContext }, capturedAgentVersion, capturedAt } } }`。`promptCapabilities` 三个字段归一化为 boolean（ACP 协议 optional 时落盘 `false`）。`capturedAgentVersion` 与 `installed.installedVersion` 不一致时丢弃旧值并在下次 `ensureAgent` 写新值。本次 scope 仅缓存 `promptCapabilities`，schema 留扩展位（未来可在同对象下加 `loadSession` / `mcpCapabilities` 等 sibling key）。

## Capabilities

### New Capabilities

- `acp-prompt-capabilities`：定义 agent prompt 能力的检测、磁盘缓存、IPC 暴露与失效策略，以及渲染端 store 集成方式。
- `chat-attachments`：定义附件文件落盘路径、`chat:saveAttachment` IPC、附件随 session 的生命周期（含 `removeSession` 清理）。

### Modified Capabilities

- `acp-chat-backend`：`chat:stream:message` IPC schema 与 `AcpSession.start(...)` 入参从 `prompt: string` 改为 `parts: ChatPromptPart[]`；reminder 注入仍以 `text` part 注入首位；user message 持久化的 `parts` 形态扩展为多 part；`removeSession` 行为扩展为同时清理 attachments 目录。
- `chat-interface`：Chat prompt 的 capability gating（图片/文件入口随 `promptCapabilities` 切换）、Audio 占位按钮、`handleSubmit` 多 part 组装、`UIMessageList` 渲染 user `file` part（图片缩略图与文件名片）。

## Impact

**前端**

- `frontend/src/components/chat/prompt/ChatPromptPanel.vue`：watch agentId、capability 注入、handleSubmit 改造、Audio 按钮
- `frontend/src/components/chat/prompt/PromptActionMenu.vue`：菜单项按 capability disabled
- `frontend/src/components/chat/UIMessageList.vue` 及内部 part 渲染：新增 user `file` part 分支
- `frontend/src/utils/chat-message-parts.ts`（新文件）：`isUserImagePart` / `isUserFilePart`
- `frontend/src/stores/chat.ts`：`sendMessage(text)` → `sendMessage(parts)`，`buildUserMessage` / `buildFallbackSessionTitle` 适配
- `frontend/src/stores/acp-agents.ts`：新增 `promptCapabilitiesByAgent` 状态、启动期 `loadCapabilitiesCache` 加载
- `frontend/src/api/chat.ts` / `frontend/src/api/acp-agents.ts`：暴露新 IPC

**Preload**

- `electron/preload/api/chat.ts`：`streamMessage` 第四参数类型；新增 `saveAttachment` 方法
- `electron/preload/api/acp-agents.ts`：新增 `ensureAgent` / `loadCapabilitiesCache` 方法

**主进程**

- `electron/main/ipc/chat.ts`：`streamMessageInputSchema` 改造、新增 `saveAttachment` handler；`removeSession` handler 增加 attachments 目录清理
- `electron/main/ipc/acp-agents.ts`：新增 `ensureAgent` / `loadCapabilitiesCache` handler
- `electron/main/services/chat/acp-session.ts`：`start` 参数类型；图片 part 主进程读盘 → base64 转 ACP `image`；文件 part → ACP `resource_link`
- `electron/main/services/chat/message-assembler.ts`：user message 构造支持多 part
- `electron/main/infra/process/acp-process-pool.ts`：`startProcess` initialize 成功后写入 `agent-capabilities.json`
- `electron/main/infra/storage/agent-capability-store.ts`（新文件）：磁盘缓存读写
- `electron/main/infra/storage/attachment-store.ts`（新文件）：附件目录路径生成、保存、清理
- `electron/main/infra/storage/session-store.ts`：`removeSession` 调 attachment-store 清理目录

**Shared**

- `shared/types/chat-prompt.ts`（新文件）：`ChatPromptPart` 类型与 `chatPromptPartSchema` zod schema
- `shared/types/acp-agent.ts`：补 `AcpPromptCapabilities` 类型
- `shared/schemas/ipc/chat.ts`：`streamMessageInputSchema.prompt` 类型改造、`saveAttachmentInputSchema`
- `shared/schemas/ipc/acp-agents.ts`：`ensureAgentInputSchema` / `capabilitiesCacheSchema`
- `shared/types/channels.ts`：新增 IPC channel 常量

**磁盘**

- 新增 `<userData>/acp/agent-capabilities.json`
- 新增 `<userData>/projects/<encoded(projectPath)>/sessions/<sessionId>/attachments/` 目录树

**显式不在范围内**

- audio part 的实际发送（仅 UI 占位 + toast）
- 拖拽 / 粘贴上传（PromptActionMenu 的 useFileUpload 已能覆盖文件选择）
- 工具产出 part 的多模态渲染（assistant 端不动）
- 缓存 `promptCapabilities` 之外的其他 `agentCapabilities` 字段
