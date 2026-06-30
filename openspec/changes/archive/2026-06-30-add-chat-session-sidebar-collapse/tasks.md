## 1. Chat 页面布局接入

- [x] 1.1 修改 `src/renderer/src/pages/chat.vue`，新增页面局部 `isSidebarCollapsed = ref(false)`，不得新增 Pinia store 或持久化读写。
- [x] 1.2 在 `src/renderer/src/pages/chat.vue` 中用 `UDashboardGroup` 包裹 Chat 页面根布局，设置 `unit="px"` 与 `:persistent="false"`，保持根布局语义等价于现有 `flex flex-1 overflow-hidden bg-elevated space-x-2`。
- [x] 1.3 在 `src/renderer/src/pages/chat.vue` 中用 `UDashboardSidebar` 承载现有 `ChatSidebar`，绑定 `v-model:collapsed="isSidebarCollapsed"`，设置 `collapsible`、`:resizable="false"`、`:toggle="false"`、`:default-size="260"`、`:collapsed-size="0"`、`:min-size="260"`、`:max-size="260"`。
- [x] 1.4 通过 `UDashboardSidebar` 的 `class` / `ui` prop 覆盖默认 dashboard 样式，使展开态保持现有 `w-65 h-full flex flex-col bg-default shrink-0 rounded-lg` 视觉，并清除会改变 `ChatSidebar` 现有布局的默认 padding、gap、border 或 `min-h-svh`。

## 2. ChatContainer 按钮交互

- [x] 2.1 修改 `src/renderer/src/components/chat/ChatContainer.vue`，新增 `sidebarCollapsed: boolean` prop 和 `toggle-sidebar` emit；点击顶部 `panel-left` 按钮时 emit 该事件。
- [x] 2.2 在 `ChatContainer.vue` 中根据 `sidebarCollapsed` 切换按钮 icon：展开态使用收起/关闭侧栏语义图标，折叠态使用打开侧栏语义图标；优先使用 Nuxt UI 默认 icon 名称对应的 lucide 图标（如 `i-lucide-panel-left-close` / `i-lucide-panel-left-open`）。
- [x] 2.3 在 `ChatContainer.vue` 中根据 `sidebarCollapsed` 设置按钮 `title`、`aria-label` 与 `aria-expanded`：展开态动作文案为“折叠聊天列表”，折叠态动作为“展开聊天列表”，`aria-expanded` 表示左侧 session sidebar 当前是否展开。
- [x] 2.4 在 `src/renderer/src/pages/chat.vue` 中把 `isSidebarCollapsed` 传给 `ChatContainer`，并在 `@toggle-sidebar` 中切换该页面局部状态。

## 3. 测试与验证

- [x] 3.1 更新 `test/renderer/src/setup.ts` 或页面测试局部 stubs，补充 `UDashboardGroup` 与 `UDashboardSidebar` stub；stub 至少支持默认 slot、`collapsed` prop、`onUpdate:collapsed` 事件和可断言的 `data-collapsed`。
- [x] 3.2 更新 `test/renderer/src/components/chat-container.spec.ts`，覆盖 `toggle-sidebar` emit，以及展开/折叠两种状态下按钮 icon、`title`、`aria-label`、`aria-expanded`。
- [x] 3.3 新增或更新 `test/renderer/src/pages/chat.spec.ts`，覆盖 `ChatContainer` 发出 toggle 后 `UDashboardSidebar` collapsed 状态切换，并确认 `ChatSidebar` 仍作为 sidebar 内容渲染。
- [x] 3.4 运行 `pnpm vitest run test/renderer/src/**/*.{test,spec}.{ts,vue}`。
- [x] 3.5 运行 `pnpm typecheck:web`，确认 Nuxt UI 组件 props、Vue emit 和自动组件类型无错误。
