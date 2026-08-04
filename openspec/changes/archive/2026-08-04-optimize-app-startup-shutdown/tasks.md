## 1. 建立可观测且集中可发现的 lifecycle 基础

- [x] 0.1 在 `src/main/index.ts` 的单实例锁前，仅对 `!app.isPackaged` 幂等创建 `<worktree>/data` 并调用 `app.setPath("userData", devDataRoot)`；生产模式不得覆盖默认路径。保持 dev userData 准备先于 `requestSingleInstanceLock()`，锁仍先于 bootstrap、migration 与业务 app-data writer。
- [x] 0.2 扩展 `test/main/index.spec.ts`，覆盖生产模式不设置路径、dev 目录创建与 `setPath` 先于锁、同 worktree 稳定路径，以及准备失败不回退生产目录且不加载 bootstrap；断言锁失败路径仍只退出并保留 second-instance 既有顺序。
- [x] 0.3 更新 `guidelines/MainProcess.md`，记录 main entry 允许的 Node 内建依赖、dev userData/单实例域边界和锁前唯一允许的目录副作用；运行聚焦 main entry 测试、typecheck 与 lint，不直接或间接运行 `pnpm build`。

- [x] 1.1 新增 `src/main/bootstrap/startup-metrics.ts`，以 monotonic clock 实现预定义 startup/shutdown phase 的 `mark`/`measure`/result 日志；在 `src/main/index.ts` 取得 process-entry 与 single-instance-lock 时间，并用测试证明日志不会包含 path、argv、Agent command、token 或任意 payload。
- [x] 1.2 扩展 `src/main/bootstrap/lifecycle.ts`，先新增固定 phase、named task、同 phase `Promise.allSettled()`、单一可覆盖 deadline 与 force hook runner及对应测试；本阶段保留旧 `registerDisposable()`/`disposeAll()` 兼容路径，直到 7.4 已接入全部资源并切换 `before-quit` 后再删除，避免实施中间状态失去清理保障。
- [x] 1.3 新增 `src/main/bootstrap/README.md`，用 Mermaid 和 phase 表完整记录 startup shell → required gate → runtime wiring → renderer critical/background → warmup，以及 snapshot-and-hide → quiesce → terminate → finalize；列出新增 startup/shutdown task checklist、允许依赖、禁止 deep registration/import side effect 的反例。

## 2. 实现轻量品牌 startup shell

- [x] 2.1 新增 `src/renderer/startup.html`、共享的极小 startup token/CSS 文件，并在 `electron.vite.config.ts#renderer.build.rollupOptions.input` 注册 `startup` entry；页面只引用生成的 `/icon.svg` 和静态 CSS，呈现中心 FylloCode Logo、低对比环形轨道、短 teal 高亮弧与轻微 Logo opacity wave，不加载 Vue/Nuxt UI/router/store，不显示百分比或业务阶段。
- [x] 2.2 在 `src/renderer/startup.html` 实现 `prefers-color-scheme`、`prefers-reduced-motion`、`role="status"`、`aria-live="polite"`、`aria-busy` 与“正在启动 FylloCode…”状态；增加聚焦的静态页面测试或构建输入测试，断言 reduced-motion 停止动画、关键非文本边界至少 3:1、Logo 只复用 public asset且没有复制 SVG path。
- [x] 2.3 新增 `src/renderer/src/components/shared/StartupLoading.vue`，复用共享 startup token/CSS 和既有 `Logo.vue`，实现与 static shell 一致的尺寸、surface、环形高亮弧和 reduced-motion 行为；在 `test/renderer/src/components/startup-loading.spec.ts` 覆盖可访问状态、无百分比和必要 class/asset，并保持 `guidelines/UiDesign.md` 的 motion/token 约束。

## 3. 拆分 main startup 并接管同一 BrowserWindow

- [x] 3.1 在 `src/main/bootstrap/window.ts` 增加 startup load target、立即显示和主题 `backgroundColor` 所需的窄 options，保留 launcher/workspace state、安全外链与 navigation guard；在 `test/main/bootstrap/window.spec.ts` 覆盖 dev `/startup.html`、packaged `out/renderer/startup.html`、立即 show/background 和正式 renderer navigation。
- [x] 3.2 新增 `src/main/bootstrap/startup.ts` 的 `StartupWindowController`，负责创建唯一 startup window、提供 first-visible barrier、聚焦/销毁/abort 与正式 renderer load；barrier 在 `did-finish-load` 后下一 event-loop 结算，在 `did-fail-load` 或可注入 `STARTUP_PAGE_BARRIER_TIMEOUT_MS = 1_000` 后保持 background 并结算，且只能结算/执行 handoff 一次。该文件不得静态导入 IPC/service/MCP/ACP runtime，并增加 load failure、timeout、重复 focus、abort 后不导航测试。
- [x] 3.3 在 `src/main/bootstrap/workspace-window-manager.ts` 实现两阶段 `reserveLauncherWindow(window, ownership)`/`activateLauncherContext(window, generation)` 与全局 `prepareForShutdown()`：reserve只转移唯一ownership token和共享mutable `WindowStateController`、不写 `contextsByWebContentsId`；预期formal main-frame generation提交后才授权业务context/fanout。Startup controller在reserve前独占closed/hide/snapshot，交接时解除listeners；唯一close-state writer读取共享state key。测试覆盖startup document在reserve后仍无业务context、错误URL/subframe/generation不能activate、重复接管、状态连续、用户关闭取消handoff，以及startup/manager shutdown snapshot按token去重。
- [x] 3.4 将当前重型 `bootstrapReady()` wiring 移入新增 `src/main/bootstrap/runtime.ts`；保持 migration → validation → MCP/IPC/workflow/event wiring 的安全依赖，确保 bundled MCP不被await。formal renderer导航只在reserve后发生，main-frame generation验证后才activate context；formal renderer load失败走原生错误并退出。将`initBuiltInWorkflows()`改为持有Promise/Abort状态的受管任务并使用原子replace或等价crash-safe模板写入。
- [x] 3.5 将 `src/main/bootstrap/index.ts#startApp()` 保持为轻量顶层 orchestrator：`app.ready` 后立即 create/show 带主题 background 的 startup window，等待 first-visible barrier 结算并进入下一 event-loop 后才启动 shell PATH promise、runtime dynamic import 与 migration；在文件顶部列出 phase 顺序并链接 `src/main/bootstrap/README.md`，不得静态导入 runtime registries。
- [x] 3.6 扩展 `test/main/bootstrap/index.spec.ts` 与 `test/main/index.spec.ts`，断言单实例锁先于 bootstrap、first-visible barrier 前未调用 shell PATH/runtime import/migration、normal runtime晚于gate、static load failure/timeout仍继续gate且不重复handoff、formal renderer load failure显示原生错误并退出、gate failure销毁shell后调用既有原生失败UI，以及启动中shutdown的迟到Promise不注册IPC、不导航、不启动MCP/ACP。增加同窗两次preload执行的focused test，验证navigation后没有遗留/重复`ipcRenderer` listener或stream state。

## 4. 完成单实例、activate 与 required gate 行为

- [x] 4.1 更新 `PrimaryInstanceController`，使 `second-instance` 在窗口创建前合并请求、startup shell 可见期间直接聚焦同一窗口、runtime ready 后委托 `WorkspaceWindowManager`、shutdown fence 后忽略请求；在 `test/main/index.spec.ts` 和 `test/main/bootstrap/index.spec.ts` 覆盖四种状态。
- [x] 4.2 调整 `app.activate` 与 `window-all-closed` wiring：macOS startup期间优先复用shell；用户关闭未reserve的shell时取消其handoff，后续activate/第二实例按gate状态创建新shell或正式Launcher；Windows/Linux无窗口仍请求退出；handoff后沿用Launcher/Workspace manager，shutdown中不重建。增加owner transfer、destroyed-window迟到completion和各平台tests。
- [x] 4.3 更新 `src/main/bootstrap/workspace-upgrade-failure.ts` 的调用边界，使 gate failure 总是先关闭 startup shell再显示原生 dialog，并验证不注册业务 IPC、不启动 bundled MCP/workflow/Agent warmup；保留打开日志目录与退出语义。

## 5. 建立 Renderer critical/background readiness

- [x] 5.1 扩展 `src/renderer/src/bootstrap/core.ts` 的 `FylloBootstrapTask` 为显式 `phase: "critical" | "background"`，返回可观察的 phase status/result；critical 全部结算后再启动 background，并继续按 task 隔离错误、记录名称/phase/duration。更新 `test/renderer/src/bootstrap/fyllo-bootstrap.spec.ts` 覆盖顺序、并发和失败隔离。
- [x] 5.2 将 `src/renderer/src/bootstrap/tasks/workspaces.ts` 标记为 critical，将 `src/renderer/src/bootstrap/tasks/acp-agents.ts` 标记为 background；保持 Workspace task 内 context → list → current Workspace → sessions 的现有顺序，并验证 ACP initialization 不阻塞 critical completion。
- [x] 5.3 修改 `src/renderer/src/main.ts` 与 `src/renderer/src/App.vue`，在 mount 后由 bootstrap phase state控制 `StartupLoading.vue`；critical 未结算时不得渲染 Welcome/Workspace RouterView，结算后显示既有 content/error，background ACP state仅影响局部 UI。增加 App/`pages/index.vue` 测试覆盖无 Welcome flash、critical failure和 background 未完成。
- [x] 5.4 新增 `src/shared/ipc/platform/lifecycle.channels.ts`、`src/main/ipc/platform/lifecycle.ts`、platform registry接线、`src/preload/api/platform/lifecycle.ts`、`src/preload/index.ts`/`index.d.ts`暴露和`src/renderer/src/api/platform/lifecycle.ts` wrapper，实现`window.api.platform.lifecycle.markInteractive()`；main handler必须验证sender属于已激活formal renderer当前main-frame generation后再幂等接受。按现有domain-first IPC/preload/API pattern添加main/preload/renderer tests。
- [x] 5.5 Renderer在critical phase结算并`nextTick()`后发送interactive signal；critical失败但既有可操作错误页已渲染时也发送。main只在formal main-frame `did-finish-load`后创建一次可注入的`RENDERER_INTERACTIVE_FALLBACK_MS = 1_500` timer，并在signal、shutdown、navigation/reload/window destroyed时取消；startup/subframe load不得计时。用fake timers覆盖正常signal、timeout、迟到/错误generation signal、reload、错误页和退出。

## 6. 调整 ACP/MCP 后台启动且保持会话语义

- [x] 6.1 修改 `src/main/services/platform/acp-agent/connection-warmup.ts`，移除首窗后的固定 `setImmediate` 所有权，提供由浅层 runtime 调用的幂等 initial schedule/cancel API；保持 installed/custom discovery、并发限制、失败隔离和 process-pool promise复用，并使用户 probe/chat 直接 process-pool 请求不等待后台队列。
- [x] 6.2 修改 `src/main/bootstrap/runtime.ts` 与 `src/main/infra/mcp/bundled-mcp-host.ts` 接线，确保 host 只在 required gate 通过后后台启动、正式 renderer/interactive 不 await readiness、ACP `newSession` 仍复用现有 readiness promise和 stdio fallback；扩展 `test/main/bootstrap/index.spec.ts` 与 bundled MCP host/session tests验证顺序。
- [x] 6.3 扩展 ACP/MCP 集成风格测试，覆盖 startup shell期间不 spawn、renderer interactive 后warmup、用户请求与warmup同 Agent去重、单 Agent失败不影响 UI，以及 gate failure/启动中退出后无迟到 spawn。

## 7. 集中并行 shutdown orchestration

- [x] 7.1 审计并将 `src/main/services/platform/acp-agent/connection-warmup.ts`、`src/main/infra/process/acp-process-pool.ts`、`src/main/services/session/chat/session-registry.ts`、`src/main/services/insight/lineage/mcp-event-consumer.ts` 中的 `registerDisposable()` import side effect改为显式幂等 `beginShutdown()`/`dispose()`/`forceDispose()` exports；保持 warmup先于process pool quiesce、session cancel和process generation invalidation语义。
- [x] 7.2 将 `src/main/services/proposal/browser/proposal-status-service.ts#unwatchAll()`、lineage watcher dispose、session registry cancel、MCP grant revoke和逐项命名的 startup/warmup fallback timer纳入 quiesce phase；为 `src/main/services/platform/acp-agent/installer.ts` 建立 active `net.fetch` AbortController与 npx/uvx/archive child registry及 `abortActiveAgentOperations()`。审计 Git/detector/archive 解压 child：凡可能跨越 deadline 的进程必须登记，明确有单次 timeout 的短任务则记录有界排除理由；临时文件只在 deadline 内 best-effort 清理，必要时提供下次启动安全清理。
- [x] 7.3 将 `src/main/infra/process/acp-process-pool.ts` 与 `src/main/infra/mcp/bundled-mcp-host.ts` 的 graceful/force teardown接入 terminate phase；两者并行结算，共享 `SHUTDOWN_DEADLINE_MS = 4_000`，并在同一总预算内预留 `FORCE_CONFIRM_RESERVE_MS = 500`。force hook必须 non-hanging，以明确 process group/PID终止进程树并在剩余预算内确认/重试，不能重新分配独立8秒预算。
- [x] 7.4 新增 `src/main/bootstrap/shutdown.ts`，在单一浅层`SHUTDOWN_PHASES`中列出snapshot-and-hide、quiesce、terminate、finalize的全部named task和资源owner/API/force/PID ownership；使用单一绝对deadline且无论force Promise是否pending都在截止时退出。`src/main/bootstrap/index.ts`首次`before-quit`只调用该coordinator。全部资源接线后切换，再删除旧registry；Windows `taskkill`等force动作必须以不依赖父进程继续存活的方式发起。
- [x] 7.5 通过`app.on("browser-window-created")`为每个窗口接入`query-session-end`/`session-end`，全部委托同一个全局幂等且不等待Promise的emergency coordinator；执行shutdown fence、grant revoke、timer cancel和已知ACP/MCP/install child的立即best-effort终止。保持bundled MCP parent-IPC disconnect兜底，并测试多窗口重复事件只触发一次及query/session事件差异。
- [x] 7.6 扩展`test/main/bootstrap/lifecycle.spec.ts`、`test/main/bootstrap/index.spec.ts`、ACP process pool、bundled MCP host、installer、proposal watcher和lineage tests，覆盖窗口立即隐藏、startup/manager ownership去重、state显式保存、quiesce-before-terminate、ACP/MCP并行、force Promise pending/失败仍遵守绝对deadline、重复退出、启动中退出、无迟到spawn和无已知child残留。
- [x] 7.7 将required migration标为protected mutation：未开始时可由startup abort阻止；进入写盘后退出先隐藏/fence并等待既有安全结算点，结算后跳过runtime handoff再开始4秒资源deadline。增加migration关键步骤期间quit、成功/失败结算、迟到continuation无副作用测试；不得借本任务修改migration数据步骤或ledger格式。
- [x] 7.8 在业务`wrapHandler`、stream kit和后台任务提交入口统一拒绝shutdown fence后的Workspace/Proposal/Git/ACP/MCP/workflow新工作；纳管`initBuiltInWorkflows()`等fire-and-forget Promise/Abort状态并测试在途写入安全结算。
- [x] 7.9 新增`test/main/bootstrap/lifecycle-boundaries.spec.mjs`或等价架构测试，扫描`src/main/**`并只允许`src/main/bootstrap/`声明global lifecycle orchestration；禁止service/infra通过`registerDisposable`或等价import side effect决定startup/shutdown顺序。

## 8. 同步规范、工程指南与验证

- [x] 8.1 更新 `guidelines/MainProcess.md`，写明 `bootstrap/index.ts`、`startup.ts`、`runtime.ts`、`shutdown.ts`、`lifecycle.ts` 的canonical职责、phase顺序、同 phase并发、single deadline、deep registration禁令和新增资源接入规则。
- [x] 8.2 更新 `guidelines/RendererProcess.md` 的 critical/background bootstrap contract，更新 `guidelines/UiDesign.md` 的 startup shell/overlay品牌、主题、motion/reduced-motion规则，更新 `guidelines/Testing.md` 的 startup/shutdown顺序、架构边界与残留进程测试位置；必须更新 `guidelines/BrandAssets.md`，明确 static startup consumer可直接复用生成的 public icon、Vue overlay继续使用 `Logo.vue`。
- [x] 8.3 运行 `sh scripts/prepare-worktree-env.sh` 后执行聚焦 main/renderer Vitest、`pnpm typecheck`、`pnpm lint` 和 `pnpm icon:check`；不得因本变更运行全局 `pnpm format`。由于修改 `electron.vite.config.ts` 与 packaged entry，只有在用户针对 Apply 阶段明确授权后才运行 `pnpm build`。
- [x] 8.4 在获得“任何直接或间接执行 `pnpm build` 的命令”授权后，根据当时 `package.json`/`electron-builder.yml` 记录并运行明确的 packaged macOS 构建命令及 `.app` 产物路径。使用隔离 `userData` 与 fixture 验证 migration failure，不得污染真实用户数据；cold 样本每次启动前结束应用并清除测试 profile 的可安全缓存，warm 样本保留同一测试 profile，各至少重复 3 次，从结构化 lifecycle 日志提取 process-entry→startup-visible→interactive 与 quit-requested→windows-hidden→process-exit。退出前记录 Electron PID 以及 ACP/MCP/install child PID/process group，退出后用明确的 PID liveness 命令逐项断言不存在；同时验证深浅主题/reduced-motion、无白闪和第二实例聚焦，并将命令、样本与结果写入实现记录，不将未经测量的数值升级为永久 SLO。
  - 人工验收：当前 Agent 会话运行在 FylloCode `.app` 宿主内，不再启动或终止第二个 packaged 实例；按 `manual-validation.md` 执行并回填结果后再勾选本项。
