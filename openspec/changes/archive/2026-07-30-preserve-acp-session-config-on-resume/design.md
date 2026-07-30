## Context

`SessionMeta.configOptions` 当前保存 Agent 在 `session/new`、`session/resume`、`session/load`、`session/set_config_option` 或 `config_option_update` 中最后确认的完整配置快照。Renderer 在应用重启后可通过 `listSessions()` 重新展示该快照，但 `AcpSessionStore` 只向 recovery 提供 `acpSessionId`，因此主进程无法在新 Agent process 上恢复这些选值。

现有 `AcpSession` 每个 prompt turn 都是新实例，并在获得 process pool entry 后先对持久化 ACP session ID 尝试 direct prompt；只有 Agent 报 session missing 才进入 `resumeSession → loadSession → newSession`。新 process 上的 direct prompt 如果成功，配置没有任何 reconciliation；如果进入 recovery，三个 lifecycle response 的 `configOptions` 又会在未校验持久化选值前直接覆盖 session meta。

ACP lifecycle request 不能携带 config values。FylloCode 若要保证应用重启后的配置连续性，只能在 session 重新激活后、首个 prompt 前，通过现有 `session/set_config_option` 逐项恢复。

## Goals / Non-Goals

**Goals:**

- 将 session meta 中最后一次 Agent 确认的 `configOptions` 与 `acpSessionId` 一起提供给 cold recovery。
- 区分当前 Agent process 已激活的 ACP session 与仅存在持久化 ID 的 cold session；cold session 必须先走 lifecycle recovery，不能先发送 direct prompt。
- 对 resume/load/new 返回的 live schema 与持久化期望值做确定性 reconciliation，并在首个 prompt 前恢复所有仍兼容的选值。
- 支持 option 依赖：每次 `setSessionConfigOption` 返回的完整配置成为下一步校验依据，直到达到稳定状态。
- 让 cold session 的用户配置修改先执行无 prompt 的 resume/load 激活和持久化配置恢复，再应用本次新值。
- 保持现有 session meta 字段、renderer API、stream chunk 与 Config Options Bar 调用方式不变。

**Non-Goals:**

- 不修复或假设任何特定 ACP Agent 的内部 session 持久化实现。
- 不在 `resumeSession` / `loadSession` 请求中增加非标准字段。
- 不升级 `@agentclientprotocol/sdk`，不在本变更处理 boolean config client capability advertisement。
- 不保证恢复 Agent 新版本已经删除的 option、改变 type 的 option 或已失效 value。
- 不为 session meta 增加 desired/live 双快照或执行数据迁移。

## Decisions

### 1. Session meta 的完整快照是 cold recovery 的期望值

将 `AcpSessionStore` 从只读写 ACP ID 扩展为加载 `{ acpSessionId, configOptions }` 的持久化 recovery state。`ChatAcpSessionStore` 继续复用 `loadSessionMeta()` / `upsertSessionMeta()`，不新增文件或字段。

该快照只包含 Agent 已经通过 lifecycle、set RPC 或 update notification 确认过的状态，因此可以作为下一次 cold activation 的期望值。正常运行期 Agent 主动调整配置后，现有 `config_option_update` 持久化路径继续更新它。

备选方案是只持久化 `{ configId: value }`。这会丢失 type、option 顺序和上次确认的 schema，无法在 lifecycle response 缺失 `configOptions` 时构造安全的恢复请求，因此不采用。

### 2. Process pool 显式记录 connection-local active session

在 `src/main/infra/process/acp-process-pool.ts` 的 `AgentProcess` 增加 `activeSessionIds: Set<string>`，并提供窄的 mark/has/forget helper。`newSession`、`resumeSession`、`loadSession` 或 probe promotion 成功后标记 active；`closeSession`、切换到 fresh fallback 的新 ID 和 process dispose 时清理对应状态。

`AcpSession` 仅在持久化 ID 已对当前 process entry 标记 active 时尝试 direct prompt。新 process 的集合为空，因此应用重启后的首个 turn 会直接进入 recovery，确保 prompt 之前有机会恢复配置。

备选方案是使用 `sessionHandlers.has(sessionId)` 推断 active。handler 属于 notification routing，会因 cancel、probe handoff 或 turn 生命周期变化而删除，不能稳定表达 Agent connection 是否已激活 session，因此不复用为生命周期事实源。

### 3. Reconciliation 分为纯规划与 ACP RPC 编排

新增纯 helper `src/main/domain/session/chat/session-config-recovery.ts`，只依赖 `@shared/types/acp-config`，负责：

- 按持久化数组顺序生成仍需恢复的候选项；
- 比较 option ID、type、currentValue；
- 校验 select value 是否仍存在于 flat/grouped options，校验 boolean value 类型；
- 汇总 removed、type-changed、invalid-value 等 incompatibility；
- 计算配置 fingerprint，供编排层检测无进展或循环。

新增 service `src/main/services/session/chat/session-config-recovery-service.ts`，负责调用 `connection.setSessionConfigOption()`。每次 RPC 返回的完整 `configOptions` 都替换 live snapshot，然后重新运行纯规划：

1. 优先恢复当前 live schema 中存在且合法、但值不同的 persisted option；
2. 每次只发送一个 set RPC，确保依赖变化进入下一轮规划；
3. 重复到所有可兼容选值一致，或 fingerprint 重复/达到基于 option 数量的有限上限；
4. 最后记录结构化 incompatibility warning，并返回 Agent 确认的完整 live snapshot。

若 lifecycle response 的 `configOptions` 为 `null`/缺失且 persisted snapshot 非空，第一轮使用 persisted schema 强制发送已保存值，以获得 `setSessionConfigOption` 的完整响应；不能因为缺失 response 字段而先 emit `[]`。若 Agent 不支持 set RPC或合法候选的 RPC 失败，reconciliation 抛错，首个 prompt 不发送，原 session meta 保持不变。

备选方案是并发重放所有选项。ACP 每次 set 都可能改变其他 option 的 schema 或 currentValue，并发会丢失依赖顺序与完整快照语义，因此不采用。

### 4. Lifecycle response 只在 reconciliation 完成后发布

`AcpSession.recoverSession()` 对 resume/load/new response 先调用 reconciliation，再产生一次最终 `config_options_update`。Raw response 的默认值、`null` 或中间 set response 不单独发往 IPC，避免 `src/main/ipc/session/chat.ts` 提前覆盖 meta。

如果 option 已删除、type 已变化或 value 已失效，编排层不发送无效 RPC，记录包含 session ID、config ID 与 reason 的 warning，并使用最终 live value。其他兼容项仍继续恢复，最终 snapshot 正常发布并成为新的 session meta。

如果合法恢复 RPC 失败或 reconciliation 发生循环，`AcpSession` 沿用现有 stream error 终止 turn；不发布未确认的最终 snapshot，因而 session meta 保留上次期望值供重试。

### 5. Cold config mutation 复用无 prompt activation，但不创建 fresh session

`config-option-service.ts` 获取 process entry 后先检查 `activeSessionIds`。若目标 session 尚未激活，则复用 lifecycle activation helper，按 Agent capability尝试 `resumeSession`，再尝试 `loadSession`，并先恢复 meta 中已有配置。成功后再执行用户本次 `setSessionConfigOption`。

该 helper 收敛在 `src/main/services/session/chat/acp-session-activation.ts`，接收 connection、initialize response、session ID、cwd 与 MCP servers，并返回 activation strategy 和 raw lifecycle `configOptions`。`AcpSession` 允许它继续执行 fresh fallback；`config-option-service.ts` 传入禁止 fresh fallback 的策略。这样 capability 判断、missing-session error 分类和 active marker 更新不会在两条入口重复实现。

该无 prompt 路径不执行 fresh `newSession` fallback。Fresh recovery 需要历史/system reminder 与首个 prompt 的原子编排，而 config mutation 没有 prompt context；若 resume/load 均不可用或 session missing，调用返回现有 ACP error 且不修改 meta，用户发送下一条消息时再由标准 `AcpSession` fresh fallback 恢复。

备选方案是在 config mutation 中创建 fresh session并标记“待注入 reminder”。这会引入新的跨请求运行时状态和取消边界，且超出配置连续性的必要范围，因此不采用。

## Risks / Trade-offs

- [Agent 的 option 依赖形成循环，恢复 A 会重置 B、恢复 B 又重置 A] → 使用 fingerprint 与有限迭代上限检测，作为恢复错误中止 prompt，避免无限 RPC。
- [Agent lifecycle response 缺失 `configOptions`] → 仅在存在 persisted snapshot 时用已保存 schema 发起强制 set；成功响应提供新的完整 live schema，失败则保留 meta 并中止 prompt。
- [Agent 升级后 schema 不兼容] → removed/type-changed/invalid-value 不发送，记录结构化 warning，继续恢复其他兼容项，最终 live snapshot 成为新 meta。
- [每次重启增加多个串行 RPC] → 只在 connection-local cold activation 时执行；warm session 保留 direct prompt，且 currentValue 已相同的 option 不发送 RPC。
- [Cold config mutation 无法 fresh fallback] → 返回明确 ACP error且不修改 meta；标准首个 prompt 仍可执行 existing fresh fallback 与历史 reminder。

## Migration Plan

1. 扩展内存 process entry 与 `AcpSessionStore` contract，不改 session meta JSON 形状。
2. 接入纯 planner、RPC reconciliation 与 cold activation，再替换 lifecycle response 的直接 emit。
3. 接入 config mutation 的 cold activation。
4. 通过已有 session meta fixtures 验证旧数据（无 `configOptions`）继续按无恢复配置处理。

回滚时可整体移除 reconciliation 与 active session marker，session meta 无需降级迁移。

## Open Questions

无。
