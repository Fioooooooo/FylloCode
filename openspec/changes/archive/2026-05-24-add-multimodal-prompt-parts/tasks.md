## 1. shared 类型与 schema

- [x] 1.1 新建 `shared/types/chat-prompt.ts`，导出 `ChatPromptPart` discriminated union 类型（`text` / `image` / `resource_link`）；导出 zod schema `chatPromptPartSchema`（discriminatedUnion on "type"）。`image` 与 `resource_link` 字段定义参考 design.md D8 与 acp-chat-backend spec ADDED requirement
- [x] 1.2 在 `shared/types/acp-agent.ts` 增加 `AcpPromptCapabilities` 接口：`{ image: boolean; audio: boolean; embeddedContext: boolean }`（不是 optional）；附加纯函数 `normalizePromptCapabilities(input?: { image?: boolean; audio?: boolean; embeddedContext?: boolean }): AcpPromptCapabilities`，缺失字段填 `false`
- [x] 1.3 在 `shared/schemas/ipc/chat.ts` 修改 `streamMessageInputSchema.prompt` 为 `z.array(chatPromptPartSchema).min(1)`；新增 `saveAttachmentInputSchema = z.object({ projectId, sessionId, fileName, mimeType, base64Data })`，其中 `base64Data` 用 `.refine` 校验解码后字节数 ≤ 25 _ 1024 _ 1024；修改 `persistMessageInputSchema` 允许 user message `parts` 含 `text` 与 AI SDK `FileUIPart` 混合，但要求至少包含一个 `text` part
- [x] 1.4 新建 `shared/schemas/ipc/acp-agents.ts`（若不存在）或在现有文件中补：`ensureAgentInputSchema = z.object({ agentId: z.string().min(1) })`；`promptCapabilitiesCacheSchema = z.record(z.string(), z.object({ image, audio, embeddedContext }))`
- [x] 1.5 在 `shared/types/channels.ts`（或现有 channel 常量文件）新增三个 IPC channel 常量：`ACP_ENSURE_AGENT = "acp:ensureAgent"`、`ACP_LOAD_CAPABILITIES_CACHE = "acp:loadCapabilitiesCache"`、`CHAT_SAVE_ATTACHMENT = "chat:saveAttachment"`

## 2. 主进程：磁盘缓存与 IPC

- [x] 2.1 新建 `electron/main/infra/storage/agent-capability-store.ts`，导出：`loadCache(): Promise<Record<string, { promptCapabilities: AcpPromptCapabilities; capturedAgentVersion: string; capturedAt: string }>>`、`upsertPromptCapabilities(agentId, capabilities, capturedAgentVersion): Promise<void>`、`getCachedPromptCapabilities(agentId): Promise<{ capabilities: AcpPromptCapabilities; capturedAgentVersion: string } | null>`。文件路径 `getDataSubPath('acp')/agent-capabilities.json`，schema 含 `version: 1`、`agents: Record<id, ...>`；写入用临时文件 + rename（参考 `session-store.ts` 写法）；解析失败仅 `logger.warn`，返回空 cache
- [x] 2.2 在 `electron/main/infra/process/acp-process-pool.ts` 的 `startProcess` 内、`connection.initialize(...)` 成功后，读取 `installed.installedVersion`（通过现有 `installed-store` API），调 `agentCapabilityStore.upsertPromptCapabilities(agentId, normalizePromptCapabilities(initializeResponse.agentCapabilities?.promptCapabilities), installedVersion)`。失败仅 `logger.error` 不抛
- [x] 2.3 在 `electron/main/services/acp-agent/acp-agent-service.ts` 增加 `ensureAgent(agentId): Promise<{ promptCapabilities: AcpPromptCapabilities }>` 方法。逻辑：先读 `agentCapabilityStore.getCachedPromptCapabilities(agentId)`；若命中且 `capturedAgentVersion === installed.installedVersion` → 异步触发进程懒启动（不 await），同步返回缓存值；若不命中或版本不一致 → `await processPool.ensureAgentProcess(agentId)`，从 `agentProcess.initializeResponse.agentCapabilities.promptCapabilities` 取出，归一化后返回（写盘已在 2.2 完成）
- [x] 2.4 在 `electron/main/ipc/acp-agents.ts` 注册两个 handler：`acp:ensureAgent` → `service.ensureAgent(agentId)`；`acp:loadCapabilitiesCache` → 读 `agentCapabilityStore.loadCache()` 后映射为 `Record<agentId, AcpPromptCapabilities>`（仅返回 `promptCapabilities` 字段）。两者均用 `IpcResponse.ok / .error` 包装；ensureAgent 失败时复用现有 ACP 启动错误码

## 3. 主进程：附件落盘与 session 清理

- [x] 3.1 新建 `electron/main/infra/storage/attachment-store.ts`，导出：`saveAttachment(projectPath, sessionId, fileName, mimeType, base64Data): Promise<{ absolutePath: string; fileUri: string; name: string; mimeType: string }>`、`removeSessionAttachments(projectPath, sessionId): Promise<void>`。`saveAttachment` 内部：基于 `sessionsDir(projectPath) + "/" + sessionId + "/attachments"` 计算目录，`mkdir -p`；扩展名优先取 fileName 后缀，缺失时取 mimeType subtype；用 `crypto.randomUUID()` + ext 生成文件名；`Buffer.from(base64Data, "base64")` 写盘；`fileUri = pathToFileURL(absolutePath).toString()`。`removeSessionAttachments` 用 `fs.rm(dir, { recursive: true, force: true })`
- [x] 3.2 在 `electron/main/ipc/chat.ts` 注册 `chat:saveAttachment` handler：用 `saveAttachmentInputSchema` 校验，通过 `projectId` 解析 `projectPath`（复用现有 project-store API），调 `attachmentStore.saveAttachment(projectPath, sessionId, fileName, mimeType, base64Data)`，返回 `IpcResponse.ok({ uri: fileUri, name, mimeType })`
- [x] 3.3 在 `electron/main/ipc/chat.ts` 的现有 `chat:removeSession` handler 中，删完 `<sessionId>.json` / `.messages.jsonl` 后调 `attachmentStore.removeSessionAttachments(projectPath, sessionId)`；目录不存在时 `fs.rm` 配合 `force: true` 静默通过

## 4. 主进程：AcpSession 改造

- [x] 4.1 修改 `electron/main/services/chat/acp-session.ts` 中 `AcpSession.start` 签名为 `start(parts: ChatPromptPart[]): AsyncIterable<SessionEvent>`；移除内部把 string 包成单 text part 的代码，改为接收外部 parts 数组
- [x] 4.2 在 `AcpSession.start` 内构造发送给 `connection.prompt(...)` 的 `prompt: ContentBlock[]` 数组前，加 capability gate：从 `agentProcess.initializeResponse.agentCapabilities.promptCapabilities` 取归一化值；若 parts 含 `image` 且 `capabilities.image === false` → 抛 `AcpError({ code: "PROMPT_CAPABILITY_MISMATCH" })`；含 `resource_link` 且 `capabilities.embeddedContext === false` → 同上
- [x] 4.3 在 `AcpSession.start` 内实现 ChatPromptPart → ContentBlock 转换：`text` 直通；`image` 用 `fileURLToPath(part.uri)` + `fs.readFile` 读出 Buffer，base64 编码，输出 `{ type: "image", mimeType: part.mediaType, data: base64 }`；`resource_link` 直通为 `{ type: "resource_link", uri: part.uri, name: part.filename, mimeType: part.mediaType }`。读盘失败抛 `AcpError({ code: "ACP_ERROR", message: "无法读取附件文件" })`
- [x] 4.4 修改 `electron/main/ipc/chat.ts` 的 `chat:stream:message` handler：从 schema 校验后 `prompt` 类型为 `ChatPromptPart[]`，传给 `AcpSession.start(parts)`
- [x] 4.5 修改 `electron/main/services/chat/message-assembler.ts` 与 user message 持久化路径，支持 user `Message.parts` 含 `text` 与 `FileUIPart` 混合；`buildUserMessage` 直接接受 parts 数组（不再从单 string 构造）
- [x] 4.6 修改 `electron/main/ipc/chat.ts` 的 `chat:persistMessage` handler，使用更新后的 `persistMessageInputSchema` 校验

## 5. Preload API

- [x] 5.1 修改 `electron/preload/api/chat.ts` 的 `streamMessage` 签名第四参数从 `prompt: string` 改为 `parts: ChatPromptPart[]`；新增 `saveAttachment(projectId, sessionId, fileName, mimeType, base64Data): Promise<{ uri, name, mimeType }>`，对应 `CHAT_SAVE_ATTACHMENT` channel
- [x] 5.2 修改 `electron/preload/api/acp-agents.ts`，新增 `ensureAgent(agentId): Promise<{ promptCapabilities: AcpPromptCapabilities }>`、`loadCapabilitiesCache(): Promise<Record<string, AcpPromptCapabilities>>`，分别对应 `ACP_ENSURE_AGENT` / `ACP_LOAD_CAPABILITIES_CACHE` channel

## 6. 渲染端 store

- [x] 6.1 在 `frontend/src/stores/acp-agents.ts` 新增 reactive 状态 `promptCapabilitiesByAgent: Ref<Map<string, AcpPromptCapabilities>>`；新增 actions `loadCapabilitiesCache()`、`refreshCapabilities(agentId)`；新增 getter `getPromptCapabilities(agentId): AcpPromptCapabilities`，未命中返回 `{ image: false, audio: false, embeddedContext: false }`
- [x] 6.2 在现有 `agentUnavailable` 事件 listener 中追加 `promptCapabilitiesByAgent.value.delete(agentId)`
- [x] 6.3 在 `frontend/src/App.vue`（或现有应用启动 composable / pinia plugin）启动期 `onMounted` 调 `useAcpAgentsStore().loadCapabilitiesCache()`，与现有 `getRegistry` / `getIcons` 同生命周期
- [x] 6.4 修改 `frontend/src/stores/chat.ts` 的 `sendMessage`：签名从 `sendMessage(text: string)` 改为 `sendMessage(parts: ChatPromptPart[])`；`buildUserMessage` 接受 parts 直接构造 UIMessage（user `parts` 含 text + file 混合）；`buildFallbackSessionTitle` 取 parts 中第一个 text part 的 text 作为 fallback；调 `chat.persistMessage` 与 `chatApi.streamMessage` 时传入 parts

## 7. 渲染端 UI

- [x] 7.1 修改 `frontend/src/utils/chat-prompt-attachment.ts` 的 `ChatPromptAttachment` 模型，增加字段：`uri: string | null`（落盘后的 file:// URI）、`mediaType: string`（原始文件 mimeType）；`createChatPromptAttachment` 仍只构造本地预览态，保留 `uri = null` 直到 `saveAttachment` 完成
- [x] 7.2 在 `frontend/src/components/chat/prompt/ChatPromptPanel.vue` 用户选择文件后（`handleSelectFiles`），对每个文件调 `chat.saveAttachment` 落盘，得到 `uri` 后写入对应 `ChatPromptAttachment.uri`；落盘进行中可禁用发送按钮（参考现有 status，sendDisabled 计算属性增加 attachments 落盘进行中的判断）
- [x] 7.3 在 `ChatPromptPanel.vue` watch `useSessionStore().activeSession?.agentId`，变化时调 `useAcpAgentsStore().refreshCapabilities(agentId)`；从 store getter 取当前 agent 的 `promptCapabilities`，作为响应式 props 传给 `PromptActionMenu`
- [x] 7.4 修改 `frontend/src/components/chat/prompt/PromptActionMenu.vue`：接受 `promptCapabilities: AcpPromptCapabilities` prop；菜单项 disabled 与 tooltip 按 design.md D6 行为；disabled 项不调 `useFileUpload.open`
- [x] 7.5 在 `ChatPromptPanel.vue` 的 `#footer` slot 内、`UChatPromptSubmit` 左侧新增 audio button：`<UButton variant="ghost" color="neutral" size="sm" icon="i-lucide-audio-lines" :disabled="!promptCapabilities.audio" @click="handleAudioClick" />`；`handleAudioClick` 调 `useToast().add({ title: "即将开放", color: "info" })`；禁用态 tooltip `"当前 agent 不支持音频输入"`（用 `UTooltip` 包裹）
- [x] 7.6 修改 `ChatPromptPanel.vue` 的 `handleSubmit`：组装 `ChatPromptPart[]`（先 text part 即使为空字符串，再依次 attachments → 按 mediaType 决定 image / resource_link）；发送前能力 gate（任一 image part 但 `capabilities.image === false`，或任一 resource_link part 但 `capabilities.embeddedContext === false`）→ 弹 toast 阻止发送；通过则调 `chatStore.sendMessage(parts)`；成功后清空 `attachments`、`input`，并对每个 attachment 调 `revokeChatPromptAttachmentPreview`
- [x] 7.7 新建 `frontend/src/utils/chat-message-parts.ts`，导出 `isUserImagePart(part)` / `isUserFilePart(part)`，实现按 chat-interface spec ADDED requirement
- [x] 7.8 在 `frontend/src/components/chat/UIMessageList.vue`（或其内部 user 消息分支组件）的 `message.role === 'user'` 分支增加 `isUserImagePart` / `isUserFilePart` 派发；图片渲染 `<img :src="part.url" />`，外壳样式参考 `frontend/src/components/chat/prompt/AttachmentCard.vue` 图片分支；文件名片样式参考 `AttachmentCard.vue` 文件分支（图标 + filename + 扩展标签）。assistant 分支不引入 file part 渲染

## 8. 测试

- [x] 8.1 `electron/main/infra/storage/agent-capability-store.test.ts`（vitest + happy-dom or node env）：覆盖 loadCache 文件不存在 / 文件损坏 / upsert 多 agent / version 不一致后覆盖
- [x] 8.2 `electron/main/infra/storage/attachment-store.test.ts`：覆盖 saveAttachment 中文/空格文件名、无扩展名时 mimeType subtype 取扩展、超出 25MB 抛错（在 ipc 层校验，store 层只接受 Buffer）；removeSessionAttachments 不存在目录不抛错
- [x] 8.3 `electron/main/services/chat/acp-session.test.ts`：扩展现有用例覆盖 ChatPromptPart → ContentBlock 转换（text / image / resource_link）；capability mismatch 抛 PROMPT_CAPABILITY_MISMATCH；reminder text part 仍位于首位
- [x] 8.4 `frontend/src/utils/chat-message-parts.test.ts`：覆盖 isUserImagePart / isUserFilePart 边界（mediaType 缺失、type 为 text、image/svg+xml 视为图片）
- [x] 8.5 `frontend/src/stores/acp-agents.test.ts`：覆盖 loadCapabilitiesCache、refreshCapabilities、agentUnavailable 清理、getPromptCapabilities 未命中默认值
- [x] 8.6 `frontend/src/components/chat/prompt/ChatPromptPanel.test.ts`：用 mocked store 覆盖 capability gate 阻止发送 + toast、handleSubmit 组装顺序（text 在前、空 text 占位）、audio 按钮 disabled / 启用 click toast
- [x] 8.7 e2e 或集成测试覆盖：含中文路径的 `file://` URI 在 ACP `prompt` 中可被读取（仅本地路径正确性，不依赖外部 agent；可用 mock connection 验证 prompt 数组结构）

## 9. 文档与 guideline

- [x] 9.1 在 `guidelines/IPC.md` 中补 `acp:ensureAgent` / `acp:loadCapabilitiesCache` / `chat:saveAttachment` 三个 channel 的入参/出参/错误码描述（包含 `PROMPT_CAPABILITY_MISMATCH`）
- [x] 9.2 在 `guidelines/DataModel.md` 中补 `<userData>/acp/agent-capabilities.json` schema 与 `<userData>/projects/<encoded>/sessions/<sessionId>/attachments/` 目录结构；说明 user message `parts` 现支持 `text` 与 AI SDK `FileUIPart` 混合
- [x] 9.3 在 `guidelines/RendererProcess.md` 中补 `useAcpAgentsStore.promptCapabilitiesByAgent` 的用法说明，以及 `frontend/src/utils/chat-message-parts.ts` 的 helper 用途
- [x] 9.4 在 `guidelines/reference/acp/ACP-Message-Types.md` 中补 ChatPromptPart 与 ACP ContentBlock 的映射表
- [x] 9.5 评估是否需要新增 `guidelines/Attachments.md` 集中描述附件生命周期，否则把附件部分整合进 `DataModel.md`（以 9.2 为准时跳过本项）
