## Context

`src/main/index.ts` 当前静态导入 `@main/bootstrap` 并立即调用 `startApp()`；`startApp()` 直接注册 `app.whenReady().then(bootstrapReady)`。`bootstrapReady()` 依次执行 `syncShellPath()`、`runAllMigrations()`、bundled MCP host、IPC/event 注册、首个 launcher window 与 Agent warmup，没有单实例门控。

迁移账本采用失败后永久跳过的语义，未来 Workspace cutover 还会复制并转换多类 app-data。两个 Electron 进程并发进入 `runAllMigrations()` 会绕过进程内串行化，因此单实例锁必须成为导入并启动这些 writer 之前的进程级前置条件。现有 `ProjectWindowManager.focusLastActiveWindow()` 已负责恢复最小化窗口并聚焦，`openLauncherWindow()` 已负责复用或创建 launcher，应直接复用。

## Goals / Non-Goals

**Goals:**

- 在主入口同步取得 Electron 单实例锁，未取得锁的进程不加载主 bootstrap 模块。
- 保证 `app.whenReady()`、migration runner、MCP/IPC、窗口与 Agent warmup 只由持锁实例启动。
- 第二实例启动时让已有主实例获得窗口注意力；主实例仍在 bootstrap 时延迟处理，保持既有启动顺序。
- 用 main Vitest 覆盖锁成功、锁失败、启动中事件、已有窗口聚焦和无窗口 fallback。

**Non-Goals:**

- 不转发或解释第二实例的 argv、cwd、additionalData，也不据此打开 Folder/Project。
- 不改变 migration runner 的账本、baseline、失败后继续或失败不重试语义。
- 不增加跨进程文件锁、持久化锁文件或新的依赖。
- 不改变 launcher/project window identity、IPC contract 或 renderer 行为。

## Decisions

### 1. 让 `src/main/index.ts` 成为最小单实例门

`src/main/index.ts` 只静态导入 Electron `app`，同步调用 `app.requestSingleInstanceLock()`。失败分支只调用 `app.quit()` 并结束；成功分支才动态导入 `@main/bootstrap` 并调用 `startApp()`。

这样不仅让锁早于 `app.whenReady()` 和 `runAllMigrations()`，也避免未持锁实例执行 bootstrap 依赖的 import-time 初始化。备选方案是在现有 `startApp()` 内申请锁；该方案虽然早于 migration 调用，但 bootstrap 依赖已经被静态求值，不能建立“未持锁实例不启动 app-data writer”的强边界，因此不采用。

### 2. 在最小入口立即接收并暂存 `second-instance`

持锁后、动态导入 bootstrap 前就在 `src/main/index.ts` 注册 `second-instance` listener。入口保存一个尚未绑定的 `PrimaryInstanceController` 与布尔型 pending 标记：controller 可用时调用 `requestWindowAttention()`，尚不可用时只把 pending 置为 true；bootstrap 加载并返回 controller 后消费一次 pending。

pending 使用布尔值而不是计数。多个第二实例在主实例启动期间只代表“启动完成后请求一次窗口注意力”，不需要产生多个窗口或重复业务动作。

### 3. `startApp()` 返回只含窗口注意力请求的 controller

在 `src/main/bootstrap/index.ts` 定义窄接口 `PrimaryInstanceController`：

```ts
interface PrimaryInstanceController {
  requestWindowAttention(): void;
}
```

`startApp()` 保持注册 `whenReady`、window-all-closed 和 before-quit 的职责，同时返回 controller。controller 在首窗尚未创建时只记录 pending；`bootstrapReady()` 完成 migration、MCP/IPC/event 注册并调用 `openLauncherWindow()` 后，通过内部 completion callback 标记窗口已就绪并消费 pending。

就绪后的 `requestWindowAttention()` 先调用 `projectWindowManager.focusLastActiveWindow()`；返回 `false` 时调用 `openLauncherWindow()`。这复用现有的最小化恢复、窗口可用性判断和 launcher 去重，不直接操作 `BrowserWindow`。

备选方案是在 `second-instance` listener 中直接调用 window manager；它可能在 async bootstrap 尚未完成时提前创建窗口，破坏 migration 与首窗的既有顺序，因此不采用。

### 4. 测试分开验证入口隔离与 bootstrap 窗口行为

- `test/main/index.spec.ts` 通过 mock Electron `app` 和动态 bootstrap 模块，断言锁失败时 `app.quit()` 被调用且 `startApp()` 未加载/调用，锁成功时 listener 先注册再启动 bootstrap，并验证 bootstrap controller 就绪前的事件会被转交一次。
- `test/main/bootstrap/index.spec.ts` 扩展现有启动顺序测试，断言 controller 在首窗前不聚焦、不创建额外窗口；首窗完成后消费 pending；就绪后优先聚焦最近活跃窗口，聚焦失败才复用 `openLauncherWindow()`。
- `test/main/setup.ts` 的 Electron stub 增加默认返回 `true` 的 `requestSingleInstanceLock`，保持其他 main tests 的安全默认值。

## Risks / Trade-offs

- [动态 import 失败会使持锁主实例无法继续启动] → 保持与当前 bootstrap 模块加载失败相同的进程失败语义；本提案不引入掩盖模块加载错误的 fallback。
- [第二实例在主实例启动中触发多次] → pending 合并为一次窗口注意力请求，避免重复创建或聚焦抖动。
- [窗口在 attention 请求到达前被关闭] → 每次处理都重新调用 `focusLastActiveWindow()`，无可用窗口时由 `openLauncherWindow()` 安全 fallback。
- [第二实例命令行被忽略] → 这是有意的最小前置契约；若未来需要“第二实例打开指定 Folder”，另行 proposal 定义参数、授权与路由。

## Migration Plan

本变更不迁移持久化数据。发布后首次启动即采用单实例门；回滚只需恢复原主入口与 bootstrap API，不需要清理数据或锁文件。该能力落地并通过测试后，`introduce-workspace-model` 才能把它作为 required cutover 的进程级前置条件。

## Open Questions

无。第二实例只请求窗口注意力、不转发业务参数的边界已经确定。
