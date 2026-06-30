## Context

当前 `/chat` 页面在 `src/renderer/src/pages/chat.vue` 中以两列 flex 布局渲染：左侧固定 `w-65` 的 `ChatSidebar`，右侧为 `ChatContainer`。`ChatContainer` 顶部已有 `i-lucide-panel-left` 图标按钮，但按钮没有点击行为。

调研本地 `@nuxt/ui@4.9.0` 后确认可选组件包括 `USidebar`、`UDashboardSidebar`、`UDashboardSidebarCollapse` 和 `UCollapsible`。其中：

- `USidebar` 面向 standalone/fixed sidebar，本地实现的桌面容器使用 `fixed inset-y-0 h-svh`，不适合直接嵌入当前 `AppHeader` + `ActivityBar` + rounded page shell 的 Chat 页面。
- `UCollapsible` 面向内容显隐和高度动画，不适合控制左侧栏横向宽度。
- `UDashboardSidebar` 支持 `v-model:collapsed`、`collapsible`、`collapsedSize`、`defaultSize` 与 `unit`，可复用其折叠尺寸能力，但需要通过 `ui` prop 覆盖 dashboard 默认 `min-h-svh`、`hidden lg:flex`、边框等样式，使其符合当前页面分区规范。

相关项目约束：

- `guidelines/RendererProcess.md` 要求页面负责路由单元和页面编排，组件负责展示与交互；跨页面或异步全局状态才优先进入 store。
- `guidelines/UiDesign.md` 要求卡片化页面根容器使用 `bg-elevated space-x-2`，主区域侧栏统一 `w-65 bg-default rounded-lg`，icon-only 按钮必须有 tooltip 或 `aria-label`。
- `openspec/specs/session-management/spec.md` 已定义 Chat 左侧 session 列表的展示、选择和操作行为；本变更只新增该列表所在 sidebar 的折叠/展开交互。

## Goals / Non-Goals

**Goals:**

- 点击 `ChatContainer` 顶部 `panel-left` 按钮时，折叠或展开 `/chat` 左侧 session sidebar。
- 折叠时左侧 session sidebar 不占用横向宽度，Chat 主内容区自然扩展。
- 展开时恢复现有 `ChatSidebar` 展示与行为。
- 按钮根据当前状态提供明确的 icon、`title`、`aria-label` 与 `aria-expanded`。
- 折叠状态保持页面局部内存态，不新增持久化格式或全局 store。
- 复用 Nuxt UI `UDashboardSidebar` 的折叠能力，同时保留现有 FylloCode 页面视觉规范。

**Non-Goals:**

- 不实现用户偏好持久化，不跨 app 重启保留折叠状态。
- 不新增 `chatCollapse` 或类似 Pinia store。
- 不改变 session 列表的数据加载、排序、选择、高亮、更多菜单或新建 session 行为。
- 不引入可拖拽 resize。
- 不改变 Chat 右侧事件栏、消息列表、prompt panel 或 prompt timeline 的行为。
- 不改造其他页面（Workflow、Settings、Specs）的侧栏模式。

## Decisions

### 1. 折叠状态由 `chat.vue` 持有

`src/renderer/src/pages/chat.vue` 是左侧 `ChatSidebar` 与右侧 `ChatContainer` 的共同父级，也是实际拥有布局宽度变化的页面编排层。实现应在该文件中维护：

```ts
const isSidebarCollapsed = ref(false);
```

`ChatContainer` 不拥有该状态，也不直接修改 sidebar；它只通过 emit 请求父级切换。

替代方案：新增 `chatCollapse` Pinia store。拒绝原因：该状态只服务 `/chat` 页面局部布局，不涉及异步编排、跨页面生命周期、重启持久化或跨路由共享。放进 store 会扩大状态作用域并增加不必要的全局耦合。

### 2. `ChatContainer` 消费只读状态来优化按钮语义

`ChatContainer` 应增加：

- `sidebarCollapsed: boolean` prop
- `toggle-sidebar` emit

按钮点击时只 emit；按钮根据 prop 切换：

- 展开态：动作是“折叠聊天列表”，图标使用关闭/收起侧栏语义，例如 Nuxt UI 默认 `panelClose` 对应的 `i-lucide-panel-left-close`
- 折叠态：动作是“展开聊天列表”，图标使用打开侧栏语义，例如 `i-lucide-panel-left-open`
- `title` 与 `aria-label` 使用同一动作文案
- `aria-expanded` 表示左侧 session sidebar 当前是否展开，即 `String(!sidebarCollapsed)`

替代方案：`ChatContainer` 完全不知道折叠状态，只 emit toggle。拒绝原因：这样按钮无法提供动态 icon、动态动作文案和准确 `aria-expanded`，不满足 icon-only 按钮的可访问性和状态反馈质量。

### 3. 使用 `UDashboardSidebar` 承载现有 `ChatSidebar`

`chat.vue` 应用 Nuxt UI dashboard sidebar 折叠能力：

```vue
<UDashboardGroup
  as="div"
  class="flex flex-1 overflow-hidden bg-elevated space-x-2"
  unit="px"
  :persistent="false"
>
  <UDashboardSidebar
    v-model:collapsed="isSidebarCollapsed"
    id="chat-session-sidebar"
    collapsible
    :resizable="false"
    :toggle="false"
    :default-size="260"
    :collapsed-size="0"
    :min-size="260"
    :max-size="260"
  >
    <ChatSidebar />
  </UDashboardSidebar>

  <div class="flex-1 flex min-w-0">
    <div class="flex-1 flex flex-col min-w-0 rounded-lg bg-default overflow-auto">
      <ChatContainer
        :sidebar-collapsed="isSidebarCollapsed"
        @toggle-sidebar="isSidebarCollapsed = !isSidebarCollapsed"
      />
    </div>
  </div>
</UDashboardGroup>
```

实现时必须通过 `class` / `ui` prop 覆盖默认 dashboard 样式，使实际外观保持当前 Chat 页面规范：

- 展开宽度等价于现有 `w-65`（260px）
- 展开侧栏是 `h-full flex flex-col bg-default shrink-0 rounded-lg`
- 折叠时宽度为 `0`，不保留 `space-x-2` 之外的可见内容
- 禁用 dashboard 默认移动端 toggle/menu 行为，避免出现第二套 sidebar 入口
- 不启用 resize handle

如果 `UDashboardSidebar` 默认 slot padding 或 border 影响 `ChatSidebar` 现有布局，优先通过 `ui` prop 清空 `body` padding / gap，而不是修改 `ChatSidebar` 行为。

### 4. 不直接使用 `UDashboardSidebarCollapse`

`UDashboardSidebarCollapse` 依赖 `UDashboardGroup` context 并通过全局 dashboard hook 发起 collapse，默认 class 也带有 dashboard 的响应式显示假设。当前按钮已经位于 `ChatContainer` 业务 header 中，使用显式 prop/emit 更清楚，也更容易测试按钮语义。

Nuxt UI 的复用边界是：使用 `UDashboardSidebar` 管理侧栏折叠尺寸与 DOM 状态；按钮仍使用现有 `UButton`。

### 5. 测试策略

需要覆盖两个层级：

- `ChatContainer` 组件测试：断言按钮点击 emit `toggle-sidebar`；在 `sidebarCollapsed=false/true` 下按钮 icon、`title`、`aria-label`、`aria-expanded` 正确。
- `/chat` 页面测试：断言点击 `ChatContainer` stub 暴露的 toggle 事件后，`UDashboardSidebar` 接收的 collapsed 状态切换，并且 `ChatSidebar` 内容仍作为 sidebar 子内容渲染。

如果新增使用 `UDashboardGroup` / `UDashboardSidebar`，需要在 `test/renderer/src/setup.ts` 中增加保留关键交互语义的 stub，或者在页面测试局部注册 stub。stub 至少应支持 `collapsed` / `onUpdate:collapsed`、默认 slot 和可断言的 `data-collapsed`。

## Risks / Trade-offs

- Nuxt UI dashboard 默认样式与当前 FylloCode 内嵌页面布局不一致 → 通过 `ui` prop 明确覆盖 root/body/header/footer 等 slot class，并在页面测试中断言 sidebar collapsed 状态。
- `UDashboardSidebar` 的默认移动端行为可能引入额外 slideover/menu → 设置 `:toggle="false"`，并通过 `ui` / props 避免渲染第二套入口；当前 Electron 桌面应用不把移动端 drawer 作为本次目标。
- 只使用内存态意味着刷新或重新进入页面后恢复展开 → 这是刻意选择，避免把局部布局交互升级为全局偏好或持久化合同。
- `ChatContainer` 接收折叠 prop 可能被误解为拥有布局状态 → 任务中应明确它只用该 prop 渲染按钮语义，真实状态和布局控制仍在 `chat.vue`。
