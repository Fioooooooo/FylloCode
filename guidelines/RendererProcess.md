---
name: RendererProcess
description: Governs renderer-process routes, navigation registry, bootstrap tasks, API wrappers, and store ownership.
keywords: [renderer, vue, routing, stores, bootstrap, ipc]
---

# RendererProcess

## 范围

- 覆盖：`src/renderer/src/` 下的 renderer 应用启动、文件系统路由、活动导航、renderer bootstrap 任务、renderer API wrapper 和 Pinia store 所有权。
- 不覆盖：主进程 IPC handler、preload 暴露和跨进程契约细节；见 `guidelines/MainProcess.md`。Renderer 测试位置和 stub 由 `guidelines/Testing.md` 覆盖。UI/UX 视觉规范见 `guidelines/UiDesign.md`。

## 规则

### 路由与导航

- MUST 将 renderer 页面定义为 `src/renderer/src/pages/` 下的 Vue SFC，并让 `vue-router/auto-routes` 生成 route records。Router 在 `src/renderer/src/config/auto-routes.ts` 中创建，并使用 `createWebHashHistory()` 适配 Electron renderer 导航。证据：`electron.vite.config.ts`、`src/renderer/src/config/auto-routes.ts`、`src/renderer/src/pages/`。
- MUST 通过 `src/renderer/src/config/activity-bar.ts` 中的 `activityBarItems` 添加主应用导航，不要在组件里硬编码侧边栏入口。`ActivityBar.vue` 渲染该注册表，并根据 route path 计算 active 状态。证据：`src/renderer/src/config/activity-bar.ts`、`src/renderer/src/components/layout/ActivityBar.vue`。
- MUST 保持且仅保持一个默认 activity item，并保持 activity item 的 id 和 path 唯一。该注册表会在 dev/test 中强制默认项数量，renderer 测试会断言注册表形状。证据：`src/renderer/src/config/activity-bar.ts`、`test/renderer/src/config/activity-bar.spec.ts`。
- MUST 使用 `ActivityBarItem.requiresProject` 表达项目门控导航。当 `useProjectStore().hasCurrentProject` 为 false 时，`ActivityBar.vue` 会禁用项目作用域的 item。证据：`src/renderer/src/config/activity-bar.ts`、`src/renderer/src/components/layout/ActivityBar.vue`。

### API 与状态

- MUST 将 renderer 对 preload API 的访问封装在 `src/renderer/src/api/<capability>.ts` wrapper 中。组件、composable 和 store 应导入这些 wrapper，而不是直接调用 `window.api`。证据：`src/renderer/src/api/settings.ts`、`src/renderer/src/stores/settings.ts`。
- SHOULD 将可复用异步状态和跨组件 UI 状态放在 `src/renderer/src/stores/` 下的 Pinia setup store 中。除非数据确实只属于局部交互，页面和组件应聚焦展示与本地交互状态。证据：`src/renderer/src/stores/settings.ts`、`src/renderer/src/stores/task.ts`、`src/renderer/src/pages/task.vue`。
- MUST 在可用时让 renderer API wrapper 基于 shared 契约或 preload API 类型进行类型约束，并保留 preload API 返回的标准 `IpcResponse<T>` 流程。证据：`src/renderer/src/api/settings.ts`、`src/preload/index.d.ts`、`src/shared/types/ipc.ts`。
- MUST 通过 `src/renderer/src/api/window.ts` 和 `useProjectStore().bootstrapWindowProject()` 绑定当前窗口的项目上下文。当前项目应来自 main 进程返回的 `WindowContext`；组件打开项目或文件夹时调用 project store 的 `openProjectWindow()` / `openFolderWindow()`，不要在组件中直接替换 `currentProject`。证据：`src/renderer/src/api/window.ts`、`src/renderer/src/stores/project.ts`、`src/renderer/src/bootstrap/tasks/projects.ts`、`src/renderer/src/components/welcome/WelcomeView.vue`、`src/renderer/src/components/layout/AppHeader.vue`。
- MUST 在项目窗口上下文不可用、项目不存在或路径缺失时展示页面级错误状态，并清空当前项目会话状态，避免继续渲染过期项目数据。证据：`src/renderer/src/stores/project.ts`、`src/renderer/src/pages/index.vue`。

### Bootstrap

- MUST 通过 `registerBootstrapTasks()` 和 `onFylloBootstrap()` 注册 renderer 启动副作用，而不是在 layout 组件中临时启动。`src/renderer/src/main.ts` 在 mount 后使用共享 `{ pinia, router }` context 运行已注册任务。证据：`src/renderer/src/main.ts`、`src/renderer/src/bootstrap/core.ts`、`src/renderer/src/bootstrap/register.ts`。
- MUST 保持 bootstrap task 失败隔离。`runBootstrapTasks()` 使用 `Promise.allSettled()` 运行任务并按任务记录失败，因此新增任务应报告自身名称，并避免抛出会阻塞无关启动工作的错误。证据：`src/renderer/src/bootstrap/core.ts`、`test/renderer/src/bootstrap/fyllo-bootstrap.spec.ts`。
- MUST 让 bootstrap task 注册保持幂等；新增任务注册应通过 `registerBootstrapTasks()` 接入，该函数会防止重复注册。证据：`src/renderer/src/bootstrap/register.ts`。

## 验证

```bash
pnpm exec vitest run --project renderer
pnpm typecheck:web
```

## 失效信号

- 当 `electron.vite.config.ts`、`src/renderer/src/main.ts`、`src/renderer/src/config/auto-routes.ts`、`src/renderer/src/config/activity-bar.ts`、`src/renderer/src/bootstrap/**`、`src/renderer/src/api/**` 或 `src/renderer/src/stores/**` 发生变化时，重新检查本文档。
