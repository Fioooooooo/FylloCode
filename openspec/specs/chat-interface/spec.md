# chat-interface 规范

## Purpose

Chat 界面定义了消息流的渲染方式以及侧边栏的展示行为。

## Requirements

### Requirement: Chat 区域显示可滚动的消息流

系统 SHALL 在中央主区域渲染垂直滚动的消息序列，消息数据类型为 `UIMessage<MessageMeta>`，每条消息通过 `parts` 数组描述内容。

#### Scenario: 消息流渲染

- **WHEN** session 处于活跃状态
- **THEN** Chat 区域按时间顺序显示所有消息，可从上到下滚动
- **AND** 消息类型为 `UIMessage<MessageMeta>`，包含 `metadata.sessionId` 和 `metadata.createdAt`

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

组件内部 SHALL 使用 `ai` 包的 `isReasoningUIPart` / `isTextUIPart` / `isToolUIPart` 派发到对应子组件（`UChatMessages` / `UChatTool` / `ChatComark` 等），保持与当前 chat 主区域一致的渲染通路。

当 `type="chat"` 且 `agentId` 提供时，assistant 头像 SHALL 显示该 agent 对应的 ACP agent icon（来自 `useAcpAgentsStore.icons`）。若 `agentId` 未提供或对应 icon 不存在，则不显示头像（保持与 `type="side"` 一致的行为）。

渲染端 SHALL 使用 `UIMessage.id` 作为 `v-for :key`；该 id 在流式活跃期间为渲染进程生成的临时 id，在 resume 后为磁盘加载的 id，系统 SHALL NOT 做跨进程 id 匹配。

#### Scenario: Chat 主区域使用共享组件渲染消息列表并显示 agent 头像

- **WHEN** 用户打开 chat 页面
- **THEN** `ChatContainer.vue` 通过 `<UIMessageList :messages :status type="chat" :agentId />` 渲染 `activeSession.messages`
- **AND** assistant 消息的头像显示当前 session 对应 ACP agent 的 icon
- **AND** 渲染结果与当前 chat 消息表现一致（text / tool / reasoning 分派保持现状）

#### Scenario: Proposal SidePanel 使用共享组件保持现有行为

- **WHEN** 用户打开 proposal 详情页，SidePanel 展开
- **THEN** `ProposalApplySidePanel.vue` 通过 `<UIMessageList :messages :status type="side" />` 渲染 `messages`
- **AND** SidePanel 外壳（stage 进度条、关闭按钮、空态、流式指示器）保持现状
- **AND** 消息列表渲染通路与 chat 一致，能显示 text part 与 dynamic-tool part
- **AND** assistant 不显示头像（与变更前行为一致）

### Requirement: 渲染进程 UIMessage 组装逻辑抽为共享 composable

系统 SHALL 在 `frontend/src/composables/useUIMessageAssembler.ts` 提供共享 composable，封装流式 chunk 到 `UIMessage<MessageMeta>[]` 的组装逻辑。`chat` store 与 `proposal-run` store SHALL 使用同一实现，`frontend/src/stores/chat.ts#streamSessionMessage` 与 `frontend/src/stores/proposal-run.ts#applyChunk` 中的重复组装代码 SHALL 被移除。

composable 对外暴露至少以下能力：

- 接受或创建一个 `Ref<UIMessage<MessageMeta>[]>` 作为消息容器
- `applyChunk(chunk: MessageChunkData)` 按 chunk kind 分派：
  - `text_delta` / `tool_call_start` / `tool_call_update`：按现有 `MessageAssembler` 组装规则更新容器中的 assistant message
  - `user_message`：将 chunk 自带的 `UIMessage` 原样 push 到容器，并清空 `activeAssistantId`
  - 其他 kind（如 `session_info_update`、`status`）：不影响消息容器，由调用方按需处理
- `resetActive()`：清空 `activeAssistantId` / `activeTextPartIdx`（在 `done`、`error`、切换 stage 时调用）

#### Scenario: chat store 使用共享 composable

- **WHEN** `stores/chat.ts#streamSessionMessage` 启动
- **THEN** 使用 `useUIMessageAssembler` 处理 chunk
- **AND** store 内部不再包含 `ensureAssistantMessage` / chunk 分派实现

#### Scenario: proposal-run store 使用共享 composable

- **WHEN** `stores/proposal-run.ts#streamCurrentStage` 或 `startArchive` 启动
- **THEN** 使用 `useUIMessageAssembler` 处理 chunk
- **AND** store 内部不再包含 `ensureAssistantMessage` / chunk 分派实现
