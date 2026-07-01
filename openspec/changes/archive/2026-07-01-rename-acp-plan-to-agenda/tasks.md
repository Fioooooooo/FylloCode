## 1. 共享类型与主进程事件链路

- [x] 1.1 修改 `src/shared/types/chat.ts`：将 `PlanEntry` 改名为 `AgendaEntry`；将 `Session.plan?: PlanEntry[]` 改为 `Session.agentAgenda?: AgendaEntry[]`；更新注释为“运行时态：ACP Agent 行动清单，全量替换、不持久化”。验收：`PlanEntry`、`Session.plan`、`plan?:` 不再出现在该文件中。
- [x] 1.2 修改 `src/shared/types/stream-event.ts`：import `AgendaEntry`，将 `StreamContentEvent` 分支 `{ kind: "plan_update"; entries: PlanEntry[] }` 改为 `{ kind: "agenda_update"; entries: AgendaEntry[] }`；保持分支位置仍在 `available_commands_update` 与 `config_options_update` 附近。验收：`pnpm typecheck` 能通过该共享类型变更。
- [x] 1.3 修改 `src/main/services/chat/acp-mapper.ts`：保留 `case "plan"` 作为上游 ACP 协议边界；将 `PLAN_PRIORITIES` / `PLAN_STATUSES` / `normalizePlanEntries` 改为 `AGENDA_PRIORITIES` / `AGENDA_STATUSES` / `normalizeAgendaEntries`；该分支产出 `SessionEvent { kind: "agenda_update", entries }`。验收：除 `sessionUpdate === "plan"` / `case "plan"` 这类协议边界外，文件中不再出现旧内部 plan 命名。
- [x] 1.4 修改 `src/main/ipc/chat.ts`：将 `onControlEvent` 中的 `case "plan_update"` 改为 `case "agenda_update"`；注释改为“agentAgenda 为运行时态，仅透传给 renderer，不持久化到 session meta”。不得把 agenda 写入 session meta。验收：`agenda_update` 仍只 `sendChunk`，不调用 `enqueueSessionMetaPersist`。
- [x] 1.5 修改 `src/main/domain/chat/acp-session-recovery.ts`：将 replay 白名单/控制事件 switch 中的 `plan_update` 改为 `agenda_update`，语义保持“不被历史 replay 抑制”。验收：相关测试覆盖 loadSession replay 期间 agenda 控制事件仍生效或不被抑制。
- [x] 1.6 更新主进程测试：`test/main/services/chat/acp-mapper.spec.ts`、`test/main/services/chat/session-event-mapper.spec.ts` 中测试名、fixture、expect 从 plan 改为 agenda；新增或更新断言确认 ACP `sessionUpdate: "plan"` 会映射为 `{ kind: "agenda_update", entries }`，空数组仍产出事件，且 `_meta` 等未识别字段被丢弃。

## 2. 渲染进程 store、composable 与组件命名

- [x] 2.1 修改 `src/renderer/src/stores/session.ts`：将接口 action `setSessionPlan(sessionId, entries: PlanEntry[])` 改为 `setSessionAgentAgenda(sessionId, entries: AgendaEntry[])`；实现写入 `session.agentAgenda = entries`；return 对象同步导出新 action。验收：`SerializedSession`、`normalizeSession`、`mergeSessionMeta` 仍不处理 `agentAgenda`，重启后自然为 `undefined`。
- [x] 2.2 修改 `src/renderer/src/stores/chat.ts`：在 `streamSessionMessage.onChunk` switch 中将 `case "plan_update"` 改为 `case "agenda_update"`，调用 `sessionStore.setSessionAgentAgenda(activeSession.id, data.entries)`，仍然 `return` 且不经过 `useUIMessageAssembler`。
- [x] 2.3 修改 `src/renderer/src/composables/useUIMessageAssembler.ts`：忽略分支从 `plan_update` 改为 `agenda_update`，保持与 `available_commands_update` / `config_options_update` / `usage_update` / `session_info_update` 同类处理。
- [x] 2.4 修改 `src/renderer/src/composables/useChatEventRail.ts`：import `AgendaEntry`；返回值 `planEntries` 改为 `agentAgendaEntries: ComputedRef<AgendaEntry[]>`；computed 从 `input.activeSession.value?.agentAgenda ?? []` 派生；`showEventRail` 使用 `agentAgendaEntries.value.length`。
- [x] 2.5 将 `src/renderer/src/components/chat/event/ChatPlanPanel.vue` 重命名为 `src/renderer/src/components/chat/event/ChatAgentAgendaPanel.vue`；组件内部类型从 `PlanEntry` 改为 `AgendaEntry`，局部类型从 `PlanEntryStatus` / `PlanEntryPriority` 改为 `AgendaEntryStatus` / `AgendaEntryPriority`；注释改为对齐 ACP agent agenda；标题文案改为“行动清单”。
- [x] 2.6 修改 `src/renderer/src/components/chat/event/EventRailContent.vue`：import `ChatAgentAgendaPanel`；props 从 `planEntries: PlanEntry[]` 改为 `agentAgendaEntries: AgendaEntry[]`；模板中渲染 `<ChatAgentAgendaPanel v-if="props.agentAgendaEntries.length > 0" :entries="props.agentAgendaEntries" />`。
- [x] 2.7 修改所有消费 `useChatEventRail` 的组件（至少 `src/renderer/src/components/chat/ChatContainer.vue`）：将解构、props 传递和测试 hook 中的 `planEntries` 改为 `agentAgendaEntries`。

## 3. 测试与 fixtures 全量同步

- [x] 3.1 更新 `test/renderer/src/stores/session.spec.ts`：`setSessionPlan` 用例改为 `setSessionAgentAgenda`；断言 `store.sessions[n]?.agentAgenda`；测试名使用“agent agenda”或“行动清单”，不再使用 plan 表述。
- [x] 3.2 更新 `test/renderer/src/stores/chat.spec.ts`：`plan_update` 路由测试改为 `agenda_update`；spy 从 `setSessionPlan` 改为 `setSessionAgentAgenda`；断言 assembler path 不被触碰。
- [x] 3.3 更新 `test/renderer/src/composables/use-ui-message-assembler.spec.ts`：忽略 chunk 用例从 `plan_update` 改为 `agenda_update`。
- [x] 3.4 更新 `test/renderer/src/components/chat-container.spec.ts` 与 `test/renderer/src/components/chat-session-event-rail.spec.ts`：fixture 字段从 `session.plan` 改为 `session.agentAgenda`；组件 stub 从 `ChatPlanPanel` 改为 `ChatAgentAgendaPanel`；断言标题从“执行计划”改为“行动清单”。
- [x] 3.5 更新任何新增编译错误暴露出的 tests/imports，保持测试目录镜像现有实现路径；不得保留旧组件名 stub 作为兼容别名。

## 4. Specs、guidelines 与命名残留审计

- [x] 4.1 更新 `guidelines/IPC.md`：控制事件列表中的 `plan_update` 改为 `agenda_update`；描述明确 `agenda_update` 仅在 `chat:stream:message` 透传，proposal apply/archive 忽略，不写磁盘。
- [x] 4.2 更新 `guidelines/RendererProcess.md`：`ChatSessionEventRail` 展示项从“执行计划”改为“行动清单”；后台 stream 更新项从“计划状态”改为“行动清单状态”；不得修改 `## Plan Review Flow` 中 FylloCode 自有 `plan.create` / Plan Slideover 语义。
- [x] 4.3 检查 `guidelines/Domain.md` 是否需要同步 ACP `sessionUpdate → SessionEvent` 命名约定；若有 ACP runtime plan 的内部事件名描述，改为 agenda；若只描述上游 `sessionUpdate === "plan"` 协议事实，则保留并补充“内部映射为 agenda_update”。
- [x] 4.4 确认本 change 的 delta specs 覆盖 `acp-chat-backend`、`ipc-streaming`、`chat-plan-display`、`chat-session-event-rail`、`chat-event-rail-panel-style`；实施时不得直接修改 `openspec/changes/archive/**` 历史记录。
- [x] 4.5 执行内容残留搜索：`rg -n "PlanEntry|plan_update|ChatPlanPanel|setSessionPlan|Session\\.plan|activeSession\\.plan|session\\.plan|\\bplanEntries\\b|执行计划" src test openspec/specs guidelines --glob '!openspec/changes/archive/**'`。验收：无命中；若命中 FylloCode 自有 plan tool/lineage plan 之外的内容，必须继续改名。
- [x] 4.6 执行文件名残留搜索：`rg --files src test openspec/specs guidelines | rg "ChatPlanPanel|chat-plan-display"`。验收：`ChatPlanPanel` 无命中；`chat-plan-display` 若仍作为既有 OpenSpec capability 目录存在，必须确认其文件内容已全部改为 Agenda/行动清单语义，并在最终报告中列为有意保留的 OpenSpec capability 名，而不是遗漏。

## 5. 验证

- [x] 5.1 运行 `pnpm typecheck`，确认共享类型、main/preload/renderer 编译链路全部接受 `agenda_update` / `AgendaEntry` / `agentAgenda`。
- [x] 5.2 运行 `pnpm vitest run test/main/**/*.{test,spec}.ts`，确认 ACP mapper、session-event mapper、stream driver 相关主进程测试通过。
- [x] 5.3 运行 `pnpm vitest run test/renderer/src/**/*.{test,spec}.{ts,vue}`，确认 store、composable、事件栏组件和 chat container 测试通过。
- [x] 5.4 运行 `pnpm lint`，确认重命名后无未使用 import、未覆盖 switch 分支或 Vue 组件命名问题。
