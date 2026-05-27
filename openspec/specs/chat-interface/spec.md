# chat-interface 规范

## Purpose

Chat 界面定义了消息流的渲染方式、流式事件组装边界、侧边栏展示行为，以及 Chat 主区域与相关组件的复用约束。

## Requirements

### Requirement: Chat 区域显示可滚动的消息流

系统 SHALL 在中央主区域渲染垂直滚动的消息序列，消息数据类型为 `UIMessage<MessageMeta>`，每条消息通过 `parts` 数组描述内容。

#### Scenario: 消息流渲染

- **WHEN** session 处于活跃状态
- **THEN** Chat 区域按时间顺序显示所有消息，可从上到下滚动
- **AND** 消息类型为 `UIMessage<MessageMeta>`，包含 `metadata.sessionId` 和 `metadata.createdAt`

### Requirement: ChatAgentSelect 在 agent 锁定时隐藏

系统 SHALL 在 `ChatContainer.vue` 的 `UChatPrompt` footer slot 中，当 session 已有消息（agent 锁定）时，完全隐藏 `ChatAgentSelect` 组件，不渲染禁用态。

#### Scenario: 新 session 或草稿态显示 Agent 选择器

- **WHEN** 用户处于草稿态（无活跃 session）或活跃 session 尚无消息
- **THEN** `ChatAgentSelect` 正常显示，用户可选择 agent

#### Scenario: session 有消息后隐藏 Agent 选择器

- **WHEN** 活跃 session 的消息数量大于 0（agent 已锁定）
- **THEN** `ChatAgentSelect` 不渲染（`v-if="!isAgentLocked"`）
- **AND** 不显示禁用态的选择器

### Requirement: UChatPromptSubmit 支持停止流式回复

系统 SHALL 在 `chatStatus` 为 `streaming` 或 `submitted` 时，响应 `UChatPromptSubmit` 的 `stop` 事件，并调用 cancel 函数终止当前流式请求。

当 stop 作用于当前活跃提交时，前端 SHALL 同步完成 UI 收口：使当前提交失效、清空当前 cancel 控制、清空当前流式瞬时错误，并将 `chatStatus` 设为 `ready`。这个状态回退 SHALL NOT 依赖后续 `onDone` 或 `onError` 回调。

系统 SHALL 忽略已失效提交的迟到 `onChunk`、`onDone`、`onError` 回调，避免 cancelled run 重新把 `chatStatus` 改回 `streaming`、`ready` 或 `error`，也避免 cancelled run 继续组装 assistant 消息。

系统 SHALL 支持新会话首条消息的 setup 期停止：当首条消息已经进入 `submitted`，但 ACP agent 还没有完成连接、session 创建/恢复，或者还没有返回任何 chunk/done/error 时，用户点击 stop 后输入框状态 SHALL 回到 `ready`，且该 setup 期请求 SHALL 被取消或失效。

同时，系统 SHALL 将 chat 页面当前流式错误作为 chatStore 的瞬时状态维护，并在聊天主区域可见渲染；这个错误状态 SHALL NOT 写入 `Session` 的持久模型，且 SHALL 通过统一 reset action 在切换会话、开始新一轮发送、用户停止当前提交或完成清理时复位。

本 requirement 不要求回滚已经排入内存或已经持久化的 user message，也不要求重放未送达 ACP 的历史消息。

#### Scenario: 用户点击 stop 按钮

- **WHEN** `chatStatus` 为 `streaming` 或 `submitted`
- **AND** 用户点击 `UChatPromptSubmit` 的 stop 按钮
- **THEN** 前端调用 cancel 函数，通过 `ChatStreamChannels.streamCancel` IPC 通道通知主进程取消
- **AND** 前端立即使当前提交失效
- **AND** `chatStatus` 立即回到 `ready`
- **AND** 当前流式瞬时错误被清空

#### Scenario: 新会话首条消息在 ACP setup 期停止

- **WHEN** 新会话首条消息发送后 `chatStatus` 为 `submitted`
- **AND** ACP agent 尚未完成连接、session 创建/恢复，或尚未返回任何 chunk/done/error
- **AND** 用户点击 stop 按钮
- **THEN** 前端使该提交失效并将 `chatStatus` 设置为 `ready`
- **AND** 后续来自该提交的迟到回调不再改变 `chatStatus`
- **AND** 后续来自该提交的迟到回调不再追加 assistant 消息

#### Scenario: 停止已失效提交后迟到错误被忽略

- **WHEN** 用户停止当前提交，`chatStatus` 已回到 `ready`
- **AND** 被停止的提交随后触发 `onError`
- **THEN** 前端不将 `chatStatus` 改为 `error`
- **AND** 前端不展示该迟到错误作为当前流式错误

#### Scenario: 无活跃流时 stop 无效

- **WHEN** `chatStatus` 为 `ready` 或 `error`
- **THEN** stop 事件不触发 cancel 调用

### Requirement: Chat 侧边栏仅显示 Sessions 标签

系统 SHALL 在 Chat 侧边栏直接渲染 SessionList，不提供标签切换器。

#### Scenario: 侧边栏默认显示 SessionList

- **WHEN** 用户打开 Chat 页面
- **THEN** 侧边栏直接显示 SessionList，无标签切换器

### Requirement: Chat 主区域与 Proposal SidePanel 共享 UIMessage 列表组件

系统 SHALL 将 `UIMessageList` 组件通过 `type: "chat" | "side"` prop 标识使用场景，并新增可选 `agentId?: string` prop 用于在 `type="chat"` 时解析 assistant 头像。`ChatContainer.vue` 与 `ProposalApplySidePanel.vue` 的消息列表部分 SHALL 都通过该组件渲染，不再各自编写 `v-for message / v-for part` 的渲染逻辑。

共享组件的必要 props：

- `messages: UIMessage<MessageMeta>[]`
- `status: ChatStatus`
- `type: "chat" | "side"`
- `agentId?: string`（可选，仅在 `type="chat"` 时用于解析 assistant 头像）

组件内部 SHALL 使用 `ai` 包的 `isReasoningUIPart` / `isTextUIPart` / `isToolUIPart` 派发到对应子组件：`UChatMessages` 承载消息容器、`UChatTool` 承载工具调用；assistant text part 与 reasoning part 中的 markdown 文本 SHALL 统一交由项目内统一的 markdown 渲染组件渲染（输入语义为 `content: string` 与 `isStreaming: boolean`），保持与当前 chat 主区域一致的渲染通路。该 markdown 渲染组件的具体实现细节由代码层决定，spec 不绑定具体组件名或第三方库。

`message.role === 'user'` 分支 SHALL 在 text part 之外，通过 `isUserImagePart(part)` 与 `isUserFilePart(part)`（`frontend/src/utils/chat-message-parts.ts` 提供）派发：

- `isUserImagePart(part)` 命中 → 渲染图片缩略图卡片（`<img>` 的 `src` SHALL 从 `part.url` 解析；当 `part.url` 为 `file://` URI 时，组件 SHALL 通过 `chatApi.readAttachmentDataUrl(part.url, part.mediaType)` 获取 data URL，并使用返回的 `dataUrl` 作为 `src`；沿用 `AttachmentCard.vue` 图片分支样式）
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

- **WHEN** user 消息的 `parts` 含 `{ type: "file", mediaType: "image/png", url: "file:///tmp/截图 1.png", filename }`
- **THEN** `UIMessageList` 渲染图片缩略图卡片
- **AND** `<img>` 的 `src` 是 `chatApi.readAttachmentDataUrl` 返回的 data URL，而不是未处理的 `file:///tmp/截图 1.png`
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

### Requirement: 渲染进程 UIMessage 组装逻辑抽为共享 composable

系统 SHALL 在 `frontend/src/composables/useUIMessageAssembler.ts` 提供共享 composable，封装流式 chunk 到 `UIMessage<MessageMeta>[]` 的组装逻辑。`chat` store 与 `proposal-run` store SHALL 使用同一实现，`frontend/src/stores/chat.ts#streamSessionMessage` 与 `frontend/src/stores/proposal-run.ts#applyChunk` 中的重复组装代码 SHALL 被移除。

composable 对外暴露至少以下能力：

- 接受或创建一个 `Ref<UIMessage<MessageMeta>[]>` 作为消息容器
- `applyChunk(chunk: MessageChunkData)` 按 chunk kind 分派：
  - `text_delta` / `tool_call_start` / `tool_call_update`：按现有 `MessageAssembler` 组装规则更新容器中的 assistant message
  - `user_message`：将 chunk 自带的 `UIMessage` 原样 push 到容器，并清空 `activeAssistantId`
  - 其他 kind（如 `usage_update`、`session_info_update`、`status`）：不影响消息容器，由调用方按需处理
- `resetActive()`：清空 `activeAssistantId` / `activeTextPartIdx`（在 `done`、`error`、切换 stage 时调用）

#### Scenario: chat store 使用共享 composable

- **WHEN** `stores/chat.ts#streamSessionMessage` 启动
- **THEN** 使用 `useUIMessageAssembler` 处理 chunk
- **AND** store 内部不再包含 `ensureAssistantMessage` / chunk 分派实现

#### Scenario: proposal-run store 使用共享 composable

- **WHEN** `stores/proposal-run.ts#streamCurrentStage` 或 `startArchive` 启动
- **THEN** 使用 `useUIMessageAssembler` 处理 chunk
- **AND** store 内部不再包含 `ensureAssistantMessage` / chunk 分派实现

### Requirement: Session 内存态保存 agent 可用命令列表

系统 SHALL 在 `shared/types/chat.ts` 的 `Session` 接口上保留可选字段 `availableCommands?: AcpAvailableCommand[]`，用于存储 agent 通过 ACP `available_commands_update` 推送的 slash 命令列表，并支持从 session meta 持久化记录恢复。

该字段 SHALL 满足：

- 对 renderer 仍表现为单个 `Session` 对象上的会话级字段：不同 session 各自独立；session 切换时随 `activeSession` 自然切换，无需手工清空。
- 主进程 SHALL 从 session meta 的可选字段 `available_commands` 映射为 `Session.availableCommands` 返回给 renderer。
- session meta 缺失 `available_commands` 时，`Session.availableCommands` SHALL 为 `undefined`。
- `available_commands: []` SHALL 映射为 `availableCommands: []`，不得被折叠为 `undefined`。
- `undefined` 表示"agent 尚未推送"，`[]` 表示"agent 已推送但无可用命令"，`[...]` 表示"有可用命令"。

`AcpAvailableCommand` 类型定义如下（与 ACP 协议 `AvailableCommand` 对齐的前端本地类型）：

```typescript
interface AcpAvailableCommand {
  name: string;
  description: string;
  hint?: string;
}
```

#### Scenario: 磁盘加载的 session 恢复 availableCommands

- **WHEN** session meta 文件包含 `available_commands: [{ name: "review", description: "Review code" }]`
- **THEN** 主进程返回给 renderer 的 `Session.availableCommands` 为 `[{ name: "review", description: "Review code" }]`
- **AND** `useSessionStore.loadSessions` 构建出的 session 保留该字段

#### Scenario: 历史 session 缺失 available_commands 时兜底为 undefined

- **WHEN** session meta 文件不包含 `available_commands`
- **THEN** 主进程返回给 renderer 的 `Session.availableCommands` 为 `undefined`
- **AND** slash 按钮按现有空态规则隐藏

#### Scenario: 空数组语义被保留

- **WHEN** session meta 文件包含 `available_commands: []`
- **THEN** 主进程返回给 renderer 的 `Session.availableCommands` 为 `[]`
- **AND** renderer 不将其归一为 `undefined`

#### Scenario: 切换 session 时数据各自独立并支持回显

- **WHEN** 用户先在 session A 收到并持久化 commands（`availableCommands = [...]`），然后切换到 session B
- **THEN** `activeSession` 切换为 session B，`activeSession.availableCommands` 为 session B 自身字段（通常为 `undefined`、`[]` 或 session B 已持久化的命令集）
- **AND** 再次切回 session A 时，`activeSession.availableCommands` 恢复为 session A 原值
- **AND** slash 按钮和菜单按当前 session 的 `availableCommands` 回显

### Requirement: Session store 提供 setSessionAvailableCommands action

系统 SHALL 在 `frontend/src/stores/session.ts` 的 `useSessionStore` 上提供 action `setSessionAvailableCommands(sessionId: string, commands: AcpAvailableCommand[]): void`，用于在收到 ACP `available_commands_update` chunk 后更新对应 session 的会话级字段。

具体行为：

- 在 `sessions` 数组中查找 `session.id === sessionId` 的条目；
- 若找到，将该 session 的 `availableCommands` 字段覆盖为传入的 `commands`（接受空数组）；
- 若未找到（例如 session 已被删除、或 sessionId 对应 draft 态不在 sessions 数组中），静默 no-op，不抛错；
- 该 action 不修改 `activeSessionId`、不触发排序、不调用任何 IPC。

该 action SHALL 被 `frontend/src/stores/chat.ts` 的 `streamSessionMessage.onChunk` 在收到 `available_commands_update` chunk 时调用。命令持久化由 main 进程负责，renderer 不额外发起持久化 IPC。

#### Scenario: 更新存在的 session

- **WHEN** renderer 收到 `{ kind: "available_commands_update", commands: [{ name: "review", description: "..." }] }` chunk，`activeSession.id` 为 "s-1"，`sessions` 中存在 id 为 "s-1" 的条目
- **THEN** chat store 调用 `sessionStore.setSessionAvailableCommands("s-1", [{ name: "review", description: "..." }])`
- **AND** 该 session 的 `availableCommands` 字段更新为传入数组
- **AND** 其他 session 的 `availableCommands` 不变

#### Scenario: 更新不存在的 session 静默忽略

- **WHEN** 调用 `setSessionAvailableCommands("not-exist", [...])`，`sessions` 中不存在该 id
- **THEN** action 不抛出异常，不修改任何状态

#### Scenario: 空数组覆盖

- **WHEN** 调用 `setSessionAvailableCommands(sessionId, [])`
- **THEN** 对应 session 的 `availableCommands` 被覆盖为 `[]`
- **AND** 不会被当作 `undefined` 处理

### Requirement: Chat store 将 available_commands_update chunk 分派到 session store

系统 SHALL 在 `frontend/src/stores/chat.ts` 的 `streamSessionMessage` 的 `onChunk` 回调中，新增对 `kind === "available_commands_update"` 的分支：

- 不经过 `useUIMessageAssembler`（不调用 `assembler.applyChunk`）；
- 不修改 `activeSession.messages` / `turnCount` / `tokenUsage` / `title` 等任何消息相关字段；
- 调用 `useSessionStore().setSessionAvailableCommands(activeSession.id, data.commands)`。

chat store SHALL NOT 自身维护 commands 状态（职责严格限定在"一次消息往返"）。

#### Scenario: 收到 available_commands_update 时分派

- **WHEN** chat store 的 `streamSessionMessage` onChunk 收到 `{ kind: "available_commands_update", commands }`
- **THEN** chat store 调用 `sessionStore.setSessionAvailableCommands(activeSession.id, commands)`
- **AND** 不调用 `assembler.applyChunk`
- **AND** 不修改 `activeSession.messages`

### Requirement: useUIMessageAssembler 支持 reasoning 轨道

系统 SHALL 在 `frontend/src/composables/useUIMessageAssembler.ts` 中扩展 `applyChunk` 逻辑，使其支持 `reasoning_delta` chunk，并对 `available_commands_update` 显式 no-op。

具体规则：

- 新增内部 let 变量 `activeReasoningPartIdx: number`，与 `activeTextPartIdx` 对等维护；`resetActive()` / `setMessages()` 同时重置两者为 -1。
- `applyChunk({ kind: "reasoning_delta", text })` 分支：
  1. 调用 `ensureAssistantMessage()` 获取当前 assistant message；
  2. 若 `activeReasoningPartIdx >= 0` 且该索引处的 part 类型为 `"reasoning"`，将 `text` 追加到该 part 的 `.text`；
  3. 否则 `message.parts.push({ type: "reasoning", text })`，`activeReasoningPartIdx = message.parts.length - 1`；
  4. 重置 `activeTextPartIdx = -1`。
- `applyChunk({ kind: "text_delta", ... })` 既有逻辑在新建 / append text part 的两种路径结束前 SHALL 重置 `activeReasoningPartIdx = -1`。
- `applyChunk({ kind: "tool_call_start", ... })` 既有逻辑 SHALL 在 push dynamic-tool part 后同时重置 `activeTextPartIdx = -1` 与 `activeReasoningPartIdx = -1`。
- `applyChunk({ kind: "available_commands_update", ... })` 分支 SHALL 直接 return，不触碰消息容器、不创建 assistant message、不影响两个 active idx。
- `applyChunk` 对 `usage_update` / `session_info_update` / `status` 保持现有 no-op 行为。

#### Scenario: 纯 reasoning 流

- **WHEN** `applyChunk` 依次收到 `{ kind: "reasoning_delta", text: "a" }`、`{ kind: "reasoning_delta", text: "b" }`
- **THEN** `messages.value` 新增一条 assistant `UIMessage`
- **AND** 该消息的 `parts` 为 `[{ type: "reasoning", text: "ab" }]`

#### Scenario: reasoning → text 切换重置 activeReasoningPartIdx

- **WHEN** `applyChunk` 依次收到 `reasoning_delta("r1")`、`text_delta("t1")`、`reasoning_delta("r2")`
- **THEN** 唯一 assistant message 的 `parts` 为 `[reasoning("r1"), text("t1"), reasoning("r2")]`
- **AND** "r2" 进入新的 reasoning part（不与 "r1" 合并）

#### Scenario: available_commands_update 不触碰消息容器

- **WHEN** 当前 `messages.value.length === 0`，`applyChunk` 收到 `{ kind: "available_commands_update", commands: [...] }`
- **THEN** `messages.value.length` 仍为 0
- **AND** 不创建任何 assistant message
- **AND** `activeAssistantId` / `activeTextPartIdx` / `activeReasoningPartIdx` 保持不变

### Requirement: ChatContainer 集成 slash 命令菜单

系统 SHALL 在 `frontend/src/components/chat/ChatContainer.vue` 的 `UChatPrompt` 组件内集成 slash 命令菜单，并在 footer 左侧渲染一个 slash 触发按钮，用于发现与使用当前 agent 声明的可用命令。

具体要求：

- **按钮可见性**：在 `UChatPrompt` 的 footer 左侧（与 `ContextUsageRing` 同区域，位于 `ContextUsageRing` 右侧、`ChatAgentSelect` 左侧）渲染一个 slash 按钮，图标为 `i-lucide-slash-square`，`v-if="(activeSession?.availableCommands?.length ?? 0) > 0"`。`availableCommands` 为 `undefined` 或空数组时按钮不渲染。

- **按钮组件**：统一使用 `UButton variant="ghost" size="sm"` 包裹 `UIcon name="i-lucide-slash-square"`；不使用 `USlot` / `UChip` 等其他组件。

- **菜单组件**：点击按钮打开命令菜单。首选 `@nuxt/ui` 的 `UCommandPalette`（支持搜索、键盘导航、回车选中、ESC 关闭）；若其与 `UChatPrompt` 内嵌布局冲突（例如定位溢出或焦点陷阱失效），降级为 `UPopover` + `UListbox` + `UInput` 的组合，保持键盘导航 / 回车选中 / ESC 关闭 / 鼠标点击选中四项能力。菜单项展示两行：
  - 主文本：`/<command.name>`
  - 副文本：`<command.description>`

- **菜单交互**：SHALL 支持键盘上下方向键导航、回车选中、ESC 关闭；支持鼠标点击选中。菜单打开时焦点落在菜单搜索输入或首个选项；菜单关闭后焦点回到输入框当前位置。

- **`/` 键触发条件**：当用户在输入框按下 `/` 键、输入框聚焦、且光标处于"行首"（定义见下）、且 `activeSession?.availableCommands?.length > 0` 时，菜单 SHALL 在下一个 tick 打开。

  **"行首"定义**：设 `text = textarea.value`、`cursor = textarea.selectionStart`，令 `prefix = text.slice(0, cursor)`；若 `prefix` 不包含 `\n`，则其中仅有空白字符（空格或 tab）或为空串时视为行首；若 `prefix` 包含 `\n`，则取最后一个 `\n` 之后到 cursor 之间的子串，该子串仅有空白字符或为空串时视为行首。此定义支持多行输入的第二行起继续唤起菜单。

- **`/` 键不阻止默认**：keydown handler SHALL NOT 调用 `event.preventDefault()`。浏览器会把 `/` 写入 textarea，菜单在 input/keyup 后打开；当用户随后选中命令时，组件负责替换该 `/`（见插入规则）。当用户按 ESC 或点外侧关闭菜单且未选择命令时，已写入的 `/` 保留在输入框中（由用户决定是否删除）。

- **插入规则**：选中命令后：
  - 若菜单由 `/` 键触发（由组件内部状态标记），组件需找到当前光标位置向左的第一个 `/` 字符（保证它就是触发菜单那一个），将其替换为 `/<name> `（末尾含一个 ASCII 空格）。若因用户在菜单打开后继续输入删除了该 `/`，则降级为"在当前光标位置插入 `/<name> `"。
  - 若菜单由按钮点击触发，直接在当前光标位置插入 `/<name> `；若光标位置左侧最末非空白字符恰为非空格（例如 `hello`），插入前 SHALL 自动补一个空格，即实际插入 `/<name>`；否则直接插入 `/<name> `。
  - 插入完成后光标置于新末尾，焦点回到输入框，菜单关闭。

- **Hint placeholder 行为**：选中命令后若 `command.hint` 为非空字符串，组件 SHALL：
  1. 记录基准值 `baseline = textarea.value`（即命令插入完成后的值）；
  2. 将 `UChatPrompt` 的 `placeholder` prop 临时覆盖为 `command.hint`；
  3. 监听 textarea 的 `input` 事件：当 `textarea.value !== baseline` 时恢复默认 `placeholder`，取消监听；
  4. 监听 textarea 的 `blur` 事件：一旦触发恢复默认 `placeholder`，取消监听；
  5. 若再次选中另一个带 hint 的命令，新 hint 覆盖旧 hint，基准值更新。
     若 `command.hint` 为 `undefined` 或空串，不修改 placeholder，也不监听 input / blur。

- **菜单关闭状态管理**：菜单关闭不清空输入框当前内容；菜单重开时重置搜索词为空、焦点回到第一项。

- **空态隐藏**：当 `activeSession` 为 `null`、`availableCommands` 为 `undefined` 或为 `[]` 时，按钮不渲染；`/` 键 keydown handler SHALL 读取最新 `availableCommands?.length`，发现不满足条件时直接返回（不打开菜单），让 `/` 按普通字符输入；不需要 preventDefault。

#### Scenario: agent 推送命令后按钮出现

- **WHEN** 用户处于某 session，`activeSession.availableCommands` 从 `undefined` 变为 `[{ name: "review", ... }]`
- **THEN** `UChatPrompt` footer 左侧出现 slash 触发按钮
- **AND** 按钮点击可打开菜单，展示 "/review" 与其 description

#### Scenario: 按 `/` 键在空输入框触发菜单

- **WHEN** 输入框聚焦、内容为空、`activeSession.availableCommands.length > 0`，用户按下 `/`
- **THEN** keydown handler 不调用 `preventDefault`，浏览器正常写入 `/`
- **AND** 菜单在随后的 tick 打开，展示当前 agent 声明的所有命令
- **AND** 输入框内容为 "/"

#### Scenario: 按 `/` 键在多行输入第二行行首触发菜单

- **WHEN** 输入框内容为 "hello\n"，光标位于末尾（即第二行行首），用户按下 `/`
- **THEN** 菜单打开，输入框内容变为 "hello\n/"

#### Scenario: 按 `/` 键在句中不触发菜单

- **WHEN** 输入框内容为 "hello" 且光标在末尾（第一行非行首），用户按下 `/`
- **THEN** 菜单不打开，输入框内容变为 "hello/"

#### Scenario: 选中命令替换 `/` 并应用 hint

- **WHEN** `/` 键触发菜单后，用户选中名为 "review-commit"（description "Review the code changes introduced by a commit"，hint "commit sha"）的命令
- **THEN** 输入框内容替换为 "/review-commit "（末尾含一个空格）
- **AND** 光标置于末尾
- **AND** `placeholder` 临时变为 "commit sha"，组件记录 baseline 为 "/review-commit "
- **AND** 菜单关闭，焦点回到输入框

#### Scenario: hint 下一次输入后恢复

- **WHEN** 上一场景完成后，用户继续输入 "abc"，`textarea.value` 变为 "/review-commit abc"
- **THEN** `textarea.value !== baseline` 条件满足，`placeholder` 恢复为默认值
- **AND** 监听器取消，不再响应后续 input 事件

#### Scenario: hint 失焦后恢复

- **WHEN** 选中带 hint 的命令后，用户直接点击输入框外，textarea 触发 `blur`
- **THEN** `placeholder` 恢复为默认值，监听器取消

#### Scenario: 按钮点击插入时自动补空格

- **WHEN** 输入框内容为 "fix this"（末尾无空格），光标在末尾，用户点击 slash 按钮后选中 "review"
- **THEN** 输入框内容变为 "fix this /review "
- **AND** 光标置于新末尾

#### Scenario: 按钮点击插入时不重复补空格

- **WHEN** 输入框内容为 "fix this "（末尾已有空格），光标在末尾，用户点击 slash 按钮后选中 "review"
- **THEN** 输入框内容变为 "fix this /review "（总空格数为 1）
- **AND** 光标置于新末尾

#### Scenario: ESC 关闭菜单保留 `/`

- **WHEN** `/` 键触发菜单后，用户按 ESC 关闭菜单，未选中任何命令
- **THEN** 菜单关闭，输入框内容保持为 "/"（此前用户按 `/` 时写入的字符不被清除）
- **AND** 焦点回到输入框

#### Scenario: agent 未声明命令时按钮隐藏

- **WHEN** `activeSession` 为 `null`，或 `activeSession.availableCommands` 为 `undefined`，或为 `[]`
- **THEN** slash 按钮不渲染
- **AND** 按 `/` 键不打开菜单，`/` 字符按普通文本输入

#### Scenario: 切换 session 按当前 session 数据更新按钮状态

- **WHEN** 用户从 session A（有命令）切换到 session B（无命令）
- **THEN** slash 按钮隐藏
- **AND** 再切回 session A，按钮根据 session A 自身 `availableCommands` 重新出现

### Requirement: Chat 页面 SHALL 可见渲染流式错误

系统 SHALL 在 chat 页面消息流区域内联展示当前流式错误信息。当流式回调触发 error 时，chatStore SHALL 记录错误详情并让 UI 在当前消息流结束位置显示该错误；当用户切换会话、重新开始发送、或流式流程正常结束时，错误状态 SHALL 被统一清理。

chat 页面错误状态 SHALL 满足：

- 错误详情由 chatStore 持有，不由 sessionStore 持有
- 错误详情至少包含错误消息；UI SHALL 以 `message` 为主文案，并将 `code` 作为次级信息展示
- 错误状态只作用于当前 chat 上下文，不持久化到 session meta 或 session 列表
- 错误展示 SHALL 与消息列表同屏可见，避免隐藏在仅日志输出中
- 错误展示 SHALL 使用现有 UI 体系的轻量 inline error alert 风格，不使用 toast、全局通知或页面顶部 banner
- 错误展示 SHALL 渲染在 assistant 回复本应出现或继续出现的位置，避免与侧边栏、输入框和全局页面状态混淆
- 错误展示不要求提供手动关闭入口；清理 SHALL 由下一次发送、切换会话或统一 reset action 完成

#### Scenario: 流式回调触发 error

- **WHEN** `chat:stream:message` 的 `onError` 回调收到 `{ code, message }`
- **THEN** chatStore 记录当前流式错误详情
- **AND** chat 页面在当前消息流结束位置以内联错误块显示该错误
- **AND** 错误块主要展示 `message`，并以次级信息展示 `code`
- **AND** 当前会话状态结束为非运行态

#### Scenario: 切换会话清理错误状态

- **WHEN** 用户在侧边栏选择另一个 session
- **THEN** chatStore 通过统一 reset action 清空当前流式错误并恢复默认 chat 状态
- **AND** 新选中的 session 不继承上一个 session 的错误展示

#### Scenario: 新一轮发送清理上一次错误

- **WHEN** 用户在当前 chat 中再次发送消息
- **THEN** chatStore 在进入新一轮流式前清理上一次错误状态
- **AND** 页面只展示当前这轮流式结果

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

- `isUserImagePart(part)` → 渲染缩略图卡片（`<img>` 的 `src` SHALL 从 `part.url` 解析；当 `part.url` 为 `file://` URI 时，组件 SHALL 通过 `chatApi.readAttachmentDataUrl(part.url, part.mediaType)` 获取 data URL，并使用返回的 `dataUrl` 作为 `src`；沿用 `AttachmentCard.vue` 风格的图片预览样式）
- `isUserFilePart(part)` → 渲染文件名片（图标 + 文件名 `part.filename` + 扩展标签，沿用 `AttachmentCard.vue` 文件分支样式）
- `isTextUIPart(part)` 与 `isSystemReminderPart(part)` 分支保持现状

assistant 分支 SHALL NOT 调这两个 helper（assistant 当前不渲染 file part）。

#### Scenario: user 消息含图片 part 渲染缩略图

- **WHEN** 历史 session 加载后，某条 user 消息 `parts` 含 `{ type: "file", mediaType: "image/png", url: "file:///abs/截图 1.png", filename: "截图 1.png" }`
- **THEN** `UIMessageList` 渲染该 part 为图片缩略图
- **AND** `<img>` 的 `src` 是 `chatApi.readAttachmentDataUrl` 返回的 data URL
- **AND** 数据层 `part.url` 仍保持为 `file:///abs/截图 1.png`

#### Scenario: user 消息含非 file URL 图片 part 渲染缩略图

- **WHEN** 某条 user 消息 `parts` 含 `{ type: "file", mediaType: "image/png", url: "data:image/png;base64,abc", filename: "x.png" }`
- **THEN** `UIMessageList` 渲染该 part 为图片缩略图
- **AND** `<img>` 的 `src` 为原始 `data:image/png;base64,abc`

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

### Requirement: ChatPromptPanel 在 footer 渲染 ConfigOptionsBar

系统 SHALL 在 `frontend/src/components/chat/prompt/ChatPromptPanel.vue` 的 `UChatPrompt#footer` slot 左侧动作区中，紧随 `ChatAgentSelect` 之后渲染 `ConfigOptionsBar` 组件，用于呈现 ACP agent 暴露的 session 级配置选项（mode / model / thought_level 等）。

`ConfigOptionsBar` 的数据源 SHALL 按下述真值表选择：

| 状态                                                                                         | 数据源                           |
| -------------------------------------------------------------------------------------------- | -------------------------------- |
| `activeSession !== null`                                                                     | `activeSession.configOptions`    |
| `activeSession === null` 且 `activeDraftProbe?.status === "ready"`                           | `activeDraftProbe.configOptions` |
| `activeSession === null` 且 `activeDraftProbe?.status` 为 `"starting"` / `"failed"` / `null` | `[]`（不渲染）                   |

`ConfigOptionsBar` 渲染条件 SHALL 严格按照下述真值表决定：

| 状态                           | 渲染   |
| ------------------------------ | ------ |
| 数据源为 `undefined` 或 `null` | 不渲染 |
| 数据源为空数组（`[]`）         | 不渲染 |
| 数据源 `length > 0`            | 渲染   |

`ConfigOptionsBar` 出现/消失时 SHALL 使用 150ms 的 ease-out 淡入位移过渡（opacity + translate-y-1），不使用 skeleton/placeholder。

切换 `draftAgentId`（草稿态）时，UI 渲染数据源 SHALL **立即**变为新 agent 对应的 `activeDraftProbe`（其值受 `closeDraftProbe` 与 `ensureDraftProbe` 控制）。已被 `closeDraftProbe` 移除的 agent 对应 configOptions SHALL NOT 出现在 UI 中——即便新 agent 的 probe 还未到达。

`ConfigOptionItem` 的 setConfigOption 调用 SHALL 按当前态分派：

- `activeSession !== null` 时 SHALL 调 `chatStore.setConfigOption({ sessionId, configId, type, value })`（既有路径，IPC `chat:setConfigOption`）
- `activeSession === null` 时 SHALL 调 `sessionStore.setDraftConfigOption({ agentId: draftAgentId, configId, type, value })`（IPC `chat:probe:setConfigOption`）

#### Scenario: 草稿态 probe 就绪时渲染 ConfigOptionsBar

- **WHEN** 用户处于草稿态（`activeSession === null`），`draftAgentId === "claude-code"`，`activeDraftProbe.status === "ready"`，`activeDraftProbe.configOptions.length === 3`
- **THEN** `ConfigOptionsBar` 渲染 3 个选择器，数据源为 `activeDraftProbe.configOptions`
- **AND** footer 左侧顺序：`+`、`/`、`ChatAgentSelect`、`ConfigOptionsBar`

#### Scenario: 草稿态 probe 启动中不渲染

- **WHEN** 用户处于草稿态，`activeDraftProbe.status === "starting"`
- **THEN** `ConfigOptionsBar` 不渲染

#### Scenario: 草稿态 probe 失败不渲染

- **WHEN** 用户处于草稿态，`activeDraftProbe.status === "failed"`
- **THEN** `ConfigOptionsBar` 不渲染

#### Scenario: 切换 agent 立即清空 ConfigOptionsBar

- **WHEN** 草稿态从 `claude-code`（probe ready，configOptions 3 项）切到 `codex`（probe 启动中）
- **THEN** ConfigOptionsBar 在下一 tick 立即不渲染（不显示 claude-code 的旧数据）
- **AND** 当 codex probe ready 后 ConfigOptionsBar 渲染 codex 的 configOptions

#### Scenario: 已建立 session 但 agent 未回传 configOptions

- **WHEN** session 已建立（`activeSession.acpSessionId` 已存在），但 `activeSession.configOptions === undefined`
- **THEN** `ConfigOptionsBar` 不渲染

#### Scenario: agent 显式声明无 configOptions

- **WHEN** chat store 收到 `config_options_update` chunk，`options` 为空数组并替换 `activeSession.configOptions`
- **THEN** `ConfigOptionsBar` 不渲染

#### Scenario: configOptions 非空时渲染（已建立 session）

- **WHEN** `activeSession.configOptions` 长度为 3，分别为 mode、model、effort
- **THEN** `ConfigOptionsBar` 渲染 3 个选择器
- **AND** 视觉位置位于 `ChatAgentSelect` 之后、ContextUsageRing 之前

#### Scenario: 草稿态 ConfigOptionItem 调 setDraftConfigOption

- **WHEN** 用户处于草稿态，在 ConfigOptionsBar 中切 `model` 为 `"sonnet"`
- **THEN** 组件调 `sessionStore.setDraftConfigOption({ agentId, configId: "model", type: "select", value: "sonnet" })`
- **AND** SHALL NOT 调 `chatStore.setConfigOption`

#### Scenario: 已建立 session ConfigOptionItem 调 chatStore.setConfigOption

- **WHEN** 用户处于已建立 session，在 ConfigOptionsBar 中切 `model` 为 `"sonnet"`
- **THEN** 组件调 `chatStore.setConfigOption({ sessionId, configId: "model", type: "select", value: "sonnet" })`
- **AND** SHALL NOT 调 `sessionStore.setDraftConfigOption`

### Requirement: ConfigOptionsBar 排序与未知 category fallback

`ConfigOptionsBar` SHALL 按下述固定优先级对 `configOptions` 进行排序后渲染：

1. `category === "mode"` 的项排第 1
2. `category === "model"` 的项排第 2
3. `category === "thought_level"` 的项排第 3
4. 其余项（含 `null` / `undefined` / 自定义字符串如 `_custom`）按 agent 返回的原顺序追加在末尾

每个选项的图标 SHALL 按下述规则映射：

- `category === "mode"` → `i-lucide-shield-check`
- `category === "model"` → `i-lucide-cpu`
- `category === "thought_level"` → `i-lucide-brain`
- 其它（含未知值） → `i-lucide-sliders`

排序与图标映射均 SHALL 不影响选项的功能行为；客户端对未知 category 的处理与已知 category 完全相同（按 `type` 渲染 dropdown 或 switch）。

#### Scenario: 三个已知 category 按固定顺序排列

- **WHEN** agent 返回的 `configOptions` 顺序为 `[thought_level, model, mode]`
- **THEN** UI 渲染顺序 SHALL 为 `[mode, model, thought_level]`

#### Scenario: 未知 category 走 fallback 图标

- **WHEN** 某项 `category === "_custom"`
- **THEN** 该项使用 `i-lucide-sliders` 图标
- **AND** 仍按 `type` 渲染 dropdown 或 switch

#### Scenario: 缺失 category 视为未知

- **WHEN** 某项的 `category` 为 `null` 或 `undefined`
- **THEN** 该项追加在三个已知 category 之后
- **AND** 使用 fallback 图标

### Requirement: ConfigOptionItem 按 type 渲染交互组件

`ConfigOptionItem` SHALL 按 `type` 字段分派渲染：

- `type === "select"` SHALL 渲染 `UDropdownMenu`，触发器为 ghost-variant、size sm 的 `UButton`，按钮内显示 `name + " "` 与该 currentValue 对应选项的 `name`（找不到时回落到 `currentValue` 字符串本身），按钮 hover SHALL 显示 `description`（若存在）。
- `type === "boolean"` SHALL 渲染 `USwitch` 与 label。
- `select.options` 为 `Array<AcpSessionConfigOptionGroup>` 形态时，SHALL 渲染分组的 `UDropdownMenu`（每个 group 一个 group label + 其下的项）；为平铺 `Array<AcpSessionConfigOptionValueItem>` 形态时渲染单层菜单。

用户点击 select 项或切换 switch 时，SHALL 调用 chat store 的 `setConfigOption` action（不经组件直接调 IPC）。

#### Scenario: select 渲染下拉

- **WHEN** 某 configOption 的 `type === "select"`
- **THEN** 渲染 `UDropdownMenu`
- **AND** 触发器按钮显示 `name + currentValueLabel`

#### Scenario: boolean 渲染开关

- **WHEN** 某 configOption 的 `type === "boolean"`
- **THEN** 渲染 `USwitch` 与 label

#### Scenario: 分组 options 渲染嵌套菜单

- **WHEN** select 的 `options` 类型为 `AcpSessionConfigOptionGroup[]`
- **THEN** 菜单按 group 分块渲染
- **AND** 每个 group 显示自身 `name`，其下列出该 group 的所有项

### Requirement: chat store 处理 config_options_update chunk

`frontend/src/stores/chat.ts` 的 `streamSessionMessage.onChunk` SHALL 新增 `case "config_options_update"`，调用 `useSessionStore().setSessionConfigOptions(activeSession.id, data.options)` 把全集替换到 session 内存态字段 `Session.configOptions`。

`useSessionStore` SHALL 新增 `setSessionConfigOptions(sessionId: string, options: AcpSessionConfigOption[])` action，行为与 `setSessionAvailableCommands` 对称：找到对应 session 后赋值。

新增 case SHALL 保持 switch 的 TypeScript 穷尽检查（`default: { void data; throw ... }`）。

`MessageAssembler`/`useUIMessageAssembler` SHALL NOT 感知 `config_options_update`，事件不进入消息组装通路。

#### Scenario: chunk 到达后替换 session.configOptions

- **WHEN** chat store 在 `streamSessionMessage.onChunk` 收到 `{ kind: "config_options_update", options: [<3 项>] }`
- **THEN** 不修改 `activeSession.messages`
- **AND** 调用 `useSessionStore().setSessionConfigOptions(activeSession.id, options)`，覆盖 `Session.configOptions`

#### Scenario: 空数组覆盖

- **WHEN** chunk 携带 `options: []`
- **THEN** `Session.configOptions` 被赋值为 `[]`
- **AND** 触发 ConfigOptionsBar 隐藏

### Requirement: chat store 提供 setConfigOption action 并支持乐观更新与回滚

`frontend/src/stores/chat.ts` SHALL 新增 `setConfigOption({ sessionId, configId, type, value })` action：

1. 找到目标 session（不强制要求是 `activeSession`，但若不存在则直接抛错）。
2. 在 `Session.configOptions` 中找到 `configId` 对应项，记录旧值 `previousValue`。若找不到目标项，SHALL 抛错（前端 UI 不应允许该路径，仅作防御）。
3. 立即把该项的 `currentValue` 设为目标 `value`（乐观更新），并把"该项 isPending = true"反映到 UI（用 store 内独立的 `pendingConfigIds: Set<string>` 维护，不污染 ACP 字段）。
4. 调用 `chatApi.setConfigOption({ projectId: session.projectId, sessionId, configId, type, value })`。
5. 成功：从响应 `data.configOptions` 调用 `setSessionConfigOptions(sessionId, ...)` 全集替换；从 `pendingConfigIds` 移除该 `configId`。
6. 失败：把 `currentValue` 回滚到 `previousValue`；从 `pendingConfigIds` 移除该 `configId`；通过 `useToast()` 显示错误（`error.message` 优先）。

`ConfigOptionItem` SHALL 在该项 `isPending === true` 时禁用交互并显示 spinner（如 `i-lucide-loader-2 animate-spin`）。

#### Scenario: 成功路径用响应替换全集

- **WHEN** 用户切 model = sonnet
- **AND** IPC 返回 `{ ok: true, data: { configOptions } }`
- **THEN** chat store 把 `Session.configOptions` 替换为响应值
- **AND** `pendingConfigIds` 不再包含该 `configId`

#### Scenario: 失败路径回滚 currentValue

- **WHEN** IPC 返回 `{ ok: false, error: { code: "CONFIG_OPTION_INVALID_VALUE", message } }`
- **THEN** chat store 把该项 `currentValue` 回滚到 `previousValue`
- **AND** 通过 `useToast()` 显示错误信息
- **AND** `pendingConfigIds` 不再包含该 `configId`

#### Scenario: 进行中禁用触发器

- **WHEN** `pendingConfigIds` 包含某 `configId`
- **THEN** `ConfigOptionItem` 触发器按钮禁用，显示 spinner

### Requirement: turn 进行中 server-push 覆盖乐观值

`config_options_update` chunk SHALL 直接全集替换 `Session.configOptions`，包括对正在 pending 的项也直接覆盖 `currentValue`。这是 ACP 协议本身定义的"agent 可主动修改 configOptions"语义。

任何因此产生的"用户乐观值与最终值不一致"SHALL NOT 触发回滚或额外 toast；UI 显示以最新全集为准。

#### Scenario: 用户乐观改值 + agent 同时 push 不同值

- **WHEN** 用户点击 model = sonnet（乐观值生效，pendingConfigIds 含 model）
- **AND** ACP turn 中收到 `config_option_update` server-push，model 的 currentValue 为 haiku
- **THEN** chunk 处理器全集替换 `Session.configOptions`，model 的 currentValue 为 haiku
- **AND** 不触发回滚 toast
- **AND** `pendingConfigIds` 因后续 IPC 响应到达时移除该项（与失败/成功正常路径一致）

### Requirement: useSessionStore 维护 draftProbeByAgent 内存态

`frontend/src/stores/session.ts` 的 `useSessionStore` SHALL 暴露：

- 状态：`draftProbeByAgent: Ref<Map<string, DraftProbeState>>`（响应式，pinia ref）
- getter：`activeDraftProbe: ComputedRef<DraftProbeState | null>`，返回 `draftProbeByAgent.value.get(draftAgentId.value)` 或 `null`（当 `draftAgentId.value` 为 `null` 时）
- action：`ensureDraftProbe(agentId: string, projectId: string): Promise<void>`
- action：`closeDraftProbe(agentId: string): Promise<void>`
- action：`setDraftConfigOption(input: { agentId: string; configId: string; type: "select" | "boolean"; value: string | boolean }): Promise<void>`
- action：`applyProbeUpdate(agentId: string, snapshot: ProbeSnapshot | null): void`（由 `chat:probe:update` 监听器调用）
- 启动钩子：`subscribeProbeUpdates(): () => void`，在 `App.vue` 初始化阶段调用一次，返回 unsubscribe（卸载时调用）

`DraftProbeState` 类型定义为：

```ts
type DraftProbeStatus = "starting" | "ready" | "failed";

interface DraftProbeState {
  agentId: string;
  status: DraftProbeStatus;
  acpSessionId: string | null;
  configOptions: AcpSessionConfigOption[];
  error?: { code: string; message: string };
}
```

`ensureDraftProbe(agentId, projectId)` 行为：

1. 调用 `chatApi.probeEnsure({ agentId, projectId })`。
2. 成功：把响应快照写入 `draftProbeByAgent.value.set(agentId, snapshot)`。
3. 失败：写入 `{ status: "failed", error }` 占位条目。
4. 不抛错；UI 通过 `activeDraftProbe.value.status` 决定渲染。

`closeDraftProbe(agentId)` 行为：

1. **立即** `draftProbeByAgent.value.delete(agentId)`（同步执行，UI 在下一 tick 反应）。
2. 异步调用 `chatApi.probeClose({ agentId })`，结果忽略（成功失败均不重写本地状态）。

`setDraftConfigOption({ agentId, configId, type, value })` 行为（与 `chat.setConfigOption` 对称的乐观更新逻辑）：

1. 找到 `draftProbeByAgent.value.get(agentId)` 的 `configOptions` 中 `id === configId` 的项，记录 `previousValue`。
2. 立即把 `currentValue` 更新为目标 `value`（乐观更新）。
3. 通过 `useChatStore` 的 `markConfigOptionPending(configId)` 标记 pending（复用现有 pendingConfigIds Set，不引入新结构）。
4. 调 `chatApi.probeSetConfigOption({ agentId, configId, type, value })`：
   - 成功：把响应 `configOptions` 替换到当前 entry。
   - 失败：把 `currentValue` 回滚为 `previousValue`；用 `useToast()` 提示错误。
5. `finally` 调 `clearConfigOptionPending(configId)`。

`applyProbeUpdate(agentId, snapshot)` 行为：

- `snapshot === null` SHALL `draftProbeByAgent.value.delete(agentId)`。
- 否则 SHALL `draftProbeByAgent.value.set(agentId, snapshot)`。

`subscribeProbeUpdates()` 行为：

- 注册 `chatApi.onProbeUpdate(handler)`，handler 内部调 `applyProbeUpdate`。
- 同时监听 `useAcpAgentsStore` 的 `agentUnavailable` 事件，对应 agentId 调 `applyProbeUpdate(agentId, null)`。
- 返回 unsubscribe，撤销 IPC 监听与事件监听。

#### Scenario: ensureDraftProbe 写入 ready snapshot

- **WHEN** 调用 `ensureDraftProbe("claude-code", projectId)`，IPC 返回 `{ ok: true, data: { status: "ready", acpSessionId: "sess-A", configOptions: [...] } }`
- **THEN** `draftProbeByAgent.value.get("claude-code")` 存在
- **AND** 该 entry 的 `acpSessionId === "sess-A"`，`configOptions` 与响应一致

#### Scenario: closeDraftProbe 立即清空本地态

- **WHEN** `draftProbeByAgent` 中存在 `claude-code` 的 entry，调用 `closeDraftProbe("claude-code")`
- **THEN** 同步调用结束后 `draftProbeByAgent.value.has("claude-code") === false`
- **AND** UI 在下一 tick 不再渲染 claude-code 的 configOptions
- **AND** 异步 IPC `chat:probe:close` 已发起（不阻塞）

#### Scenario: setDraftConfigOption 乐观更新与回滚

- **WHEN** `draftProbeByAgent` 中存在 `claude-code` 的 entry，含 `id="model", currentValue="haiku"` 的 configOption
- **AND** 调用 `setDraftConfigOption({ agentId: "claude-code", configId: "model", type: "select", value: "sonnet" })`
- **THEN** 该 configOption 的 `currentValue` 立即变为 `"sonnet"`
- **AND** chat store 的 `pendingConfigIds` 含 `"model"`
- **AND** IPC 失败时 `currentValue` 回滚为 `"haiku"`，并 `useToast()` 提示错误
- **AND** `pendingConfigIds` 移除 `"model"`

#### Scenario: applyProbeUpdate snapshot 为 null 时清空对应 entry

- **WHEN** 主进程通过 `chat:probe:update` 推送 `{ agentId: "claude-code", snapshot: null }`
- **THEN** session store 调 `applyProbeUpdate("claude-code", null)`
- **AND** `draftProbeByAgent.value.has("claude-code") === false`

### Requirement: draftAgentId 变化时先清后取

`useSessionStore` SHALL 在 `draftAgentId` 变化时执行"先清后取"动作：

1. 获取上一个 `previousAgentId`（来自 watcher 的 oldValue）。
2. 若 `previousAgentId` 非空且与新值不同，**同步**调用 `closeDraftProbe(previousAgentId)`（先于任何 ensure）。
3. 若新值（`currentAgentId`）非空，**异步**调用 `ensureDraftProbe(currentAgentId, projectId)`。
4. `projectId` 取自 `useProjectStore().currentProject?.id`；若为空则不发起 ensure（无项目无法 probe）。

watcher SHALL 通过 `watch(() => sessionStore.draftAgentId, (next, prev) => ..., { immediate: true })` 实现，初次执行（prev === undefined）时不触发 close，仅根据 next 触发 ensure。

watcher SHALL 实现 200ms debounce，避免用户快速切 agent 时的雪崩 newSession 调用：debounce 仅作用于 ensure，close 不 debounce（保持 UI 立即清空的语义）。

watcher SHALL 仅在 `activeSessionId === null`（草稿态）时执行 close/ensure。`activeSessionId !== null` 时（用户处于已建立 session）`draftAgentId` 即便变化也 SHALL NOT 触发 probe 相关动作。

#### Scenario: 用户从 claude-code 切到 codex

- **WHEN** 草稿态下 `draftAgentId` 从 `"claude-code"` 变为 `"codex"`
- **THEN** session store 同步调 `closeDraftProbe("claude-code")`，`draftProbeByAgent` 立即移除 claude-code entry
- **AND** ConfigOptionsBar 在下一 tick 不再渲染任何 configOptions（因为新 codex probe 还未到达）
- **AND** 200ms 后 session store 调 `ensureDraftProbe("codex", projectId)`，IPC 完成后 `draftProbeByAgent` 写入 codex 的 ready snapshot
- **AND** UI 渲染 codex 的 configOptions（如有）

#### Scenario: 用户在 200ms 内连续切多次

- **WHEN** 草稿态下 `draftAgentId` 在 50ms 内从 A → B → C
- **THEN** A 与 B 的 close 各自同步执行（`draftProbeByAgent` 中均不存在）
- **AND** ensure 仅对最终的 C 在 200ms 后触发一次

#### Scenario: 已建立 session 切 agent 不触发 probe

- **WHEN** `activeSessionId !== null`，用户改 `agent` 触发 `setSessionAgent(...)`
- **THEN** session store SHALL NOT 调 `closeDraftProbe` 或 `ensureDraftProbe`
- **AND** `draftProbeByAgent` 内容不变

### Requirement: chat store sendMessage 在草稿态首条消息携带 probe acpSessionId

`frontend/src/stores/chat.ts` 的 `sendMessage(parts)` SHALL 在草稿态创建 fyllo session 后、调用 `streamSessionMessage` 之前，根据 `useSessionStore().activeDraftProbe` 决定是否携带 `acpSessionId`：

1. 拿到草稿态对应的 `draftAgentIdSnapshot`（与 `createSession` 入参一致）。
2. 读取 `useSessionStore().draftProbeByAgent.get(draftAgentIdSnapshot)` 得到 `probeBeforeCreate`。
3. 调 `streamSessionMessage(activeSession, projectId, parts, sessionStore, streamRunId, options)`，其中 `options.acpSessionId` 仅当 `probeBeforeCreate?.status === "ready" && probeBeforeCreate.acpSessionId` 时传入。
4. **不要在 `streamSessionMessage` 启动后再读 probe**——`createSession` 与 stream 之间存在异步窗口，必须使用 `probeBeforeCreate` 的快照。
5. **必须**在写入 `chatApi.streamMessage(...)` 之前**同步**调用 `useSessionStore().applyProbeUpdate(draftAgentIdSnapshot, null)` 清空对应 draftProbe 内存态——主进程 handler 会 `takeFor` consume，renderer 不应再认为它存在。

`streamSessionMessage` 函数签名 SHALL 改为：

```ts
function streamSessionMessage(
  activeSession: Session,
  projectId: string,
  parts: ChatPromptPart[],
  sessionStore: ReturnType<typeof useSessionStore>,
  streamRunId: number,
  options: { acpSessionId?: string }
): void;
```

`chatApi.streamMessage(...)` 调用 SHALL 把 `options.acpSessionId` 透传到第六个参数。

#### Scenario: 草稿态发首条消息，probe 已 ready

- **WHEN** 草稿态 `draftAgentId === "claude-code"`，`draftProbeByAgent` 中 claude-code entry `status === "ready", acpSessionId === "sess-A"`
- **AND** 用户调 `sendMessage([{ type: "text", text: "hi" }])`
- **THEN** chat store 创建 fyllo session
- **AND** 调 `chatApi.streamMessage(..., { acpSessionId: "sess-A" })`
- **AND** 同步调 `applyProbeUpdate("claude-code", null)`，`draftProbeByAgent` 移除 claude-code entry

#### Scenario: 草稿态发首条消息，probe 失败或未就绪

- **WHEN** 草稿态 `draftAgentId === "claude-code"`，`draftProbeByAgent` 中 claude-code entry `status === "failed"` 或 `status === "starting"` 或不存在
- **AND** 用户调 `sendMessage([...])`
- **THEN** chat store 调 `chatApi.streamMessage(...)` 不带 `acpSessionId`
- **AND** SHALL NOT 调 `applyProbeUpdate(..., null)`（保留 failed/starting 态供后续重试或 UI 显示）

#### Scenario: 已建立 session 发消息不读 draftProbe

- **WHEN** `activeSessionId !== null`，用户发消息
- **THEN** chat store 调 `streamSessionMessage` 不传 `acpSessionId`
- **AND** SHALL NOT 读 `draftProbeByAgent`
