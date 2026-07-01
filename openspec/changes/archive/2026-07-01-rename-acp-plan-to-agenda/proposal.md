## Why

ACP 的 `session/update` 中 `plan` 表示 Agent 当前 turn 的运行时执行安排，而 FylloCode 已经引入了自己的 `create-plan` / `plan.create` / Plan Slideover 规划方案链路。两者同名但语义不同：ACP `plan` 不持久化、不可审批、只做过程可视化；FylloCode plan 是 session-scoped Markdown 文档，可审阅、编辑和批准。

本变更把 ACP `plan` 在 FylloCode 内部统一命名为 Agenda（UI 文案为“行动清单”），从主进程接收到 ACP `sessionUpdate === "plan"` 后的全部内部调用链中消除旧的 `plan` 命名残留，避免继续与正式规划方案概念混淆。

## What Changes

- **BREAKING**：跨进程流式事件分支从 `{ kind: "plan_update"; entries: PlanEntry[] }` 改为 `{ kind: "agenda_update"; entries: AgendaEntry[] }`。
- **BREAKING**：共享类型 `PlanEntry` 改名为 `AgendaEntry`，`Session.plan` 运行时字段改为 `Session.agentAgenda`。
- 主进程 `acp-mapper` 仍按上游协议接收 `sessionUpdate === "plan"`，但内部归一化函数、常量、`SessionEvent`、IPC 控制事件和测试全部使用 Agenda 命名。
- 渲染进程 store、composable、props、变量、组件文件名和测试全部使用 Agenda 命名；`ChatPlanPanel.vue` 改为 `ChatAgentAgendaPanel.vue`，UI 标题改为“行动清单”。
- `useUIMessageAssembler`、proposal apply/archive 控制事件忽略逻辑、chat session event rail 展示条件同步从 plan 命名改为 agenda 命名。
- 当前规范与 guidelines 中描述 ACP 运行时 plan 展示/流转的条目同步改为 Agenda/行动清单。
- 不改变 FylloCode 自有 `create-plan` tool、`plan.create` Fyllo action、lineage plan、Plan Slideover、`PlanDocument` 等正式规划方案链路。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `acp-chat-backend`：ACP `sessionUpdate === "plan"` 仍作为协议输入，但 FylloCode 内部 `SessionEvent`、chat store 分发和会话运行时状态改为 Agenda 命名。
- `ipc-streaming`：跨进程流式协议从 `plan_update` / `PlanEntry` 改为 `agenda_update` / `AgendaEntry`。
- `chat-plan-display`：当前 ACP 执行计划面板要求改为 Agent Agenda / 行动清单面板要求，组件、prop、session 字段和 UI 标题全部改名。
- `chat-session-event-rail`：事件栏显示条件从 `activeSession.plan` 改为 `activeSession.agentAgenda`，并以行动清单事件卡片表述。
- `chat-event-rail-panel-style`：事件栏 panel 样式规范中的 `ChatPlanPanel` / “执行计划”改为 `ChatAgentAgendaPanel` / “行动清单”。

## Impact

- 共享类型：`src/shared/types/chat.ts`、`src/shared/types/stream-event.ts`、`src/shared/types/ipc.ts` 间接受影响。
- 主进程：`src/main/services/chat/acp-mapper.ts`、`src/main/ipc/chat.ts`、`src/main/domain/chat/acp-session-recovery.ts`、`src/main/services/chat/session-event-mapper.ts` 相关测试。
- 渲染进程：`src/renderer/src/stores/chat.ts`、`src/renderer/src/stores/session.ts`、`src/renderer/src/composables/useChatEventRail.ts`、`src/renderer/src/composables/useUIMessageAssembler.ts`、`src/renderer/src/components/chat/event/EventRailContent.vue`、`ChatPlanPanel.vue` 组件重命名及相关测试。
- 文档与规范：`openspec/specs/acp-chat-backend`、`ipc-streaming`、`chat-plan-display`、`chat-session-event-rail`、`chat-event-rail-panel-style` 的 delta，以及 `guidelines/IPC.md`、`guidelines/RendererProcess.md` 中 ACP 运行时 plan 相关描述。
- 不影响 session meta 持久化格式；Agenda 仍是纯运行时内存态，不写入 session meta，不进入 `session.messages`。
