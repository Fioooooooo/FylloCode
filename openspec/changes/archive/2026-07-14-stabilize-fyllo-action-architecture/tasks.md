# Stabilize Fyllo Action Architecture — Tasks

## 1. 规范与回归基线

- [x] 1.1 确认 `openspec/changes/stabilize-fyllo-action-architecture/specs/` 下四个新增 spec 和一个 delta spec 已创建并通过 `pnpm exec openspec validate`（或等效校验）。
- [x] 1.2 在 `test/shared/fyllo-action/` 为现有 `src/shared/utils/fyllo-action.ts` parser 和 `src/shared/constants/fyllo-action-contracts.ts` prompt 输出添加回归测试，覆盖 `task.create`、`plan.create`、`knowledge.flag`、`knowledge.review` 的解析和 prompt 片段。
- [x] 1.3 在 `test/renderer/src/utils/` 为现有 `src/renderer/src/utils/fyllo-action-rail.ts` 和 `src/renderer/src/utils/fyllo-action.ts` 添加回归测试，覆盖 pending action 收集、ID 生成和状态过滤。
- [x] 1.4 在 `test/main/services/session/chat/` 为现有 `chat-service.ts` 中的 `setActionState` 行为添加回归测试，覆盖 `succeeded`/`failed`/`cancelled` 的 last-write-wins 合并。

## 2. Shared capability 重组

- [x] 2.1 创建 `src/shared/fyllo-action/` 目录，并添加 `README.md` 说明各文件职责。
- [x] 2.2 创建 `src/shared/fyllo-action/protocol.ts`，迁移并整理 `src/shared/types/fyllo-action.ts` 中的类型；新增 `FylloActionStateStatus = "ready" | "succeeded" | "failed" | "cancelled"` 和带 `revision`、`error?: string` 的 `FylloActionState`。
- [x] 2.3 创建 `src/shared/fyllo-action/schemas.ts`，迁移 `src/shared/schemas/fyllo-action.ts` 中的 payload schemas，并新增 `registerActionInputSchema`、`transitionActionInputSchema`（`fail` 命令含可选 `error`，最大 1000 字符）、`transitionActionsInputSchema`（`expectedRevisions` 为 `Record<string, number>`）、`safeSessionIdSchema`（正则 `^[a-zA-Z0-9_-]+$​`）、versioned `persistedActionStatesSchema`。
- [x] 2.4 创建 `src/shared/fyllo-action/registry.ts`，定义 `FylloActionContract<Type>` 和 `contracts` 穷尽 Record，覆盖 `task.create`、`plan.create`、`knowledge.flag`、`knowledge.review`；`presentation` 和 `interaction` 从 registry 获取。
- [x] 2.5 创建 `src/shared/fyllo-action/parser.ts`，迁移并隔离标签 source 收集和 payload schema 验证逻辑。
- [x] 2.6 创建 `src/shared/fyllo-action/identity.ts`，保留当前 Action ID 构造规则 `chat:{sessionId}:{messageIndex}:{partIndex}:{actionOrdinalInPart}` 和 source 类型。
- [x] 2.7 创建 `src/shared/fyllo-action/state.ts`，定义状态机联合、终态谓词 `isFylloActionResolved`、attention 谓词 `requiresFylloActionAttention` 和合法迁移检查函数。
- [x] 2.8 创建 `src/shared/fyllo-action/prompt.ts`，实现 `renderFylloActionPromptContract()` 纯函数，使用 `JSON.stringify` 生成 example，不依赖 Electron/Vue/AI SDK。
- [x] 2.9 在旧文件 `src/shared/types/fyllo-action.ts`、`src/shared/schemas/fyllo-action.ts`、`src/shared/constants/fyllo-action-contracts.ts`、`src/shared/utils/fyllo-action.ts` 中添加临时 re-export，指向新位置，保持现有 import 可用。
- [x] 2.10 在 `test/shared/fyllo-action/` 添加新 shared capability 的单元测试，覆盖 registry 穷尽、prompt snapshot、state predicates、ID 确定性、payload strict schema、legacy/new persistence envelope、`FylloActionState.error` 字段。

## 3. Main Action service

- [x] 3.1 创建 `src/main/services/session/action/` 目录。
- [x] 3.2 在 `src/shared/fyllo-action/state.ts` 实现合法迁移函数 `applyFylloActionTransition` 和终态/attention 谓词，供 Main action-service 与 Renderer selectors 共用。
- [x] 3.3 创建 `src/main/services/session/action/action-execution-idempotency.ts`，提供 `getIdempotencyRecord(actionId)` / `setIdempotencyRecord(actionId, result)` 辅助，供 task/create 和 knowledge/capture 使用。
- [x] 3.4 创建 `src/main/services/session/action/action-service.ts`，实现 `registerAction`、`transitionAction`、`transitionActions`；`transitionActions` 使用 `Record<string, number>` 形式的 `expectedRevisions`，返回 `Array<{ actionId: string; success: boolean; record?: FylloActionState; error?: string }>`；包含 sender project 校验、session 归属校验、`safeSessionIdSchema` 校验、create-if-absent、CAS/revision、authoritative `updatedAt`、`fail` 命令的 `error` 校验与写入（最长 1000 字符）、version envelope 读写。
- [x] 3.5 创建 `src/shared/ipc/session/action.channels.ts` 和 `src/shared/ipc/session/action.schemas.ts`，定义 `session:action:registerAction`、`session:action:transitionAction`、`session:action:transitionActions`。
- [x] 3.6 创建 `src/main/ipc/session/action.ts`，使用 `_kit/wrap-handler.ts` 和 `src/shared/ipc/session/action.schemas.ts` 注册 handler，并接入 `src/main/ipc/session/index.ts`。
- [x] 3.7 创建 `src/preload/api/session/action.ts` 暴露 `window.api.session.action.registerAction` / `transitionAction` / `transitionActions`，更新 `src/preload/index.ts` 和 `src/preload/index.d.ts`。
- [x] 3.8 创建 `src/renderer/src/api/session/action.ts` wrapper。
- [x] 3.9 更新 `src/main/infra/storage/session-store.ts`，使 `actionStates` 读写支持 `{ version: 1, records: ... }` envelope 和 legacy map 兼容；未知 version 保留原始数据并报告诊断。
- [x] 3.10 在 `src/main/services/session/chat/chat-service.ts` 中将 `setActionState` 标记为 `@deprecated`，另新增内部函数或委托到 action-service 保持兼容；该函数在 Phase 8 彻底删除。
- [x] 3.11 在 `test/main/services/session/action/` 添加单元测试，覆盖 register create-if-absent、remount 重复注册不更新 `updatedAt`、ready 不覆盖 terminal、type mismatch conflict、revision/CAS、batch transition 原子性、sender/project/session 校验、path traversal、unknown Action type filtering。

## 4. Renderer feature 重组

- [x] 4.1 创建 `src/renderer/src/features/fyllo-action/README.md`，说明 feature 范围、公开入口、integration entry 和依赖方向。
- [x] 4.2 创建 `src/renderer/src/features/fyllo-action/model/selectors.ts`，实现 `requiresFylloActionAttention`、`isFylloActionResolved` 等纯 selector。
- [x] 4.3 创建 `src/renderer/src/features/fyllo-action/model/pending-actions.ts`，实现 `Session -> PendingFylloAction[]` 纯投影，不返回 EventRail DTO。
- [x] 4.4 创建 `src/renderer/src/features/fyllo-action/application/registration.ts`，监听 Markstream ready parse result，使用 in-flight Set 去重，调用 `registerAction` IPC，用 Main 返回的 record 更新 store，失败时保留 UI 并提供重试。
- [x] 4.5 创建 `src/renderer/src/features/fyllo-action/application/execution-runtime.ts`，管理 `running`、`retrying`、`sync-failed` 等临时控制器状态。
- [x] 4.6 创建 `src/renderer/src/features/fyllo-action/application/execution-controller.ts`，冻结 `projectId`/`sessionId`/`actionId`，选择 typed handler，区分业务副作用失败与状态同步失败，调用单条或批量 transition API。
- [x] 4.7 创建 `src/renderer/src/features/fyllo-action/application/ports.ts`，定义 execution 所需的依赖端口，包括 `sendMessageAndAwaitDurableAppend` port（供 knowledge flag handler 使用）。
- [x] 4.8 迁移 `src/renderer/src/composables/fyllo-action-handlers/` 到 `src/renderer/src/features/fyllo-action/application/handlers/`，并移除对 Vue SFC 和 Rail DTO 的反向依赖。
- [x] 4.9 迁移 `src/renderer/src/components/shared/fyllo-action/*.vue` 到 `src/renderer/src/features/fyllo-action/ui/actions/`；迁移 `FylloActionShell.vue` 和 `FylloActionNode.vue` 到 `src/renderer/src/features/fyllo-action/ui/`，拆分 UI 与 execution controller；`FylloActionShell` 展示来自 `FylloActionState.error` 的持久化错误。
- [x] 4.10 创建 `src/renderer/src/features/fyllo-action/integration/markstream.ts`，向 Markstream 注册 ready 监听器并装配 registration controller。
- [x] 4.11 创建 `src/renderer/src/features/fyllo-action/integration/event-rail.ts`，将 `PendingFylloAction[]` 转换为 EventRail contributor。
- [x] 4.12 创建 `src/renderer/src/features/fyllo-action/integration/renderer-registry.ts`，维护 `Record<FylloActionType, RendererActionDefinition>` UI override，从 shared registry 获取 `presentation`/`interaction`。
- [x] 4.13 创建 `src/renderer/src/features/fyllo-action/index.ts`，导出稳定公共 API；如需 Markstream/EventRail 独立入口，在 README 中显式列出。
- [x] 4.14 更新 `src/renderer/src/components/shared/MarkStream.vue` 和 `AssistantMessage.vue`，使用新的 `fyllo-action/integration/markstream` 入口。
- [x] 4.15 更新 `src/renderer/src/composables/useChatEventRail.ts`，使用新的 `fyllo-action/integration/event-rail` contributor。
- [x] 4.16 在 `test/renderer/src/features/fyllo-action/` 添加测试，覆盖 Markstream ready 后立即展示 UI、ready 后只发一次 register IPC、registration failure 可重试、persisted ready 恢复 Shell ready、ready/failed 留在 EventRail、succeeded/cancelled 从 pending 集合移除、session/project 切换保持原上下文。

## 5. session-attention（作为 fyllo-action 公开能力）

- [x] 5.1 在 `src/renderer/src/features/fyllo-action/model/session-attention.ts` 实现 `getSessionAttention(session)` 纯函数，统计 persisted Fyllo Action ready/failed 以及 assistant message 中尚未持久化的 pending ready actions。
- [x] 5.2 在 `src/renderer/src/features/fyllo-action/application/useSessionAttention.ts` 实现 `useSessionAttention(session: MaybeRefOrGetter<Session>)`，返回 `attentionCount: ComputedRef<number>`。
- [x] 5.3 在 `src/renderer/src/features/fyllo-action/index.ts` 公开导出 `getSessionAttention` 和 `useSessionAttention`；本次不创建独立的 `session-attention` feature。
- [x] 5.4 更新 `src/renderer/src/components/chat/SessionItem.vue`，在 setup 内调用 `useSessionAttention(toRef(props, "session"))`，移除新增的 `attentionCount` prop，按约束展示 badge、aria-label、tooltip 和 `99+`。
- [x] 5.5 确认 `ChatSidebar` 继续只向 `SessionItem` 传递 `:session="session"`。
- [x] 5.6 在 `test/renderer/src/features/fyllo-action/session-attention.spec.ts`（或等效位置）添加测试，覆盖 attentionCount 聚合、SessionItem 数量显示、`99+`、aria-label、running pulse 与 badge 共存。

## 6. 执行一致性

- [x] 6.1 更新 `src/main/services/automation/task/task-service.ts`（或当前 task 创建服务），将 `actionId` 作为 task creation 幂等键；重复请求时返回已有 task。
- [x] 6.2 为 task store 的 `tasks.json` read-modify-write 添加项目级队列锁，使用 temp file + rename 原子写；在 `test/main/services/automation/task/` 增加两个并发 `task.create` 不丢数据的测试。
- [x] 6.3 在 knowledge flag handler 中注入或使用 dedicated port `sendMessageAndAwaitDurableAppend(parts): Promise<{ messageId: string }>` 发送 capture 用户消息；durable append 成功后才能调用 `transitionActions` batch succeed。该 port 实现 SHALL NOT 改变 `chatStore.sendMessage` 的公共签名。
- [x] 6.4 在 `src/renderer/src/features/fyllo-action/application/execution-controller.ts` 中实现“业务副作用成功、状态同步失败”的分支，该分支只重试 transition，不重跑 handler。
- [x] 6.5 在 execution controller 中冻结执行上下文（projectId/sessionId/actionId），防止 project/session 切换竞态导致副作用写入错误项目或会话。
- [x] 6.6 在 `test/renderer/src/features/fyllo-action/` 添加 state sync failure 不重跑副作用、batch succeed 一次性清除、idempotent side effect retry 的测试。

## 7. Prompt 与可靠性

- [x] 7.1 更新 `src/main/services/session/chat/system-reminder/providers/chat.ts`，调用 `src/shared/fyllo-action/prompt.ts` 的 `renderFylloActionPromptContract()` 并将结果注入 `<fyllo-action-contract>` section。
- [x] 7.2 在 `src/main/services/session/chat/system-reminder/providers/knowledge.ts` 和 `guidelines.ts` 中，对动态字段（路径、标题、description 等）的尖括号进行编码，确保单字段异常不丢弃整份 reminder。
- [x] 7.3 确保空 knowledge index 时，system-reminder 仍输出固定 `<knowledge>` admission/flag 指令块。
- [x] 7.4 更新 `src/shared/fyllo-action/schemas.ts` 中的 `knowledgeFlagFylloActionPayloadSchema`，使 `summary` 拒绝 `\r` 和 `\n`。
- [x] 7.5 更新 knowledge review slideover 的 autosave 逻辑：debounce save 消费 rejection 并进入本地状态；显式确认/关闭时 await save；unmount 时 flush debounce。
- [x] 7.6 在 `test/main/services/session/chat/system-reminder/` 和 `test/renderer/src/components/shared/fyllo-action/` 增加 system-reminder 安全编码、空 knowledge block、knowledge candidate JSON 边界、autosave failure 和 teardown 测试。

## 8. 清理、边界与归档

- [x] 8.1 删除 `src/shared/types/fyllo-action.ts`、`src/shared/schemas/fyllo-action.ts`、`src/shared/constants/fyllo-action-contracts.ts`、`src/shared/utils/fyllo-action.ts` 中的临时 re-export，确认无生产代码引用后删除旧文件。
- [x] 8.2 删除 `src/renderer/src/config/fyllo-actions.ts`、`src/renderer/src/utils/fyllo-action.ts`、`src/renderer/src/utils/fyllo-action-rail.ts`、`src/renderer/src/composables/useFylloActionDispatcher.ts` 及旧 `fyllo-action-handlers/` 目录，确认无生产代码引用后删除。
- [x] 8.3 删除 `session:chat:setActionState` channel、schema、handler、preload API、renderer wrapper 和相关 tests。
- [x] 8.4 检查 `scripts/eslint-rules/renderer-feature-boundaries.mjs` 是否需要更新以覆盖 `src/renderer/src/features/fyllo-action/` 的四层依赖方向；确保规则是通用语义，不针对具体 feature 名称。
- [x] 8.5 将测试目录镜像迁移到 `test/shared/fyllo-action/`、`test/main/services/session/action/`、`test/renderer/src/features/fyllo-action/`，删除旧位置对应测试。
- [x] 8.6 根据落地结果检查并更新 `guidelines/RendererFeatures.md`、`guidelines/MainProcess.md`、`guidelines/RendererProcess.md`、`guidelines/Architecture.md` 中与本实现不一致的条目；只更新事实冲突，不新增未落地的约定。
- [x] 8.7 运行 `pnpm typecheck`、`pnpm lint`、`pnpm test` 并修复全部错误。
