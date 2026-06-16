## Why

当前 Chat 执行计划面板固定放在消息列表与输入框之间，会占用底部输入区域上方空间，也不利于后续把会话中的结构化事件集中呈现。需要先建立一个右侧会话事件栏结构，并把现有 plan 迁移进去，为未来承载未完成 Fyllo action、proposal 进度等事件预留稳定扩展点。

## What Changes

- 在 Chat 主区域新增右侧会话事件栏结构，用于承载当前会话的结构化事件卡片。
- 将现有 `ChatPlanPanel` 从 `ChatContainer.vue` 底部输入框上方迁移到右侧事件栏内展示。
- 保持 plan 的数据来源、折叠行为、状态图标、优先级标记、进度计数和草稿态隐藏规则不变。
- 事件栏本次只接入 plan 事件；不实现 Fyllo action 聚合、不实现 proposal 进度、不新增新的持久化字段或 IPC。
- 事件栏出现时，消息列表、流式错误和 `ChatPromptPanel` SHALL 作为同一个 conversation column 被整体向左挤压，与事件栏左右并排展示。
- 事件栏不得因窗口宽度不足自动隐藏；若用户手动收起事件栏，右侧边界 SHALL 保留展开按钮。

## Capabilities

### New Capabilities

- `chat-session-event-rail`: 定义 Chat 主区域右侧会话事件栏的显示边界、初始内容和扩展约束。

### Modified Capabilities

- `chat-plan-display`: 将执行计划面板的承载位置从底部输入框上方改为右侧会话事件栏，同时保持既有 plan 展示与内存态语义。

## Impact

- 影响 `src/renderer/src/components/chat/ChatContainer.vue` 的布局编排。
- 需要新增 `src/renderer/src/components/chat/event/` 下的事件栏结构组件。
- 需要在 Chat 主区域引入左右并排布局：conversation column 包含消息列表、流式错误和输入区，session rail 作为右侧 sibling。
- 可能调整或复用 `src/renderer/src/components/chat/plan/ChatPlanPanel.vue`，但不改变 `PlanEntry` 类型、`Session.plan` 内存态、`useSessionStore.setSessionPlan` 或 chat stream chunk 分派逻辑。
- 不影响主进程、preload、IPC、持久化 schema、Fyllo action 执行流或 proposal apply/archive 页面。
