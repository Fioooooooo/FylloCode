## Why

Chat 主区域顶部已有 `panel-left` 图标按钮，但当前没有任何交互行为。用户在阅读或编写较长对话时无法临时隐藏左侧 session 列表来释放横向空间。

## What Changes

- 为 Chat 页面左侧 session sidebar 增加折叠/展开能力。
- 复用 Nuxt UI 的 dashboard sidebar 折叠布局能力承载现有 `ChatSidebar`，而不是从零实现侧栏折叠动画与尺寸控制。
- 保留 `ChatContainer` 顶部的 `panel-left` 按钮作为交互入口；按钮根据当前折叠状态切换图标、标题文案和可访问性标签。
- 折叠状态仅保存在 `/chat` 页面内存中，不新增 Pinia store，也不跨重启持久化。
- 不改变 session 列表排序、选择、创建、删除、后台 stream 或消息渲染语义。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `session-management`: 新增 Chat 左侧 session sidebar 的折叠/展开交互要求。

## Impact

- 影响渲染进程 Chat 页面与组件：
  - `src/renderer/src/pages/chat.vue`
  - `src/renderer/src/components/chat/ChatContainer.vue`
  - `src/renderer/src/components/chat/ChatSidebar.vue`（仅作为现有内容被承载，除非实现时发现需要轻微样式适配）
- 影响 renderer 测试与 Nuxt UI stub：
  - `test/renderer/src/components/chat-container.spec.ts`
  - 可能新增 `test/renderer/src/pages/chat.spec.ts`
  - `test/renderer/src/setup.ts`
- 不新增 IPC、主进程逻辑、持久化 schema 或共享类型。
