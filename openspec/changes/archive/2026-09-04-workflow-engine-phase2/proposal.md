## Why

Phase 1（`workflow-engine`/`fyllo-workflow-mcp`/`workflow-run-inspection`）已经落地了 workflow 的运行时地基，但 workflow definition 目前只能由用户在 `/workflow` 页面手写 YAML 后保存。Agent 在对话中沉淀出的可复用流程（例如反复执行的排查/发布步骤）无法被自己保存为 workflow，用户也没有一个"边聊边生成、边确认、边决定要不要沉淀"的路径。Phase 2 补上这条路径：Agent 在对话中按 [definition-schema.md](../../../references/designs/workflow-engine/definition-schema.md) 动态生成 workflow YAML，用户在确认卡片上完整审阅后决定"仅本次执行"还是"保存为可复用资产"，执行仍交给 Phase 1 已有的 `trigger_workflow`。

设计已完成收敛：`references/designs/workflow-engine/phase2/phase2-agent-generation.md` 记录了完整方案，`phase2-blocker-decision-log.md` 显示 P0-1～P0-9 共 9 个阻塞议题全部"已结论"（其中 P0-8/P0-9 以"首版最小默认"收敛），没有遗留"待人工审阅"项，可以直接推进 proposal。

## What Changes

- 新增 `fyllo-workflow` MCP tool `describe_workflow_schema`：无副作用地返回 workflow YAML schema 骨架（definition-schema 第 1-9 节）与"schema 合法 ≠ 当前运行时可执行"的说明，按需下发，不常驻 system prompt。
- 新增 `fyllo-workflow` MCP tool `propose_workflow`：Agent 提交生成/更新的 YAML，只做 owner/state、schema 解析期校验和 `mode`("create"|"update")/`workflowId`/`persist`("session"|"workspace") 的基本组合校验；校验通过后写入 **session-owned proposal**（`workflow-proposals/<proposal-id>/{definition.yaml,.meta.json}`），触发 wake，不创建 Run、不写入正式 definition。schema 合法但超出 Phase 1 execution profile 的 definition 允许进入 proposal，运行时能力校验仍统一由 `trigger_workflow` 负责。
- 新增 owner-scoped `automation:workflow-proposal:*` IPC（`list`/`getDetail`/`confirm`/`cancel`/`wake`）：`confirm` 按用户在确认卡片上选择的 `persist` 把 definition 正式落盘到 session shadow 或 workspace 正式目录（`mode: create` 分配新 `workflowId`，`mode: update` 复用提案中的 `workflowId`），成功后发送 `role: user` 的 `<system-reminder>` handoff 提示主 Agent 调用 `trigger_workflow`；`cancel` 复用 Phase 1 已有的 `ChatTurnGate` + 五状态 notification 投递机制发一条不可见 reminder。两者都只做落盘/取消标记，不创建 Run、不等待执行。
- 新增 Renderer `workflow-proposal-review` feature 与 `workflow-proposal` Pinia store：owner-scoped wake + interest-gated pull，`WorkflowProposalActivityEntry` 作为 `ChatBackgroundActivityBar` 里与 `WorkflowRunActivityEntry` 平级的 sibling entry；确认卡片完整展示 YAML 全部字段（不折叠），对 `exec`/`webhook` 且 `confirm` 非 `true` 的 stage 加醒目标记，`mode: update` 的卡片标注目标 workflow 名称与 `workflowId`。
- 扩展 `workflow-engine`：新增 session-scoped "session shadow" definition 存储（`sessions/<session-id>/workflows/<workflow-id>.yaml`，Phase 1 设计文档第 8 节已预留该路径）；`trigger_workflow` 的 definition 解析顺序改为 session shadow 优先于 workspace 正式 definition，Run snapshot 记录实际命中的 definition source（provenance）。`list_workflows` 仍只返回 workspace 正式资产，session shadow 不参与检索。
- 常驻 chat system-reminder 新增一段固定能力提示（插入位置：`knowledge` 段之后、FylloAction contract 之前），只说明"用户明确要求保存/复用流程时，先调 `describe_workflow_schema` 再调 `propose_workflow`"，不塞入完整 schema，不新增主动提议阈值。
- **不包含**（已在 blocker 讨论中明确排除，不在本次 proposal 范围内）：`context: inherit`、`WaitStage`、非 `human` Gate、`retry`/`idempotencyKey` 等能力的运行时实现；agent 生成的 `exec` 强制 `confirm: true`；跨文件事务/target 锁/backup-restore 协议；`ChatBackgroundActivityBar` 到 `ChatEventRail` 的迁移；主动提议/隐式复用判断。

## Capabilities

### New Capabilities

- `workflow-proposal-authoring`: `fyllo-workflow` MCP server 新增的 `describe_workflow_schema`/`propose_workflow` 两个 Agent 侧工具，以及 `propose_workflow` 校验通过后的 session-owned proposal 落盘与 wake 触发。
- `workflow-proposal-confirmation`: Renderer 发起的 `automation:workflow-proposal:confirm`/`cancel` IPC 契约——正式 definition 写入（session shadow / workspace，create / update）、`role: user` handoff、cancel decision reminder、proposal 终态生命周期。
- `workflow-proposal-review-ui`: Renderer `workflow-proposal` store 与 `workflow-proposal-review` feature，`ChatBackgroundActivityBar` 的 `WorkflowProposalActivityEntry`，确认卡片的数据契约与展示规则（完整展示、agent-generated 标记、`confirm` 高亮、`mode: update` 提示）。

### Modified Capabilities

- `workflow-engine`: 新增 session-scoped shadow definition 存储路径与读取顺序（session shadow 优先于 workspace 正式 definition），`trigger_workflow` 的 definition 解析与 Run snapshot provenance 记录相应调整。
- `fyllo-workflow-mcp`: bundled MCP server 的工具集从 2 个（`list_workflows`/`trigger_workflow`）扩展到 4 个，新增 RPC method/schema，Host codec 覆盖新方法；`list_workflows` 现有行为（含 `workflowId` 字段）不变。

## Impact

- **MCP server**：`src/mcp-servers/fyllo-workflow/src/{tools,rpc-schema.ts,rpc-client.ts}`
- **Main 自动化域/服务**：`src/main/domain/automation/workflow/**`（新增 proposal 校验/mode 解析）、`src/main/services/automation/workflow/**`（新增 workflow-proposal-service、workflow-rpc-bridge 扩展新 method、workflow-engine 增加 session-shadow 解析）
- **持久化**：`src/main/infra/storage/workspace-paths.ts`（新增 proposal 目录与 session shadow definition 路径 helper）、新增 `workflow-proposal-store.ts`、`workflow-decision-store.ts`（cancel reminder record）、`workflow-definition-store.ts` 扩展 session-scope 读写
- **IPC 三层契约**：`src/shared/ipc/automation/workflow-proposal.*`、`src/main/ipc/automation/workflow-proposal.ts`、`src/preload/api/automation/workflow-proposal.ts`
- **通知/turn 复用**：`src/main/services/session/chat/chat-turn-gate.ts`、`chat-turn-service.ts`、`src/main/services/session/spawn/spawn-notification-service.ts`（薄适配或等价复用，不新增 ChatTurnKind）
- **system-reminder**：`src/main/services/session/chat/system-reminder/providers/chat.ts`（新增能力提示 section）
- **Renderer**：`src/renderer/src/features/workflow-proposal-review/**`（新建，比照 `workflow-run-inspector` 结构）、`src/renderer/src/stores/automation/workflow-proposal.ts`（新建）、`src/renderer/src/api/automation/workflow-proposal.ts`（新建）、`src/renderer/src/components/chat/ChatBackgroundActivityBar.vue`（新增 sibling entry）
- **测试**：`test/mcp-servers/fyllo-workflow/**`、`test/main/services/automation/workflow/**`、`test/main/infra/storage/workflow-proposal-*.spec.ts`、`test/main/ipc/automation/workflow-proposal.spec.ts`、`test/renderer/src/features/workflow-proposal-review/**`、`test/renderer/src/stores/automation/workflow-proposal.spec.ts`
