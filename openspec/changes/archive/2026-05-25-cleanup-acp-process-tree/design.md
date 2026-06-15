## Context

`electron/main/infra/process/acp-process-pool.ts` 是 FylloCode 主进程内唯一的 ACP agent 子进程拉起点（`startProcess` 内通过 `spawn(cmd, args, { stdio, env })`）。当前现状：

- spawn 时不传 `detached`、不传 `windowsHide`、不显式建 process group。Node.js 在 POSIX 上默认会让 child 继承父进程的 process group。
- `dispose()` 流程：
  1. 对每个池内 entry 调 `connection.closeSession()`（按 sessionId 逐个关）
  2. `entry.child.stdin.end()` 触发 EOF
  3. 等 `child.once("close", ...)` 或 2 秒超时
  4. 若进程仍活，调 `entry.child.kill()`（默认 SIGTERM）
- 外层 `bootstrap/lifecycle.ts#disposeAll` 给每个 disposable 留 5 秒总超时，超时后 `app.exit(0)`。

### 现实观察（来自用户 ps 输出）

```
501 18273  1  ... codex-acp                    # PPID = 1，已是孤儿
501 18275 18273  ... fyllocode mcp-servers/fyllo-cortex/index.js
501 18276 18273  ... pencil/.../mcp-server-darwin-arm64
501 18277 18273  ... fyllocode mcp-servers/fyllo-specs/index.js
```

ACP agent 派生的 MCP 进程的 PPID 是 ACP agent 自己（不是 FylloCode 主进程）。当主进程对 ACP agent 发 SIGTERM 时：

- 信号只送给 ACP agent；
- ACP agent 的 stdin pipe 被 close 也只是它自己的输入流，不会顺势终止它的 child；
- ACP agent 即便退出，其 MCP 子进程在 POSIX 上**不会**因为父进程消失而被 OS 回收，会被 reparent 到 PID 1。

因此核心问题是"信号没有沿进程树扩散"，不是"超时不够"。光把 5s 调大不解决问题。

### 平台差异

| 平台    | OS 是否为父死孤儿做自动回收                            | 我们能用的"杀整棵树"机制             |
| ------- | ------------------------------------------------------ | ------------------------------------ |
| macOS   | 否（reparent 到 launchd）                              | `kill(-pgid, signal)`                |
| Linux   | 否（reparent 到 systemd）                              | `kill(-pgid, signal)`                |
| Windows | 否（除非父进程持有 Job Object 且标 KILL_ON_JOB_CLOSE） | `taskkill /T /F`（递归杀整棵进程树） |

POSIX 上要让 `kill(-pgid, ...)` 的负数 pgid 语义命中"杀进程组"，前提是 child 自己是 process group leader（即 child 启动时 `setpgid(0, 0)`）。Node.js 上等价做法就是 `spawn(..., { detached: true })`：会触发 `setsid()` / `setpgid(0, 0)`，pgid 等于 child.pid。

`detached: true` 的潜在副作用：父进程退出时 Node runtime 默认不会等 child（除非显式 `child.unref()` 或 `child.ref()`）。本次场景下我们**不**调用 `child.unref()`，因为我们要的是"主进程退出**前**主动收掉 child"，主进程在退出窗口内仍持 child 引用是必要的。

Windows 上 `detached: true` 会让 child 跑在新 console 窗口里（除非配合 `windowsHide` 或 `shell` 选项），且 Windows 没有 process group 概念，`process.kill(-pid, ...)` 在 libuv 上不被支持。所以 Windows 不走 `detached: true`，统一用 `taskkill /T /F` 直接按 PID 递归收掉整棵进程树。

## Goals / Non-Goals

**Goals:**

- FylloCode 通过 `app.quit()`、Cmd+Q、菜单 Quit、`window-all-closed`（非 macOS）等正常退出路径关闭后，本次会话期间拉起的所有 ACP agent 进程及其派生的 MCP 孙进程在用户 ps（或 Task Manager）中全部不存在。
- 在 macOS、Linux、Windows 三平台上提供统一的、可在 CI 单测中验证的 dispose 行为。
- dispose 路径优先 graceful（让 ACP agent 有机会 flush 日志），失败兜底 force kill，整体在 8 秒内完成。
- 不引入新的 npm 依赖、不引入原生 addon。

**Non-Goals:**

- 不解决 macOS Force Quit / Linux `kill -9` / Windows End Task 这种主进程被 SIGKILL 立即终止、无法运行 `before-quit` 钩子的场景。这类场景需要"父死自杀 sentinel"或 Windows Job Object 才能 cover，超出本次范围。
- 不实现"主进程崩溃后再次启动时扫描旧孤儿并清理"的补救机制。该机制的 PID 复用风险与额外复杂度不符成本收益。
- 不改变 ACP 进程池的懒启动、复用、backoff 重启、give-up 阈值、stderr 日志透传等既有语义。
- 不修改 ACP agent 内部的 MCP 子进程拉起逻辑（这是 codex-acp 等第三方 agent 的实现，不在我们代码范围）。

## Decisions

### Decision 1: POSIX 用 `detached: true` + `kill(-pgid, signal)` 替代 `child.kill()`

**选择**：POSIX 平台在 `spawn` 时设置 `detached: true`，让 ACP agent child 成为独立 process group leader（pgid === child.pid）；dispose 时用 `process.kill(-child.pid, "SIGTERM")` → 短超时 → `process.kill(-child.pid, "SIGKILL")`。

**为什么不是其他选项**：

- _`tree-kill` 等第三方 npm 包_：底层在 POSIX 上其实也是按 ppid 递归 `ps` + `kill`，比直接用 process group 更脆，且引入额外依赖。
- _父进程逐层 ps 找 child 再 kill_：主进程退出窗口里要扫 ps 树有竞态，且对孙进程派生新进程的瞬态状况没有覆盖。
- _只 `child.kill()` + 加大 disposeAll 超时_：根因不是超时，是信号没扩散，调高超时无效。

`detached: true` 不影响 ACP agent 的 stdio 管道（仍是 `["pipe", "pipe", "pipe"]`），ACP 协议通信不变。

### Decision 2: Windows 用 `taskkill /T /F`，不上 Job Object

**选择**：Windows 平台不设置 `detached: true`；dispose 时通过 `child_process.spawn("taskkill", ["/pid", String(pid), "/T", "/F"])` 递归终止整棵进程树。

**为什么不上 Job Object**：

- Job Object + `KILL_ON_JOB_CLOSE` 是 Windows 上唯一能 cover Force Quit / 崩溃场景的机制，但需要 N-API/FFI 绑定（`node-windows-job` 这类社区包不活跃，自己写 napi addon 维护成本高）。
- 本次目标只是"正常退出路径不留孤儿"，`taskkill /T /F` 已经够用，且零依赖。
- 后续如果 Windows 用户反馈 Force Quit 孤儿成为痛点，再单独立 change 升级到 Job Object。

`/T` 杀整棵子树（按 PID parent-child 关系遍历），`/F` 强制终止。`taskkill` 在所有受支持的 Windows 版本（10/11/Server 2016+）都自带，无需额外安装。

### Decision 3: dispose 内三段流程：graceful close → SIGTERM/taskkill grace → SIGKILL fallback（仅 POSIX）

**为什么保留 graceful close 阶段**：

- ACP agent 收到 `closeSession` 可以让远端写完 stderr 日志、关闭 MCP 连接，避免日志被截断。
- POSIX 上即便 graceful 阶段就让 ACP agent 自己退出，孙进程依然是孤儿；所以 graceful 之后**仍然要**对进程组发信号。换言之：graceful 阶段处理 ACP agent 自己，强杀阶段处理整棵树。

**时序**（每个 entry 独立计时）：

```
t = 0      closeSession（每个 session 上限 300ms）+ stdin.end()
t ≤ 0.5s   等待 child "close" 事件，同时孙进程视情况自然退出
t = 0.5s   POSIX: process.kill(-pgid, "SIGTERM")
            Windows: spawn("taskkill", ["/pid", pid, "/T", "/F"])（taskkill 本身就是 force，无 grace）
t = 1.0s   POSIX: process.kill(-pgid, "SIGKILL") fallback
                  Windows: 无此阶段
t ≤ 1.3s 内全部完成（最坏路径）
```

`disposeAll` 单 disposable 超时仍保留 8s，给小概率慢路径留缓冲（如 closeSession 有未捕获的额外延迟、`taskkill` spawn 自身排队等）。

### Decision 4: 错误处理边界

- `process.kill` 失败的常见 errno：
  - `ESRCH`（进程已不存在）—— 视为成功，吞掉
  - `EPERM`（权限错误）—— 极少出现，logger.warn 后继续
- `taskkill` exit code != 0：logger.warn 后继续，不抛
- 所有清理动作都被包在 `try/catch` 里，单个 entry 失败不阻塞其他 entry 的清理

### Decision 5: shuttingDown 标志位语义不变

`shuttingDown` 仍由 `dispose()` 入口置 `true`，避免 `child.on("exit", ...)` 在退出窗口里再次触发 backoff 重启。这一行为在本次改动里保留。

## Risks / Trade-offs

- **Risk**：`detached: true` 的副作用是 Node 主进程退出时不会自动等 child（一般 Node 会等所有 stdio 引用关闭）。**Mitigation**：本方案在主进程的 `before-quit` 钩子里同步收 child，主进程在 `disposeAll` 完成前不会真正 exit；不调用 `child.unref()`。
- **Risk**：POSIX 上 `kill(-pgid, ...)` 若 pgid 等于主进程自身的 pgid，会把 FylloCode 主进程也杀掉。**Mitigation**：`detached: true` 强制 child 走 `setsid()` 拿到独立 pgid，与父进程 pgid 必然不同；测试用例里要校验 spawn 选项里 `detached: true` 存在。
- **Risk**：Windows 上 `taskkill /T` 的 PID 树是基于 `CreateProcess` 时记录的 parent PID，理论上 ACP agent 派生 MCP 时若用 `CREATE_NO_WINDOW` 之类标志可能影响树结构。**Mitigation**：`/F` 兜底强杀，且 ACP agent 是标准 Node/binary spawn，没有反常的 process creation 标志；如有遗漏可在后续个案修复。
- **Risk**：超时窗口拉到 8s 会让 Cmd+Q 到完全退出多 3 秒。**Mitigation**：8s 是最坏情况；正常路径 graceful close 即可结束，不会触发后两段。可以通过 logger 观察实际命中频率。
- **Trade-off**：本方案不 cover Force Quit。文档里需要明说"Force Quit 会留孤儿"是已知行为，留待后续 phase 决定是否做 sentinel。

## Migration Plan

不涉及数据迁移、不涉及 IPC 协议变更、不涉及 spec 重大重构。改动落地即可生效。回滚策略：单文件 `acp-process-pool.ts` 改动 + 一处常量调整 + 测试新增，回滚成本很低。
