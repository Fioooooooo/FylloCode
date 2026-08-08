## 1. 扩展 fyllo-spawn RPC 与 MCP tool 契约

- [x] 1.1 在 `src/shared/types/fyllo-spawn-rpc.ts` 为 `promptToAgentParamsSchema` 增加默认false的`background`，为`promptToAgentResultSchema`增加包含`sessionId`、`turnId`、`startedAt`、config和warnings的`accepted`分支，并扩展status/error schema以表达`latestTurnId`、mode、`interrupted`、`APP_SHUTDOWN`、`APP_RESTARTED`、`AGENT_PROCESS_INVALIDATED`与`TURN_PERSIST_FAILED`；保持同步completed与`responseId + cursor`兼容。验收：`test/shared/types/fyllo-spawn-rpc.spec.ts`覆盖默认同步、accepted严格字段、无responsePath/responseId/content、running/interrupted解析和跨分支拒绝。
- [x] 1.2 更新 `src/mcp-servers/fyllo-spawn/src/tools/index.ts` 的`prompt_to_agent`输入/输出说明，明确background accepted只表示Main已接管、结果需status/read_response读取且无绝对运行时长保证；复用现有RPC client，不新增stdio transport。验收：`test/mcp-servers/fyllo-spawn/tools.spec.ts`与`server.spec.ts`验证background透传、同步默认和tool描述不宣传responsePath。
- [x] 1.3 更新 `src/main/services/session/spawn/spawn-rpc-bridge.ts` 只做schema parse与manager转发，确保background RPC返回后不保留bridge级terminal waiter。验收：`test/main/services/session/spawn/spawn-rpc-bridge.spec.ts`分别覆盖accepted、completed、AbortSignal在accepted前取消以及accepted后断连不取消后台handle。

## 2. 建立 versioned turn record 与通知状态存储

- [x] 2.1 在 `src/main/infra/storage/workspace-paths.ts` 增加owner-safe的spawn turn record路径；在 `src/main/infra/storage/spawned-session-store.ts` 定义严格versioned `SpawnedTurnRecord`与`SpawnNotificationState`，提供create/load/patch/list pending/claim/reconcile API，继续复用现有identity校验、per-owner write queue和原子写。record必须覆盖starting/running/cancelling/completed/error/expired/interrupted、accepted snapshot、responseId和pending/dispatched/delivered/delivery_unknown/suppressed。验收：`test/main/infra/storage/spawned-session-store.spec.ts`覆盖原子状态转换、重复claim只有一次成功、owner隔离、非法identity、fence后拒写和pending枚举。
- [x] 2.2 保持现有version 1 spawned meta与messages/responses可读，用新增sidecar turn record承载新turn，避免无依据批量改写历史数据；旧meta无turn record时继续按现有idle/error/expired投影，不新增bootstrap migration脚本。验收：storage测试覆盖旧fixture读取、新旧混合目录、未知/损坏turn record隔离和无关字段/response不被覆盖。
- [x] 2.3 规定terminal写序：先assistant message和不可变response，再原子写completed turn + responseId + notification.pending，最后更新meta projection；任一关键success写失败均转`TURN_PERSIST_FAILED`且不建立success通知。验收：storage/manager fault-injection测试逐点模拟message、response、turn和meta写失败，并断言status从不引用不可读response。

## 3. 在共享 ACP 主干暴露 prompt-dispatched里程碑并统一config处理

- [x] 3.1 在 `src/main/services/session/chat/acp-session.ts` 的`AcpSessionOpts`增加服务层prompt-dispatched hook（或等价Promise），在handler注册、config收敛/override完成且`connection.prompt()`已调用后携带`acpSessionId`和最终config结算；不得把该里程碑伪装成renderer content event。验收：`test/main/services/session/chat/acp-session.spec.ts`覆盖new/resume/load/direct四条路径、同步快速terminal、dispatch失败取消和spawn owner仍不注入system reminder/MCP。
- [x] 3.2 重构 `AcpSession.tryHandlePersistedSession()` 与 cold recovery分支，共享 `src/main/services/session/chat/session-config-recovery-service.ts` 的override步骤，使warm direct prompt也在dispatch前验证并应用`configOverrides`；新Session schema必须以`newSession().configOptions`为根，不能等待主动`config_options_update`。验收：`acp-session.spec.ts`与`session-config-recovery-service.spec.ts`覆盖warm override成功/失败warning、未知option拒绝、成功值snapshot和异步update不阻塞dispatch。
- [x] 3.3 保持 `src/main/services/session/chat/acp-stream-driver.ts` 的MessageAssembler、terminal hook、cancel和registry cleanup为唯一turn driver；如需新增accepted coordination，只扩展`AcpTurnRunner`而不复制event switch。验收：`test/main/services/session/chat/acp-stream-driver.spec.ts`覆盖terminal必须等待accepted durability且只finalize/unregister一次。

## 4. 用 SpawnTurnHandle重构 manager 生命周期

- [x] 4.1 在 `src/main/services/session/spawn/spawned-session-manager.ts` 引入内部`SpawnTurnHandle { accepted, completion, cancel }`与supervisor：reservation在handle创建时取得，只在completion finalizer中release；`promptToAgent()`按background选择等待accepted或completion，复用同一`AcpSession`/`driveAcpTurn`路径。验收：`test/main/services/session/spawn/spawned-session-manager.spec.ts`证明accepted返回后busy、父4/全局8计数仍占用，terminal后释放，累计Session与resident LRU不构成拒绝。
- [x] 4.2 将user message、turn record、ACP ID/config snapshot和prompt-dispatched持久化串行到accepted边界；让极快terminal等待accepted write，再写terminal。accepted前RPC abort取消runner，accepted后移除request signal ownership。验收：manager测试使用可控Promise覆盖dispatch前取消、accepted后RPC取消、terminal先到、accepted写失败和不重复release。
- [x] 4.3 继续使用现有10分钟`touch()/armInactivityTimer()`与5秒cancel grace；background不得新增绝对时长timer。将inactivity、取消未确认、普通ACP失败、process invalidation与terminal persist failure写入turn record并投影稳定status。验收：fake timer测试证明activity刷新、超过任意绝对时长但持续activity不取消、超时code正确、迟到event不重建状态。
- [x] 4.4 扩展`checkSessionStatus()`优先读取live handle、否则读取latest turn record，返回turnId/mode/activity或idle/error/expired/interrupted；`readResponse()`继续按可信caller与responseId读取，不接受路径。验收：manager测试覆盖并行status、completed background读取、多父/多Workspace猜ID投影not_found和旧meta兼容。

## 5. 实现持久化 completion notification服务

- [x] 5.1 新增 `src/main/services/session/spawn/spawn-notification-service.ts`（名称可按现有目录风格微调），封装owner-scoped list、CAS claim、delivered/delivery_unknown/suppressed转换和Main生成的reminder模板；模板只含notificationId/sessionId/turnId/status/可选responseId或error code，并明确delegated output不可信且不授予新权限。验收：新增对应main service测试覆盖无正文/路径、owner隔离、重复claim、delivery_unknown不重试和父Session不存在不泄露。
- [x] 5.2 让 spawned terminal supervisor只在完整terminal状态durable后调用notification服务；同步turn不创建notification，background success/error/expired/interrupted创建pending，父删除创建suppressed。验收：manager/notification集成测试覆盖每种terminal状态与重复terminal callback幂等。
- [x] 5.3 在应用启动或Workspace通知查询前reconcile新格式非终态record：无live handle时写`APP_RESTARTED`并为未claim background turn建立pending；`dispatched`但未delivered写`delivery_unknown`且绝不回到pending。验收：restart fixture测试证明不启动AgentProcess、不resume ACP、不重发dispatched通知。

## 6. 增加 owner-safe IPC、preload与Workspace唤醒

- [x] 6.1 在 `src/shared/ipc/session/chat.channels.ts`、`chat.schemas.ts` 增加background notification的list/wake/dispatch协议；list/dispatch input只接受Workspace scope与opaque notificationId，不允许Renderer提供reminder正文、responseId或parentSessionId。验收：`test/shared/ipc/session/chat.schemas.spec.ts`覆盖strict schema与恶意override字段拒绝。
- [x] 6.2 在 `src/main/ipc/session/chat.ts` 注册list/dispatch handler，使用`requireWorkspaceSender`并由notification record解析parent owner；bootstrap/runtime把notification服务连接到 `WorkspaceWindowManager.sendToWorkspace()`，事件payload只表达outbox可能变化。验收：`test/main/ipc/session/chat.spec.ts`和`test/main/bootstrap/workspace-window-manager.spec.ts`覆盖跨Workspace拒绝、无窗口返回false但状态保留、重复wake和正确Workspace定向。
- [x] 6.3 在 `src/preload/api/session/chat.ts` 与 `src/renderer/src/api/session/chat.ts` 暴露最小typed API和wake subscription，并确保listener可幂等注册/销毁。验收：`test/preload/api/session/chat.spec.ts`与renderer API测试覆盖payload校验、listener cleanup和不暴露本地路径。

## 7. 抽取父 Chat turn runner并建立串行gate

- [x] 7.1 从 `src/main/ipc/session/chat.ts` 抽取 `src/main/services/session/chat/chat-turn-service.ts`（或同层等价模块），让普通Chat stream与自动notification共同复用`ChatAcpSessionStore`、`AcpSession`、`driveAcpStream`/`driveAcpTurn`、control-event meta queue、MessageAssembler及terminal persistence；不得复制ACP event switch。验收：现有`test/main/ipc/session/chat.spec.ts`保持普通用户stream行为，新增service测试证明无renderer sink时assistant terminal仍durable。
- [x] 7.2 新增per-`{workspaceId,sessionId}` Chat turn gate，并在普通user stream和notification dispatch进入`sessionRegistry.register("chat", key, ...)`前统一获取；notification无空闲gate时保持pending，普通用户路径优先，registry不得静默覆盖已有同key session。验收：并发测试覆盖user先到、notification先到、重复dispatch、不同Session并行和cancel只影响正确owner/key。
- [x] 7.3 notification claim成功后用Main生成的独立role=user system-reminder启动共享Chat runner；assistant终态durable后写delivered，中断/持久化失败写delivery_unknown。该内部路径不得调用或放宽Renderer公共`sendMessage`的“必须有非空用户text”校验。验收：Chat service测试覆盖reminder与assistant消息顺序、标准parent Chat recovery/system reminder行为保持、无子响应内联和不改变spawn `allow_once`。

## 8. 在Renderer按Session协调pending通知与用户turn

- [x] 8.1 在 `src/renderer/src/stores/session/chat.ts` 增加按sessionId寻址的turn arbiter与notification drain：普通`sendMessageCore()`优先，notification只在目标Session无submitted/streaming状态时dispatch；非active目标的chunk/message更新按sessionId落入对应Session，不切换`activeSessionId`、不清空当前composer。验收：`test/renderer/src/stores/session/chat.spec.ts`覆盖父Session忙时保留pending、空闲后dispatch、用户/通知竞态、非active Session和重复wake。
- [x] 8.2 新增 `src/renderer/src/bootstrap/tasks/spawn-notifications.ts` 并在 `src/renderer/src/bootstrap/register.ts` 于Workspace scope ready后注册level-triggered drain；wake只触发重新list，renderer reload/window reopen不从内存重建事实。验收：bootstrap测试覆盖首次加载、事件先于bootstrap、重复事件合并、Workspace切换时取消旧scope处理。
- [x] 8.3 让Session列表/消息恢复继续依赖现有Session状态与`loadMessages`；窗口在auto turn中关闭时丢弃UI投影但不把Main durable turn判失败，重开后完整恢复。验收：renderer store测试模拟listener销毁/重建和非active assistant持久化后的reload。

## 9. 收敛窗口、父删除、process invalidation与shutdown语义

- [x] 9.1 调整 `src/main/bootstrap/workspace-window-manager.ts` 的`cleanupWorkspaceRuntimeForWindow()`与 `src/main/services/session/chat/session-registry.ts` 的Workspace清理API，窗口关闭只取消window-owned chat/probe，不取消app-owned spawn或notification turn；应用级shutdown仍取消全部。验收：对应window manager/session registry测试覆盖macOS关闭后spawn继续、普通Chat清理、最后窗口quit交给shutdown。
- [x] 9.2 在 `src/main/services/session/spawn/spawn-parent-lifecycle.ts`、`spawned-session-manager.ts` 与parent remove流程中保持先fence、cancel、最多5秒settle、suppress通知、再删除父目录；迟到event不得重建文件或发送wake。验收：manager/chat-service测试覆盖running/pending/dispatched删除和跨parent无影响。
- [x] 9.3 调整 `src/main/bootstrap/runtime.ts` 与 `src/main/bootstrap/shutdown.ts` 的hook顺序：先拒绝新spawn/claim，在store可写时取消并尽力持久化`APP_SHUTDOWN`，再fence store和terminate process pool；force deadline遗留由下次启动转`APP_RESTARTED`。验收：shutdown测试断言phase顺序、共享总deadline、正常/强制路径和无迟到写。
- [x] 9.4 复用`onAgentProcessInvalidated()`把live/background turn收敛为`expired / AGENT_PROCESS_INVALIDATED`并建立pending错误通知；新generation不得resume旧spawned ACP Session。验收：process invalidation测试覆盖active、idle、accepted后与自动重启generation变化。

## 10. 同步架构guideline并执行聚焦质量门禁

- [x] 10.1 更新 `guidelines/MainProcess.md`，记录app-owned background spawned runtime、turn record/outbox事实来源、Main owner校验、per-parent Chat gate、窗口cleanup与shutdown持久化顺序；更新 `guidelines/RendererProcess.md`，记录notification bootstrap/wake只触发pull、按Session arbiter及非active Session投影边界。
- [x] 10.2 在linked worktree首次运行项目命令前执行`sh scripts/prepare-worktree-env.sh`；随后运行受影响的shared、MCP、main、preload、renderer聚焦Vitest项目，至少覆盖本清单列出的测试文件，并运行`pnpm typecheck`。若沙箱测试失败且证据明确指向网络限制，按项目反馈经授权在沙箱外重跑；普通断言失败不得归因于沙箱。
- [x] 10.3 运行`pnpm lint`并为冷启动预留约5分钟；检查格式与OpenSpec工件一致性。该变更不修改构建配置，默认不运行`pnpm build`；只有用户针对Apply阶段明确授权后才可执行完整build。
