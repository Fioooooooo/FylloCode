## 1. 窗口状态与窗口管理基础设施

- [x] 1.1 扩展 `src/main/infra/storage/window-state-store.ts`：新增 `WindowStateKey`、`loadWindowState(key)`、`saveWindowState(key, state)`，路径分别为 `window-state/launcher.json` 和 `window-state/projects/<projectId>.json`；保留 `resolveMainWindowState()`、`captureMainWindowState()`、`isSafeExternalUrl()` 相关测试可复用的导出；验收标准是旧 `main-window.json` 在 launcher 新状态不存在时可作为 fallback 且不会被删除。
- [x] 1.2 更新 `test/main/infra/storage/window-state-store.spec.ts`：覆盖 launcher/project 分文件读写、无效状态回退、旧 `main-window.json` fallback、项目 A/B 状态互不覆盖。
- [x] 1.3 新增 `src/main/bootstrap/project-window-manager.ts`：实现 `openLauncherWindow()`、`openProjectWindow(projectId, sourceWebContents?)`、`focusProjectWindow(projectId)`、`getContextByWebContents(webContents)`、`sendToProject(projectId, channel, payload)`、`sendToAll(channel, payload)`、`cleanupProjectRuntime(projectId)`；manager 内维护 `projectId -> BrowserWindow` 与 `webContents.id -> WindowContext`，并在窗口 `closed` 时注销。
- [x] 1.4 新增 `test/main/bootstrap/project-window-manager.spec.ts`：mock `BrowserWindow`，验证 launcher 唯一性、同项目重复打开只聚焦、不同项目创建不同窗口、project window 打开其他项目不重绑、关闭窗口清理映射、`sendToProject` 不向其他项目发送。
- [x] 1.5 改造 `src/main/bootstrap/window.ts`：将 `createMainWindow()` 演进为可被 manager 调用的 `createFylloWindow(options)` 或等价窄接口，保留现有外部链接拦截、`will-navigate` 防护、macOS titlebar、Linux icon、dev/prod load 逻辑，并按 `WindowStateKey` 读取和保存窗口状态。
- [x] 1.6 更新 `test/main/bootstrap/window.spec.ts`：保留 `resolveMainWindowState()`、`captureMainWindowState()`、`isSafeExternalUrl()` 覆盖，并新增按 state key 传入窗口状态的窗口工厂行为测试。

## 2. 主进程生命周期与窗口 IPC

- [x] 2.1 改造 `src/main/bootstrap/index.ts`：app ready 后初始化 `ProjectWindowManager`，只创建 launcher window；`activate` 在无窗口时创建 launcher，在已有窗口时聚焦最近活跃窗口；`window-all-closed` 和 `before-quit` 语义保持现有平台行为。
- [x] 2.2 新增 `src/shared/types/window.ts`：定义 `WindowContext`、`OpenProjectWindowResult`、`OpenFolderWindowResult`，其中 open result 明确区分 `bound-current`、`created`、`focused-existing` 和 `cancelled`。
- [x] 2.3 在 `src/shared/types/channels.ts` 新增 `WindowChannels`：`getContext`、`openProject`、`openFolder`、`openLauncher`，命名保持 `window:<action>` 风格。
- [x] 2.4 新增 `src/shared/schemas/ipc/window.ts`：定义 `getContext` 无输入约束、`openProjectInputSchema`、`openFolderInputSchema`、`openLauncherInputSchema`，并导出对应 zod 类型；`openProjectInputSchema` 至少包含 `projectId: z.string().min(1)`。
- [x] 2.5 新增 `src/main/ipc/window.ts` 并在 `src/main/ipc/index.ts` 注册：所有 handler 使用 `wrapHandler` 和 `validate`；`getContext` 通过 `event.sender` 反查窗口上下文；`openProject` 校验项目存在和路径状态后调用 manager；`openFolder` 用 `BrowserWindow.fromWebContents(event.sender)` 作为 `dialog.showOpenDialog(parentWindow, options)` 的 parent，再调用 `adoptExistingFolder()` 与 manager。
- [x] 2.6 新增 `test/main/ipc/window.spec.ts`：覆盖 `getContext` 返回 launcher/project、`openProject` 聚焦已有项目、`openProject` 路径缺失时不创建窗口、`openFolder` 取消时返回 cancelled、`openFolder` 使用发起窗口作为 dialog parent。

## 3. Preload 与 Renderer Window API

- [x] 3.1 新增 `src/preload/api/window.ts`，通过 `ipcRenderer.invoke(WindowChannels.*)` 暴露 `getContext()`、`openProject(projectId)`、`openFolder()`、`openLauncher()`，返回标准 `IpcResponse<T>`。
- [x] 3.2 更新 `src/preload/index.ts` 与 `src/preload/index.d.ts`：在 `window.api` 中新增 `window` 命名空间，并保持现有 API 类型不破坏。
- [x] 3.3 新增 `test/preload/api/window.spec.ts`：断言每个 preload 方法调用正确 channel 和 payload。
- [x] 3.4 新增 `src/renderer/src/api/window.ts`：提供 renderer wrapper，不允许组件和 store 直接调用 `window.api.window`；返回类型使用 shared `WindowContext` 和 open result 类型。

## 4. Renderer 项目绑定与打开项目语义

- [x] 4.1 改造 `src/renderer/src/stores/project.ts`：新增 `windowContext`、`bootstrapWindowProject()`、`bindCurrentProject(project)`、`openProjectWindow(projectId)`、`openFolderWindow()`；`openRecentProject()` 和 `openFolder()` 改为调用 window API，不再直接 `activateProject()` 替换当前窗口项目。
- [x] 4.2 改造 `src/renderer/src/bootstrap/tasks/projects.ts`：在同一个 projects bootstrap task 内按顺序完成 `loadProjects()`、`windowApi.getContext()`、project context 加载、`setCurrentProject()` 和 session 加载；不得新增依赖执行顺序的独立窗口上下文 task。
- [x] 4.3 改造 `src/renderer/src/components/layout/AppHeader.vue`：最近项目下拉项调用 `projectStore.openProjectWindow(project.id)`；当前 project window 打开其他项目后当前窗口不跳转、不清空 session；打开文件夹入口调用 `openFolderWindow()`。
- [x] 4.4 改造 `src/renderer/src/components/welcome/WelcomeView.vue` 和 `src/renderer/src/components/welcome/ProjectList.vue`：launcher 中打开文件夹或最近项目走 window API；处理 `bound-current` 时绑定当前项目并导航默认页，处理 `focused-existing` 时保持 launcher 状态。
- [x] 4.5 改造 `src/renderer/src/pages/index.vue`：继续用 `projectStore.hasCurrentProject` 做项目路由门控；当 project context 加载失败或项目路径缺失时展示明确错误状态和返回 launcher/关闭窗口操作，不展示过期项目数据。
- [x] 4.6 更新 `test/renderer/src/stores/project.spec.ts`、`test/renderer/src/components/app-header.spec.ts`、`test/renderer/src/components/welcome/*.spec.ts`：覆盖 launcher context 不设置 currentProject、project context 自动绑定、打开最近项目调用 window API、project window 打开其他项目不改变当前项目。

## 5. 事件 Fanout 与全局广播

- [x] 5.1 改造 `src/main/ipc/chat.ts` 的 `setupProbeBroadcast`：删除 `probeBroadcastWindow` 单窗口引用，订阅 `sessionProbeBus.onUpdate` 后根据 payload 的 `projectId` 调用 `ProjectWindowManager.sendToProject()`。
- [x] 5.2 改造 `src/main/ipc/proposal.ts` 的 `setupProposalStatusBroadcast`：删除 `proposalStatusBroadcastWindow` 单窗口引用，按 payload 的 `projectId` 或由 `projectPath` 解析出的项目发送到对应 project window。
- [x] 5.3 改造 `src/main/ipc/acp-agents.ts` 的 `setupAgentEventBroadcast`：删除 `agentEventWindow` 单窗口引用，registry/status/install/uninstall/agentUnavailable 事件调用 `ProjectWindowManager.sendToAll()`。
- [x] 5.4 调整 `src/main/bootstrap/index.ts` 中的广播 setup 调用：在 app ready 后只订阅一次事件源，不再为每个窗口调用 `setup*Broadcast(window)`。
- [x] 5.5 更新 `test/main/ipc/chat.spec.ts`、`test/main/ipc/proposal.spec.ts`、`test/main/ipc/acp-agents.test.ts`：断言 project-scoped 事件只发目标窗口，全局 agent 事件发所有窗口，窗口销毁后不发送。

## 6. Runtime Registry 项目隔离

- [x] 6.1 改造 `src/main/services/chat/session-probe-registry.ts`：key 改为 project+agent 复合 key；新增 `deleteProject(projectIdOrPath)`；`toProbeSnapshot()` 保持返回 snapshot 内容，同时 registry API 支持按项目读取/删除。
- [x] 6.2 改造 `src/main/services/chat/session-probe-service.ts` 和 `src/shared/schemas/ipc/chat.ts`：`probeCloseInputSchema`、`probeSetConfigOptionInputSchema` 增加 `projectId`；`ensureProbe`、`closeProbe`、`setProbeConfigOption` 使用项目复合 key；`SessionProbeUpdatePayload` 增加 `projectId`。
- [x] 6.3 更新 renderer chat API 和 session store：`src/preload/api/chat.ts`、`src/preload/index.d.ts`、`src/renderer/src/api/chat.ts`、`src/renderer/src/stores/session.ts` 的 probe close/setConfigOption/update payload 传递和过滤 `projectId`。
- [x] 6.4 改造 `src/main/services/proposal/proposal-status-service.ts`：watch key 至少包含 `projectPath` 和 `changeId`；`ProposalStatusChangedPayload` 增加 `projectId`；新增 `unwatchProject(projectPath)`。
- [x] 6.5 改造 `src/main/ipc/proposal.ts` 的 `watch` handler：调用 `proposalStatusService.watchProposal()` 时传入 `projectId`、`project.path`、`changeId`、`sessionId`，并保持项目不存在时抛 `PROJECT_NOT_FOUND`。
- [x] 6.6 更新 `test/main/services/chat/session-probe-registry.spec.ts`、`test/main/services/chat/session-probe-service.spec.ts`、`test/main/services/proposal/proposal-status-service.spec.ts`：覆盖同 agent 不同项目互不覆盖、同 changeId 不同项目 watcher 互不替换、项目关闭时能清理项目 watcher/probe。

## 7. Stream Cancel 与项目级清理

- [x] 7.1 改造 `src/shared/schemas/ipc/chat.ts` 的 `streamCancelInputSchema`：增加 `projectId`；改造 `src/main/ipc/chat.ts` 的 stream register/cancel key 为 `${projectId}:${sessionId}`；同步更新 `src/renderer/src/api/chat.ts` 和调用处。
- [x] 7.2 改造 `src/shared/schemas/ipc/proposal.ts` 的 `stageStreamCancelInputSchema`：增加 `projectId`；改造 `src/main/ipc/proposal-apply.ts` 的 apply stream register/cancel key 为 `${projectId}:${runId}`；archive 继续使用 `${projectId}:${changeId}`。
- [x] 7.3 扩展 `src/main/services/chat/session-registry.ts`：新增 `cancelProject(projectId)` 或等价按项目取消 API，并确保 `cancelAll()` 仍用于 app 退出。
- [x] 7.4 补充 lineage MCP event consumer 项目级释放 API：在 `src/main/services/lineage/mcp-event-consumer.ts` 中新增或复用 `disposeProject(projectPath)`，由 `ProjectWindowManager.cleanupProjectRuntime(projectId)` 调用。
- [x] 7.5 更新 `test/main/ipc/chat.spec.ts`、`test/main/ipc/proposal-apply.spec.ts`、`test/main/services/chat/session-registry.spec.ts`、`test/main/services/lineage/mcp-event-consumer.spec.ts`：覆盖相同 `sessionId`/`runId` 在不同项目中取消互不影响，项目窗口关闭时只清理该项目 runtime。

## 8. 项目删除、路径缺失与错误状态

- [x] 8.1 改造 `src/main/services/project/project-service.ts`：新增或复用路径存在检查，提供给 window handler 判断项目路径缺失；删除项目时调用窗口管理能力关闭或阻止已打开 project window，避免窗口继续展示已删除项目。
- [x] 8.2 改造 `src/main/ipc/project.ts` 或新增 window handler 调用路径：`removeProject` 对打开窗口的项目执行关闭/清理策略；如果选择阻止删除，返回明确错误码和消息。
- [x] 8.3 更新 renderer 错误 UI：project context 加载到缺失路径或项目不存在时，使用现有 `AppEmptyState` 或页面级错误状态展示发生了什么和下一步操作。
- [x] 8.4 更新 `test/main/services/project/project-service.spec.ts`、`test/main/ipc/project.spec.ts` 或 `test/main/ipc/window.spec.ts`、对应 renderer 测试：覆盖路径缺失不创建窗口、删除打开项目时窗口不会继续持有 currentProject。

## 9. 文档、准则与验证

- [x] 9.1 更新 `guidelines/MainProcess.md`：在 bootstrap/IPC 边界中记录多窗口约定，明确 Electron `BrowserWindow` 只能由 bootstrap/window manager 和 IPC fanout 层持有，project-scoped 事件不得保存单个全局窗口引用。
- [x] 9.2 更新 `guidelines/RendererProcess.md`：记录 renderer 当前项目来自窗口上下文，打开项目入口必须走 renderer window API，不得在组件中直接替换 `currentProject`。
- [x] 9.3 更新 `guidelines/Testing.md`：补充多窗口相关主进程测试位置和 renderer window context 测试建议。
- [x] 9.4 运行主进程聚焦测试：`pnpm exec vitest run --project main test/main/infra/storage/window-state-store.spec.ts test/main/bootstrap/window.spec.ts test/main/bootstrap/project-window-manager.spec.ts test/main/ipc/window.spec.ts`。
- [x] 9.5 运行运行时隔离测试：`pnpm exec vitest run --project main test/main/services/chat/session-probe-registry.spec.ts test/main/services/proposal/proposal-status-service.spec.ts test/main/ipc/chat.spec.ts test/main/ipc/proposal-apply.spec.ts`。
- [x] 9.6 运行 renderer 测试：`pnpm exec vitest run --project renderer test/renderer/src/stores/project.spec.ts test/renderer/src/components/app-header.spec.ts`。
- [x] 9.7 运行质量门禁：`pnpm lint`、`pnpm typecheck`、`pnpm test`。
- [x] 9.8 手工 QA：启动显示 launcher；打开项目 A 后进入项目窗口；从 A 打开 B 后 A/B 两个窗口互不影响；再次打开 A 聚焦已有窗口；A/B 使用同一 agent 的 draft probe 互不覆盖；A/B 同名 proposal status 不串扰；关闭重开项目 A 恢复 A 的窗口状态。

## 10. Code review bug fixes

- [x] 10.1 修复删除项目和关闭项目窗口时 runtime cleanup 与项目 meta 删除之间的竞态，确保 proposal watcher 和 lineage consumer 能按项目 path 清理且不会重复清理。
- [x] 10.2 修复同一项目多个 session watch 同一 `changeId` 时 proposal status 只发最后一个 session 的问题。
- [x] 10.3 修复同一 agent 跨项目并发 draft probe 时 pending handler 被覆盖的问题。
- [x] 10.4 修复聚焦已有 project window 时最小化窗口不会恢复的问题。
- [x] 10.5 运行 bugfix 相关回归测试和质量门禁。

## 11. Review follow-up fixes

- [x] 11.1 修复删除最后一个已打开项目时非 macOS 直接退出的问题，删除动作完成后应保留或打开 launcher。
- [x] 11.2 修复 `listProjects()` 不返回 `pathMissing`，让最近项目列表能提前识别缺失路径。
- [x] 11.3 修复 `AppHeader` 和 `WelcomeView` 打开最近项目时绕过 `openRecentProject()` 的路径缺失前置提示。
- [x] 11.4 修复 `unwatchProposal(projectPath, changeId)` 无 `sessionId` 时漏清 pending watch，以及 `unwatchProject()` 与 pending watch 启动阶段的竞态。
- [x] 11.5 运行 review follow-up 相关回归测试和质量门禁。
