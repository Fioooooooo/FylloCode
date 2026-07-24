## Why

聊天侧栏当前使用“置顶组按内容高度、最多占 50%，最近组占剩余空间”的固定双分组布局，既不能折叠，也难以在未来增加归档等第三个分组。需要把侧栏改为一致的可折叠分组模型，让用户按需释放可视空间，同时保留当前会话在分组变化后的可发现性。

## What Changes

- 将所有非空会话分组展示为可独立展开和折叠的分组，分组标题显示文本、数量和展开状态。
- 分组首次出现时默认展开；展开状态只属于当前 `ChatSidebar` 实例，不持久化。
- 所有展开分组平分扣除折叠标题后的剩余可用高度，并在各自内容区独立纵向滚动；折叠分组只占标题高度。
- 当 `activeSession` 从无到有地进入某个分组时展开该分组，不自动折叠其他分组；非 active 会话跨组移动不改变折叠状态。
- 折叠时保留分组内容 DOM，避免列表滚动位置和 `SessionItem` 局部 UI 状态因卸载丢失。
- 即使最近会话是唯一非空分组，也保留可折叠的“最近会话”标题。
- 保持分组自然顺序和全部折叠后的自然布局，不增加底部定位或可拖拽高度调整。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `pinned-sessions`：将聊天侧栏的固定高度双分组要求改为默认展开、可独立折叠、展开组等分剩余高度，并定义 active 会话驱动的自动展开行为。

## Impact

- 受影响组件：`src/renderer/src/components/chat/ChatSidebar.vue`。
- 受影响测试：`test/renderer/src/components/chat-sidebar.spec.ts`，并在 `test/renderer/src/setup.ts` 增加支持受控展开状态和 content slot 的 `UCollapsible` 测试 stub。
- 受影响规范：`openspec/specs/pinned-sessions/spec.md`。
- 复用现有 `@nuxt/ui` 依赖中的 `UCollapsible`，不新增依赖，不修改 session 持久化、IPC、store 公共 API 或会话分组数据契约。
