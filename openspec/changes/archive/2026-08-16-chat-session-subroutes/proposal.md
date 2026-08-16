## Why

当前 Chat 仍然只把 `/chat` 当作统一入口，`useOpenChatSession()` 也只是先回到 `/chat` 再依赖 store 选中会话。这样会话身份无法直接体现在 URL 中，任务页、搜索页、lineage 页和刷新后的恢复路径都缺少稳定且可共享的会话定位方式。

把每个真实会话拆成独立子路由，可以保留 `/chat` 作为草稿/Probe 入口，同时让 `/chat/<session-id>` 成为可直达、可恢复、可分享的会话页面。

## What Changes

- 新增 `/chat/:sessionId` 作为真实会话子路由。
- 保持 `/chat` 作为草稿/Probe 入口，不携带 active Session。
- 更新统一打开会话入口，使任务页、搜索页、lineage 页和其他调用方都进入 `/chat/:sessionId`。
- 当用户从 `/chat` 发起真实首条消息并成功创建会话后，URL 需要在首条消息 durable append 成功后切换为新会话子路由。
- 当会话路由无效、缺失或不属于当前 Workspace 时，回退到 `/chat` 并给出 toast 提示。

## Capabilities

### New Capabilities

- `chat-session-subroutes`: 定义 `/chat` 与 `/chat/:sessionId` 的路由职责、进入态、失效回退和 URL 升级语义。

### Modified Capabilities

- `task-linked-conversations`: 将“从任务打开关联会话”的目标路由从 `/chat` 改为 `/chat/:sessionId`，并更新当前路由兼容说明。
- `chat-message-submission`: 首次真实提交成功后，需要把草稿态 URL 升级为新建会话的子路由。

## Impact

- 受影响的 renderer 页面与导航入口：`src/renderer/src/pages/chat.vue`、`src/renderer/src/composables/useOpenChatSession.ts`、`src/renderer/src/pages/task.vue`、`src/renderer/src/pages/lineage.vue`、`src/renderer/src/components/chat/SessionSearchModal.vue`、`src/renderer/src/components/chat/SessionItem.vue`。
- 受影响的聊天状态流：`src/renderer/src/stores/session/session.ts`、`src/renderer/src/stores/session/chat.ts`。
- 受影响的测试：`test/renderer/src/pages/chat.spec.ts`、`test/renderer/src/composables/use-open-chat-session.spec.ts`、`test/renderer/src/pages/task.spec.ts`、`test/renderer/src/pages/lineage.spec.ts`、`test/renderer/src/stores/session/chat.spec.ts` 等相关用例。
- 受影响的 OpenSpec 规格：`task-linked-conversations`、`chat-message-submission`，以及新增的 `chat-session-subroutes`。
