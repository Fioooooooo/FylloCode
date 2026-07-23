## 1. ACP Process Pool 单 Agent 生命周期

- [x] 1.1 修改 `src/main/infra/process/acp-process-pool.ts`：在 `startProcess()` spawn 后立即按 `agentId` 登记 starting child，将 restart timer 改为可按 Agent 取消的结构，并抽取 ready/starting child 共用的安全终止 helper；验收标准是初始化中、ready 和 backoff restart 三种状态都能被精确定位且全局 `dispose()` 继续复用同一清理逻辑。
- [x] 1.2 在 `src/main/infra/process/acp-process-pool.ts` 实现并 export `stopAgentProcess(agentId, reason)`：取消该 Agent 的 starting/restarting/pending 状态，停止进程树、清理 `pool`/`pendingStarts`/`restarting`/`giveUp`，并使用 intentional-stop 或 generation 防止旧启动结果和 exit handler 自动重启；主动停止不得增加 failure、触发 crash give-up 或广播 `agentUnavailable`，`getOrStartProcess()` 在全局 `shuttingDown` 后必须拒绝新启动。
- [x] 1.3 在 process pool event bus 增加 Agent process-invalidated 订阅入口，使主动停止和 crash give-up 都能通知 session-owned 清理逻辑，同时仅 crash give-up 保留现有 `agentUnavailable` 广播；事件 payload 必须包含 `agentId` 和失效原因，且不得依赖 `BrowserWindow`。
- [x] 1.4 扩展 `test/main/infra/process/acp-process-pool.spec.ts`：覆盖 stop ready process、stop 卡在 `initialize` 的 starting child、取消 backoff timer、清除 give-up、旧 start 不回写 pool、主动退出不自动 restart/不发 unavailable、shutdown 后拒绝 `getOrStartProcess()`，以及 warmup/probe 并发请求仍只 spawn 一次。

## 2. Draft Probe 失效与 Session 恢复边界

- [x] 2.1 在 `src/main/services/session/chat/session-probe-registry.ts` 增加按 `agentId` 删除所有 project entry 的方法，并返回被删除条目供调用方逐项目发送更新；保留现有 `(projectId, agentId)` 隔离键。
- [x] 2.2 修改 `src/main/services/session/chat/session-probe-service.ts`：订阅 process-invalidated 事件，清除该 Agent 的 probe fallback/session handler 和所有 project probe entry，并通过现有 `sessionProbeBus` 对每个受影响 project 发送 `snapshot: null`；主动升级/配置变更不得走 platform `agentUnavailable` UI 语义。
- [x] 2.3 扩展 `test/main/services/session/chat/session-probe-service.spec.ts` 与 `session-probe-registry.spec.ts`：覆盖同一 Agent 跨项目 probe 被清空、其他 Agent 不受影响、每个项目分别收到 null update，以及失效后再次 `ensureProbe()` 会创建新 session 而不是返回旧 snapshot。
- [x] 2.4 在 `test/main/services/session/chat/acp-session.spec.ts` 增加升级后新 connection 使用已持久化 ACP session ID 的回归场景，断言仍按 `resumeSession` → `loadSession` → fresh `newSession` fallback 顺序执行，并保持 persisted history reminder 只用于 fresh fallback；不得在 production `AcpSession.recoverSession()` 中引入新的恢复分支。

## 3. Main-Owned 连接预热

- [x] 3.1 新建 `src/main/services/platform/acp-agent/connection-warmup.ts`：实现 `resolveInstalledAgentIds()`，复用 `listAgents()` 与 `readInstalledRecords()`，按 catalog 顺序选择具有 installed record 的 registry Agent 和所有有效 custom Agent，不调用 `detectAgentStatuses()`。
- [x] 3.2 在同一模块实现应用级 `prewarmAgentConnections(agentIds)` coordinator 与 `prewarmInstalledAgentConnections()`：输入去重保序、最多两个后台 worker、每个条目调用 `getOrStartProcess()`、逐 Agent 归一化 ready/failed 结果，并让并发批次共享在途工作；coordinator 必须持有首次 `Immediate`、aborted 状态和 app disposable，dispose 时取消 Immediate、清空未启动队列并阻止新 batch，且先于 process pool dispose；当前 probe 直接调用 process pool 时不得被 warmup 队列阻塞。
- [x] 3.3 修改 `src/main/bootstrap/index.ts`：在 `bootstrapReady()` 完成 shell PATH、migration、handler/event 注册和 `projectWindowManager.openLauncherWindow()` 后，通过 `setImmediate` fire-and-forget 调用 `prewarmInstalledAgentConnections()`；不等待 BrowserWindow `did-finish-load`，只记录顶层发现错误，不把 Agent readiness 加入 await 链，并把 Immediate handle 交给 coordinator lifecycle 管理。
- [x] 3.4 新增 `test/main/services/platform/acp-agent/connection-warmup.spec.ts`：覆盖全局 registry/custom 目标发现、不执行 status/version detection、最多两个活跃启动、输入去重保序、跨批次同 Agent 合并、单 Agent 失败隔离、queued Agent 被 probe 直接 `getOrStartProcess()` 抢先启动后的复用，以及 dispose 取消首次 Immediate/未启动队列并拒绝新 batch。
- [x] 3.5 扩展 `test/main/bootstrap/index.spec.ts`：使用 fake timers/Immediate 断言预热发生在 shell PATH、migration、IPC/event setup 和首窗创建后的下一轮 event loop，不等待 `did-finish-load` 或 warmup ready，且 warmup discovery 失败不会阻止 Launcher 使用。

## 4. 安装、升级、卸载与 Custom Agent 配置变更

- [x] 4.1 修改 `src/main/services/platform/acp-agent/acp-agent-service.ts` 的 `installAgentById()`：在 installer 前读取 installed record；record 已存在时先 `await stopAgentProcess(agentId, "upgrade")`，首次安装则不 stop；installer 成功后 fire-and-forget 调用 `prewarmAgentConnections([agentId])`，保持既有 progress/status 语义。
- [x] 4.2 修改同一 service 的 `uninstallAgentById()`：在运行卸载命令、`removeInstalledRecord()` 和 `removeAgentCapabilities()` 前停止对应 Agent 进程，保证旧进程不会在卸载后被 restart 或重新写入 pool，并且成功卸载后不提交预热。
- [x] 4.3 修改 `saveCustomAgents()`：保存前读取旧 custom 配置，使用现有 custom Agent ID 生成规则比较 command、args、env，对被删除或启动配置变化的旧 Agent 调用 `stopAgentProcess()`；保存、catalog 重建与 status event 成功后，调用 `prewarmAgentConnections()` 提交新配置中新增、变更或仍有效的 custom Agent。
- [x] 4.4 扩展 `test/main/services/platform/acp-agent/acp-agent-service.spec.ts` 和 `.test.ts`：断言升级 stop 发生在 installer 前且成功后预热、首次安装不 stop 且成功后预热、失败安装不预热、卸载 stop 发生在磁盘记录删除前且不重启、custom command/args/env 变化或删除会 stop、保存后只预热有效 catalog，并验证 mutation 不删除 session storage。

## 5. 工程约定与验证

- [x] 5.1 更新 `guidelines/MainProcess.md`，记录 main app lifecycle 对全局 Agent 预热的所有权、首窗创建后通过 `setImmediate` 且不等待 `did-finish-load` 的调度、可取消 coordinator、mutation 增量预热、ACP process pool 的 shutdown 拒绝、单 Agent intentional stop、升级/卸载/config invalidation 和全局 dispose；Renderer guideline 无需增加预热职责。
- [x] 5.2 运行 targeted main tests：`pnpm exec vitest run --project main test/main/bootstrap/index.spec.ts test/main/infra/process/acp-process-pool.spec.ts test/main/services/platform/acp-agent test/main/services/session/chat/session-probe-service.spec.ts test/main/services/session/chat/session-probe-registry.spec.ts test/main/services/session/chat/acp-session.spec.ts`，修复所有失败。
- [x] 5.3 运行 `pnpm typecheck:node` 与 `pnpm lint`，确认 main bootstrap、service/domain import、process lifecycle 类型和注释符合现有质量门禁。
