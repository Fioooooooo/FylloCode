## 1. 建立主入口单实例门

- [x] 1.1 修改 `src/main/index.ts`：只静态导入 Electron `app`，同步调用 `app.requestSingleInstanceLock()`；失败时调用 `app.quit()` 且不加载 `@main/bootstrap`，成功时先注册 `second-instance` listener，再动态导入 bootstrap。用布尔 pending 合并 controller 就绪前的多个事件，并在 controller 绑定后转交一次 `requestWindowAttention()`。
- [x] 1.2 修改 `src/main/bootstrap/index.ts`：导出只含 `requestWindowAttention()` 的 `PrimaryInstanceController`，让 `startApp()` 返回该 controller；在首个 `projectWindowManager.openLauncherWindow()` 完成后标记 bootstrap window ready 并消费 pending。就绪后的请求必须先调用 `focusLastActiveWindow()`，返回 `false` 时才调用 `openLauncherWindow()`，不得改变现有 migration、MCP、IPC/event、首窗和 warmup 的顺序。

## 2. 覆盖锁与窗口注意力场景

- [x] 2.1 新增 `test/main/index.spec.ts`：使用隔离模块和 Electron/bootstrap mocks 覆盖锁失败时只退出且不加载/调用 `startApp()`、锁成功时先注册 `second-instance` 再加载 bootstrap，以及 controller 绑定前多个事件只转交一次；断言 argv、cwd、additionalData 不进入业务 API。
- [x] 2.2 扩展 `test/main/bootstrap/index.spec.ts`：覆盖 bootstrap 未完成时 controller 不提前聚焦或创建窗口、首窗完成后消费一次 pending、就绪后聚焦成功不创建窗口、聚焦失败才调用 `openLauncherWindow()`；保留现有 `syncShellPath → runAllMigrations → MCP/IPC/events → first window → warmup` 顺序断言。
- [x] 2.3 更新 `test/main/setup.ts` 的 Electron app stub，为 `requestSingleInstanceLock` 提供默认成功实现；运行 `pnpm exec vitest run --project main test/main/index.spec.ts test/main/bootstrap/index.spec.ts` 验证聚焦测试。

## 3. 固化工程前置条件并完成质量门禁

- [x] 3.1 更新 `guidelines/MainProcess.md`：在 main entry/bootstrap 边界中记录 `src/main/index.ts` 必须先取得单实例锁、未持锁实例不得加载 bootstrap，以及 `second-instance` 必须通过 `PrimaryInstanceController` 复用 `ProjectWindowManager`，不得绕过启动顺序直接创建窗口。
- [x] 3.2 更新 `guidelines/DataMigrations.md`：把单实例锁写为 `runAllMigrations()` 和其他启动期 app-data writer 的进程级前置条件，并明确 Workspace cutover 等业务迁移不得另造跨进程锁替代该门控。
- [x] 3.3 运行 `pnpm lint`、`pnpm typecheck:node` 和 `pnpm exec vitest run --project main`；验收标准为单实例 delta spec 的全部场景有自动测试，且既有 bootstrap、migration 与 window manager 测试无回归。
