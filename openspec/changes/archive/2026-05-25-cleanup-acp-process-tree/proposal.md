## Why

FylloCode 通过 Cmd+Q 等正常路径退出后，由 ACP agent 进程（如 `codex-acp`）拉起的 MCP 子进程（`fyllo-cortex`、`fyllo-specs`、`pencil` 等）以及 ACP agent 自身在系统中残留为孤儿进程，PPID 被 reparent 到 PID 1（macOS 的 `launchd` / Linux 的 `systemd` / Windows 的 `services.exe`）后继续占用 CPU、文件句柄与端口。

根因是 `electron/main/infra/process/acp-process-pool.ts` 在 spawn ACP agent 时未启用进程组隔离，dispose 阶段调用 `child.kill()` 只对 ACP agent 直接进程发 SIGTERM，**信号不会传递到 ACP agent 派生的 MCP 孙进程**；同时 graceful 等待 2 秒后才强杀，加上外层 `disposeAll()` 的 5 秒总超时，强杀路径常常被截断。

## What Changes

- 在 `acp-process-pool.ts#startProcess` 的 `spawn(cmd, args, opts)` 调用上启用进程组隔离：POSIX 平台 SHALL 设置 `detached: true`，使 ACP agent 子进程成为独立的 process group leader；Windows 平台 SHALL 不设置 `detached: true`（保持当前默认行为，避免开启新 console 窗口）。
- 重写 `acp-process-pool.ts#dispose` 的清理流程：保留现有 `closeSession` + `stdin.end()` graceful 阶段；此后将"对 child 单点 `kill()`"替换为"按平台对整棵进程树发信号"——POSIX 用 `process.kill(-pgid, "SIGTERM")` → 短超时 → `process.kill(-pgid, "SIGKILL")` 的两段级联，Windows 用 `taskkill /pid <pid> /T /F`。
- 把 `bootstrap/lifecycle.ts#disposeAll` 的单 disposable 总超时从 5s 抬高到 8s，确保 graceful close → SIGTERM grace → SIGKILL 三段在最坏情况下都能跑完。
- 在 `electron/main/__tests__/infra/process/acp-process-pool.spec.ts` 中新增 dispose 路径的测试，覆盖：spawn 选项里携带 `detached: true`（POSIX）、dispose 调用 `process.kill(-pid, "SIGTERM")` 而非 `child.kill()`、SIGTERM 后超时 fallback 到 SIGKILL、Windows 分支调用 `spawn("taskkill", ["/pid", String(pid), "/T", "/F"])`。
- 不引入原生绑定（不上 Job Object）；不实现"启动期补救扫孤儿"；不实现"父死自杀 sentinel"。Force Quit / 主进程崩溃 / 断电场景**不在本次范围**，留给后续可选增强。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `main-process-layering`: 修订 "长期运行资源通过 lifecycle 注册为 disposable" Requirement 下 "ACP 进程池可释放" 场景：dispose 时清理对象从"pool 内所有 child process"扩展为"pool 内每个 child process 所在的整棵进程树（含所有派生孙进程）"，并明确 POSIX / Windows 两条平台路径与 SIGTERM → SIGKILL 级联策略。
- `acp-chat-backend`: 修订 "ACP agent 进程池管理（按 agentId 懒启动复用）" Requirement 下 "首次使用某 agentId 时懒启动进程" 场景：spawn 选项 SHALL 在 POSIX 平台携带 `detached: true`，使 ACP agent 子进程成为独立 process group leader，从而支持后续按进程组清理。

## Impact

- 受影响代码：
  - `electron/main/infra/process/acp-process-pool.ts`（spawn 选项 + dispose 实现）
  - `electron/main/bootstrap/lifecycle.ts`（`disposeAll` 默认超时常量）
  - `electron/main/__tests__/infra/process/acp-process-pool.spec.ts`（新增 dispose 路径用例）
- 平台：macOS、Linux、Windows 三平台同步覆盖；POSIX 与 Windows 走不同实现分支。
- 行为兼容：对调用方（IPC handler、AcpSession 等）零感知；只在主进程退出路径上改变信号语义。
- 不影响：进程池的懒启动、复用、backoff 重启、give-up 阈值、stderr 日志透传等既有行为。
- 不引入新依赖。Windows 的 `taskkill` 为系统自带命令；POSIX 的 process group 清理使用 Node `process.kill` 标准 API。
