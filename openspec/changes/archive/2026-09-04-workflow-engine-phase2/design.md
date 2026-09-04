## Context

Phase 1（已归档，`openspec/specs/{workflow-engine,fyllo-workflow-mcp,workflow-run-inspection}/spec.md`）已经实现：

- `fyllo-workflow` bundled MCP server（`transportPolicy: "http-only"`），目前只注册 `list_workflows`/`trigger_workflow` 两个 tool，通过 `src/main/services/automation/workflow/workflow-rpc-bridge.ts` 以 Node child_process IPC RPC 调用 Main（`src/mcp-servers/fyllo-workflow/src/rpc-client.ts`/`rpc-schema.ts`）。
- workflow definition 只有 workspace 正式来源：`workspaceDataDir(workspaceId)/workflows/<workflow-id>/definition.yaml`（`src/main/infra/storage/workflow-definition-store.ts`、`workspace-paths.ts`）。Phase 1 设计文档第 8 节已预留 session 临时来源路径 `sessions/<session-id>/workflows/<workflow-id>.yaml`，但未实现。
- Run 状态机、wake+pull 展示信道（`automation:workflow-run:*`）、`ChatBackgroundActivityBar` 上的 `WorkflowRunActivityEntry` 均已上线，`WorkflowEngine.trigger_workflow` 是唯一权威的运行时能力预检入口。
- `SessionOwner` 类型（`src/main/services/session/chat/session-registry.ts:10`）已经包含 `"workflow"`（Phase 1 为 fresh Agent stage 引入），本次不需要新增 owner 类型。
- `ChatTurnGate`（`chat-turn-gate.ts`）的 `ChatTurnKind` 仍是 `"user" | "notification"`；`spawn-notification-service.ts` + `chat-turn-service.ts` 的 `claimSpawnNotificationTurn`/`executeNotificationTurn` 已经实现了"owner-scoped 五状态 outbox + wake 通知 Renderer + Renderer 按需 claim + turn 忙碌保持 pending"的完整模式，可作为 workflow cancel reminder 的结构参照。
- chat system-reminder 由 `src/main/services/session/chat/system-reminder/providers/chat.ts` 按 `[template, workspaceSection, guidelinesSection, knowledgeSection, FylloAction contract, FylloSignal contract]` 顺序拼接；`resolveSystemReminder` 对 `owner === "workflow" | "spawn"` 直接返回 `null`（fresh Agent stage 不吃这套 reminder）。
- `references/**` 在 `electron-builder.yml` 中被显式排除出打包（`"!references/**"`），因此 `definition-schema.md` 不能在运行时被 MCP server 读取，`describe_workflow_schema` 的返回内容必须作为包内维护的资产。

设计方案已在 `references/designs/workflow-engine/phase2/phase2-agent-generation.md` 完整收敛，阻塞讨论记录见同目录 `phase2-blocker-decision-log.md`（P0-1～P0-9 全部"已结论"）。本文档把该设计翻译为对当前代码库的具体改动方案。

## Goals / Non-Goals

**Goals:**

- Agent 能在对话中调用 `describe_workflow_schema` 了解格式，再调用 `propose_workflow` 提交生成/更新的 workflow YAML，供用户在确认卡片上审阅。
- 用户确认后，definition 按用户选择的 `persist`（`session` shadow 或 `workspace` 正式资产）落盘，`trigger_workflow` 能解析到该 definition 并按 session shadow 优先于 workspace 的顺序启动执行。
- 用户取消时，Agent 能通过既有 notification 机制收到不可见提示；用户确认时，Agent 能通过一条最小 `role: user` handoff 收到"该调用 `trigger_workflow` 了"的提示。
- Proposal 是 session-owned 临时状态，与 Phase 1 Run 数据模型、store、owner 完全独立，二者作为 `ChatBackgroundActivityBar` 的 sibling entry 共存。

**Non-Goals（已在 blocker 讨论中明确排除）：**

- 不实现 `context: inherit`、`WaitStage`、非 `human` Gate、`retry`/`idempotencyKey` 等 Phase 1 未覆盖的运行时能力——`propose_workflow` 允许它们进入 proposal，`trigger_workflow` 仍按 Phase 1 profile 结构化拒绝。
- 不强制 agent 生成的 `exec` stage 使用 `confirm: true`（P0-7 用户决策：卡片 review + 既有 stage-level `confirm` 语义已经足够）。
- 不引入跨文件事务、target 锁、backup/restore、commit-intent/hash 协议（P0-2 用户决策：基本校验 + 落盘/执行解耦即可）。
- 不把 `WorkflowRunActivityEntry`/`WorkflowProposalActivityEntry` 迁移到 `ChatEventRail`，不新增 EventRail contributor/attention 协议（P0-9）。
- 不实现 agent 主动提议或隐式复用判断，只响应用户显式要求（P0-8）。
- 不做 `persist: session` 到 workspace 的"事后转正"入口；要沉淀必须重新走一次 `propose_workflow` + 确认卡片。

## Decisions

### D1. `describe_workflow_schema` 的内容维护在 MCP server 包内，不在运行时读 `references/`

`references/**` 被 `electron-builder.yml` 显式排除出打包（第 20 行 `"!references/**"`），且 `references/CLAUDE.md` 明确该目录"仅供参考，不是事实依据"。因此 `describe_workflow_schema` 返回的 schema 骨架（definition-schema 第 1-9 节 + 第 10 节示例）必须作为 `src/mcp-servers/fyllo-workflow/src/schema-docs/{schema.md,examples.md}` 之类的包内静态资产维护，工具实现直接 `import`/内联字符串返回，不做运行时文件系统读取。这两份文档与 `references/designs/workflow-engine/definition-schema.md` 保持内容一致但物理独立；`references/` 版本仍是设计基线，`schema-docs/` 是它的运行时快照，两者不同步时以 `references/` 为准人工同步（`tasks.md` 会包含一条同步任务）。

**替代方案**：运行时通过某种打包时复制机制把 `references/designs/workflow-engine/definition-schema.md` 打进 `resources/`——被拒绝，因为这会让一份明确标注"仅供参考"的设计文档变成运行时依赖，且该目录未来可能包含大量与 schema 无关的内容，没有必要为了一个字段引入构建时的选择性打包规则。

### D2. `propose_workflow`/`describe_workflow_schema` 走既有 RPC bridge，`workflow-rpc-bridge.ts` 新增两个 method 分派到新的 `workflow-proposal-service.ts`

沿用 Phase 1 的 `fyllo-workflow-rpc` 协议（`FYLLO_WORKFLOW_RPC_PROTOCOL`/`FYLLO_WORKFLOW_RPC_VERSION`，`src/mcp-servers/fyllo-workflow/src/rpc-schema.ts`）：

- `workflowRpcMethodSchema` 从 `["list_workflows", "trigger_workflow"]` 扩展为 `["list_workflows", "trigger_workflow", "describe_workflow_schema", "propose_workflow"]`。
- `describe_workflow_schema` 请求/响应不携带 owner 相关字段（无副作用查询），`propose_workflow` 复用既有 `workflowRpcCallerSchema`（`workspaceId`/`parentSessionId`/`callerType`）注入 trusted context，请求体只有 `{yaml, persist, mode, workflowId?}`。
- `trigger_workflow`/`list_workflows` 路由到既有 `workflow-engine.ts`/`workflow-service.ts`；新增两个 method 路由到新增的 `src/main/services/automation/workflow/workflow-proposal-service.ts`。Host 侧的 server-neutral envelope、requestId 关联、codec 选择机制（`fyllo-workflow-mcp` spec 已定义）不变，只是 handler 内部按 method 分派到两个不同的 Main service。
- `callerType !== "chat"` 时 `propose_workflow` 复用 `trigger_workflow` 已有的 `WORKFLOW_INVALID_CALLER` 拒绝路径；`describe_workflow_schema` 不做 caller 类型限制（纯信息查询，workflow-owned fresh session 本来就不在 allowlist 里，不会拿到这个 tool）。

**替代方案**：为 proposal 相关调用新开一个 bundled MCP server 或一个新协议版本——被拒绝，`fyllo-workflow-mcp` spec 已经把"一个 server 对应一个 codec/协议"作为约束，Phase 2 只是给同一个 server 增加 tool，没有理由破坏这个边界。

### D3. Session-owned proposal 存储与生命周期

新增存储层 `src/main/infra/storage/workflow-proposal-store.ts`，路径 helper 加进 `workspace-paths.ts`：

```
workflowProposalsDir(workspaceId, parentSessionId)      → sessions/<parentSessionId>/workflow-proposals/
workflowProposalDir(workspaceId, parentSessionId, id)    → .../workflow-proposals/<proposalId>/
workflowProposalDefinitionPath(...)                      → .../<proposalId>/definition.yaml
workflowProposalMetaPath(...)                             → .../<proposalId>/.meta.json
```

`.meta.json` 字段：`proposalId`、`workspaceId`、`parentSessionId`、`mode`（`"create"|"update"`）、`targetWorkflowId?`、`suggestedPersist`（`"session"|"workspace"`，Agent 建议值）、`status`（`"pending"|"confirming"|"confirmed"|"cancelled"`）、`createdAt`、`updatedAt`，以及 confirm 成功后写入的 `resolvedWorkflowId`/`resolvedPersist`/`handoffDelivered`（见 D5）。写入复用 `workflow-definition-store.ts` 里已经验证过的 `withWriteQueue` + `writeFileAtomicSync` 模式，避免同一 proposal 的并发写竞争。

`proposalId` 用 `newWorkflowId()` 同款的随机 ID 生成器（`src/main/infra/ids.ts`）分配，与 `workflowId`/`runId` 同源不同前缀，保证跨类型不误用。

状态机：`pending`（`propose_workflow` 写入）→ `confirming`（confirm IPC 收到请求、写入正式 definition 之前的短暂中间态，仅用于防止同一 proposal 的并发重复提交，不落盘为独立文件版本）→ `confirmed`/`cancelled`（终态）。终态 metadata 保留到 parent session 删除，不设 TTL；parent session 删除时级联删除整个 `workflow-proposals/` 目录（复用现有 parent session 删除流程的清理钩子，比照 `workflowRunsDir` 在 parent 删除时的处理方式）。

**替代方案**：把 proposal 记录写进 workspace 根级临时目录（旧 `.tmp` 风格）——被 blocker 讨论明确排除（P0-1/P0-8 都提到会破坏 session owner 隔离），不采用。

### D4. Confirm IPC：`mode`/`persist` 的落盘矩阵与 provenance

新增 `src/shared/ipc/automation/workflow-proposal.channels.ts`/`.schemas.ts`，Main handler `src/main/ipc/automation/workflow-proposal.ts`，比照现有 `workflow-run.ts` 的 owner 校验结构（`requireWorkspaceSender` + `assertSessionBelongsToWorkspace`）：

| channel                                  | 输入                                                        | 行为                                       |
| ---------------------------------------- | ----------------------------------------------------------- | ------------------------------------------ |
| `automation:workflow-proposal:list`      | `{workspaceId, parentSessionId}`                            | 返回该 parent 下所有 proposal 的 summary   |
| `automation:workflow-proposal:getDetail` | `{workspaceId, parentSessionId, proposalId}`                | 返回完整 YAML + metadata（确认卡片数据源） |
| `automation:workflow-proposal:confirm`   | `{workspaceId, parentSessionId, proposalId, persist}`       | 见下表                                     |
| `automation:workflow-proposal:cancel`    | `{workspaceId, parentSessionId, proposalId}`                | 标记 `cancelled`，写 decision record（D6） |
| `automation:workflow-proposal:wake`      | Main→Renderer，`{workspaceId, parentSessionId, proposalId}` | debounce 后广播，不携带 YAML               |

`confirm` 落盘矩阵（`workflow-proposal-service.ts` 内的纯函数，便于单测覆盖全部分支）：

| mode   | persist   | 目标路径                                                 | workflowId 处理                                                                                                                |
| ------ | --------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| create | session   | `sessions/<sessionId>/workflows/<new-id>.yaml`           | 用 `newWorkflowId()` 分配新 id                                                                                                 |
| create | workspace | `workspaceDataDir/workflows/<new-id>/definition.yaml`    | 用 `newWorkflowId()` 分配新 id                                                                                                 |
| update | session   | `sessions/<sessionId>/workflows/<target-id>.yaml`        | 复用 proposal 记录的 `targetWorkflowId`，workspace 正式文件不受影响                                                            |
| update | workspace | `workspaceDataDir/workflows/<target-id>/definition.yaml` | 复用 `targetWorkflowId`，若目标只存在于 session shadow 则返回 `WORKFLOW_PROPOSAL_TARGET_NOT_UPGRADABLE` 结构化错误，不自动复制 |

写入复用 `workflow-definition-store.ts` 现有的 `saveWorkflowDefinition`（workspace 分支）；新增 `saveSessionWorkflowDefinition(workspaceId, sessionId, workflowId, yaml)`（session 分支，同样走 `withWriteQueue`/`writeFileAtomicSync`，新文件 `session-workflow-definition-store.ts` 或并入现有 store 模块按 scope 参数分流——留给 tasks.md 决定，两者数据形状相同）。

成功写入后：`proposal.status = "confirmed"`，`resolvedWorkflowId`/`resolvedPersist` 写回 metadata，IPC 返回 `{workflowId, persist}`，随后触发 D5 的 handoff。任一步失败（definition 写入失败、metadata 写入失败）时 IPC 返回结构化错误，proposal 保持 `pending`（不是 `confirming` 卡死），用户可重新点击确认；不做部分回滚补偿（P0-2 决策）。

`trigger_workflow` 侧新增 definition 解析顺序：先查 `sessions/<sessionId>/workflows/<workflowId>.yaml`（若存在），否则查 workspace 正式 `definition.yaml`；`WorkflowRunSnapshot` 新增字段 `definitionSource: "session" | "workspace"` 记录命中来源，写入 `frozenDefinition` 旁边（不改变 `frozenDefinition` 本身的内联语义）。`list_workflows` 保持只读 workspace 目录，不受影响。

### D5. Confirm handoff：一次性尽力投递，不建五状态 outbox

Blocker 记录 P0-6 的用户决策明确："confirm 产生 role=user handoff，但不强行并入 cancel decision outbox，也不新增复杂 delivery 状态"；"若应用在 handoff 前崩溃/繁忙，这不构成 confirm IPC 的失败，用户可在重启后要求 Agent 再次调用 `trigger_workflow`"。据此设计为单次尽力投递，不重试、不持久化 pending 队列：

1. definition 落盘成功后，`workflow-proposal-service.ts` 尝试 `chatTurnGate.tryAcquire(workspaceId, parentSessionId, "notification")`（复用既有 `ChatTurnGate`，不新增 `ChatTurnKind`）。
2. 拿到 lease：构造 handoff reminder 文本（`workflow 已保存为 <workflowId>，可调用 trigger_workflow(workflowId) 执行`），以 `role: user` message 追加到 parent session，驱动一次 ACP turn（结构上比照 `chat-turn-service.ts` 的 `executeNotificationTurn`，但不经过 `spawnNotificationService`/`SpawnedTurnRecord`——这是给 workflow 的独立最小实现，避免把两类通知语义耦合），成功后 `proposal.meta.json.handoffDelivered = true`。
3. 拿不到 lease（当前 parent session 正有其它 turn 在跑）：直接放弃，`handoffDelivered = false`，不排队、不设 wake、不重试。IPC 仍返回 `{status: "confirmed", workflowId, persist}` 成功结果——confirm 的成功语义只等价于"definition 已落盘"，不等价于"handoff 已送达"。
4. Proposal detail 里带出 `handoffDelivered` 供确认卡片展示；`handoffDelivered: false` 时卡片提示用户"可以直接告诉 Agent 调用 trigger_workflow"作为人工兜底，不依赖静默重试。

**替代方案（被拒绝）**：复用 spawn 的五状态 outbox 给 confirm 也建一条 `dispatched/delivered/delivery_unknown` 记录——这正是 P0-6 用户决策明确排除的方向（"不新增复杂 delivery 状态"），且 confirm 场景下 turn 通常已经空闲（用户点确认前，`propose_workflow` 所在的 Agent turn 早已结束），复杂重试机制收益低于其维护成本。

### D6. Cancel decision reminder：复用 `ChatTurnGate` + 五状态语义，独立于 spawn notification

新增 `src/main/infra/storage/workflow-decision-store.ts`（存储 `workflow-decisions/<proposalId>.json`，字段对齐 P0-6 结论：`version`、owner 三元组、`decision: "cancelled"`、`notification: {notificationId, state, updatedAt}` 五状态、`decidedAt`、`updatedAt`）和 `src/main/services/automation/workflow/workflow-decision-service.ts`（方法形状比照 `spawn-notification-service.ts`：`list`/`claim`/`buildReminder`/`markDelivered`/`markDeliveryUnknown`/`suppress`/`reconcileWorkspace`，但读写 `workflow-decision-store.ts`，不触碰 `spawned-session-store.ts`）。

投递复用 `ChatTurnGate`（`kind: "notification"`）与 `driveAcpStream`，新增一个结构上对称于 `executeNotificationTurn` 的 `executeWorkflowDecisionTurn`（`chat-turn-service.ts` 内新增导出或独立 `workflow-decision-turn.ts`，视 tasks 拆分决定）。Renderer 感知路径：新增 `automation:workflow-proposal:decisionWake`（Main→Renderer，`{workspaceId}`，不携带内容）→ Renderer 收到后调用 `automation:workflow-proposal:decisionList`（列出待投递 cancel reminder）→ 用户所在窗口对某条 reminder 调用 `automation:workflow-proposal:decisionDispatch`（等价于 `claimSpawnNotificationTurn`，`busy` 时不重试，等待下一次 wake 或该 session 下一次自身 turn 结束后由 Renderer 自行重新触发，与 spawn notification 现有前端行为一致）。

刻意不复用 `SessionChatNotificationChannels`/`SpawnNotificationSummary` 这一组既有 IPC 与类型：它们的 schema 已经和 `SpawnedTurnRecord` 强耦合（`spawnedSessionId`/`turnId`/`responseId` 等字段），把 workflow decision 塞进同一个 union 需要在 renderer 的 `spawned-session-inspector` feature 里开口子处理 workflow 分支，违反 `guidelines/RendererFeatures.md` 的 feature 边界；重启/parent 删除/五状态转换等**行为**通过共享 `ChatTurnGate` 和结构对称的两个 service 实现一致，但**协议**保持独立，符合 P0-6"不与 spawn notification 合并成一个新公共协议"的结论。

### D7. Renderer feature 与 store：比照 `workflow-run-inspector` 的四层结构

新增 `src/renderer/src/features/workflow-proposal-review/{model,application,integration,ui}`，结构与命名对称于既有 `workflow-run-inspector`：

- `model/projection.ts`：`projectWorkflowProposalDetail`、`workflowProposalStatusPresentation` 等纯函数（比照 `projectWorkflowRunDetail`）。
- `application/use-workflow-proposal-review.ts`：`useWorkflowProposalReview(target)`（对称于 `useWorkflowRunInspector`，暴露 `open/detail/refresh/confirm/cancel`）与 `useWorkflowProposalListInterest(input)`（对称于 `useWorkflowRunListInterest`）。
- `integration/wake.ts`：`registerWorkflowProposalWakeListener(pinia)`，模式与 `registerWorkflowRunWakeListener` 完全一致（比对 `workspaceStore.currentWorkspace?.id`，调用 store 的 `handleWake`）。
- `ui/WorkflowProposalActivityEntry.vue` + `ui/WorkflowProposalConfirmCard.vue`（或 slideover，视内容长度）：`ChatBackgroundActivityBar.vue` 在现有 `WorkflowRunActivityEntry` 旁新增这一个 sibling `<WorkflowProposalActivityEntry>`。

新增 Pinia store `src/renderer/src/stores/automation/workflow-proposal.ts`，接口对称于 `workflow-run.ts`（`acquireListInterest`/`acquireDetailInterest`/`loadDetail`/`handleWake`/`confirm`/`cancel`），按 `workspaceId+parentSessionId+proposalId` 隔离 state，晚到 response 按 owner/interest generation 丢弃（与 `workflow-run-inspection` spec 的既有 debounce/generation 规则一致）。

审阅态 UI 使用 @nuxt/ui v4 的 `UTimeline`（`orientation: "vertical"`）搭建 stage 拓扑骨架（design 文档第 8.6 节已确认可行），与运行态 `WorkflowRunDetailSlideover` 共享视觉骨架但不共享数据源类型：`WorkflowProposalDetail`（新类型，来自 proposal YAML 解析）与 `WorkflowRunDetail`（已有类型，来自 `WorkflowRunSnapshot`）保持独立，组件层显式区分两态而不是假设同一份 `getDetail` 返回结构。

### D8. 常驻 system-reminder 能力提示

在 `src/main/services/session/chat/system-reminder/providers/chat.ts` 的 `resolveChatSystemReminder` 里，`knowledgeSection` 之后、`renderFylloActionPromptContract()` 之前插入新的 `workflowCapabilitySection`（新增 `resolveWorkflowCapabilitySection` helper，可放在 `providers/workflow.ts` 或并入 `shared.ts`，按现有 provider 拆分习惯决定）。内容固定为 phase2 设计文档第 4.1 节给出的那段话，只说明"用户明确要求保存/复用流程时，先调 `describe_workflow_schema` 再调 `propose_workflow`"，不塞入 schema 全文，不提步数阈值。`ctx.owner === "workflow"` 分支已经在 `resolveSystemReminder` 顶层被短路为 `null`（Phase 1 既有行为），fresh Agent stage 不会看到这段提示，符合"workflow-owned fresh session 不该知道 propose_workflow"的边界（它们的 MCP allowlist 本来就只有 `fyllo-specs`/`fyllo-cortex`，看到这段提示也调不了）。

## Risks / Trade-offs

- **[Risk] Confirm handoff 在 turn 忙碌时被静默丢弃（D5）** → Mitigation：proposal detail 暴露 `handoffDelivered`，确认卡片对 `false` 给出"请手动提示 Agent 调用 trigger_workflow"的兜底文案；这是 P0-6 用户决策的直接后果，不是实现疏漏。
- **[Risk] Session shadow 与 workspace 正式 definition 用同一个 `workflowId` 会造成"改的是哪一份"的用户困惑** → Mitigation：Run snapshot 强制记录 `definitionSource`，确认卡片对 `mode: update` 场景强制标注目标 workflow 名称与 id（D4/proposal.md 已覆盖）；`persist: session` 不提供事后升格入口，减少两份内容长期并存、互相漂移的窗口。
- **[Risk] `describe_workflow_schema` 的包内快照（D1）可能与 `references/designs/workflow-engine/definition-schema.md` 逐渐漂移** → Mitigation：tasks.md 包含显式同步任务；后续若 definition-schema 有变更，评审清单应包含"是否需要同步 `schema-docs/`"这一项（可考虑在 `guidelines/Testing.md` 或新增测试里对两份内容做字符串级差异告警，具体机制留给实现阶段决定，不在本次强制要求逐字节相等）。
- **[Risk] `mode: update` 允许多个 proposal 并发指向同一 workspace target，最终"后写覆盖"** → 这是 P0-2/10.3 节明确接受的行为（不引入 revision/CAS/锁），已有 Run 使用的是创建时冻结的 `frozenDefinition`，不受后续覆盖影响，风险已被限定在"定义内容"层面，不影响正在跑的 Run。
- **[Trade-off] Cancel decision 走独立协议而非复用 `SessionChatNotificationChannels`（D6）** → 增加了一小段结构相似但物理独立的代码（store/service/IPC），换来的是 renderer feature 边界不被打破、workflow 语义不与 spawn 语义耦合；判断这个重复度可接受，符合 phase2 设计文档"如发现稳定可复用代码可以薄适配，但不强求抽象成通用组件"的态度。

## Migration Plan

- 纯增量变更：新增存储路径、新增 IPC area、新增 MCP tool、新增 Renderer feature/store，均不修改 Phase 1 已有 `WorkflowRunSnapshot`/`workflow-run.*` 的既有字段语义，只新增 `definitionSource` 字段（可选，旧 snapshot 缺失时按 `"workspace"` 兜底解释，不需要 snapshot 版本迁移）。
- `list_workflows` 返回结构不变（已含 `workflowId`），无需 client 兼容处理。
- 无数据库 schema、无需要回填的历史数据；`workflow-proposals/`/`workflow-decisions/`/session-scoped `workflows/` 都是全新目录，旧版本升级上来的用户不会有这些路径下的遗留文件。
- 回滚策略：由于是纯增量能力（新增 MCP tool + 新增 IPC + 新增 UI 入口），关闭方式是不注册新 tool/不渲染新 ActivityEntry；不需要数据迁移回滚。

## Open Questions

- `session-workflow-definition-store.ts` 是独立新文件还是给现有 `workflow-definition-store.ts` 加一个 `scope: "session"|"workspace"` 参数——两种实现都满足契约，留给 tasks 阶段按代码可读性决定，不影响对外行为。
- `executeWorkflowDecisionTurn` 放在 `chat-turn-service.ts` 内新增导出，还是拆到独立文件——同上，纯实现组织问题。
- `describe_workflow_schema`/`references/definition-schema.md` 的同步检查是否需要自动化测试断言（例如内容 hash 比对并在不一致时失败提示"请同步"）——留待实现阶段决定，不阻塞本次 proposal。
