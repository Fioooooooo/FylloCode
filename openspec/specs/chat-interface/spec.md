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

系统 SHALL 将 `UIMessage<MessageMeta>[]` 的列表渲染抽成共享 Vue 组件（命名建议 `UIMessageList`，实现阶段可调整），通过 `type: "chat" | "side"` prop 标识使用场景。`ChatContainer.vue` 与 `ProposalApplySidePanel.vue` 的消息列表部分 SHALL 都通过该组件渲染，不再各自编写 `v-for message / v-for part` 的渲染逻辑。

共享组件的必要 props：

- `messages: UIMessage<MessageMeta>[]`
- `isStreaming: boolean`
- `type: "chat" | "side"`

组件内部 SHALL 使用 `ai` 包的 `isReasoningUIPart` / `isTextUIPart` / `isToolUIPart` 派发到对应子组件（`UChatMessages` / `UChatTool` / `ChatComark` 等），保持与当前 chat 主区域一致的渲染通路。

本次变更 SHALL NOT 基于 `type` 做样式差异化；`type` 为 TypeScript 接口层面的占位，组件内部在本次 change 中 SHALL NOT 出现基于 `type` 的条件分支。未来样式差异化通过在该 prop 之上扩展实现。

渲染端 SHALL 使用 `UIMessage.id` 作为 `v-for :key`；该 id 在流式活跃期间为渲染进程生成的临时 id，在 resume 后为磁盘加载的 id，系统 SHALL NOT 做跨进程 id 匹配。

#### Scenario: Chat 主区域使用共享组件渲染消息列表

- **WHEN** 用户打开 chat 页面
- **THEN** `ChatContainer.vue` 通过 `<UIMessageList :messages :isStreaming type="chat" />` 渲染 `activeSession.messages`
- **AND** 渲染结果与当前 chat 消息表现一致（text / tool / reasoning 分派保持现状）

#### Scenario: Proposal SidePanel 使用共享组件渲染消息列表

- **WHEN** 用户打开 proposal 详情页，SidePanel 展开
- **THEN** `ProposalApplySidePanel.vue` 通过 `<UIMessageList :messages :isStreaming type="side" />` 渲染 `messages`
- **AND** SidePanel 外壳（stage 进度条、关闭按钮、空态、流式指示器）保持现状
- **AND** 消息列表渲染通路与 chat 一致，能显示 text part 与 dynamic-tool part

#### Scenario: 本次变更不做样式差异化

- **WHEN** 查看共享组件在当前 change 的实现
- **THEN** 组件内部不包含基于 `type` prop 的条件分支
- **AND** `type === "chat"` 与 `type === "side"` 两种场景视觉表现一致（除外壳外）

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
