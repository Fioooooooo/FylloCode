## Context

当前 draft probe 的 `configOptions` 已经在主进程内存（`SessionProbeRegistry`）和渲染端（`draftProbeByAgent`）两侧维护，并通过 `chat:probe:update` IPC 互相同步。一旦草稿态首条消息触发 `createSession`：

- 主进程 `chat-service.createSession`（`electron/main/services/chat/chat-service.ts:52-70`）只写入最小 `SessionMeta`（无 `config_options`、无 `acpSessionId`）。
- 渲染端 `useChatStore.streamMessage`（`frontend/src/stores/chat.ts:259-271`）在 createSession 完成的同一同步块里 `applyProbeUpdate(draftAgentIdSnapshot, null)` 删除 draft probe。
- 后续 `chat:stream:message` 的 `takeFor` 路径（`electron/main/ipc/chat.ts:228-245`）才会把 probe 的 `config_options` 与 `acpSessionId` patch 进 meta.json。

但这条 `takeFor` patch 是「主进程异步落盘」，并不会回流到渲染端 store；renderer 只能等到 stream 中 agent 主动 emit `config_options_update` chunk 才能恢复 `activeSession.configOptions`。在不少 ACP agent 实现下，紧随 newSession 的当前 turn 不会再 emit `config_options_update`，于是 `ConfigOptionsBar` 出现一次空帧并保持空到下一次用户交互。

`SessionMeta.config_options` 字段、stream chunk 的双端持久化、`toSession` 的内存映射都已具备（见 `session-meta-storage` spec 与 `chat-service.ts:40`）；本次变更只补齐「createSession 阶段就把 probe 数据搬过去」这一缺失的桥。

## Goals / Non-Goals

**Goals:**

- 用户在草稿态发出第一条消息后，`ConfigOptionsBar` 不出现空帧；新 `Session` 一进入 `sessions.value` 就已带 `configOptions`。
- 关闭 / 重开 FylloCode 后，已带 `config_options` 的 session 在 `loadSessions` 与 `selectSession` 路径上仍能恢复 `configOptions`（已具备，本次变更需要 spec 化以防回归）。
- 主进程主动推送的 `config_options_update` stream chunk 继续同时维护渲染端 store 与 meta.json 持久化（已具备，本次保持）。

**Non-Goals:**

- 不引入新的 IPC 通道用于 idle 期主进程主动推送 config options。当前两条通道（`chat:probe:update` 与 stream `config_options_update`）已经覆盖 draft 与 active 阶段。
- 不改变 `SessionProbeRegistry.takeFor` 的语义，也不删除 stream handler 里的 patch meta 路径；该路径作为兜底保留，与 `createSession` 写入构成幂等关系。
- 不引入「按 agentId 缓存 configOptions schema」机制（与 `session-meta-storage` 现有约束一致）。
- 不改变 archive / apply owner 的 ACP session 持久化（它们走自己的 `AcpSessionStore`，不触及 `session-store`）。

## Decisions

### 决策 1：在 `chat:createSession` 入参里增可选 `configOptions` 与 `acpSessionId`，而不是只依赖 stream `takeFor` 的兜底

- 选项 A（采纳）：`createSession` 入参扩展可选字段，service 直接把它们写进新 `SessionMeta`；返回的 `Session` 已经带 `configOptions`，渲染端 store 一次性拿到完整状态。
- 选项 B（已否决）：保留 `createSession` 现状，只让前端先 `createSession`，再立刻 `chat:setConfigOption` 或读 meta 回填。需要额外一轮 IPC，仍存在中间帧；且 `chat:setConfigOption` 的语义是「修改值」而非「初始化 schema」，不合适。
- 选项 C（已否决）：把 draft probe 的内存态直接搬给 `activeSession`，不写 meta.json。问题是关闭重开后 session 仍然不带 `config_options`，违反「持续维护」目标，且与 `session-meta-storage` 已有约束相冲突。

选项 A 的另一个收益：renderer 不需要在 createSession 之后自己拼 `configOptions` 写入 store —— 主进程返回的 `Session` 已经经过 `toSession(meta, projectId)` 映射，含 `configOptions`，与现有 listSessions / loadSessions 的恢复路径走同一套代码。

### 决策 2：`applyProbeUpdate(draftAgentId, null)` 推迟到 `createSession` 已写入 `sessions.value` 之后

- 选项 A（采纳）：保持 draft probe 直到 `sessionStore.createSession` 的 Promise resolve 且 `sessions.value` 已包含新 session（renderer 内部用 `findSession` 验证）后再 `applyProbeUpdate(null)`。`ConfigOptionsBar` 在两个数据源之间无缝切换，因为 `activeSession` 与 `activeDraftProbe` 在过渡瞬间至少有一个非空。
- 选项 B（已否决）：完全不再调 `applyProbeUpdate(null)`，让 draft probe 自己随 watcher 因 `effectiveAgentId` 不变而保留。但 `effectiveAgentId` 在创建 session 后会切到 `activeSession.agentId`，watcher 不会主动关 draft probe；如果不显式清掉，`draftProbeByAgent` 会在内存中持续累积，用户切回草稿态再换 agent 时残留旧 probe。代价大于收益。
- 选项 C（已否决）：在主进程侧让 `createSession` 自动 takeFor 注册表中的对应 entry。这会把「promote draft probe」语义从 stream 路径转移到 createSession 路径，破坏 `chat-session-probe` spec 中 `takeFor` 与 stream handler 的强耦合契约（acpSessionId 不匹配时 stream 立即失败），需要重写一整段 spec。本次变更范围内不做。

### 决策 3：`stream:message` 入参在 createSession 已写入 config_options 后仍允许携带 `acpSessionId`，并执行 `takeFor` + patch meta 作为兜底

幂等性来自 patch 的具体字段：`{ acpSessionId, agentId, config_options, updatedAt }` —— 当 createSession 已经写过这些值时，再次写入只会更新 `updatedAt`。这保留了两条好处：

- 老 renderer / 老调用方未传 `configOptions` 给 `createSession` 时，stream `takeFor` 仍然能把 probe 数据写进 meta.json。
- `SessionProbeRegistry.takeFor` 的「acpSessionId 不匹配立即拒绝」契约不变（继续作为消费 probe 内存槽位的事务边界）。

### 决策 4：渲染端 `useSessionStore.createSession` 透传字段而非读 `draftProbeByAgent`

由 `useChatStore.streamMessage` 调用方显式传入 `configOptions` 与 `acpSessionId`，`useSessionStore.createSession` 不去读 `draftProbeByAgent`。理由：

- `createSession` 在测试里被作为最小通用 action 直接调用（见 `frontend/src/__tests__/stores/session.spec.ts`）；让它隐式依赖 `draftProbeByAgent` 会扩大其副作用面。
- streamMessage 已经持有 `probeBeforeCreate` 引用（`chat.ts:256`），透传几乎零成本。
- 后续若有其他场景（例如恢复型创建）想跳过 probe，可不传字段，行为退化到老路径。

## Risks / Trade-offs

- **风险**：渲染端 streamMessage 在 `createSession` 失败或被取消时，draft probe 可能仍残留 → 当前流程在 catch 分支不调 `applyProbeUpdate(null)`，与现状一致；不影响本次变更的目标，但要在测试里覆盖「失败后 draft probe 仍可被下一次 streamMessage 复用」。**Mitigation**：tasks.md 中显式列入失败路径的回归测试。
- **风险**：`createSession` IPC 入参扩展后，旧版 preload / 老 renderer 调用未带新字段时，main schema 校验需保持向后兼容。**Mitigation**：在 `shared/schemas/ipc/chat.ts` 用 `.optional()` 标注；service 做存在性判断而非强制读取。
- **权衡**：`takeFor` 兜底路径会在 createSession 已写入 config_options 的情况下做一次冗余 patch（值相同，仅 `updatedAt` 变化）。代价是一次小幅 meta.json 写入；收益是保留 stream handler 的 acpSessionId 校验事务。**结论**：接受冗余以换取契约稳定。
- **权衡**：本次未引入 idle 期主进程主动推送 config options 的新通道。若未来某 ACP agent 在 newSession 之外的 idle 阶段产生 config 变更，需要单独提案设计推送通道；当前没有该需求。

## Migration Plan

无数据迁移需求：

- `SessionMeta.config_options` 字段已存在；老 session 文件没有该字段时 `toSession` 返回 `Session.configOptions === undefined`，`ConfigOptionsBar` 的 `?? []` 回落已覆盖。
- IPC schema 仅做可选扩展，preload / main 同步发布即可，无需阶段式部署（本应用是单进程桌面端）。

回滚策略：还原本次 change 的代码改动即可；不会写入与旧版冲突的字段。
