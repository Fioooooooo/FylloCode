## 1. 会话置顶状态与跨进程契约

- [x] 1.1 修改 `src/shared/types/chat.ts`、`src/main/infra/storage/session-store.ts` 和 `src/main/services/session/chat/chat-service.ts`：为 session meta 增加向后兼容的 `isPinned?: boolean`，为 renderer `Session` 增加必有的 `isPinned: boolean`，并在 `toSession()` 中将缺失或非 `true` 值规范为 `false`；`createSession()` 创建的会话默认未置顶。扩展 `test/main/infra/storage/session-store.spec.ts` 与 `test/main/services/session/chat/chat-service.spec.ts`，验证旧 meta 回退、持久化读取和默认值。
- [x] 1.2 扩展既有 `session:chat:updateSession` 的 patch 路径：在 `src/shared/ipc/session/chat.schemas.ts`、`src/main/services/session/chat/chat-service.ts`、`src/preload/api/session/chat.ts`、`src/preload/index.d.ts` 和 `src/renderer/src/api/session/chat.ts` 中接受并透传 `isPinned`，复用现有 `SessionChatChannels.updateSession`，不新增 channel。仅 `isPinned` patch 必须保留原 `updatedAt`；包含 `title` 或 `agentId` 的现有更新时间语义不变。更新 `test/main/ipc/session/chat.spec.ts`、`test/preload/api/session/chat.spec.ts` 与 `test/renderer/src/utils/chat-api.test.ts`，验证输入、桥接与返回值。

## 2. Renderer 会话状态

- [x] 2.1 修改 `src/renderer/src/stores/session/session.ts`：在 `normalizeSession()` 和 `mergeSessionMeta()` 中规范并合并 `isPinned`，在 `SessionStore` 公共接口新增 `setSessionPinned(sessionId, isPinned)`。该 action 使用 `chatApi.updateSession()`，仅在成功响应后更新会话；失败时保留原 `sessions` 状态，使用现有 toast 输出“置顶会话失败”或“取消置顶失败”后抛出错误。扩展 `test/renderer/src/stores/session/session.spec.ts`，覆盖成功置顶、取消置顶、重新加载恢复、失败不乐观更新与 `updatedAt` 保持不变。
- [x] 2.2 保持 `sortSessions()` 的全局最近活动语义不变；在 renderer 侧验证从草稿态首次创建的 `New Session` 默认 `isPinned === false`，并且置顶状态不产生第二份可变会话数组。将相应断言添加到 `test/renderer/src/stores/session/session.spec.ts` 或现有 `test/renderer/src/stores/session/chat.spec.ts`。

## 3. 侧栏交互与受限分组布局

- [x] 3.1 修改 `src/renderer/src/components/chat/SessionItem.vue`：保留仅 `session` 的 props 形状，在现有 dropdown menu 中按 `session.isPinned` 展示“置顶会话”/“取消置顶”动作和图标，调用 `sessionStore.setSessionPinned()`，并阻止菜单操作触发条目选中。置顶状态只通过 sidebar 的文本分组标题识别，条目不重复渲染图钉；不改变现有 attention badge、running indicator、标题编辑和删除行为。扩展 `test/renderer/src/components/session-item.spec.ts`，验证两种菜单状态、调用参数、选择状态不受影响和无条目级图钉。
- [x] 3.2 修改 `src/renderer/src/components/chat/ChatSidebar.vue`：从 `sessionStore.sessions` 以 `isPinned` 派生互斥的 `pinnedSessions` 与 `recentSessions`，两个数组均按 `updatedAt` 降序渲染。无置顶时保持现有完整列表；同时存在两组时显示“置顶会话”和“最近会话”文本标题。新增或扩展 `test/renderer/src/components/chat-sidebar.spec.ts`，验证分组、组内排序、无重复渲染和无置顶时不渲染空分组。
- [x] 3.3 在 `ChatSidebar.vue` 使用 `flex-1 min-h-0` 的会话列表容器实现 nested scroll：置顶分组（含标题）最高为该容器的 50%，其条目区域 `overflow-y-auto`；最近会话区域占剩余高度并独立 `overflow-y-auto`；顶部“新建会话”区域不计入上限。置顶会话溢出时仍保留最近会话可视空间，首次发送生成的未置顶会话位于最近组。为布局添加 `data-test` 标识并在 `test/renderer/src/components/chat-sidebar.spec.ts` 断言分组与滚动/高度约束 class；按 `guidelines/UiDesign.md` 手动检查浅色、深色和窄窗口。

## 4. 验证

- [x] 4.1 在 proposal worktree 运行 `pnpm exec vitest run --project main` 与 `pnpm exec vitest run --project renderer`，修复本变更涉及的持久化、IPC、store 和组件测试失败。
- [x] 4.2 在 proposal worktree 运行 `pnpm typecheck` 与 `pnpm lint`，修复 `Session`、preload 声明、Vue 模板和 renderer 边界规则的错误；不要运行全量格式化以避免无关改动。
