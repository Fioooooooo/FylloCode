## 1. 流式运行时身份与计时状态

- [x] 1.1 修改 `src/renderer/src/composables/useUIMessageAssembler.ts` 的 `UIMessageAssembler` 公共接口，增加读取当前 renderer 临时 assistant message ID 的只读方法；复用现有 `activeAssistantId`，并确保 `resetActive()` 后不再返回旧 ID。更新 `test/renderer/src/composables/use-ui-message-assembler.spec.ts`，覆盖 text、reasoning、tool chunk 创建 ID 以及 reset 清空 ID 的行为。
- [x] 1.2 修改 `src/renderer/src/stores/session/chat.ts` 的 `ChatSessionStreamState`，增加非持久化 `assistantMessageId` 与 `replyStartedAt`；在同一 `sessionId + runId` 的首个内容 chunk 经 assembler 处理后写入它们，后续 chunk 不得重置。公开只读的当前会话 indicator 投影，仅在 `streaming`、ID 和开始时间齐全时返回。保持 `onDone`、`onError`、`cancelStream()` 及旧 run 过滤清理该投影，不修改 `MessageMeta` 或任何 IPC 调用。扩展 `test/renderer/src/stores/session/chat.spec.ts`，覆盖首 chunk 起点、同 session 后续 chunk 不重置、两 session 并行隔离、旧 run 不覆盖以及三个终态移除投影。

## 2. 消息级视觉组件

- [x] 2.1 新建 `src/renderer/src/components/chat/message/AssistantStreamIndicator.vue`，实现 4×4 dot matrix pattern 动画、预设中文通用状态文案的循环与 scramble 切换、`UChatShimmer` 渲染和从 `startedAt` 派生的每秒经过时间。状态文案不得读取或映射 Agent、tool、reasoning 或 text chunk。组件卸载时必须清理矩阵、文案、计时 interval 及所有 pending `requestAnimationFrame`；样式遵守 `guidelines/UiDesign.md` 的语义色、短过渡、无 transform/shadow hover 规则。
- [x] 2.2 新建 `test/renderer/src/components/chat/message/assistant-stream-indicator.spec.ts`，使用 fake timers 和 UI stub 验证首次显示时间、每秒更新时间、状态文案循环、dot matrix 状态变化，以及卸载后不再触发 interval 或 animation frame 更新；测试组件行为而不测试 `UChatShimmer` 的库内部实现。
- [x] 2.3 修改 `AssistantStreamIndicator.vue` 的经过时间格式为自然中文单位：秒、分和秒、小时和分、天和小时；扩展组件测试覆盖每个单位阈值，避免长任务显示为需要换算的总分钟或纯数字时钟。

## 3. 消息渲染装配

- [x] 3.1 修改 `src/renderer/src/components/chat/message/ChatMessageList.vue`、`src/renderer/src/components/chat/ChatContainer.vue` 与 `src/renderer/src/components/chat/message/AssistantMessage.vue`：将当前 active session 的只读 indicator 投影传入消息列表，并且只为 message ID 匹配的 assistant 在 part 循环之后挂载 `AssistantStreamIndicator`。不得使用 `UChatMessages` 的 `#indicator` slot，且 side 类型消息列表和不匹配/非 streaming/历史消息不得展示组件。
- [x] 3.2 扩展 `test/renderer/src/components/shared/ui-message-list.spec.ts`（必要时新增 `test/renderer/src/components/chat-container.spec.ts` 覆盖装配）以验证 indicator 位于匹配 assistant 的内容之后、不会出现在用户或历史 assistant 消息下、会话切换后使用目标 session 原始开始时间，并继续保持现有 Fyllo Action 与消息操作渲染。

## 4. 验证

- [x] 4.1 运行 `pnpm exec vitest run --project renderer`，修复本变更涉及的 renderer 测试失败。
- [x] 4.2 运行 `pnpm typecheck:web`，修复新增组件、store 投影和模板 props 的类型错误。
