## 1. 路由与页面结构

- [x] 1.1 在 `src/renderer/src/pages/chat.vue` 与新的 `src/renderer/src/pages/chat/[sessionId].vue` 之间拆分草稿态与真实会话态，确保 `/chat` 只初始化草稿会话，`/chat/:sessionId` 只负责选中目标会话。
- [x] 1.2 把聊天页共用布局收敛到一个可复用壳层，保持现有 `ChatSidebar`、`ChatContainer`、`ChatPromptTimeline` 和会话 header 的视觉与交互不变。
- [x] 1.3 为无效 sessionId、已删除会话和 Workspace 不匹配的场景添加回退逻辑：导航回 `/chat` 并显示 toast。

## 2. 统一打开会话入口

- [x] 2.1 更新 `src/renderer/src/composables/useOpenChatSession.ts`，让它直接进入 `/chat/:sessionId`，并在目标会话已经打开时避免多余跳转。
- [x] 2.2 更新 `src/renderer/src/pages/task.vue`、`src/renderer/src/pages/lineage.vue`、`src/renderer/src/components/chat/SessionSearchModal.vue`、`src/renderer/src/components/chat/SessionItem.vue` 和任何直接拼接 `/chat` 的调用点，全部改为复用统一打开入口。
- [x] 2.3 检查 `src/renderer/src/components/layout/ProjectHealthPopover.vue`、`src/renderer/src/stores/automation/task.ts` 等会进入聊天页的入口，确保它们只回到 `/chat` 草稿态，不抢占真实会话路由。

## 3. 首发后的 URL 升级

- [x] 3.1 在 `src/renderer/src/stores/session/chat.ts` 的首次提交流程激活真实 Session 后，由 `ChatPageShell` 将 `/chat` 草稿 URL replace 为新会话子路由。
- [x] 3.2 确认失败路径不会留下错误 URL：创建失败、附件保存失败或首条消息持久化失败时都保持在 `/chat` 草稿态，并清理未完成的临时会话。
- [x] 3.3 更新当前 active Session 删除后的路由同步：清空 active selection，并始终导航回 `/chat` 草稿入口；不得自动打开下一个可用会话。

## 4. 测试覆盖

- [x] 4.1 更新 `test/renderer/src/composables/use-open-chat-session.spec.ts`，覆盖直接进入 `/chat/:sessionId` 和失效回退的导航行为。
- [x] 4.2 更新 `test/renderer/src/pages/chat.spec.ts`，验证 `/chat` 只初始化草稿态，而真实会话页会按 route param 选中会话。
- [x] 4.3 更新 `test/renderer/src/pages/chat.spec.ts`，补上首次提交成功后 URL replace 到真实会话子路由的断言。
- [x] 4.4 回归 `test/renderer/src/pages/task.spec.ts`、`test/renderer/src/pages/lineage.spec.ts`、`test/renderer/src/components/session-search-modal.spec.ts` 和 `test/renderer/src/components/session-item.spec.ts`，确保所有入口仍通过统一打开会话入口工作。
