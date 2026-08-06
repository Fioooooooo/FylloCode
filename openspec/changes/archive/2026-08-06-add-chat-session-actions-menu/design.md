## Context

`src/renderer/src/components/chat/ChatContainer.vue` 当前使用三栏 Header：左侧放 sidebar/new-session/mode 控件，中间放关联任务，右侧放 `SessionScopePopover`。当前会话由 `useSessionStore()` 提供，`activeSession` 是根据 `activeSessionId` 从 `sessions` 中解析出的 `Session`，其 `id` 即本次需要复制的 FylloCode 会话 ID；底层 `acpSessionId` 不属于 Renderer `Session` 展示模型，也不在本次范围内。

项目已使用 Nuxt UI `UDropdownMenu`、ghost icon button、`navigator.clipboard.writeText()` 与 `useToast()` 反馈复制结果。该能力仅服务 Chat Header 的局部交互，不满足 Renderer feature 准入条件，应继续使用 `components/chat/**` 的传统小组件结构。

## Goals / Non-Goals

**Goals:**

- 为当前打开会话提供统一、可扩展的 Header 操作菜单。
- 通过菜单复制 `activeSession.id`，并对成功和失败给出明确反馈。
- 保持现有 Header 三栏布局、授权范围入口和键盘可访问性。

**Non-Goals:**

- 不展示或复制底层 ACP session ID。
- 不修改 Session Store、IPC/preload API、持久化结构或会话创建流程。
- 不把现有 SessionItem 的修改标题、置顶或删除操作迁入 Header 菜单。
- 不在本次变更中预先增加其他空菜单项或新的 Renderer feature。

## Decisions

### 使用相邻的 `ChatSessionActionsMenu.vue` 封装菜单

在 `src/renderer/src/components/chat/ChatSessionActionsMenu.vue` 中接收必填 `sessionId: string` prop，维护 `DropdownMenuItem[]` 与复制副作用；`ChatContainer.vue` 只在 `activeSession` 存在时传入 `activeSession.id` 并挂载组件。这样可让 Header 继续只负责布局，同时让后续会话级操作集中加入同一菜单。

备选方案是把菜单数组、clipboard 调用和 toast 全部写进 `ChatContainer.vue`。该方案少一个文件，但会让已经承担消息区布局、滚动引用和会话状态切换的宿主继续增长，且后续扩展操作时边界不清晰，因此不采用。

### 复用 Nuxt UI 与浏览器剪贴板能力

菜单使用 `UDropdownMenu`，触发器使用 `UButton` 的 `color="neutral"`、`variant="ghost"`、`size="sm"` 和 Lucide `more-vertical` 图标，并提供 `title` 与 `aria-label`“会话操作”。菜单项使用“复制会话 ID”与 Lucide `copy` 图标。复制直接调用 `navigator.clipboard.writeText(props.sessionId)`，不新增 renderer API wrapper 或主进程桥接。

成功后通过 `useToast().add()` 显示 `title: "会话 ID 已复制"`、`color: "success"`；失败时显示 `title: "会话 ID 复制失败"`、`color: "error"`，并把捕获到的错误消息放入 `description`。该反馈与现有 commit hash 复制模式一致，并符合 toast 必须说明具体变化的 UI 规范。

### 由 `activeSession` 决定入口可见性和复制值

`ChatContainer.vue` 使用 `v-if="activeSession"`，而不是只检查 `!isDraft`。这保证菜单出现时一定存在可复制的当前会话实体，并在会话切换后通过 prop 立即获得新的 `activeSession.id`。菜单放在现有 `SessionScopePopover` 之后，保持“Agent 授权范围”能力独立。

## Risks / Trade-offs

- [浏览器拒绝剪贴板权限] → 捕获 `writeText()` rejection，并通过错误 toast 保留原因，不让未处理 Promise 泄漏到界面。
- [会话切换时复制旧 ID] → 不在菜单组件内部缓存 ID；每次选择菜单项时读取当前 prop，由 Vue 在 `activeSession` 切换后更新。
- [Header 右侧空间增加] → 只增加一个现有 `size="sm"` 的 ghost icon button，并保留右侧 `gap-1`；窄窗口人工检查无横向溢出。

## Migration Plan

该变更不涉及数据迁移或兼容层。回滚时移除 `ChatSessionActionsMenu.vue` 及 `ChatContainer.vue` 中的挂载点即可，既有会话数据和授权范围入口不受影响。

## Open Questions

无。后续会话操作在出现明确需求时再追加到同一菜单。
