## Why

当前流式回复只在整个消息列表级别提供短暂的占位状态，无法让用户辨认正在回复的 assistant 消息，也无法了解本次回复已持续多久。多个会话可以并行 stream，反馈状态必须在当前界面内按会话隔离，且不能污染历史消息的持久化格式。

## What Changes

- 为正在流式输出的 assistant 消息增加独立的底部状态指示组件，而不使用 `UChatMessages` 的列表级 `indicator` slot。
- 在该组件中展示 4×4 dot matrix 动画、循环预设的非 Agent 语义状态文案及 `UChatShimmer` 效果。
- 实时展示本次 assistant 回复从首个内容 chunk 到当前时刻的耗时；完成、失败、取消或组件卸载后停止刷新并清理运行时资源。
- 将每个会话的流式展示状态绑定到 `sessionId + runId`，并临时关联 renderer 生成的 assistant message ID，以支持多个会话同时 stream。
- 保持开始时间与临时 renderer message ID 仅存在于 renderer 内存；不修改 `MessageMeta`、主进程消息 ID、消息持久化 JSONL 或历史会话展示。

## Capabilities

### New Capabilities

- `assistant-stream-indicator`: 在单条当前流式 assistant 消息下展示会话隔离的状态动画与实时回复耗时。

### Modified Capabilities

无。

## Impact

- Renderer 流式状态：`src/renderer/src/stores/session/chat.ts`、`src/renderer/src/composables/useUIMessageAssembler.ts`。
- Chat 消息渲染：`src/renderer/src/components/chat/message/ChatMessageList.vue`、`src/renderer/src/components/chat/message/AssistantMessage.vue`，以及新增的消息级状态组件。
- Renderer 测试：assembler、chat store 与消息列表/状态组件测试。
- 不新增 IPC、preload API、main-process 改动或第三方依赖；复用现有 `@nuxt/ui` 的 `UChatShimmer`。
