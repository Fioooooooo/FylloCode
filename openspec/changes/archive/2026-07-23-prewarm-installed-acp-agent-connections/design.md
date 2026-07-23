## Context

Renderer 启动时，`registerAcpAgentsTask()` 会读取 registry、Agent 状态和 capabilities 缓存。`useSessionStore()` 根据 `installedAgentIds` 选择默认 Agent，并在当前项目可用后创建 draft probe。该 probe 经 `session-probe-service.ts` 先调用 `getOrStartProcess()`，再解析项目级 bundled MCP transport 并执行 `newSession()`。因此首个 Agent 会被启动，其他已安装 Agent 直到用户切换才进入冷启动。

ACP Agent 的安装记录与 custom 配置保存在应用级数据目录；`src/main/infra/process/acp-process-pool.ts` 也在 main 进程按 `agentId` 维护应用级连接，并通过 `pendingStarts` 合并同一 Agent 的并发启动。Agent 连接不携带项目上下文，只有 `newSession()` 才需要 project path、MCP transport 和 draft/session 状态。因此连接预热的所有权应属于 main app lifecycle，而不是任一 renderer 窗口。

`bootstrapReady()` 当前先同步 shell PATH、执行 migration、启动 bundled MCP host、注册 IPC 与全局事件广播，再打开 Launcher window。预热依赖正确 PATH、安装记录和事件订阅，但不应阻塞 app ready 或窗口展示。安装、升级、卸载和 custom 配置保存同样已经由 main platform service 编排，可以在 mutation 成功前后直接维护连接，不需要 renderer 回传全局状态。

当前 process pool 只提供整个应用退出时的统一 dispose，没有按 Agent 主动停止、取消待重启或使 draft probe 失效的完整路径。预热所有 Agent 会使这些生命周期缺口从偶发路径变为常态路径。

## Goals / Non-Goals

**Goals:**

- Main 在应用 ready 后发现并后台预热所有全局已安装 registry Agent 与 custom Agent。
- 预热不依赖 renderer 窗口或项目存在，不新增连接预热 IPC。
- 预热只完成 spawn、ACP transport 建立和 `initialize`，不调用 `newSession`，不解析或启动项目级 bundled MCP。
- 当前选择的 Agent 继续立即进入 draft probe；probe 能复用已就绪连接或加入同一 Agent正在进行的启动。
- 预热由 main 全局协调、限制并发并按 Agent 隔离失败，不延长首窗展示或 `bootstrapReady()` 完成时间。
- Agent 首次安装、升级和 custom 配置保存成功后，由 main service 增量预热仍有效的 Agent。
- Agent 卸载、升级和影响 custom Agent 启动配置的变更在修改磁盘或安装状态前停止旧进程，并清理旧进程关联的 draft probe。
- Agent 升级后保留 FylloCode 已持久化的 ACP session 标识和历史；下一次对话继续使用现有 resume、load、fresh fallback 恢复顺序。

**Non-Goals:**

- 不为每个预热 Agent 预先创建项目级 ACP session。
- 不保证用户切换 Agent 前已经存在 `configOptions` 或 `availableCommands`；这些数据仍以当前 Agent 的 probe 结果为准。
- 不新增 Agent 连接状态 UI，也不把后台预热失败展示为新的页面级错误状态。
- 不改变 renderer 的 Agent registry/status bootstrap、默认 Agent 选择或 draft probe watcher。
- 不改变 ACP session 持久化格式、恢复优先级或历史回放规则。
- 不提供正在执行的 prompt 在 Agent 升级期间的无缝迁移；升级导致的当前 turn 失败仍按现有错误路径处理，后续 turn 才进入恢复流程。

## Decisions

### 1. 在 main `bootstrapReady()` 末尾非阻塞启动首次预热

在 `src/main/bootstrap/index.ts` 的 `bootstrapReady()` 中，保持现有 `syncShellPath()`、migration、bundled MCP host、IPC handler、probe/Agent/proposal event broadcast 和 Launcher window 创建顺序。`projectWindowManager.openLauncherWindow()` 返回后，通过 `setImmediate()` 将 `prewarmInstalledAgentConnections()` 安排到下一轮 event loop，以 fire-and-forget 方式执行，只记录顶层发现失败，不 `await` 所有 Agent 连接。

选择首窗创建后再让出一个 event-loop turn，是为了保证 BrowserWindow 创建调用先完成，再让多个重量级 CLI 开始竞争磁盘和 CPU；10 秒级 Agent 冷启动仍会与 renderer 加载、项目打开和状态初始化重叠。系统不等待 BrowserWindow 的 `did-finish-load` 或 renderer ready，因为那会无意义地推迟预热。若 renderer 的首个 probe 先于后台预热到达，process pool 的 `pendingStarts` 仍保证同一 Agent 只启动一次。

首次调度的 `Immediate` handle 必须归 warmup lifecycle 所有。Warmup coordinator 注册 app disposable：dispose 时先 `clearImmediate()` 取消尚未触发的首次调度，再标记 coordinator aborted、清空尚未启动的 Agent 队列，并等待或隔离在途 worker。Coordinator disposable 必须先于 process pool disposer 执行；process pool 的 `getOrStartProcess()` 也必须在自身进入 `shuttingDown` 后拒绝新的启动，形成防止退出期 spawn 的双重边界。

不在 renderer bootstrap 中注册 watcher，也不新增 `platform:acp-agents:prewarmConnections` IPC。这样 Launcher、项目窗口数量、多窗口创建顺序和 renderer 状态缓存都不会决定应用级资源是否预热。

### 2. Main 从权威全局配置发现预热目标

`prewarmInstalledAgentConnections()` 使用 `listAgents()` 取得 registry 顺序和解析后的 custom Agent catalog，并使用 `readInstalledRecords()` 过滤 registry Agent；所有有效 custom catalog entry 都加入目标列表。输入保持 catalog 顺序并按 Agent ID 去重。

不调用 `detectAgentStatuses()`：该流程面向 UI 的 installed/version/update 状态，会执行 npm、uv 和命令版本探测；连接预热只需要 installed record、custom 配置与 process pool 自身的启动校验。若 installed record 或 custom command 已失效，`getOrStartProcess()` 的失败只计入对应 Agent，不阻塞其他目标。

### 3. 使用应用级 warmup coordinator，固定最多两个后台启动

在 platform ACP Agent service 下新增 `src/main/services/platform/acp-agent/connection-warmup.ts`。Coordinator 提供：

- `prewarmInstalledAgentConnections()`：发现全部全局目标并提交队列；
- `prewarmAgentConnections(agentIds)`：供安装、升级和 custom 配置保存后的 main service 增量提交。

Coordinator 维护应用级队列、最多两个活跃 warmup worker、首次 `Immediate` handle 和 aborted 状态，并对每个 Agent 调用现有 `getOrStartProcess(agentId)`。同一 Agent 被 app bootstrap、mutation、probe 或 chat 重复请求时，coordinator 的 in-flight 状态与 process pool 的 `pool` / `pendingStarts` 作为双层去重边界。进入 dispose 后，新的 batch 请求只返回取消/失败结果，不得继续排队或启动进程。

固定并发为 2，在“尽早覆盖所有已安装 Agent”和“避免多个重量级 CLI 同时冷启动争抢 CPU、磁盘与登录态”之间取平衡。当前 Agent 的 `probeEnsure` 不进入 warmup 队列，仍可直接调用 `getOrStartProcess()`；若该 Agent 已在预热则加入同一个 `pendingStarts`，若尚在队列则可以立即启动而不等待排队。

Warmup API 为 main 内部 service 能力，返回逐 Agent `ready`/`failed` 结果供日志和测试使用，不进入 shared/preload/renderer public contract。

### 4. Mutation 成功路径由 main 直接增量预热

`installAgentById()` 在调用 installer 前读取 installed record：

- 不存在 record 时视为首次安装，不需要停止进程；安装成功后提交该 Agent 预热；
- 已存在 record 时视为升级或重装，必须先 `stopAgentProcess(agentId, "upgrade")`，安装成功后提交新版本预热。

`uninstallAgentById()` 在卸载命令和删除 installed/capability record 前调用 stop，卸载后不重新预热。

`saveCustomAgents()` 在写入新配置前读取旧配置并比较 command、args 和 env；对被删除或启动配置发生变化的旧 custom Agent ID 主动停止。保存、catalog 重建和 status event 成功后，只提交新配置中新增或仍有效的 custom Agent ID。无变化的 live Agent 会由 process pool 廉价复用。

该设计不依赖 renderer forced status refresh。Renderer 状态更新继续只负责 UI；连接生命周期在 main mutation 返回成功时已经完成调度。

### 5. 将单 Agent主动停止建模为 process pool 生命周期原语

`src/main/infra/process/acp-process-pool.ts` 新增 `stopAgentProcess(agentId, reason)`，并抽取可被单 Agent stop 与全局 dispose 复用的进程终止 helper。主动停止必须覆盖：

- 已在 `pool` 中的 ready 进程和已注册 session handlers；
- 已 spawn 但仍在 `initialize` 的 starting child；
- `pendingStarts`、`restarting` 和该 Agent 尚未触发的 backoff timer；
- `giveUp` 状态，使升级或修正配置后的新进程可以重新尝试。

Restart timer 从无 owner 信息的 `Set<NodeJS.Timeout>` 调整为按 `agentId` 定位的数据结构。进程 exit handler 通过 intentional-stop 标记或启动 generation 判断此次退出是否允许自动重启；主动停止不得计入 crash failures，也不得广播 `agentUnavailable`。

为了能中止长时间卡在 `initialize` 的进程，`startProcess()` 在 spawn 后立即登记 starting child，并在成功、失败或主动终止时统一清理。主动停止不只等待 `pendingStarts` 自然结束。

### 6. 主动停止同时使该 Agent 的所有 draft probe 失效

Ready probe 保存的 `acpSessionId` 属于旧进程，进程被升级、卸载或配置变更主动停止后不能继续返回旧 snapshot。Process pool 增加独立于 `agentUnavailable` 的 process-invalidated 事件；`session-probe-service.ts` 监听该事件，删除该 Agent 在所有 project 下的 probe registry entry、清除 fallback handler，并通过现有 `sessionProbeBus` 向对应项目窗口发送 `snapshot: null`。

主动失效事件不复用 `agentUnavailable`：升级和配置变更不是 Agent 故障，不应让 platform store 把 Agent 标记为不可用。现有 crash give-up 路径仍同时产生 unavailable 语义并清理 probe。

### 7. 升级后的会话继续复用现有恢复算法

主动停止只清理内存中的 ACP connection、session handlers 和 draft probes，不删除 `chat-acp-session-store` 中的持久化 ACP session ID，也不重写 FylloCode session/history。后续 prompt 创建新的 `AcpSession` 并取得升级后的连接后，继续由 `AcpSession.recoverSession()` 按 `resumeSession`、`loadSession`、`newSession + persisted history reminder` 的既有优先级恢复。

不在 warmup coordinator 或升级 service 中主动 resume 所有历史 session，因为 resume 需要项目路径、MCP transport 和具体对话上下文，也会把连接级预热重新耦合到项目级 session 生命周期。

## Risks / Trade-offs

- [预热所有 Agent 增加常驻内存和子进程数量] → 使用最多两个并发启动避免冷启动尖峰；产品目标明确要求所有全局已安装 Agent 保持预热，进程继续由 app disposer 统一回收。
- [预热与首窗竞争资源] → 在 Launcher 创建后 fire-and-forget 调度，不将 Agent readiness 加入 `bootstrapReady()` 的 await 链。
- [应用在 `setImmediate` 触发前或 warmup 队列未清空时退出] → Coordinator disposer 先取消 Immediate 和队列，process pool 在 `shuttingDown` 后拒绝新启动，避免 pool dispose 后再次 spawn。
- [installed record 或 custom command 已失效] → Process pool 以当前记录/catalog 再校验，单 Agent 失败不影响批次。
- [安装或 custom 保存重复提交已有 Agent] → Warmup coordinator 与 `getOrStartProcess()` 双层去重，无变化 live connection 直接复用。
- [升级或配置修改发生在正在执行的 prompt 中] → 主动停止会让当前 turn 按现有 stream 错误路径结束；Proposal 不承诺 mid-turn 迁移，下一次发送使用既有恢复算法。
- [主动停止与 initialize/自动重启竞态产生孤儿进程] → spawn 后立即登记 starting child、timer 按 Agent 归属、intent/generation 阻止旧启动结果重新写入 pool。
- [旧 draft probe 指向已终止 session] → process-invalidated 事件统一清理所有项目的 probe entry，并使用既有 project-scoped probe update 通道同步 renderer。
- [某个 Agent 长期启动失败造成重复日志] → 每次 app bootstrap 或成功 mutation 对每个 Agent只尝试一次；process pool 保留现有 crash backoff/give-up，用户主动 probe 仍可进入既有错误语义。

## Migration Plan

1. 先扩展 process pool 的单 Agent stop、starting child 管理、intentional exit 和 probe invalidation，并以生命周期测试锁定竞态。
2. 实现 main-only warmup coordinator、全局 installed/custom Agent 发现、`setImmediate` 首次调度和可取消 disposable。
3. 将 `bootstrapReady()` 在首窗创建后的下一轮 event loop、首次安装、升级和 custom 配置保存成功路径接入非阻塞预热；将升级、卸载和 custom 变更接入 stop 原语，并让 process pool 在 shutdown 后拒绝新启动。
4. 使用单元测试验证 main bootstrap 不等待 warmup、warmup 与 probe 并发去重、mutation 后增量预热、升级后恢复路径以及多 Agent 失败隔离。
5. 若上线后资源占用不可接受，可移除 `bootstrapReady()` 的首次批量调度，同时保留 mutation 预热和单 Agent stop；这不会改变 session 持久化数据。

## Open Questions

无。当前范围明确采用 main app lifecycle 所有权、全部全局已安装 Agent、最多两个后台启动、连接级预热以及既有 session 恢复语义。
