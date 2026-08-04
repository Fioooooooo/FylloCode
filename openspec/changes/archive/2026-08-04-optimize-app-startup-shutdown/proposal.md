## Why

FylloCode 当前在创建首窗前等待完整 main bootstrap 模块加载、shell PATH 探测、全部 migration 与 required cutover 校验；极端情况下用户点击应用图标后长时间看不到任何反馈。应用退出又通过按注册顺序串行等待的 disposer 清理资源，既缺少统一的总耗时边界，也难以让未来新增的启动或清理任务保持正确顺序。

## What Changes

- 在 Electron `app.ready` 后尽早显示一个无业务数据访问的轻量启动页；启动页使用克制的 FylloCode 品牌视觉（Logo 与环形假进度/轻微波动动画），不显示虚假百分比，并支持深浅主题与 reduced motion。
- 在申请单实例锁前让开发模式将 Electron `userData` 指向当前 worktree 的既有 `data/` 开发数据根目录，使打包应用、不同 worktree 的 dev 实例互不抢锁，同时保持同一 worktree 内单实例；生产模式继续使用 Electron 默认 `userData`。
- 将启动过程显式拆分为 startup shell、required gate、runtime wiring、renderer critical bootstrap 和 background warmup 阶段；required migration/cutover 仍在正常 Launcher、Workspace 数据和业务 IPC 可用前完成。
- 让启动窗口在 required gate 通过后由统一窗口管理器接管并导航到正式 renderer，覆盖第二实例、macOS activate、启动中退出和升级失败路径，避免重复窗口与 Welcome 页面闪现。
- 将 shell PATH、bundled MCP host、ACP Agent 预热和 renderer Agent 初始化移出首个可见反馈的关键路径，并规定用户主动 Agent 请求可以优先于后台 warmup。
- 增加结构化启动/退出阶段耗时记录，以区分 process start、app ready、startup shell 首帧、runtime ready、interactive、窗口隐藏和 process exit。
- 将退出改为集中、分阶段的 lifecycle orchestration：先冻结新工作、显式保存并隐藏窗口、取消上游任务，再按依赖并行释放 ACP/MCP、session、watcher 等资源，最后在统一总期限内完成强制终止与 `app.exit()`。
- 将启动任务注册、阶段顺序、退出资源注册与依赖规则保留在浅层、可发现的 bootstrap/lifecycle 入口；通过源码注释、架构文档、guideline 和顺序测试防止未来新增任务绕过编排或重新进入关键路径。

## Capabilities

### New Capabilities

- `application-lifecycle-orchestration`: 定义轻量启动页、启动阶段与 readiness、集中可发现的任务编排、启动/退出性能观测，以及分阶段有界退出行为。

### Modified Capabilities

- `single-instance-startup`: 开发模式按 worktree 的 `data/` 目录隔离 Electron 单实例域，生产模式保持全局单实例；第二实例在应用仍处于启动阶段时聚焦既有 startup shell，并在 runtime ready 后继续复用同一主实例窗口。
- `workspace-storage-cutover`: required cutover 前允许显示不访问业务数据的 startup shell，但仍禁止 Launcher、Workspace runtime 和业务 IPC 绕过 gate。
- `legacy-project-storage-retirement`: settlement pending/failed 时从 startup shell 安全切换到既有原生失败 UI，且不得进入 normal runtime。
- `acp-agent-connection-lifecycle`: 全局 Agent warmup 改为 startup shell 已可见后的后台阶段，并纳入集中 shutdown phase 与用户请求优先级约束。
- `bundled-mcp-http-transport`: bundled MCP host 在 required gate 后后台启动，不阻塞正式 renderer/interactive readiness，并通过集中 shutdown phase 有界关闭。
- `workspace-window`: required gate 通过后将既有 startup BrowserWindow 接管为 launcher；启动期间的 macOS activate 复用 startup shell，normal runtime 无窗口时仍按既有规则创建 launcher。

## Impact

- 主进程入口与窗口：`src/main/index.ts` 在锁前完成 dev `userData` 根目录准备，`src/main/bootstrap/index.ts`、`src/main/bootstrap/window.ts`、`src/main/bootstrap/workspace-window-manager.ts`，以及新增的浅层 startup/shutdown orchestration 模块。
- 主进程 lifecycle：`src/main/bootstrap/lifecycle.ts`、ACP warmup/process pool、bundled MCP host、session registry、proposal/lineage watcher 和其他长生命周期资源注册点。
- Renderer 与构建：`electron.vite.config.ts`、新增轻量 startup HTML、`src/renderer/src/main.ts`、`src/renderer/src/bootstrap/**`、`App.vue`/启动 loading 组件及 Workspace bootstrap 状态。
- 规范与工程约定：相关 OpenSpec specs、`guidelines/MainProcess.md`、`guidelines/RendererProcess.md`、`guidelines/UiDesign.md`、`guidelines/BrandAssets.md`、`guidelines/Testing.md`。
- 测试与验证：main bootstrap/window/lifecycle、single-instance、migration failure、ACP/MCP shutdown、renderer critical bootstrap、主题/reduced-motion loading，以及 packaged macOS 冷启动和退出残留进程检查。
- 不新增外部运行时依赖，不改变 Workspace 持久化格式、ACP/MCP 协议、业务 IPC 输入输出或用户数据 migration 内容。
