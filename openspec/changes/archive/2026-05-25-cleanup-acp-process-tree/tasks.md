## 1. 进程组隔离与平台分支

- [x] 1.1 在 `electron/main/infra/process/acp-process-pool.ts#startProcess` 中，向 `spawn(cmd, args, opts)` 的 `opts` 添加 `detached: process.platform !== "win32"`。Windows 不设置该字段以避免 child 切到独立 console 窗口；其余平台让 child 通过 `setsid()` 成为独立 process group leader（pgid === child.pid）。保持 `stdio` 仍为 `["pipe", "pipe", "pipe"]`、`env` 仍为 `process.env`。**不要**调用 `child.unref()`。
- [x] 1.2 在 `acp-process-pool.ts` 顶部新增内部常量 `GRACEFUL_CLOSE_TIMEOUT_MS = 1500` 与 `SIGKILL_GRACE_MS = 1500`，分别用于 graceful close 等待与 SIGTERM 后的 fallback 等待。替换原 `dispose()` 中硬编码的 `2_000`。
- [x] 1.3 验收：检查 `git diff` 后 `acp-process-pool.ts` 中只对 `spawn` 选项做了 `detached` 字段新增；TypeScript 类型仍通过（`pnpm typecheck`）。

## 2. dispose 三段级联清理

- [x] 2.1 在 `acp-process-pool.ts` 中新增内部辅助函数 `killProcessTree(child: ChildProcessWithoutNullStreams): Promise<void>`，签名与作用：负责对一个仍存活的 child 进程及其派生的整棵进程树发出终止信号。**POSIX 分支**（`process.platform !== "win32"`）依次执行：（a）`process.kill(-child.pid, "SIGTERM")`，捕获 `ESRCH` 视为成功，捕获其他错误调用 `logger.warn` 记录后继续；（b）等待 `SIGKILL_GRACE_MS`；（c）若 `child.killed === false` 且进程组仍存在（再次 `process.kill(-child.pid, 0)` 不抛 `ESRCH`），调用 `process.kill(-child.pid, "SIGKILL")`，错误处理同 (a)。**Windows 分支**（`process.platform === "win32"`）单步执行：使用 `child_process.spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" })`，等待该 taskkill 子进程 `close` 事件或 1500ms 超时，超时仅 `logger.warn`，不抛。
- [x] 2.2 重写 `acp-process-pool.ts#dispose`，每个 entry 的清理流程改为：
  1. `await Promise.all(closeSession 调用)`（保留现有逻辑）
  2. `entry.child.stdin.end()`（保留）
  3. `await` 一个 race：`entry.child.once("close", ...)` 与 `setTimeout(GRACEFUL_CLOSE_TIMEOUT_MS)`
  4. 若 graceful 超时或 child 仍存活（`!entry.child.killed`），调用 `await killProcessTree(entry.child)`
  5. 若 (4) 之后 child 仍未退出，最后兜底 `entry.child.kill("SIGKILL")`，错误吞掉
- [x] 2.3 把 `dispose()` 入口的 `shuttingDown = true` 保持在最前；在 `shuttingDown` 为 true 时 `child.on("exit", ...)` 既有逻辑已提前 return（不重启），无需额外改动。
- [x] 2.4 验收：手动核对 `dispose` 中的 `entry.child.kill()` 单点调用已被 `killProcessTree` 替换；search 全文确认 `acp-process-pool.ts` 中已无形如 `entry.child.kill()` 的旧调用残留。

## 3. lifecycle 总超时调整

- [x] 3.1 修改 `electron/main/bootstrap/lifecycle.ts#disposeAll` 的默认参数 `timeoutMs = 5_000` 为 `timeoutMs = 8_000`，对应 design 文档中"graceful 1.5s + SIGTERM grace 1.5s + buffer"的预算。
- [x] 3.2 验收：搜索代码库中是否有显式传入 `disposeAll(具体值)` 的调用——`bootstrap/index.ts` 当前调用为 `disposeAll()` 不带参，无需同步修改；仅常量调整即可。

## 4. 单元测试

- [x] 4.1 修改 `electron/main/__tests__/infra/process/acp-process-pool.spec.ts`：在现有 `mocks` 中扩充对 `process.kill`、`child.killed`、`child_process.spawn`（taskkill 调用）等的可观察 stub。建议把 `child` mock 升级为带 `pid: 12345`、可读写 `killed` 标志的对象。
- [x] 4.2 新增用例 "spawn 在 POSIX 平台传入 detached: true"：`vi.stubGlobal("process", { ...process, platform: "darwin" })` 或通过 `Object.defineProperty(process, "platform", { value: "darwin" })` 模拟平台；触发 `getOrStartProcess`，断言 `mocks.spawn` 调用第三参数包含 `detached: true`。
- [x] 4.3 新增用例 "spawn 在 Windows 平台不设置 detached"：模拟 `process.platform === "win32"`，断言 `mocks.spawn` 调用第三参数中 `detached` 字段为 `undefined` 或不存在。
- [x] 4.4 新增用例 "POSIX dispose 调用 process.kill(-pid, 'SIGTERM') 并在超时后 fallback 到 SIGKILL"：mock 全局 `process.kill`；先启动一个 entry，从 `mocks.registerDisposable` 捕获注册的 `dispose` 函数；调用该 dispose；用 `vi.useFakeTimers()` 推进时间，断言 `process.kill` 至少被以 `(-12345, "SIGTERM")` 调用一次；推进 `SIGKILL_GRACE_MS` 后断言 `process.kill` 又被以 `(-12345, "SIGKILL")` 调用一次。
- [x] 4.5 新增用例 "POSIX dispose 在 SIGTERM 阶段 ESRCH 视为成功"：让 mock 的 `process.kill` 抛 `Object.assign(new Error("ESRCH"), { code: "ESRCH" })`，断言 dispose 不抛、不再发 SIGKILL（视为已退）。
- [x] 4.6 新增用例 "Windows dispose 调用 taskkill"：模拟 `process.platform === "win32"`，捕获 `child_process.spawn` 调用，断言 dispose 期间被调用一次且参数为 `("taskkill", ["/pid", "12345", "/T", "/F"], expect.objectContaining({ stdio: "ignore" }))`。
- [x] 4.7 新增用例 "dispose 期间 child 已自然退出（graceful close 触发）则不发 SIGTERM"：在 mock 的 `child.once("close", cb)` 注册的回调被 graceful 阶段触发后，断言 `process.kill` 与 `taskkill` 都未被调用。
- [x] 4.8 验收：`pnpm test electron/main/__tests__/infra/process/acp-process-pool.spec.ts` 通过；现有 `retains initializeResponse on the returned live process entry` 用例继续通过。

## 5. 文档与项目规范

- [x] 5.1 评估是否需要在 `guidelines/` 下增改进程生命周期相关说明。本次决定在 `guidelines/MainProcess.md`（若已存在）或对应主进程分层文档中追加一段简短说明："ACP agent 等会派生孙进程的子进程在 POSIX 必须以 `detached: true` 启动、退出阶段按 process group 清理；Windows 走 `taskkill /T /F`。" 若 `guidelines/MainProcess.md` 不存在该层级章节，则跳过本步并在 PR description 中说明。
- [x] 5.2 不修改 CLAUDE.md / README，本次为内部实现优化，对外行为兼容。

## 6. 端到端手工验证（由用户在 main worktree 完成）

- [ ] 6.1 在 macOS（用户主开发机）执行：`pnpm dev` → 选择 codex agent 发起一次对话 → `ps -ef | grep -E "codex-acp|fyllo-cortex|fyllo-specs|pencil"` 记录 PID 树 → Cmd+Q 关闭 FylloCode → 再次 `ps -ef | grep ...` 确认全部进程消失。
- [ ] 6.2 （可选）在 Linux 上重复 6.1 流程；用 `pgrep -f codex-acp` / `pgrep -f fyllo-` 替代。
- [ ] 6.3 （可选）在 Windows 上重复 6.1 流程；用 PowerShell `Get-Process | Where-Object { $_.Path -like "*codex-acp*" -or $_.Path -like "*FylloCode*MCP*" }` 或 Task Manager 验证。
- [ ] 6.4 验证退出耗时：从触发 Cmd+Q 到 dock 图标消失，正常情况应在 2 秒内（graceful close 即可结束）；最坏情况不超过 8 秒。
