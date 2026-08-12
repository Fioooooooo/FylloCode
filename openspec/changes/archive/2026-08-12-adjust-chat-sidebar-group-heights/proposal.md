## Why

聊天侧栏当前让置顶与最近会话组在同时展开时固定平分可用高度，即使置顶组只有少量会话也会占据一半空间，压缩了最近会话的可视区域。需要让短内容分组按实际内容高度收缩，同时继续限制置顶组不能遮挡最近会话。

## What Changes

- 当置顶与最近会话组同时展开时，置顶组按标题与会话条目的实际内容高度展示，并以侧栏会话列表可用高度的 50% 为上限。
- 最近会话组使用置顶组之后的剩余可用高度；内容溢出时仍在组内独立纵向滚动。
- 仅一个非空分组存在，或另一个分组被折叠时，保留当前展开组占用标题之外全部剩余高度的行为。
- 保留分组顺序、排序、独立折叠、滚动位置和 active 会话触发展开的既有行为。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `pinned-sessions`: 将两个展开分组固定平分剩余高度的要求，调整为置顶组按内容自然收缩且最高占 50%，最近组占用剩余高度。

## Impact

- Renderer 组件：`src/renderer/src/components/chat/ChatSidebar.vue` 的分组 flex 与 overflow 布局。
- Renderer 测试：`test/renderer/src/components/chat-sidebar.spec.ts` 的分组高度、滚动与折叠断言。
- OpenSpec：`openspec/specs/pinned-sessions/spec.md` 中“置顶会话组保留普通会话可视空间”要求。
- 不改变 IPC、持久化格式、会话排序、置顶操作或外部依赖。
