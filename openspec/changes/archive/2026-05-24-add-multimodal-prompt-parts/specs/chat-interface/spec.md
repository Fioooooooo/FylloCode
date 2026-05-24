## ADDED Requirements

### Requirement: ChatPromptPanel 按 promptCapabilities 启用附件入口

系统 SHALL 在 `frontend/src/components/chat/prompt/ChatPromptPanel.vue` 中 watch 当前 `agentId`（来自 `useSessionStore`），变化时触发 `acp:ensureAgent(agentId)`；返回的 `promptCapabilities` 写入 `useAcpAgentsStore.promptCapabilitiesByAgent`。

`PromptActionMenu` 的菜单项 SHALL 按 capability 控制 disabled：

- "上传图片" 项：`disabled = !promptCapabilities.image`，禁用时不展开 `useFileUpload` 图片选择器
- "上传文件" 项：`disabled = !promptCapabilities.embeddedContext`，禁用时不展开通用文件选择器
- 禁用项 SHALL 显示 tooltip：分别为 `"当前 agent 不支持图片输入"` 与 `"当前 agent 不支持文件输入"`

无 capability 信息时（agent 未连接过、未命中磁盘缓存）三个能力均按 `false` 处理，所有附件入口禁用。

#### Scenario: 切换到支持图片的 agent 后启用图片入口

- **WHEN** 用户在 `ChatPromptPanel` 切换 agent，触发 `acp:ensureAgent` 返回 `{ image: true, audio: false, embeddedContext: true }`
- **THEN** `PromptActionMenu` 的 "上传图片" / "上传文件" 项均启用
- **AND** 用户点击可正常打开 `useFileUpload` 选择器

#### Scenario: 切换到 capability 未知的 agent 后禁用入口

- **WHEN** 用户切到一个 magic 未连接过、磁盘缓存未命中的 agent
- **THEN** `PromptActionMenu` 的图片项与文件项均 disabled
- **AND** 鼠标悬停显示对应 tooltip
- **AND** `acp:ensureAgent` 异步完成后入口随之启用

### Requirement: ChatPromptPanel 集成 audio 占位按钮

系统 SHALL 在 `frontend/src/components/chat/prompt/ChatPromptPanel.vue` 的 `#footer slot` 内、`UChatPromptSubmit` 左侧渲染一个 audio icon button：

- 组件：`<UButton variant="ghost" color="neutral" size="sm" icon="i-lucide-audio-lines" />`
- `disabled` 由 `promptCapabilities.audio === true` 决定（`true` 启用、其他禁用）
- 启用态 click handler：`useToast().add({ title: "即将开放", color: "info" })`，不修改任何 store、不发送
- 禁用态 tooltip：`"当前 agent 不支持音频输入"`
- 即使在 agent capability 未知（`promptCapabilities.audio` 缺省视为 `false`）时也保持禁用渲染（按钮可见）

#### Scenario: agent 不支持 audio 时按钮禁用

- **WHEN** 当前 agent 的 `promptCapabilities.audio` 为 `false` 或未知
- **THEN** audio 按钮渲染但 disabled
- **AND** 悬停显示 `"当前 agent 不支持音频输入"`

#### Scenario: agent 支持 audio 时按钮启用，点击触发 toast

- **WHEN** 当前 agent 的 `promptCapabilities.audio === true`
- **AND** 用户点击 audio 按钮
- **THEN** 调用 `useToast().add({ title: "即将开放", color: "info" })`
- **AND** 不调用 `chatStore.sendMessage`、不修改 input、不修改 attachments

### Requirement: handleSubmit 组装 ChatPromptPart 数组

`ChatPromptPanel` 的 `handleSubmit` SHALL 把 `input.value` 与 `attachments` 组装为 `ChatPromptPart[]`，调 `chatStore.sendMessage(parts)`：

1. 始终先 push 一个 `text` part（text 字段为 `input.value`，即使为空字符串）
2. 按 `attachments` 数组顺序依次 push 附件 part
3. 附件 part 类型由文件 mimeType 决定：`mediaType.startsWith("image/")` → `{ type: "image", mediaType, uri, filename }`；否则 → `{ type: "resource_link", mediaType, uri, filename }`
4. 附件 `uri` 由 `chat:saveAttachment` 落盘后返回的 `file://` URI 取得；UI 在用户选择文件时立即调用 `saveAttachment` 并把 `uri` / `filename` / `mediaType` 缓存到 `attachments` 元素上

发送前 SHALL 做能力 gating：

- 含 image part 时 `promptCapabilities.image` 必须为 `true`
- 含 resource_link part 时 `promptCapabilities.embeddedContext` 必须为 `true`
- 不满足时 SHALL 阻止发送，调用 `useToast().add({ title: "当前 agent 不支持 X 附件，请移除后再发送", color: "warning" })`，不修改 attachments、不清空 input

`useChatPrompt.handleSubmit` 接受 `parts: ChatPromptPart[]` 而非 string；submit 成功后清空 `input` 与 `attachments`，并调用 `revokeChatPromptAttachmentPreview`。

#### Scenario: 发送只含文本的消息

- **WHEN** 用户输入 "hello" 没有附件，点击发送
- **THEN** `chatStore.sendMessage([{ type: "text", text: "hello" }])` 被调用

#### Scenario: 发送文本+图片+文件混合消息

- **WHEN** 用户输入 "请看图" 并附加 1 张图片 1 个 PDF
- **AND** 当前 agent 支持 image 与 embeddedContext
- **THEN** parts 顺序为 `[{ type: "text", text: "请看图" }, { type: "image", ... }, { type: "resource_link", ... }]`
- **AND** 发送成功后 `attachments` 清空，所有 `previewUrl` 被 `URL.revokeObjectURL` 释放

#### Scenario: 文本为空但有附件时仍发送 empty text part

- **WHEN** `input.value` 为空字符串，attachments 含一张图片
- **THEN** parts 形如 `[{ type: "text", text: "" }, { type: "image", ... }]`
- **AND** 至少包含一个 part，IPC schema 校验通过

#### Scenario: 切换 agent 后已选附件不被支持时阻止发送

- **WHEN** 用户在支持 image 的 agent 下选了一张图片
- **AND** 切换到 `promptCapabilities.image === false` 的 agent
- **AND** 点击发送
- **THEN** `chatStore.sendMessage` 不被调用
- **AND** 弹出 toast `"当前 agent 不支持图片附件，请移除后再发送"`
- **AND** input 与 attachments 不变

### Requirement: 附件用户消息渲染图片缩略图与文件名片

系统 SHALL 在 `frontend/src/utils/chat-message-parts.ts` 暴露：

```ts
isUserImagePart(part: UIMessage["parts"][number]): boolean
isUserFilePart(part: UIMessage["parts"][number]): boolean
```

判定规则：

- `isUserImagePart`：`part.type === "file" && typeof part.mediaType === "string" && part.mediaType.startsWith("image/")`
- `isUserFilePart`：`part.type === "file" && typeof part.mediaType === "string" && !part.mediaType.startsWith("image/")`

`UIMessageList` 在 `message.role === 'user'` 分支 SHALL 通过这两个 helper 派发：

- `isUserImagePart(part)` → 渲染缩略图卡片（用 `part.url` 作 `<img :src>`，沿用 `AttachmentCard.vue` 风格的图片预览样式）
- `isUserFilePart(part)` → 渲染文件名片（图标 + 文件名 `part.filename` + 扩展标签，沿用 `AttachmentCard.vue` 文件分支样式）
- `isTextUIPart(part)` 与 `isSystemReminderPart(part)` 分支保持现状

assistant 分支 SHALL NOT 调这两个 helper（assistant 当前不渲染 file part）。

#### Scenario: user 消息含图片 part 渲染缩略图

- **WHEN** 历史 session 加载后，某条 user 消息 `parts` 含 `{ type: "file", mediaType: "image/png", url: "file:///abs/x.png", filename: "x.png" }`
- **THEN** `UIMessageList` 渲染该 part 为图片缩略图，`<img>` 的 `src` 为 `file:///abs/x.png`

#### Scenario: user 消息含文件 part 渲染名片

- **WHEN** user 消息 `parts` 含 `{ type: "file", mediaType: "application/pdf", url: "file:///abs/doc.pdf", filename: "doc.pdf" }`
- **THEN** 渲染包含文件图标、文件名 "doc.pdf"、扩展标签 "PDF" 的卡片
- **AND** 不展开 PDF 内容预览

### Requirement: useAcpAgentsStore 维护 promptCapabilitiesByAgent

`frontend/src/stores/acp-agents.ts` 的 `useAcpAgentsStore` SHALL 暴露：

- 状态：`promptCapabilitiesByAgent: Map<string, AcpPromptCapabilities>`（响应式）
- 启动期 action：`loadCapabilitiesCache()`，调 `acp:loadCapabilitiesCache` IPC，把结果写入 `promptCapabilitiesByAgent`
- action：`refreshCapabilities(agentId)`，调 `acp:ensureAgent(agentId)` 并把结果写入 `promptCapabilitiesByAgent`
- getter：`getPromptCapabilities(agentId): AcpPromptCapabilities`，未命中时返回 `{ image: false, audio: false, embeddedContext: false }`

agent 进程崩溃时（`agentUnavailable` 事件）SHALL 从 `promptCapabilitiesByAgent` 删除对应条目。

#### Scenario: 启动期加载磁盘缓存

- **WHEN** 渲染端 `App.vue` 初始化阶段调 `loadCapabilitiesCache()`
- **THEN** `promptCapabilitiesByAgent` 写入磁盘缓存中所有 agent 的 capability

#### Scenario: 切换 agent 触发 refreshCapabilities

- **WHEN** `ChatPromptPanel` watch agentId 变化
- **THEN** `refreshCapabilities(agentId)` 被调用
- **AND** IPC 返回值写入 `promptCapabilitiesByAgent.<agentId>`

#### Scenario: agentUnavailable 清理内存态

- **WHEN** `useAcpAgentsStore` 监听到 `agentUnavailable` 事件 with `{ agentId }`
- **THEN** `promptCapabilitiesByAgent.delete(agentId)` 被调用

## MODIFIED Requirements

### Requirement: Chat 主区域与 Proposal SidePanel 共享 UIMessage 列表组件

系统 SHALL 将 `UIMessageList` 组件通过 `type: "chat" | "side"` prop 标识使用场景，并新增可选 `agentId?: string` prop 用于在 `type="chat"` 时解析 assistant 头像。`ChatContainer.vue` 与 `ProposalApplySidePanel.vue` 的消息列表部分 SHALL 都通过该组件渲染，不再各自编写 `v-for message / v-for part` 的渲染逻辑。

共享组件的必要 props：

- `messages: UIMessage<MessageMeta>[]`
- `status: ChatStatus`
- `type: "chat" | "side"`
- `agentId?: string`（可选，仅在 `type="chat"` 时用于解析 assistant 头像）

组件内部 SHALL 使用 `ai` 包的 `isReasoningUIPart` / `isTextUIPart` / `isToolUIPart` 派发到对应子组件：`UChatMessages` 承载消息容器、`UChatTool` 承载工具调用；assistant text part 与 reasoning part 中的 markdown 文本 SHALL 统一交由项目内统一的 markdown 渲染组件渲染（输入语义为 `content: string` 与 `isStreaming: boolean`），保持与当前 chat 主区域一致的渲染通路。该 markdown 渲染组件的具体实现细节由代码层决定，spec 不绑定具体组件名或第三方库。

`message.role === 'user'` 分支 SHALL 在 text part 之外，通过 `isUserImagePart(part)` 与 `isUserFilePart(part)`（`frontend/src/utils/chat-message-parts.ts` 提供）派发：

- `isUserImagePart(part)` 命中 → 渲染图片缩略图卡片（`<img :src="part.url">`，沿用 `AttachmentCard.vue` 图片分支样式）
- `isUserFilePart(part)` 命中 → 渲染文件名片（图标 + `part.filename` + 扩展标签，沿用 `AttachmentCard.vue` 文件分支样式）
- `isTextUIPart(part)` 命中 → 走现有 text 渲染（含 system-reminder 跳过逻辑）

当 `type="chat"` 且 `agentId` 提供时，assistant 头像 SHALL 显示该 agent 对应的 ACP agent icon（来自 `useAcpAgentsStore.icons`）。若 `agentId` 未提供或对应 icon 不存在，则不显示头像（保持与 `type="side"` 一致的行为）。

渲染端 SHALL 使用 `UIMessage.id` 作为 `v-for :key`；该 id 在流式活跃期间为渲染进程生成的临时 id，在 resume 后为磁盘加载的 id，系统 SHALL NOT 做跨进程 id 匹配。

在 `message.role === 'user'` 的 text part 渲染分支中，系统 SHALL 通过 `isSystemReminderPart(part)` 工具函数识别 system-reminder 内容并**跳过渲染**。识别规则：`part.type === "text"` 且 `part.text` 经过 trim 后以 `<system-reminder>` 开头、以 `</system-reminder>` 结尾。该工具函数位于 `frontend/src/utils/system-reminder.ts`，`UIMessageList.vue` 直接调用。类型 `system-reminder` 的 part 仅在磁盘与 `UIMessage.parts` 数据中保留，UI 不展示。

#### Scenario: Chat 主区域使用共享组件渲染消息列表并显示 agent 头像

- **WHEN** 用户打开 chat 页面
- **THEN** `ChatContainer.vue` 通过 `<UIMessageList :messages :status type="chat" :agentId />` 渲染 `activeSession.messages`
- **AND** assistant 消息的头像显示当前 session 对应 ACP agent 的 icon
- **AND** 渲染结果与当前 chat 消息表现一致（text / tool / reasoning 分派保持现状）

#### Scenario: Proposal SidePanel 使用共享组件保持现有行为

- **WHEN** 用户打开 proposal 详情页，SidePanel 展开
- **THEN** `ProposalApplySidePanel.vue` 通过 `<UIMessageList :messages :status type="side" />` 渲染 `messages`
- **AND** SidePanel 外壳保持现状
- **AND** 消息列表渲染通路与 chat 一致

#### Scenario: user 消息含图片 part

- **WHEN** user 消息的 `parts` 含 `{ type: "file", mediaType: "image/png", url, filename }`
- **THEN** `UIMessageList` 渲染图片缩略图卡片
- **AND** assistant 消息不渲染任何 file part

#### Scenario: user 消息含文件 part

- **WHEN** user 消息的 `parts` 含 `{ type: "file", mediaType: "application/pdf", url, filename }`
- **THEN** `UIMessageList` 渲染文件名片，包含 PDF 图标、文件名、扩展标签

#### Scenario: user 消息中的 system-reminder part 不在 UI 展示

- **WHEN** user 消息的 `parts` 首位为 system-reminder text part（`part.text` 经 trim 后以 `<system-reminder>` 开头并以 `</system-reminder>` 结尾）
- **THEN** `UIMessageList.vue` 的 `message.role === 'user'` 分支跳过该 part 的渲染
- **AND** 同条 user 消息的其余 part 正常渲染
- **AND** 数据层 `message.parts` 不做修改

#### Scenario: user 消息仅含 system-reminder 时不输出可见文本

- **WHEN** user 消息的 `parts` 全部为 system-reminder text part
- **THEN** 该消息气泡不渲染任何 text 内容
- **AND** 不抛错、不影响其他消息渲染
