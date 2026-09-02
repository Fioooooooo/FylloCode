# Workflow Engine Phase 1 实施任务

## 1. Shared v2 contract 与 Workspace storage

- [x] 1.1 重写 `src/shared/types/workflow.ts`（或按当前 shared 分组拆分 definition/run 文件），定义 `WorkflowDefinition`、Agent/Action/Wait stage union、Transition、Gate、Artifact、ActionOp、`WorkflowRunSnapshot` 和 status union；删除 `WorkflowStage`、`WorkflowStageType`、`WorkflowTemplate` 及所有兼容别名，确保 `snapshotSchemaVersion: 1`、inline `frozenDefinition` 和 `workflowId`/`name` 解耦的类型在 shared 层可复用。
- [x] 1.2 更新 `src/shared/ipc/automation/workflow.channels.ts`、`src/shared/ipc/automation/workflow.schemas.ts` 为 v2 definition list/save/delete contract：按 workflowId 更新/删除、创建时允许缺省 ID、保存只接受 YAML；新增 `src/shared/ipc/automation/workflow-run.channels.ts` 与对应 schemas，精确实现 list/getDetail/decide/wake 的输入和 payload；同步 `src/shared/types/channels.ts` 的 active channel registry。
- [x] 1.3 删除 `src/shared/types/proposal.ts` 对 `WorkflowStage` 的依赖以及 `ApplyRunMeta`/`ArchiveRunMeta` 旧 Proposal run metadata public contract；让 Proposal browser 类型只依赖 ProposalRef、ProposalMeta 与 watcher 状态，并同步修正所有 preload/renderer 类型引用。
- [x] 1.4 在 `src/main/infra/storage/workspace-paths.ts` 增加并测试 `workflowDir`、`workflowDefinitionPath`、`workflowRunsDir`、`workflowRunDir`、`workflowRunSnapshotPath`、fresh session transcript 和 action output path helper；所有 ID 使用现有 `assertStorageIdentity`，保持 `workspaceDataDir(workspaceId)` ownership。
- [x] 1.5 新建 `src/main/infra/storage/workflow-definition-store.ts` 与 `src/main/infra/storage/workflow-run-store.ts`，复用 `src/main/infra/storage/atomic-write.ts`；实现 definition 原子保存、Run snapshot 完整原子写入、transcript append、Action log append 和按 Workspace/parent/run owner 读取，禁止扫描旧 name-based YAML 与 `apply-runs/**`。
- [x] 1.6 为 shared schema、storage path、definition save/update/delete、snapshot atomic write、旧路径 inert 行为补充 `test/shared/**`、`test/main/infra/storage/**` 和相关 fixture；覆盖改名保持 workflowId/runs 路径、两个 Workspace 隔离和 snapshot 写失败不返回 runId。

## 2. Definition service 与 `/workflow` v2 编辑入口

- [x] 2.1 将 `src/main/domain/automation/workflow/yaml-parser.ts` 替换为基于 `definition-schema.md` 的 v2 parser/validator，区分 YAML/schema validation 与 Phase 1 capability preflight；错误须携带 field/stage/feature 定位，不能沿用旧 parser 的 alias/fallback 行为。
- [x] 2.2 重构 `src/main/services/automation/workflow/workflow-service.ts` 为 definition service，并移除 `src/main/services/automation/workflow/built-in-loader.ts`、`loadAllWorkflowTemplates` 和按 name/global built-in 发现逻辑；在 `src/main/services/automation/_public/index.ts` 暴露明确的 definition 读取/list/save/delete 方法，不使用 `export *`。
- [x] 2.3 重写 `src/main/ipc/automation/workflow.ts` 和 `src/main/ipc/automation/index.ts` 的 workflow registration，使 `automation:workflow:*` 只服务 v2 definition CRUD；Main 必须先验证 Workspace 与 workflowId 所有权，再调用 definition service，且不再调用 Proposal runtime 或旧 template loader。
- [x] 2.4 更新 `src/preload/api/automation/workflow.ts`、`src/preload/index.ts`、`src/preload/index.d.ts` 和 `src/renderer/src/api/automation/workflow.ts` 为 v2 definition contract；保留 `window.api.automation.workflow` 作为同一 v2 definition area，但不得暴露旧 `WorkflowTemplate` shape 或 stage type。
- [x] 2.5 重写 `src/renderer/src/stores/automation/workflow.ts` 为 workflow definition store，按 workflowId 管理 list/selected/raw YAML/save/delete generation；改造 `src/renderer/src/pages/workflow.vue` 和现有 `YamlEditor.vue`（若可复用则保留纯文本编辑器）以编辑完整 v2 YAML，不再按旧 stage 类型生成内容。
- [x] 2.6 删除或改造仅服务旧模型的 `src/renderer/src/components/workflow/WorkflowDetail.vue`、`WorkflowSidebar.vue`、`StageList.vue`、`StageCard.vue`、`src/renderer/src/composables/useWorkflowEditor.ts`、`src/renderer/src/utils/workflow.ts`；同步 `src/renderer/src/stores/index.ts`、路由/导航注册和 workflow 页面测试，确保页面仍可保存合法 definition、报告非法 YAML、重命名不新建目录。
- [x] 2.7 删除 `resources/workflows/built-in/quick-apply.yaml` 及 workflow-specific resource 假设；核对 `electron-builder.yml` 的 `files`/`asarUnpack` 仅保留仍在使用的非 workflow 资源通用规则，不新增替代复制步骤，并在构建产物清单或等价打包测试中断言不包含 `resources/workflows/built-in/**`。

## 3. WorkflowEngine 状态机与执行资源

- [x] 3.1 在 `src/main/domain/automation/workflow/` 新建纯状态迁移模块，实现 `advance(snapshot,event)`、status transition、Transition pass/fail/signal、visitCounts/maxLoops、pending decision 和 terminal/error projection；为非法迁移、重复 decision、循环超限建立结构化错误。
- [x] 3.2 在同一 domain 实现 Phase 1 capability preflight，覆盖空 requires、`run.*` template、Agent fresh/freeform、Action exec、human Gate；对 inherit/Wait/expr/verdict/structured artifact/op/retry/idempotencyKey 返回设计约定的错误码和 stage/feature refs，且在 Run 创建前终止。
- [x] 3.3 新建主进程 `WorkflowEngine`（建议位于 `src/main/services/automation/workflow/`），实现 trusted trigger、`{workspaceId,parentSessionId}` active key、per-Run serialized event queue、snapshot store、wake callback、list/detail projection 和 beginShutdown/dispose/force API；engine 是唯一 Run 执行 owner，不新增第二个 workflow runner。
- [x] 3.4 从 `src/main/services/session/_public/index.ts` 使用并必要时扩展 session domain 的窄 public surface；在 `src/main/services/session/chat/session-registry.ts`、`acp-session.ts`、`session-runtime-profile.ts` 等现有公共能力处增加 workflow owner/store/runtime profile 支持，保证 workflow session 与 chat/apply/archive/spawn 的 owner key、storage 和 notification 语义隔离。
- [x] 3.5 实现 Agent fresh runner：在 AgentStage 启动前生成并持久化逻辑 session ID，使用 parent 冻结 Workspace snapshot 创建 ACP session，复用 `driveAcpTurn`/message assembler 能力但写入 Run 专用 transcript；ACP session resolve 后 patch acpSessionId，最终响应保存为 freeform artifact，禁止调用 `SpawnedSessionManager.promptToAgent` 或 spawned store/list。
- [x] 3.5.1 实现模板变量插值：在 `src/main/domain/automation/workflow/template-interpolator.ts` 新建插值函数，支持 Phase 1 的 `run.*` 和 `artifacts.*` 命名空间；在 `workflow-agent-runner.ts` 中对 `stage.prompt` 插值，在 `workflow-action-runner.ts` 中对 `op.command` 插值，确保 agent 和 action 收到的是替换后的实际值；补充 `test/main/domain/automation/workflow/template-interpolator.spec.ts` 覆盖 run.id/startedAt、artifacts 嵌套路径、空值处理和真实场景。
- [x] 3.6 实现 Action exec runner，复用 `src/main/infra/process/` 的 cross-spawn/registry 能力；按 parent 冻结 Workspace snapshot 校验 cwd，合并 stdout/stderr 到 `action-outputs/<stage-id>.log`，记录 exitCode/signal/start/end，confirm 未批准前不创建进程，且不引入隐含 timeout。
- [x] 3.6.1 区分 Action 的 error 和 fail：在 `workflow-action-runner.ts` 的 `finishStage` 中，当 `exitCode === 127` 或 `signal !== null` 时发送 `error` event（触发 workflow 终止），其他非零 exitCode 发送 `action-completed` event（按 fail transition 处理）；确保命令不存在等环境错误不会触发回边循环，并补充相关测试覆盖 exitCode=127、signal=SIGTERM 和 exitCode=1 的不同处理路径。
- [x] 3.7 实现 startup reconcile：校验 snapshot schema/frozenDefinition/currentStageId，恢复 awaiting 状态，将无 live handle 的 running 标为 interrupted，使用 `WORKFLOW_SNAPSHOT_INCOMPATIBLE`/`WORKFLOW_DEFINITION_INCOMPATIBLE` 等结构化错误，不读取 live definition、不迁移旧 snapshot，并保留 artifacts/visitCounts/transcript/log。
- [x] 3.8 为 `advance`、preflight、Run conflict、confirm/gate、Agent/Action 完成、maxLoops、并发事件、reconcile、父 session 删除和 action cancellation 补充 `test/main/domain/automation/workflow/**`、`test/main/services/automation/workflow/**`；至少包含一个 Agent→human Gate→Action→terminal 的端到端 engine fixture。

## 4. `fyllo-workflow` MCP 与 Host transport

- [x] 4.1 更新 `src/main/infra/mcp/bundled-mcp-registry.ts` 和 `src/main/infra/mcp/bundled-mcp-servers.ts`，显式注册 `fyllo-workflow` 为 HTTP-only server，并支持 per-session `allowedServerNames`；正常 Chat activation 保留 workflow server，workflow fresh activation 与 grant 均固定为 `fyllo-specs`/`fyllo-cortex`。
- [x] 4.2 重构 `src/main/infra/mcp/bundled-mcp-host.ts` 为 server-neutral envelope、requestId pending map、per-server codec/handler registry 和通用 process lifecycle；保留 fyllo-spawn 的现有 codec/schema/error behavior，不复制 host 或用 `FylloSpawnRpcRequest` 别名承载 workflow protocol。
- [x] 4.3 新建 `src/mcp-servers/fyllo-workflow/` 的 HTTP-only server、tool registration、RPC client、独立 request/response schemas 和 README；实现 `list_workflows({})` 与 `trigger_workflow({workflowId})`，不在 MCP 子进程执行 workflow 或接受 parentSessionId/targetPath/YAML。
- [x] 4.4 在 Main workflow RPC handler 中从 trusted MCP context 取得 workspace/parent/caller owner，接入 `WorkflowEngine`；实现 not-found/conflict/preflight/rejected result，所有非 chat caller 统一返回 `WORKFLOW_INVALID_CALLER`、记录 warn 且不创建 Run。
- [x] 4.5 更新 `scripts/build-mcp-servers.mjs` 和 bundled MCP 构建/打包配置，让新 server 通过显式 registry 构建、解析和分发；新增 `test/main/infra/mcp/bundled-mcp-host.spec.ts`、registry/activation tests 和 `test/mcp-servers/fyllo-workflow/**`，回归 fyllo-spawn codec、HTTP-only、caller guard、fresh allowlist 和 Host shutdown。

## 5. Workflow Run IPC、Renderer store 与可见性

- [x] 5.1 新建 `src/main/ipc/automation/workflow-run.ts`，注册 list/getDetail/decide handlers 和 workspace/parent/run/status validation；通过 automation registry 接入，不允许 Renderer 直接写 snapshot；在 `src/preload/api/automation/workflow-run.ts`、`src/preload/index.ts`、`src/preload/index.d.ts` 和 `src/renderer/src/api/automation/workflow-run.ts` 暴露同一 contract。
- [x] 5.2 在 WorkflowEngine 与 `src/main/bootstrap/workspace-window-manager.ts` 的既有 sendToWorkspace 出口之间接入 debounced wake；只发送 `{workspaceId,runId}`，覆盖 stage transition、awaiting、terminal、error 和 cancellation，并确保 shutdown 后不再推送新工作。
- [x] 5.3 在 `src/renderer/src/stores/automation/workflow-run.ts` 新建 workflow-run Pinia store，并在 `src/renderer/src/features/workflow-run-inspector/model/`、`application/`、`ui/`、`integration/` 和根 `index.ts` 中分别放置 projection、interest controller、UI 入口和 Chat host 装配；实现 list/detail projection、interest ref-count、wake listener、generation guard 和 approve/reject action，无 interest 时不得因 wake 调用 getDetail。
- [x] 5.4 在 `src/renderer/src/features/workflow-run-inspector/ui/` 实现 `WorkflowRunActivityEntry`/detail view，并修改 `src/renderer/src/components/chat/ChatBackgroundActivityBar.vue` 将其作为 `SpawnedSessionActivityEntry` 的平级兄弟；显示运行/等待/终态和 decision 控件，禁止从 spawned store/count/notification 派生。
- [x] 5.5 为 workflow-owned fresh session 提供从 Run detail 打开 transcript/对话的入口；使用 WorkflowEngine 返回的 session identity，不接入 `SpawnedSessionActivityEntry`，并在 ACP turn 重启不可恢复时展示 interrupted 与已有 artifact/transcript。
- [x] 5.6 补充 `test/main/ipc/automation/workflow-run.spec.ts`、`test/renderer/src/stores/**workflow-run**`、activity bar/entry/detail tests，覆盖 owner 拒绝、wake payload、interest-gated pull、decision 状态机、spawned count 隔离和迟到 response 丢弃。

## 6. 删除旧 WorkflowStage 与 Proposal stage-stream 链路

- [x] 6.1 删除旧 workflow 实现中的 fallback/alias 代码、按 name loader、`src/main/services/automation/workflow/built-in-loader.ts`、全局 `getDataSubPath("workflows")` staging 和所有 `loadAllWorkflowTemplates` 调用；将 `src/main/domain/automation/workflow/yaml-parser.ts` 收敛为唯一的 v2 parser；更新 automation public barrel、registry、启动 wiring 与测试，仓库 active source 不得再引用旧 WorkflowStage symbols 或 built-in source semantics。
- [x] 6.2 删除仅服务旧 Proposal stage-stream 的 `src/main/ipc/proposal/apply.ts`、`src/main/ipc/proposal/archive.ts`、`src/shared/ipc/proposal/apply.channels.ts`、`src/shared/ipc/proposal/apply.schemas.ts`、`src/shared/ipc/proposal/archive.channels.ts`、`src/shared/ipc/proposal/archive.schemas.ts`、`src/preload/api/proposal/apply.ts`、`src/preload/api/proposal/archive.ts` 及 `src/main/ipc/proposal/index.ts` 中的对应 handlers；保留 proposal browser/status IPC 和 `src/mcp-servers/fyllo-specs/src/tools/apply-change.ts`、`archive-change.ts`。
- [x] 6.3 删除 `src/main/services/proposal/runtime/apply-run-service.ts`、`stage-prompts.ts`、`src/main/infra/storage/apply-run-store.ts`、`apply-stage-acp-session-store.ts`、`archive-acp-session-store.ts` 及 `applyRunsDir` 相关旧 storage；确认 `fyllo-specs` MCP 的 resolver、OpenSpec archive、metadata 和 Git finalization 不依赖这些文件。
- [x] 6.4 从 renderer 删除 `src/renderer/src/stores/proposal/run.ts`、`ProposalApplySidePanel.vue`、Proposal detail/header 中旧 runMeta/isArchiving/stage progress/运行历史注释和 props；移除 `ChatPageShell.vue` 对旧 workflow store 的无调用方 fetch；保留 ChatProposalPanel 的文字 Apply/Archive 消息，并让 proposal display status 只依赖 Proposal metadata/task progress/watcher。
- [x] 6.5 同步 `src/renderer/src/stores/proposal/index.ts`、组件 barrel、preload index/types、`src/main/ipc/index.ts` 相关注册和 route/navigation 引用；删除旧 stage/template 测试 fixture，补充 active source 搜索门禁，确保 `WorkflowStage`、`WorkflowStageType`、`ApplyRunMeta`、旧 template schema/fallback 和旧 `automation:workflow` handler 实现不再残留（v2 definition CRUD 可继续使用相同 channel 前缀；历史 archive/reference 文档不作为 active source 修改）。
- [x] 6.6 更新 Proposal owner/browser delta 对应实现和测试：Apply/Archive 只从 Chat→MCP tools 进入，Proposal detail 不加载旧 run history/side panel，`archiveReady` 不依赖 runMeta；回归同名 change 的 Folder 隔离、stale target、watcher status push 和 Chat 消息文本。
- [x] 6.7 删除 `IpcErrorCodes.BUILT_IN_WORKFLOW` 及仅服务旧 name-to-file API 的 `INVALID_WORKFLOW_NAME`（若没有其他 active caller）；从 `src/main/infra/paths/index.ts` 删除不再使用的 global `workflows` subpath，并更新 error-code、path、workflow-service 和相关测试，确保 v2 definition validation 使用通用 field/schema 错误。

## 7. Bootstrap、parent lifecycle 与 shutdown

- [x] 7.1 在 `src/main/bootstrap/runtime.ts` 删除 `initBuiltInWorkflows`、初始化 AbortController/promise 及其 getter；同步删除 `SHUTDOWN_PHASES` 中 `built-in-workflow-initialization` 的 quiesce/settle 资源和 runtime test；在集中 runtime wiring 中显式启动 WorkflowEngine，确保 IPC、bundled MCP host、session public capability 已就绪后再开始 reconcile。
- [x] 7.2 在 `src/main/bootstrap/shutdown.ts` 的 `SHUTDOWN_PHASES`、`ShutdownRuntimeResources` 和 `createShutdownPhases` 中增加 workflow-engine named quiesce/settle/force tasks；更新 `runEmergencyShutdown`，保证 WorkflowEngine 在 ACP process pool、bundled MCP host 和 auxiliary process terminate 前拒绝新工作、取消 handles、尽力落盘并标记 interrupted。
- [x] 7.3 在 `src/main/services/session/chat/chat-service.ts` 的 `removeSession` 前接入 `WorkflowEngine.cancelRunsByParentSession(workspaceId,parentSessionId)`；保留 Run snapshot/transcript/action output，确认 Proposal status watcher 和 spawned parent deletion 顺序不被破坏。
- [x] 7.4 为 runtime wiring、shutdown phase ordering、emergency shutdown、parent deletion、late trigger rejection 和 force cleanup 更新 `test/main/bootstrap/runtime.spec.ts`、`shutdown.spec.ts`、lifecycle tests 与 `test/main/services/session/chat/**`。

## 8. 文档、guideline 与质量验收

- [x] 8.1 更新当前有效的 workflow/automation 文档（中英文 feature/reference/guide）、`src/mcp-servers/fyllo-workflow/README.md`、必要的根 README/CONTRIBUTING 和代码注释，明确 v2 definition path、Run snapshot、MCP tools、fresh session 隔离、无 built-in template/copy semantics 和无 legacy compatibility；删除 version 1 template、built-in read-only/copy-on-save 描述；不要改写 `openspec/changes/archive/**` 历史记录。
- [x] 8.2 更新或新增 `openspec/specs/**` 的实现对应关系，确保本 Proposal 的 `workflow-engine`、`workflow-run-inspection`、`fyllo-workflow-mcp` 新 spec 与三个 modified capability 的 delta 均能由代码和测试覆盖；完成每个 artifact/task 的 acceptance trace。
- [x] 8.3 由于本变更新增 WorkflowEngine owner/registry/store、server-neutral MCP bridge、workflow-run wake/pull 和 renderer sibling activity boundary，更新 `guidelines/MainProcess.md`、`guidelines/RendererProcess.md`、`guidelines/RendererFeatures.md`、`guidelines/Testing.md` 中对应的具体约定与测试位置；不得只添加“检查 guideline”而不记录新边界。
- [x] 8.4 按 `guidelines/QualityGates.md` 执行 `pnpm typecheck`、`pnpm lint`、`pnpm test` 和必要的格式检查，确认新旧 workflow source search、built-in resource/package absence、MCP build registry、shared domain channel lint、Proposal Chat 回归与覆盖率门禁通过；`pnpm build` 如需运行，先取得项目规定的明确批准。
