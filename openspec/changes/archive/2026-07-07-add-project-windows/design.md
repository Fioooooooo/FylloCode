## Context

FylloCode 当前在 `src/main/bootstrap/index.ts` 中只创建一个 `BrowserWindow`，`src/main/bootstrap/window.ts` 的 `createMainWindow()` 也没有项目上下文入参。窗口状态由 `src/main/infra/storage/window-state-store.ts` 固定读写 `data/window-state/main-window.json`，因此多个窗口会互相覆盖位置和最大化状态。

主进程业务 IPC 多数已经显式传入 `projectId`，这是多窗口的有利基础。真正阻塞多窗口的是窗口和运行时事件层：

- `setupProbeBroadcast(mainWindow)`、`setupAgentEventBroadcast(mainWindow)`、`setupProposalStatusBroadcast(mainWindow)` 都保存单个 `BrowserWindow` 引用。
- `sessionProbeRegistry` 以 `agentId` 为 key，不区分项目。
- `proposalStatusService` 以 `changeId` 为 watcher key，不区分项目。
- `ChatStreamChannels.streamCancel` 只带 `sessionId`，`ProposalChannels.stageStreamCancel` 只带 `runId`。
- renderer bootstrap 使用 `Promise.allSettled()` 并行执行 task，不能依赖一个新 task 先于 `projects` task 完成。

该设计遵守现有分层：Electron 窗口生命周期留在 `src/main/bootstrap`，IPC handler 通过 `_kit` 校验和 `wrapHandler` 返回，renderer 通过 `src/renderer/src/api/**` wrapper 访问 preload API。

## Goals / Non-Goals

**Goals:**

- 一个项目最多对应一个 project window，重复打开同一项目聚焦已有窗口。
- 启动时提供一个无项目 launcher window，用于打开文件夹和最近项目。
- project window 的当前项目来自 main 进程窗口绑定，而不是 renderer 自行切换。
- project-scoped 事件、watcher、probe 和 stream cancel 必须按项目隔离。
- global agent 事件广播到所有窗口。
- launcher 和每个 project window 独立保存并恢复窗口状态。
- 打开文件夹对话框必须以发起窗口作为 parent。
- 保持现有项目数据目录、项目 ID 编码和大多数业务 IPC 参数化方式。

**Non-Goals:**

- 不支持同一项目多个窗口。
- 不实现多项目 tab、跨窗口拖拽或跨窗口同步 UI 状态。
- 不在首版自动恢复上次打开的所有项目窗口集合；启动默认打开 launcher。
- 不引入 feature flag 双模式；测试和实现以新窗口模型为目标。
- 不改变项目路径编码规则，也不处理项目路径迁移导致的稳定 ID 设计问题。

## Decisions

### 1. 主进程拥有窗口事实，renderer 只消费窗口上下文

新增 `src/main/bootstrap/project-window-manager.ts`。它维护：

- `projectId -> BrowserWindow`
- `webContents.id -> WindowContext`
- launcher window 引用
- 最近聚焦窗口时间，用于 macOS activate 聚焦已有窗口

核心 API：

- `openLauncherWindow()`
- `openProjectWindow(projectId, sourceWebContents?)`
- `focusProjectWindow(projectId)`
- `getContextByWebContents(webContents)`
- `sendToProject(projectId, channel, payload)`
- `sendToAll(channel, payload)`
- `cleanupProjectRuntime(projectId)`

替代方案是让 renderer 通过 URL query/hash 决定自己的项目。该方案不采用，因为窗口唯一性、聚焦已有窗口、关闭清理和事件 fanout 都必须由 main 进程裁决；renderer 只能消费 main 返回的 `WindowContext`。

### 2. launcher 可以复用为 project window，但 project window 不允许重绑

规则：

- 启动时创建 launcher。
- launcher 打开未打开项目时，main MAY 复用当前 launcher，把该窗口绑定为 project window，并返回 `bound-current`。
- launcher 打开已打开项目时，main 聚焦已有 project window，launcher 保持 launcher。
- project window 打开任何其他项目时，main 创建或聚焦目标 project window，当前 project window 的绑定不变。

替代方案是始终新建 project window 并保留 launcher。该方案更简单，但用户首次打开项目会留下一个多余 launcher。允许 launcher 复用可以保持单项目用户的窗口数量接近当前体验。为了避免旧异步请求回写，renderer 在处理异步结果前必须检查请求时的 `windowContext.projectId` 是否仍匹配当前窗口上下文。

### 3. 窗口上下文通过 IPC 握手获取

新增 `WindowChannels.getContext`、`WindowChannels.openProject`、`WindowChannels.openFolder`、`WindowChannels.openLauncher`。`getContext` 通过 `BrowserWindow.fromWebContents(event.sender)` 或 manager 的 `webContents.id` 映射返回：

```ts
type WindowContext =
  | { windowId: number; role: "launcher"; projectId: null }
  | { windowId: number; role: "project"; projectId: string };
```

替代方案是把 `projectId` 写入 URL query/hash。该方案不采用为主路径，因为 renderer 使用 `createWebHashHistory()`，dev/prod URL 处理差异会增加不必要的耦合；IPC 握手与既有 preload/API 模式一致。URL 可作为调试信息，但不能成为唯一上下文来源。

### 4. 窗口上下文初始化合并进 projects bootstrap 流程

`src/renderer/src/bootstrap/core.ts` 使用 `Promise.allSettled()` 并行运行所有 task。不能新增一个 `window-context` task 并假设它先于 `projects` task 完成。

调整 `src/renderer/src/bootstrap/tasks/projects.ts`：由该 task 统一完成项目列表加载、窗口上下文读取、项目绑定和 session 加载。`useProjectStore` 暴露内部方法，例如 `bootstrapWindowProject()` 或 `bindCurrentProject(project)`，只允许 bootstrap 和 window open result 调用。

### 5. 窗口状态按窗口上下文分文件保存

`window-state-store.ts` 改为支持：

- launcher：`data/window-state/launcher.json`
- project：`data/window-state/projects/<projectId>.json`

API 使用结构化 key：

```ts
type WindowStateKey = { role: "launcher" } | { role: "project"; projectId: string };
```

保留 `resolveMainWindowState()` 和 `captureMainWindowState()` 的屏幕 bounds clamp 逻辑。新文件不存在时，launcher 可 fallback 读取旧 `main-window.json`；不主动删除旧文件，降低迁移风险。

### 6. 事件分三类路由

- 发起窗口定向：MessagePort stream、openDevTools、open folder dialog。使用 `event.sender` 或 parent window。
- 项目定向：chat probe update、proposal status changed、project watcher cleanup。使用 `sendToProject(projectId, channel, payload)`。
- 全局广播：ACP registry/status/install/uninstall、agent unavailable。使用 `sendToAll(channel, payload)`。

三处现有 `setup*Broadcast` 不再接收 `BrowserWindow`。它们只订阅事件源一次，并通过 `ProjectWindowManager` 发送。IPC 文件不得再保存单个 `BrowserWindow` 作为广播目标。

### 7. 运行时 registry key 必须包含项目维度

仅做事件路由不够，registry 内部 key 也必须项目化：

- `sessionProbeRegistry` key 从 `agentId` 改为 `${projectId}::${agentId}` 或 `${projectPath}::${agentId}`。`probeCloseInputSchema` 和 `probeSetConfigOptionInputSchema` 增加 `projectId`，`SessionProbeUpdatePayload` 增加 `projectId`。
- `proposalStatusService.watches` key 从 `changeId` 改为至少 `${projectPath}::${changeId}`；若同一项目同一 change 允许多个 session 订阅，则底层 watcher 可共享，payload 必须保留 `sessionId`。
- `sessionRegistry` 的 chat/apply cancel key 使用项目复合 key：chat 使用 `${projectId}:${sessionId}`，apply 使用 `${projectId}:${runId}`。archive 已使用 `${projectId}:${changeId}`，保持。

### 8. 项目窗口关闭触发项目级 runtime cleanup

当 project window 关闭且该项目没有其他窗口时，manager 调用项目级清理：

- `proposalStatusService.unwatchProject(projectPath)`
- `sessionProbeRegistry.deleteProject(projectId 或 projectPath)`
- `sessionRegistry.cancelProject(projectId)`
- lineage MCP event consumer 若已按 `projectPath` 管理 consumer，则补充或复用项目级 dispose API

这些 API 不应关闭全局 ACP agent process pool。ACP 进程池首版继续按 `agentId` 共享，因为 ACP session 本身以 `cwd` 和 sessionId 隔离；仅 registry 与事件 payload 项目化。

### 9. 打开文件夹合并到 window API

现有 `ProjectChannels.openFolder` 可以保留为“选择并 adopt 项目”的兼容能力，但 renderer 主路径迁移到 `WindowChannels.openFolder`：

1. handler 使用 `BrowserWindow.fromWebContents(event.sender)` 作为 `dialog.showOpenDialog(parentWindow, options)` 的 parent。
2. 调用 `adoptExistingFolder(path)`。
3. 交给 `ProjectWindowManager.openProjectWindow(project.id, event.sender)` 创建、绑定或聚焦窗口。

### 10. 项目删除和路径缺失

打开项目窗口前必须校验项目存在且路径可访问。路径缺失时返回项目路径缺失错误，不创建新窗口。

删除项目时，如果该项目窗口已打开，先关闭或解绑该窗口，再删除项目 meta。首版建议关闭窗口并清理 runtime；不将 project window 静默转为 launcher，避免窗口内容与项目数据不一致。

## Risks / Trade-offs

- [风险] launcher 复用后旧异步请求回写到新项目窗口 → [缓解] 每个异步加载保存请求时的 `windowContext.projectId` 快照，完成时不一致则丢弃。
- [风险] 遗漏某个模块级 `Map` 继续按非项目 key 串扰 → [缓解] 实施阶段搜索 `new Map`、`registry`、`watch`、`cancel`，对每个 runtime key 做项目维度审计；任务中列出必须修改的 registry。
- [风险] 过度广播导致 renderer 状态污染 → [缓解] project-scoped 事件在 main 层定向发送；renderer 订阅侧再按 `projectId` 防御性过滤。
- [风险] 旧窗口状态丢失 → [缓解] launcher 新状态不存在时 fallback 读取旧 `main-window.json`；不删除旧文件。
- [风险] ACP process pool 继续按 agent 共享，一个 agent 崩溃会影响所有项目 → [缓解] 本次不拆 process pool，但 agent unavailable 作为全局事件广播，并逐项目清理 probe；若需要进程级隔离，后续单独提案。
- [权衡] 不做 feature flag 双模式 → 让实现和测试矩阵更简单，但需要更完整的单元和手工 QA 覆盖单窗口常见流程。

## Migration Plan

1. 先新增窗口 manager、window API 和 window state key，但保持启动只创建 launcher。
2. 再迁移 renderer 打开项目入口，使打开项目走 `WindowChannels.openProject/openFolder`。
3. 然后替换三处单窗口广播，完成 project/global fanout。
4. 最后项目化 probe/proposal/session registry key 和 cancel schema。
5. 迁移窗口状态时只读 fallback，不删除旧 `main-window.json`。如需回滚，旧文件仍可被旧版本读取。

## Open Questions

无阻塞问题。首版明确不恢复上次所有项目窗口、不做同项目多窗口、不做 feature flag 双模式。
