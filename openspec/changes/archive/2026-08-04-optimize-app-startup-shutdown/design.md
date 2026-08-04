## Context

当前 main 入口 `src/main/index.ts` 在取得单实例锁后动态加载 `@main/bootstrap`，但该 bootstrap chunk 静态包含 IPC registries、services、ACP process pool、bundled MCP host 和 migration 等完整依赖图。`bootstrapReady()` 随后依次等待 shell PATH、全部 migration 与 required cutover 校验，才创建 `show: false` 的 Launcher BrowserWindow；窗口又等待正式 Vue renderer 的 `ready-to-show` 才显示。ACP warmup 虽然不被 `bootstrapReady()` await，但会在首窗创建后的下一轮 event loop 启动，可能与正式 renderer 首帧和 Workspace bootstrap 竞争资源。

Renderer 当前先 mount 完整应用，再以 `Promise.allSettled()` 并行运行 Workspace 与 ACP bootstrap task。Workspace context 尚未返回时 `currentWorkspace` 为 `null`，页面可能短暂显示 Launcher Welcome，而不是明确的应用启动状态。

退出路径在 `before-quit` 中阻止默认退出，然后调用 `disposeAll()`。现有 lifecycle 依赖模块加载时的深层 `registerDisposable()` 副作用，以逆注册顺序逐个 await，每项拥有独立 8 秒超时；任务顺序难以从一个入口审查，新增 disposer 也可能扩大总退出时间。完成后调用 `app.exit()` 立即终止，因此窗口状态和紧急强制清理不能依赖后续 Electron quit 事件。

现有硬约束包括：单实例锁先于 bootstrap 和业务 app-data writer；开发模式可在锁前幂等创建当前 worktree 的 `data/` 根目录并将其设为 Electron `userData`，但不得写入其业务子目录；required cutover 未通过时不得启动 normal runtime；ACP warmup 与 bundled MCP readiness 不得阻塞可用窗口；退出必须停止 detached ACP/MCP 子进程；窗口生命周期仍归 bootstrap/window manager；品牌图形必须复用生成的 `src/renderer/public/icon.svg`，不得复制 SVG path。

## Goals / Non-Goals

**Goals:**

- 在 `app.ready` 后尽快提供稳定、品牌一致的可见反馈，即使 shell profile、migration 或外部进程启动很慢。
- 保留 required migration/cutover 的数据安全门禁；startup shell 只提供视觉反馈，不成为 Launcher 或业务 runtime。
- 将 main 与 renderer 启动拆成可命名、可观测、可测试的阶段，避免非关键任务重新进入首显或 interactive 关键路径。
- 复用同一 BrowserWindow 从 startup shell 平滑切换到正式 renderer，并覆盖第二实例、activate、启动失败与启动中退出。
- 将 shutdown 改为浅层集中声明的固定阶段；同阶段独立任务并行，跨阶段依赖显式，总等待使用单一 deadline。
- 用 `src/main/bootstrap/README.md`、相关 guidelines、入口注释和顺序测试固化新增 startup/shutdown task 的规则。

**Non-Goals:**

- 不修改 migration 脚本内容、Workspace/Folder 持久化结构或 required gate 的通过条件。
- 不让 startup shell 展示精确进度、migration 明细、可取消操作或业务错误恢复入口。
- 不取消 ACP 全局预热，也不改变 Agent session、MCP transport、IPC 业务输入输出。
- 不在本次变更中引入 last-known-good PATH 缓存或新的 shell environment 外部依赖。
- 不以 dev server 的耗时替代 packaged application 性能结论，也不承诺从操作系统图标点击瞬间开始的应用内精确计时。

## Decisions

### 0. 开发模式在锁前按 worktree 隔离 Electron userData

`src/main/index.ts` 在调用 `app.requestSingleInstanceLock()` 前读取 `app.isPackaged`。生产模式不调用 `app.setPath()`，继续使用 Electron 默认 `userData`，因此已安装应用保持全局单实例。开发模式以 `process.cwd()` 对应当前 `pnpm dev` worktree 根目录，将 `<worktree>/data` 幂等创建后通过 `app.setPath("userData", devDataRoot)` 设置为 Electron `userData`，然后再申请锁。Electron 的 ProcessSingleton 因此按该目录形成以下边界：

- 同一 worktree 的多个 dev 进程共享一个锁，后启动者仍立即退出并请求主实例窗口注意力。
- 不同 worktree 的 dev 进程使用不同锁，可并行运行。
- dev 与使用系统默认 `userData` 的打包应用使用不同锁，可并行运行。

锁前允许的文件系统副作用仅限 `mkdir(<worktree>/data, recursive)`；不得在此阶段创建或读取 settings、Workspace、migration、session、ACP 等业务子目录，也不得加载 `@main/bootstrap`。`data/` 已经是现有 dev 业务数据根且被 gitignore，因此该设置不迁移、不复制、不改变既有 dev 数据格式。目录创建或 `app.setPath()` 失败时入口直接失败并保留终端错误，不回退到生产 `userData`，避免意外与已安装应用抢锁或写入其数据。

`src/main/index.ts` 仍保持最小门禁，只允许静态依赖 Electron `app` 与用于准备路径的 Node `fs`/`path` 内建模块；dev userData 设置必须位于 process-entry 计时之后、single-instance-lock 计时之前。使用 `app.isPackaged` 而不是 renderer URL 或 `NODE_ENV`，使判定与项目其余 `is.dev` 语义一致。

替代方案是在 `pnpm dev` 外层脚本传递环境变量；拒绝该方案，因为直接运行 electron-vite 或 IDE debug 时容易绕过，且会把安全关键的锁命名空间分散到 package script。替代方案是在 bootstrap 中设置 `userData`；拒绝该方案，因为此时 Electron 已经申请锁，无法解决 dev 与打包应用的冲突。

### 1. 保持 bootstrap 入口浅层且让顺序显式可见

`src/main/bootstrap/index.ts` 继续是 `startApp()`、Electron app event 与顶层启动顺序的唯一入口，但必须保持轻量，不得静态导入完整 IPC/service runtime。跨模块编排只允许位于以下一层目录文件：

- `src/main/bootstrap/index.ts`：单实例 controller 交接、`app.whenReady()`、activate/window-all-closed/before-quit 绑定，以及启动阶段的顶层顺序注释。
- `src/main/bootstrap/startup.ts`：startup shell 创建、首帧等待、required gate 与 runtime handoff。
- `src/main/bootstrap/runtime.ts`：gate 通过后的 IPC/event/workflow/MCP wiring、正式 renderer 导航和 background work 调度。
- `src/main/bootstrap/shutdown.ts`：固定 shutdown phases、总 deadline、force fallback 和阶段耗时。
- `src/main/bootstrap/lifecycle.ts`：阶段/任务类型与通用 runner；不再通过深层模块 import side effect 决定顺序。
- `src/main/bootstrap/README.md`：当前顺序、每阶段允许的任务、依赖规则、新增任务 checklist 与反例。

`index.ts` 顶部保留一段短注释指向 `README.md` 并列出 phase 名称。实际顺序使用显式数组/函数调用表达，不创建 `bootstrap/startup/tasks/**` 或 `bootstrap/shutdown/tasks/**` 之类深层注册目录。

替代方案是保留任意模块调用 `registerDisposable()` 并增加 priority；拒绝该方案，因为 import 顺序仍会隐式影响行为，未来维护者无法从单一入口看到完整生命周期。

### 2. 使用同一个 BrowserWindow 和独立静态 startup HTML

在 `electron.vite.config.ts` renderer input 中增加 `startup: src/renderer/startup.html`。该页面不加载 Vue、Nuxt UI、router、store 或业务脚本，只使用静态 HTML/CSS 和生成的 `/icon.svg`。窗口创建后立即显示，并设置与页面一致、由 `nativeTheme.shouldUseDarkColors` 选择的 `backgroundColor`；不再让首个可见反馈等待正式 renderer 的 `ready-to-show`。

视觉采用中心 FylloCode Logo 与环形不确定进度：低对比度完整轨道上有一个短 teal 高亮弧持续匀速旋转，Logo 仅做很轻的透明度波动；不显示百分比或阶段文案。静态页和 Vue overlay 共享一个不含运行时代码的极小 startup token/CSS 文件，避免两份颜色、尺寸和动画参数漂移；静态页直接读取生成的 `src/renderer/public/icon.svg` 构建副本，Vue overlay 继续通过 `Logo.vue` 使用同一资产，不复制品牌 path，也不修改品牌源资产。loading 容器使用 `role="status"`、`aria-live="polite"` 与 `aria-busy="true"`（或等价语义），可见 Logo/环形关键边界至少达到 3:1 非文本对比度。`prefers-color-scheme` 保持深浅主题，`prefers-reduced-motion: reduce` 时停止旋转/波动并显示静态高亮弧。

startup shell 与正式页面复用现有 preload。虽然 preload 会提前暴露完整 `window.api`，startup HTML 不包含调用脚本，且 main 在 gate 通过前仍不注册业务 handler。采用同窗方案是为了避免双窗口闪烁、焦点竞争、窗口状态跳变和第二实例分流复杂度；preload 的现有构建体积相对完整 Vue renderer 足够小。

### 3. StartupWindow 先独立存在，再由 WorkspaceWindowManager 显式接管

轻量 bootstrap 先通过 `createStartupWindow()` 创建窗口并保留 `StartupWindowController`。required gate 通过且 runtime module 加载后，使用两阶段协议转移所有权，避免仍存活的 startup document 短暂获得业务 sender context：

1. `reserveLauncherWindow(window, ownership)` 只把 BrowserWindow 与共享的 mutable `WindowStateController` 交给 manager，不写入 `contextsByWebContentsId`，也不授权业务 sender。
2. 导航到 dev server `/` 或 packaged `out/renderer/index.html`；startup document 的完整 preload 在此期间仍拿不到 Launcher context。
3. 仅当预期 formal URL 的 main-frame navigation generation 提交后，调用 `activateLauncherContext(window, generation)`，注册唯一 Launcher context并启用 event fanout。
4. 导航期间保持 BrowserWindow 可见，并让正式 Vue 首屏 overlay 使用与 static shell 相同的背景和 loading 视觉，避免白闪或内容跳变。

`StartupWindowController` 在 reserve 前独占 closed/hide/snapshot 与 handoff 取消责任；窗口从创建时即持有唯一 mutable state controller，现有 close-state writer只读取该 controller当前 key，不另装第二个 writer。reserve 时连同 ownership token/state controller 一次性交给 manager并解除 startup listeners，activate 后才由 manager独占保存/关闭责任；shutdown snapshot 同时询问 startup controller 与 manager，并按 ownership token 去重。

启动期间 `PrimaryInstanceController.requestWindowAttention()` 直接聚焦现有 startup window；app ready 后但窗口尚未创建时合并请求。`app.activate` 同样优先复用 startup window。macOS 用户在 gate 期间关闭 startup window时取消该窗口 handoff但不强杀已开始的 protected migration；后续 activate/第二实例若 gate 未完成可创建新的 shell观察同一启动状态，gate 已完成则创建正式 Launcher。Windows/Linux 的 `window-all-closed` 仍请求应用退出。startup window 在 formal main-frame generation 激活前不属于业务 context，因此 gate 失败时不会产生 Launcher context 或业务 sender 授权。

替代方案是创建独立 splash 后销毁并新建 Launcher；拒绝该方案，因为视觉切换、macOS focus、window state 和第二实例路径更复杂。

### 4. Required gate 前只允许 startup shell

`startup.ts` 先创建并立即显示带主题 `backgroundColor` 的 BrowserWindow，再加载 static startup page。只有 first-visible barrier 结算后，才在下一轮 event loop 并行启动 `syncShellPath()` 与 runtime dynamic import，并由 runtime 继续 migration/cutover gate。barrier 由 static page `did-finish-load` 正常结算；`did-fail-load` 或 `STARTUP_PAGE_BARRIER_TIMEOUT_MS = 1_000` 到达时记录失败并保持 BrowserWindow `backgroundColor`，但也必须结算，避免启动永久挂死。`startup-window-created`、`startup-page-loaded` 与 `startup-visible` 分别记录，测试必须证明 barrier 前未调用 PATH、runtime import 或 migration。migration runner 和 cutover validation 仍严格串行，并在以下动作之前完成：

- `registerAllHandlers()` 与业务 event broadcast。
- `initBuiltInWorkflows()`。
- `startBundledMcpHost()`。
- WorkspaceWindowManager adoption 与正式 renderer navigation。
- ACP warmup。

first-visible barrier 后，shell PATH 与 runtime module import 并行；runtime module 就绪后可启动 migration，但 normal runtime wiring 必须等待 PATH 与 migration/cutover gate 都结算，从而保持所有现有外部进程入口都看到同步后的 PATH，而无需在本次变更中修改每个 spawn 调用点。PATH 失败继续沿用当前 fallback，不阻塞 normal runtime；最坏超时时间由 loading shell 承担，不再是无窗口等待。

cutover validation 失败时立即标记 startup aborted，销毁 startup window，再调用现有 `showWorkspaceUpgradeFailure()`；不得注册业务 IPC、启动 MCP/ACP 或导航到正式 renderer。启动中收到退出请求时 abort controller 阻止所有迟到 continuation 执行 handoff 或 spawn。

### 5. Renderer bootstrap 分为 critical 与 background

扩展 `FylloBootstrapTask`，增加显式 `phase: "critical" | "background"`。`runBootstrapTasks()` 按以下规则运行：

- critical：当前只有 `workspaces`，继续在同一 task 内按 window context、Workspace list、当前 Workspace、session list 顺序执行；task 成功或失败结算前保持全局启动 overlay。
- background：`acp-agents`，只在全部 critical task 结算后启动，内部仍可并行 load capability cache、registry、icon 和 status。
- 每个 task 继续失败隔离并记录 task name、phase 与 duration。

`App.vue` 在正式 renderer mount 后立即显示与 static startup shell 同视觉的 `StartupLoading.vue`。critical tasks 全部结算后：若 Workspace bootstrap 已设置既有页面级错误，则隐藏 overlay 并显示该错误；否则隐藏 overlay 并显示 Launcher/Workspace 内容。这样不会在 context 未知时短暂显示 Welcome。

新增 `platform:lifecycle:renderer-interactive` 单向 channel 与 `window.api.platform.lifecycle.markInteractive()`。Renderer 在 critical phase 结算并完成一次 DOM flush 后幂等通知 main；critical 失败但既有可操作错误页已经呈现时也视为 interactive。Main 只接受来自已激活 formal renderer 的当前 main-frame generation 的 signal，再启动全局 ACP warmup。只在该 generation 的 main-frame `did-finish-load` 后创建一次 `RENDERER_INTERACTIVE_FALLBACK_MS = 1_500` timer；startup document/subframe load不得创建 timer，首次 signal、shutdown、navigation/reload/window destroyed 时取消，迟到 signal仍由 generation校验和 coordinator幂等去重。用户主动 probe/chat 继续直接进入 process pool，不等待 background queue。formal renderer 本身加载失败时显示原生错误并退出，不依赖 warmup fallback掩盖失败。

### 6. bundled MCP 与 ACP 都退出首显关键路径

bundled MCP host 只在 required gate 通过后启动，仍不等待 proxy/backend ready 才导航正式 renderer或标记 interactive；首次 ACP lifecycle 请求继续复用既有 readiness promise 与 stdio fallback。

ACP warmup coordinator 继续去重、复用 process pool、隔离单 Agent 失败。首次 warmup 改由 renderer-interactive/fallback 调度，而不是首窗创建后的 `setImmediate`；mutation warmup 保留现有即时提交语义。后台 warmup 继续限制并发，用户主动请求通过 process pool 直接加入或优先启动同一 Agent，不被后台队列顺序阻塞。

### 7. Shutdown 使用固定 phase，而不是任意 DAG 或逆 import 顺序

`shutdown.ts` 声明并导出唯一的 `SHUTDOWN_PHASES`，每个 phase 内的 named task 使用 `Promise.allSettled()` 并行，不允许深层模块自行插入 phase。所有业务 `wrapHandler`、stream kit 与后台工作入口先统一读取 shutdown fence，fence 后拒绝新的 Workspace/Proposal/Git/ACP/MCP/workflow 工作；runtime 还必须持有 fire-and-forget 初始化的 Promise/AbortController。初始阶段如下：

1. `snapshot-and-hide`（同步）：设置全局 shutdown fence，捕获所有窗口 state，阻止 state writer 重复执行并立即隐藏窗口，记录 visual-exit 时间。
2. `quiesce`（并行、必须先完成）：取消首次/排队 ACP warmup；拒绝新的 ACP/MCP/stream/workflow 启动；cancel session registry；撤销 grants；关闭 proposal status 和 lineage FS watchers；abort 可安全取消的 Agent install/download 与其他受管长任务。
3. `terminate`（并行）：dispose ACP process pool；stop bundled MCP host；等待受管子进程 graceful close、SIGTERM/taskkill 与既有强制终止 fallback。
4. `finalize`：记录每项结果和总耗时，执行剩余 force hooks，然后调用 `app.exit(exitCode)`。

phase 顺序固定，只有确有依赖时才新增 phase；同一 phase task 必须彼此独立。深层模块只导出幂等的 `beginShutdown()`、`dispose()` 或 `forceDispose()`，不得调用 `registerDisposable()`。`shutdown.ts` 是资源清单与顺序的 source of truth。

使用一个可测试覆盖的 `SHUTDOWN_DEADLINE_MS = 4_000` 约束整个异步清理，而不是为每个 task 重新分配 8 秒；其中 `FORCE_CONFIRM_RESERVE_MS = 500` 预留在同一总预算尾部，最迟在剩余时间等于该值时进入 force/confirm。ACP/MCP/install force hook 必须 non-hanging、以已登记的 PID/process group 为明确目标，使用平台进程树终止手段并在剩余预算内有界确认退出；仍存活时重试最终强制终止并记录结果，不能只发 signal 或只依赖 Promise timeout。force hook pending/失败不得让窗口重新出现或让退出无限等待。普通窗口关闭仍使用既有 per-Workspace runtime cleanup，不走全局 app shutdown phases。

`src/main/bootstrap/README.md` 同时维护下列可执行资源清单；Apply 时必须以实际 owner API 补齐表格，不能以“其他任务/所有 timer”代替具体资源：

| 资源 owner                | 当前入口                                              | quiesce                                          | graceful / force                                                    | 验证重点           |
| ------------------------- | ----------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------- | ------------------ |
| ACP warmup                | `connection-warmup.ts`                                | cancel queue/timer，拒绝新 batch                 | 无子进程；交给 pool                                                 | 迟到任务不 spawn   |
| Chat sessions             | `session-registry.ts`                                 | cancel active sessions                           | session/process generation 失效                                     | stream/cancel 结算 |
| ACP process pool          | `acp-process-pool.ts`                                 | 拒绝 acquire                                     | dispose / PID 或 process-group tree kill + confirm                  | descendant 归零    |
| Bundled MCP host          | `bundled-mcp-host.ts`                                 | 拒绝 readiness/new work，撤销 grants             | stop / PID tree kill + confirm                                      | proxy/backend 归零 |
| Proposal/lineage watchers | `proposal-status-service.ts`、`mcp-event-consumer.ts` | `unwatchAll()`/停止新 watcher                    | dispose listener                                                    | watcher/timer 归零 |
| Agent installer           | `installer.ts`                                        | abort active `net.fetch`，拒绝 install/uninstall | 终止 npx/uvx/archive child；临时文件在 deadline 内 best-effort 清理 | 已登记 child 归零  |

Apply 的资源审计还必须明确短时 Git/detector/archive 解压进程是纳入 registry，还是凭已有单次 timeout 被有界排除；任何可能跨越退出 deadline 的 child 都必须纳入。临时文件删除不承诺在 `app.exit()` 后继续异步完成，未能在 deadline 内删除的受控临时目录需要由下次启动的安全清理策略处理或被明确证明可无害遗留。

Required migration 是全局 deadline 的唯一 protected-mutation 例外。退出请求若发生在 migration 尚未开始前，startup abort直接阻止其启动；若 migration 已进入写盘区间，则立即隐藏窗口、设置 fence并等待该 migration到达既有成功/失败安全结算点，期间不得进入 runtime handoff。只有 protected mutation结算后才启动上述 4 秒 runtime-resource deadline并最终 `app.exit()`，不能在中途强杀 migration。该等待单独记录 `shutdown-waiting-protected-migration`，不得伪装成普通 cleanup deadline；本 Proposal 不借机修改 migration数据步骤或 ledger格式。

`initBuiltInWorkflows()` 也改为显式受管 startup task，其模板写入使用原子 replace 或等价 crash-safe方式；quiesce对尚未开始的任务取消，对已开始的写入等待安全结算，避免 `app.exit()` 截断普通 `fs.writeFile`。

Windows `query-session-end`/`session-end` 无法等待异步清理时，通过 `app.on("browser-window-created")` 为每个 startup/formal窗口绑定同一个全局幂等 emergency coordinator；多窗口事件不得重复清理。该路径只执行同步或立即发起的 shutdown fence、grant revoke、timer cancel 和对子进程/process group 的 best-effort终止，不 await Promise、不承诺完成正常 deadline流程。Windows force path发起的 `taskkill` 必须以不依赖父进程继续存活的方式运行；bundled MCP继续保留父 IPC disconnect兜底。

### 8. 启动和退出性能使用结构化阶段日志验证

新增浅层 `src/main/bootstrap/startup-metrics.ts`，使用 monotonic time 记录且只输出阶段名、duration、结果与 dev/prod，不记录 Workspace path、Agent command、token 或用户数据。至少包含：

- process-entry、single-instance-lock、app-ready。
- startup-window-created、startup-page-loaded/visible。
- shell-path-settled、migration-settled、cutover-validated、runtime-wired。
- formal-renderer-loaded、renderer-interactive、warmup-scheduled。
- shutdown-requested、windows-hidden、各 shutdown phase、shutdown-complete/deadline。

应用内指标从 process entry 开始；点击 Dock/桌面图标到 process entry 的时间由 packaged QA 外部观察。Proposal 不先写未经测量的绝对 SLO；实现后以 packaged macOS 的 cold/warm 样本建立 baseline，再决定是否在后续变更中增加数值门禁。

### 9. 文档与测试共同约束未来扩展

`src/main/bootstrap/README.md` 记录启动/退出 mermaid、phase 表、允许/禁止事项以及新增 task checklist。`guidelines/MainProcess.md` 将 `bootstrap/index.ts`、`startup.ts`、`runtime.ts`、`shutdown.ts` 定义为 canonical orchestration surface，禁止 main 深层模块用 import side effect 注册 startup/shutdown task。`guidelines/RendererProcess.md` 记录 critical/background bootstrap；`guidelines/UiDesign.md` 记录 startup loading 的品牌、motion 与 reduced-motion 规则；`guidelines/Testing.md` 记录 phase order 与超时测试位置。

单元测试不得只验证函数被调用，还必须断言：startup shell 先于 gate；normal runtime 晚于 gate；第二实例聚焦 shell；退出中迟到 continuation 无副作用；shutdown phase 顺序、同 phase 并发、单一 deadline、force hooks；deep module 不再注册 disposer。增加一个轻量架构测试扫描 `src/main/**` 的 `registerDisposable`/等价 API，确保资源编排没有重新下沉。

## Risks / Trade-offs

- [同窗 startup 提前加载完整 preload，业务 API 在 handler 注册前已暴露] → startup HTML 不包含业务脚本或外部导航；所有业务 handler 仍晚于 gate；导航保护从窗口创建时即安装。
- [reserve 与 formal navigation 之间 startup document 仍存活] → reserve不写业务 context；只在预期 main-frame generation提交后activate，所有 lifecycle signal与业务IPC都校验sender generation。
- [static shell 与 Vue overlay 视觉不一致导致 handoff 闪烁] → 两者共享固定 token 值、Logo public asset 和视觉快照测试；BrowserWindow `backgroundColor` 使用同一主题值。
- [等待 startup first-visible barrier 后才执行重型工作增加少量 interactive 时间] → 该等待保证窗口先获得可见反馈；barrier 最多等待 1 秒，成功、load failure 与 timeout 都会结算，随后 PATH/runtime import/migration 才启动。
- [renderer-interactive 信号丢失导致 warmup 不执行] → formal renderer `did-finish-load` 后设置有限 fallback 调度；coordinator 继续幂等去重。
- [固定 4 秒 shutdown deadline 对极慢磁盘/进程不足] → 窗口先隐藏改善感知；OS resource 提供 force hook；所有 mutation 使用现有原子写/持久化 run 语义，不在 deadline 后无限等待。
- [并行 shutdown 破坏资源依赖] → 只在固定 phase 内并行，session/warmup/watchers quiesce 完成后才 terminate ACP/MCP；phase order 由集中测试锁定。
- [启动中退出或 gate 失败后异步 continuation 继续 spawn] → startup 与 shutdown 共享 abort/shutdown fence，每个 dynamic import、migration、navigation、MCP/ACP 调度边界重新检查状态。
- [退出发生在 required migration写盘中] → migration作为protected mutation等待既有安全结算点，隐藏窗口和阻止handoff可以立即完成，但4秒runtime清理deadline只在migration结算后开始。
- [Windows session end 不执行正常 before-quit] → 注册 best-effort emergency path；正常用户退出与系统强制退出分别测试和记录，不把异步完成作为 session-end 保证。
- [性能日志本身泄露环境信息或制造噪声] → 只记录预定义 phase 和 duration，不记录路径、命令、argv、Agent 元数据或 token。

## Migration Plan

1. 先引入 startup metrics、phase types 和单元测试，不改变现有用户行为。
2. 增加 static startup entry、StartupWindowController 和 WindowManager adoption，在 gate 失败/第二实例/activate 测试通过后切换首窗路径。
3. 拆分 main runtime dynamic import，保持 required gate 和业务 wiring 的现有相对顺序。
4. 引入 renderer critical/background bootstrap 与 interactive signal，再移动 ACP warmup 调度。
5. 将现有 deep disposer 逐项迁移到集中 shutdown phases；每迁移一个资源保留幂等与终止测试，最后删除逆 import-order registry。
6. 更新 guidelines/README，运行 focused tests、typecheck/lint 和 packaged macOS smoke；检查退出后没有 ACP/MCP descendant process。

本变更没有数据迁移。回滚时可恢复原 `bootstrapReady()` 和串行 lifecycle wiring；新增 startup HTML、interactive channel 与 phase metadata 均不改变持久化数据，旧版本可以直接读取现有 app data。

## Open Questions

没有阻塞 Apply 的产品或架构问题。绝对启动/退出 SLO 需在埋点落地并获得 packaged baseline 后确定，本 Proposal 先以阶段顺序、非阻塞条件、单一 deadline 和无残留进程作为可验证契约。
