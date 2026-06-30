## 1. Shared contracts

- [x] 1.1 修改 `src/shared/types/fyllo-action.ts`：新增 `PlanCreateActionPayload`、把 `FylloActionType` 扩展为 `"task.create" | "plan.create"`，并将 `FylloActionHandlerResult` 从 `ok: true/false` 改为 `outcome: "succeeded" | "failed" | "cancelled" | "dismissed"`；更新所有引用处的类型推导。
- [x] 1.2 修改 `src/shared/schemas/fyllo-action.ts`：新增 `planCreateFylloActionPayloadSchema = z.strictObject({ slug, goal })`，其中 `slug` 校验完整 `yyyy-MM-dd-<agent-slug>` 且禁止路径穿越；更新 `fylloActionStateSchema.type` 支持 `"plan.create"`。
- [x] 1.3 修改 `src/shared/constants/fyllo-action-contracts.ts`：注册 `plan.create` contract，payload 字段只包含 `slug` 与 `goal`，示例不得包含 `planPath`。
- [x] 1.4 修改 `src/shared/types/mcp-event.ts`：新增 `McpPlanEvent` 并导出 `McpEvent = McpProposalEvent | McpPlanEvent`，其中 `McpPlanEvent.tool === "create-plan"` 且字段为 `createdAt/sessionId/planSlug`。
- [x] 1.5 修改 `src/shared/types/lineage.ts`：新增 `LineagePlanLink`，在 `LineageSessionLink` 增加 `plans: LineagePlanLink[]`；保持 `LineageIndex` 不新增 `plans` 字段。
- [x] 1.6 修改 `src/shared/types/channels.ts` 与 `src/shared/schemas/ipc/lineage.ts`：新增 `lineage:readPlan`、`lineage:savePlanBody`、`lineage:approvePlan` channel 常量和入参 schema；schema 必须校验 `projectId/sessionId/slug`，`savePlanBody` 额外校验 `body: string`。

## 2. fyllo-specs create-plan tool

- [x] 2.1 新建 `src/mcp-servers/fyllo-specs/src/tools/create-plan.ts`：注册 `create-plan` tool，input schema 只包含 `{ goal, slug }`；不接收 `targetPath`、路径类字段或 `includeInstruction`，并校验 `slug` 为不带日期前缀的 kebab-case 片段。
- [x] 2.2 在 `create-plan.ts` 中读取 `FYLLO_PROJECT_DATA_DIR` 与 `FYLLO_SESSION_ID`；缺失时通过 `runTool` 返回 `state.errors`，不得创建文件。
- [x] 2.3 在 `create-plan.ts` 中生成完整 slug `yyyy-MM-dd-<slug>`，创建 `<FYLLO_PROJECT_DATA_DIR>/sessions/<sessionId>/plans/<fullSlug>.md`，写入 frontmatter 与六个固定 heading；文件存在时不得覆盖已有内容，应返回可诊断错误 state。
- [x] 2.4 在 `create-plan.ts` 中写出 `McpPlanEvent` 到 `FYLLO_MCP_EVENT_DIR`，采用与 `create-proposal` 相同的 mkdir、临时文件、rename、失败不阻断策略。
- [x] 2.5 新建 `src/mcp-servers/fyllo-specs/src/tools/instructions/create-plan.md`：说明 Plan 阶段只允许调研和写 plan；Agent 写完后输出 `plan.create` action；payload 禁止包含 `planPath`。
- [x] 2.6 修改 `src/mcp-servers/fyllo-specs/src/tools/index.ts` 与 `src/mcp-servers/fyllo-specs/src/utils/load-prompt.ts`：注册 `create-plan` 并加载 `create-plan.md`。
- [x] 2.7 更新 `test/mcp-servers/fyllo-specs/**`：覆盖 tools/list 五个 tool、`create-plan` 不暴露 `targetPath`、缺少 env 时不创建文件、合法输入创建 plan 骨架、事件写出 best-effort、instruction 总是返回且禁止 `planPath` payload。

## 3. Lineage model and plan storage

- [x] 3.1 修改 `src/main/domain/lineage/subject.ts`：新增 `appendPlan(subject, sessionId, slug, now)`，对同一 `(sessionId, slug)` 幂等，不重复追加；`upsertSessionLink` 新建 link 时初始化 `plans: []`。
- [x] 3.2 修改 `src/main/infra/storage/lineage-store.ts`：新增 `normalizePlanLink`；`normalizeSessionLink` 读取缺失 `plans` 的历史数据时归一为 `[]`；`normalizeIndex` 保持不接受/不输出 `plans`。
- [x] 3.3 修改 `src/main/domain/lineage/index-derive.ts`：保持 `LineageIndexEntries` 只包含 `tasks/sessions/proposals/commitHashes`，确认 plan link 不参与 index 派生；补充测试证明 `rebuildIndex` 不写 `plans` 字段。
- [x] 3.4 修改 `src/main/domain/lineage/projection.ts`：`cloneSessionLink` 深拷贝 `plans` 与 `proposals`，确保 `lineage:getBySession` 能返回 session plans。
- [x] 3.5 修改 `src/main/services/lineage/lineage-service.ts`：新增 `recordPlan(projectPath, sessionId, slug)`，经 `index.sessions` 反查 subject 后追加 plan；未知 session 返回 `null`，不创建 subject。
- [x] 3.6 新建 `src/main/services/lineage/plan.ts`：实现 `readPlan(projectPath, sessionId, slug)`、`savePlanBody(projectPath, sessionId, slug, body)`、`approvePlan(projectPath, sessionId, slug)`；所有路径必须通过 session plans 目录推导，禁止从 renderer 接收路径。
- [x] 3.7 修改 `src/main/infra/storage/project-paths.ts`：新增 `sessionPlansDir(projectPath, sessionId)` 或等价 helper，供 plan service 使用。
- [x] 3.8 更新 `test/main/services/lineage/lineage-service.spec.ts`、`test/main/infra/storage/lineage-store*.spec.ts`：覆盖 `plans` 兼容读取、`recordPlan` 幂等、未知 session 返回 `null`、index 不包含 plans。

## 4. MCP event consumer and IPC

- [x] 4.1 修改 `src/main/services/lineage/mcp-event-consumer.ts`：解析 `McpEvent` 联合类型；按 `tool` 分发 `create-proposal -> recordProposal`、`create-plan -> recordPlan`；plan 事件遇未知 session 时先 `ensureChatSubject` 再重试。
- [x] 4.2 更新 `test/main/services/lineage/mcp-event-consumer.spec.ts`：覆盖 plan 事件直接挂边、纯 chat 起源兜底建链、损坏 plan 事件跳过、消费成功删除事件文件。
- [x] 4.3 修改 `src/main/ipc/lineage.ts`：注册 `lineage:readPlan`、`lineage:savePlanBody`、`lineage:approvePlan`，handler 只做 validate、projectId 解析、调用 `services/lineage/plan.ts`。
- [x] 4.4 修改 `src/preload/api/lineage.ts`、`src/preload/index.d.ts`、`src/renderer/src/api/lineage.ts`：暴露 read/save/approve plan 薄封装，返回统一 `IpcResponse<PlanDocument>`。
- [x] 4.5 更新 `test/main/ipc/lineage*.spec.ts`、`test/preload/**/*.spec.ts` 或相邻测试：覆盖入参 schema、非法 slug 拒绝、IPC 成功转调 service。

## 5. Renderer plan review flow

- [x] 5.1 修改 `src/renderer/src/components/shared/markstream/FylloActionShell.vue`：支持新的 `FylloActionHandlerResult.outcome`；`dismissed` 回到 ready 且不调用 `persistActionState`；保留 `succeeded/failed/cancelled` 的持久化行为。
- [x] 5.2 修改 `src/renderer/src/config/fyllo-actions.ts`：为 action definition 增加 FylloCode 内部控制字段 `confirmLabel?: string`、`showCancel?: boolean`；注册 `plan.create`，标题“审阅规划”，确认按钮文案“审阅方案”，不显示取消按钮，摘要为 `goal`。
- [x] 5.3 新建 `src/renderer/src/components/chat/action/PlanCreateAction.vue`：只展示 `slug` 与 `goal` 摘要；不得 import `window.api`、renderer api、Pinia store 或业务 service。
- [x] 5.4 新建 `src/renderer/src/composables/usePlanSlideover.ts` 与 `src/renderer/src/components/plan/PlanSlideover.vue`：使用 `useOverlay().create(..., { destroyOnClose: true })`；Slideover 读取 plan、markdown 编辑正文、保存正文、批准 plan，并在关闭时返回 approved/dismissed。
- [x] 5.5 修改 `src/renderer/src/composables/useFylloActionDispatcher.ts`：`task.create` 返回新的 outcome；新增 `plan.create` 分支，校验当前 project 与 sessionId，打开 Plan Slideover，approved 返回 `succeeded`，关闭未批准返回 `dismissed`，错误返回 `failed`。
- [x] 5.6 在 `PlanSlideover` 批准成功后调用 chat store 发送用户消息 `我已确认规划方案：<slug>`；发送前必须确保 `approvePlan` 成功。
- [x] 5.7 更新 renderer 测试：覆盖 `dismissed` 不写 action state、`plan.create` payload 含 `planPath` invalid、确认按钮文案和隐藏取消按钮、Slideover approve/dismissed 分支、dispatcher 缺 sessionId 失败。

## 6. System reminder and guidelines

- [x] 6.1 修改 `src/main/services/chat/system-reminder/templates/chat.txt`：加入直接实现 / Plan / Proposal 三级分流，说明 Plan 只适用于不改变契约的复杂任务，发现契约变更必须升级 Proposal。
- [x] 6.2 在 chat reminder 中说明 `mcp__fyllo_specs__create-plan` 使用规则：用户要求或同意后创建 plan；写入 plan 前后不得修改业务代码；写完后输出 `plan.create`；批准消息后重新读取 plan 再实施。
- [x] 6.3 确认 `formatFylloActionContractInstructions` 自动注入 `plan.create` contract，且 apply/archive reminder 不注入 chat-only action contract。
- [x] 6.4 更新 `test/main/services/chat/system-reminder/resolve.spec.ts`：覆盖三级分流、create-plan 指令、禁止 `planPath` payload、plan.create contract 注入、apply/archive 不注入。
- [x] 6.5 更新本地 guidelines：`guidelines/DataModel.md` 补充 session plan 文件、`LineageSessionLink.plans` 与“不新增 LineageIndex.plans”；`guidelines/IPC.md` 补充 plan lineage IPC；`guidelines/RendererProcess.md` 补充 Plan Slideover 与 action outcome；`guidelines/Build.md` 或相关 MCP 章节补充 `create-plan` instruction 文件。

## 7. Verification

- [x] 7.1 运行 `pnpm vitest run test/mcp-servers/fyllo-specs/**/*.ts` 或项目实际 MCP test 命令，确认 `create-plan` tool 与 prompt 测试通过。
- [x] 7.2 运行 `pnpm vitest run test/main/services/**/*.spec.ts test/main/infra/storage/**/*.spec.ts test/main/ipc/**/*.spec.ts`，确认 lineage、event consumer、plan service 与 IPC 通过。
- [x] 7.3 运行 `pnpm vitest run test/shared/**/*.{test,spec}.ts`，确认 Fyllo action、MCP event、lineage schema 类型与校验通过。
- [x] 7.4 运行 `pnpm vitest run test/renderer/src/**/*.{test,spec}.{ts,vue}`，确认 action shell、dispatcher 与 Slideover 行为通过。
- [x] 7.5 运行 `pnpm typecheck` 与 `pnpm lint`。
- [x] 7.6 手动 dogfood：在 Chat 中创建 plan，确认 plan 文件生成、lineage session link 出现 plan、action payload 不含路径、关闭 Slideover 不写 succeeded、批准后发送确认消息并允许 Agent 重新读取 plan。
