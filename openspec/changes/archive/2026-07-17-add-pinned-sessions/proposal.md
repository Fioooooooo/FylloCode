## Why

当前聊天侧栏只按最近更新时间展示所有会话。用户无法保留需要长期跟进的会话；当置顶会话较多时，若没有容量边界，新发起的普通会话又会被挤出可视区域。

## What Changes

- 为项目内会话增加可持久化的置顶状态，支持在既有会话操作菜单中置顶和取消置顶。
- 将聊天侧栏拆分为“置顶会话”和“最近会话”分组，并以分组标题和会话图钉标识区分置顶状态。
- 限制整个置顶分组（含标题）的高度不超过会话列表可用可视高度的 50%；置顶组和最近组独立滚动，顶部“新建会话”操作不计入该高度。
- 保持各分组内现有的最近更新时间排序；仅切换置顶状态不得改变会话的 `updatedAt`。
- 兼容缺少置顶字段的既有会话元数据，将其视为未置顶。

## Capabilities

### New Capabilities

- `pinned-sessions`: 允许用户持久化置顶会话，并在聊天侧栏以受高度限制的分组展示置顶与普通会话。

### Modified Capabilities

无。

## Impact

- 跨进程会话契约：`src/shared/types/chat.ts` 与 `src/shared/ipc/session/chat.schemas.ts` 的 `Session` 和更新 patch 增加置顶状态。
- 主进程会话路径：`src/main/infra/storage/session-store.ts`、`src/main/services/session/chat/chat-service.ts`、`src/main/ipc/session/chat.ts`、`src/preload/api/session/chat.ts`。
- Renderer：`src/renderer/src/api/session/chat.ts`、`src/renderer/src/stores/session/session.ts`、`src/renderer/src/components/chat/ChatSidebar.vue`、`src/renderer/src/components/chat/SessionItem.vue`。
- 测试：主进程存储、service/IPC/preload 与 renderer store、sidebar、会话条目测试；不新增第三方依赖。
