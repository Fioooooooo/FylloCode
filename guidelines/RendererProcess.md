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
- MUST 使用 `ActivityBarItem.requiresWorkspace` 表达 Workspace 门控导航。当 `useWorkspaceStore().hasCurrentWorkspace` 为 false 时，`ActivityBar.vue` 会禁用 Workspace 作用域的 item。证据：`src/renderer/src/config/activity-bar.ts`、`src/renderer/src/components/layout/ActivityBar.vue`。
- MUST 通过 `evaluateWorkspaceNavigation()` 统一 activity bar 与 route guard 的 Workspace capability 判断；阶段性不支持 Collection Chat 时，两处必须显示/执行同一禁用结果，不得向 Main 发送 primary-only fallback 请求。证据：`src/renderer/src/config/navigation-gate.ts`、`src/renderer/src/components/layout/ActivityBar.vue`、`src/renderer/src/pages/index.vue`。

### API 与状态

- MUST 将 renderer 对 preload API 的访问封装在 `src/renderer/src/api/<domain>/<area>.ts` wrapper 中。组件、composable 和 store 应导入这些 wrapper，而不是直接调用 `window.api`；除 `src/renderer/src/api/**` 外，renderer 代码不得直接访问 `window.api`。证据：`src/renderer/src/api/platform/settings.ts`、`src/renderer/src/api/session/chat.ts`、`eslint.config.mjs`。
- MUST 让 renderer API wrapper 对齐 `window.api.<domain>.<area>`，并在可用时基于 shared 契约或 preload API 类型进行类型约束，保留 preload API 返回的标准 `IpcResponse<T>` 流程。证据：`src/preload/index.ts`、`src/preload/index.d.ts`、`src/renderer/src/api/proposal/apply.ts`、`src/shared/types/ipc.ts`。
- SHOULD 将可复用异步状态和跨组件 UI 状态放在 `src/renderer/src/stores/<domain>/` 下的 Pinia setup store 中。store 的形状应服务 renderer 状态和页面用例，不需要强制镜像 main services 的 area 或文件名。证据：`src/renderer/src/stores/platform/settings.ts`、`src/renderer/src/stores/session/session.ts`、`src/renderer/src/stores/proposal/run.ts`。
- MUST 让每个 store domain 通过 `src/renderer/src/stores/<domain>/index.ts` 暴露本 domain 的 public store entry points；根级 `src/renderer/src/stores/index.ts` 只 re-export domain barrel，不逐文件 re-export store。renderer 非 store 代码应从 `@renderer/stores` root barrel 导入 store，不要从 `@renderer/stores/<domain>` 深路径导入。store 模块内部不得导入 root barrel，跨 store 组合时使用目标 domain barrel 或直接 store module，避免 `stores/index.ts` 形成循环依赖。证据：`src/renderer/src/stores/platform/index.ts`、`src/renderer/src/stores/session/index.ts`、`src/renderer/src/stores/index.ts`、`src/renderer/src/pages/task.vue`、`eslint.config.mjs`。
- MUST 让每个 renderer store 只直接导入本 domain 的 API wrapper；如果需要组合其他 domain 的能力，应导入其他 domain 的 store 或由本 domain store 提供更高层 action。不得在 `src/renderer/src/stores/<domain>/**` 直接导入 `src/renderer/src/api/<other-domain>/**`。该规则由 `eslint.config.mjs` 强制。证据：`src/renderer/src/stores/session/session.ts`、`src/renderer/src/stores/automation/task.ts`、`eslint.config.mjs`。
- SHOULD 让页面和组件通过所属流程的 store/composable 取数和提交动作，避免直接导入无关 domain 的 API wrapper。需要跨 domain 组合时，优先把组合逻辑收敛到拥有该页面流程的 store。证据：`src/renderer/src/pages/task.vue`、`src/renderer/src/stores/automation/task.ts`。
- SHOULD 让页面、组件和关键 composable 的跨 domain store 组合保持流程所有权清晰；当组合逻辑开始承载业务流程，应收敛到 owner store action，而不是在页面里长期堆叠多个领域的细节。该约束通过 review 判断，不再由文件级 lint 白名单维护。证据：`src/renderer/src/pages/task.vue`、`src/renderer/src/stores/automation/task.ts`。
- MUST 通过 `src/renderer/src/api/workspace/window.ts` 和 `useWorkspaceStore().bootstrapWindowWorkspace()` 绑定当前窗口的 Workspace 上下文。当前 Workspace 只能来自 main 返回的 `WindowContext`；组件打开 Workspace 或文件夹时调用 Workspace store 的 `openWorkspaceWindow()` / `openFolderWindow()`，不要在组件中直接替换 `currentWorkspace`。证据：`src/renderer/src/stores/workspace/workspace.ts`、`src/renderer/src/bootstrap/tasks/workspaces.ts`、`src/renderer/src/components/welcome/WelcomeView.vue`。
- MUST 在 launcher context 中保持 `currentWorkspace` 为空；在 Workspace context 不可用、Workspace 不存在或 primary Folder path 缺失时展示页面级错误状态并清空 session state。Workspace bootstrap 必须在同一任务中按 context、Workspace list、当前 Workspace、session list 的顺序完成。证据：`src/renderer/src/stores/workspace/workspace.ts`、`test/renderer/src/stores/workspace/workspace.spec.ts`、`src/renderer/src/pages/index.vue`。
- MUST 让 launcher 使用 active/deleted `WorkspaceLauncherItem` 投影管理 Folder 与 Collection Workspace；创建、成员编辑、重定位、soft delete、restore 和永久清理只通过 Workspace store action 进入，组件不得直接调用 preload API。证据：`src/renderer/src/stores/workspace/workspace.ts`、`src/renderer/src/components/welcome/WorkspaceList.vue`、`src/renderer/src/components/welcome/DeletedWorkspaceManager.vue`。
- MUST 让 Workspace-scoped 异步结果绑定请求发起时的 `workspaceId` 和请求世代；切换 Workspace 后的迟到 list/detail 响应不得覆盖新 Workspace state，确认式删除和 Action 执行也必须拒绝 scope 已变化的操作。证据：`src/renderer/src/stores/session/session.ts`、`src/renderer/src/stores/insight/knowledge.ts`、`src/renderer/src/features/fyllo-action/application/use-fyllo-action-dispatcher.ts`、`src/renderer/src/pages/knowledge.vue`。
- MUST 让 proposal list key、detail selection、status update、EventRail item 和 apply/archive run comparison 使用完整 `ProposalRef { folderId, changeId }`；不得用裸 `changeId` 在不同 Folder 的同名 proposal 之间查找、更新或取消 watcher。Proposal 列表和会话卡片必须展示 owner Folder，linked target 通过 `worktreeMode` 与 `worktreePath` 呈现。证据：`src/renderer/src/stores/proposal/browser.ts`、`src/renderer/src/stores/proposal/run.ts`、`src/renderer/src/stores/session/session.ts`、`src/renderer/src/components/proposal/ProposalDetailSlideover.vue`、`src/renderer/src/components/chat/event/ChatProposalPanel.vue`、`src/renderer/src/pages/proposal.vue`。
- MUST 让 Lineage Browser 仅以当前 Workspace subjects 作为列表来源，并让每个 proposal node 携带完整 `ProposalRef`、owner Folder metadata 与 composite key；详情入口必须按该 `ProposalRef` 打开正确 repository owner，不得按裸 `changeId` 匹配。Workspace 切换后的迟到 lineage 响应必须丢弃，共享 Folder 的 proposal 只能使用当前 Workspace subject/reference 补充 task/session 信息，不得读取其他 Workspace 的 subject 内容。证据：`src/renderer/src/stores/insight/lineage.ts`、`src/renderer/src/pages/lineage.vue`、`src/renderer/src/composables/useProposalDetailSlideover.ts`、`src/main/services/insight/lineage/browser.ts`。

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
