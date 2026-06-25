## Why

Chat 侧栏的 session item 已经暴露更多操作菜单，但“重命名”和“删除”仍依赖浏览器原生 `prompt` / `confirm`，与当前 renderer 的 Nuxt UI 和 `useConfirmDialog()` 规范不一致。当前条目还为 hover 后才出现的三点按钮永久预留右侧空间，导致正常状态下标题可见长度明显偏短。

## What Changes

- 将 session item 菜单中的“重命名”改为“修改标题”，突出用户修改的是会话展示标题，而不是资源标识。
- 实现“修改标题”交互，用户可以从更多操作菜单进入就地编辑，提交后复用现有 `useSessionStore.renameSession(sessionId, title)` 持久化标题。
- 删除会话改为通过 `useConfirmDialog()` 发起危险操作确认，用户确认后才调用现有 `useSessionStore.deleteSession(sessionId)`。
- 优化 session item 标题与更多操作按钮布局：正常状态下标题区域不再为隐藏按钮永久保留固定右侧空白，按钮仅在 hover、focus 或菜单打开时浮现。
- 补充 `SessionItem` 组件测试，覆盖修改标题、删除确认、取消分支和标题布局约束。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `session-management`: 补充 Session 条目的“修改标题”交互、删除确认方式，以及更多操作按钮不永久压缩标题区域的布局要求。

## Impact

- `src/renderer/src/components/chat/SessionItem.vue`: 替换浏览器原生 prompt/confirm，新增就地标题编辑状态，接入 `useConfirmDialog()`，调整标题与三点菜单布局。
- `src/renderer/src/composables/useConfirmDialog.ts`: 复用现有 API，不改变 composable 契约。
- `src/renderer/src/stores/session.ts`: 复用现有 `renameSession` / `deleteSession`，不新增 store action。
- `src/shared/types/channels.ts`、`src/shared/schemas/ipc/chat.ts`、`src/main/ipc/chat.ts`、`src/preload/api/chat.ts`: 不新增或修改 IPC channel。
- `test/renderer/src/components/session-item.spec.ts`: 增加组件级行为测试，并按测试规范 mock `useConfirmDialog()`。
