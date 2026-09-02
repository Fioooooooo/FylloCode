# Workflow Engine Phase 1 实施设计

## Context

仓库当前有一条旧的 workflow 代码链路：`WorkflowTemplate` 按名称对应 YAML 文件，`WorkflowStage` 同时承担 workflow 编辑模型和 Proposal Apply/Archive stage-stream 的运行模型，Main 通过 `automation:workflow:*` 提供 list/save/delete，Proposal 运行代码再从旧 template 生成 stage。该链路还包含 `resources/workflows/built-in/quick-apply.yaml`、`built-in-loader.ts` 和启动时把 packaged template 复制到全局 `data/workflows`/`userData/workflows` 的初始化机制。renderer 中真正的 Proposal Apply/Archive 入口已经改为向 Chat 发送文字消息；旧 workflow dropdown、详情页运行入口和直接 stage-stream 调用只剩注释或历史测试。

Phase 1 设计和两轮讨论已经将新模型收敛为：手写 `version: 2` YAML、Workspace asset、随机 `workflowId`、主进程唯一 Run engine、`Agent(fresh, freeform)` + `Action(exec)` + `Gate(human)`、独立 Run 快照和 wake + pull 展示。交叉评审进一步确认了以下实施决定：

- Run 快照内联完整 `frozenDefinition`，删除 `workflowVersion`，用 `snapshotSchemaVersion: 1` 表示 Run JSON 结构版本。
- `automation:workflow-run:*` 是独立的 run IPC area；`wake` 只携带失效标记，Renderer 在有 interest 时再 pull detail。
- Workflow fresh session 使用独立 owner/registry/store/transcript，不复用 spawned-session 的 store、列表、通知或 `SpawnedSessionManager.promptToAgent`。
- fresh workflow session 的 MCP allowlist 固定为 `fyllo-specs`、`fyllo-cortex`，排除 `fyllo-spawn`、`fyllo-workflow`；handler 仍对所有非 `chat` trusted caller 返回 `WORKFLOW_INVALID_CALLER`，不创建 Run。
- Host 的 RPC 线协议抽象为 server-neutral envelope 和 per-server codec，不能复制一套 fyllo-spawn proxy 或只给旧类型加别名。

本 Proposal 还落实了用户确认的清理边界：旧 workflow engine 和仅服务 `WorkflowStage` 的 Proposal stage-stream 代码没有真实用户，不做兼容运行；`fyllo-specs` MCP 的 `apply-change`/`archive-change`、Chat Event Rail 的文字入口、Proposal watcher 和 owner-qualified target 仍然是 Apply/Archive 的有效产品路径。

## Goals

- 让新 v2 Workflow Engine 成为仓库中唯一的通用 workflow 执行实现。
- 让 `/workflow` 页面可以创建、编辑、保存和删除 Workspace-owned 的 v2 YAML definition。
- 在 Main 中实现可测试的纯状态迁移、串行 Run 推进、原子快照、人工决策和可恢复边界。
- 以可信 Workspace/parent session 上下文约束 Run 归属、MCP 触发、Agent filesystem/MCP descriptor 和 Action cwd。
- 让 workflow 内部 fresh Agent 对用户透明可见，但保持与 spawned session 的语义和数据源隔离。
- 接入现有 bootstrap/shutdown、ACP process pool、辅助进程和 parent session 删除生命周期。
- 清除旧 `WorkflowStage`、旧模板 API、旧 Proposal stage-stream 与无调用方 renderer 运行面板，避免新旧状态机并存。

## Non-Goals

- 不实现 Phase 2 的 agent 动态生成、`context: inherit`、reminder 注入或 Chat turn 互斥。
- 不实现 `WaitStage`、`gate.type: expr`、`gate.type: verdict`、结构化 artifact、结构化 ActionOp、`retry` 或 `idempotencyKey`。
- 不实现命令来源安全检查、危险命令拦截、Provider capabilities、`git.*`/`scm.*`/`tracker.*`/`webhook` op 或图形化 workflow 编辑器。
- 不把 Workflow fresh session 放入 spawned-session 的用户/agent 子 session 列表，也不通过 `fyllo-action` 触发或展示 Run。
- 不重新设计或删除 `fyllo-specs` 的 Apply/Archive MCP tools，不改变其 OpenSpec archive、metadata、Git finalization 和 Proposal watcher 语义。
- 不迁移旧 `workflow-name.yaml`、旧 `WorkflowStage` JSON 或旧 `apply-runs` 数据；本次不建立旧数据兼容层，也不让新 runtime 发现它们。

## Decisions

### 1. 定义模型与单一 engine

使用 `references/designs/workflow-engine/definition-schema.md` 作为完整定义态 schema 的唯一来源。Shared contract 以 `WorkflowDefinition`、Stage union、Transition、Gate、Artifact 和 ActionOp 表达定义态；旧 `WorkflowStage`、`WorkflowStageType`、`WorkflowTemplate` 不保留别名。

`WorkflowDefinitionService` 负责 definition 的读取、解析、校验和 CRUD；`WorkflowEngine` 负责 Run 的创建、推进和生命周期。前者是定义存储服务，不是第二个执行 engine。所有 Run 只能进入 `WorkflowEngine`，Proposal Apply/Archive 不再转译为旧 WorkflowStage。

定义管理 API 继续使用 automation domain 的 workflow area（`automation:workflow:list/save/delete`），以保持 `/workflow` 页面所属的 domain 位置；但 shared schema、返回值和实现整体替换为 v2 definition API。它不再返回 built-in/custom `WorkflowTemplate`，不再按 name 读写文件。Run 展示使用单独的 `automation:workflow-run:*` area，避免把定义 CRUD 与 Run 状态混为一谈。

选择保留 domain/channel 前缀而不是增加顶层 `workflow` API，是因为现有 domain-first 规范已经将 workflow 归入 `automation`，而真正需要隔离的是旧数据模型与新的 Run area。旧类型和旧 handler 会删除，不会以兼容入口继续存在。

### 1.1 移除 built-in 模板资源与全局 staging

Phase 1 不包含任何 app-shipped workflow template。实现 SHALL 删除 `resources/workflows/built-in/quick-apply.yaml`，并删除 `src/main/services/automation/workflow/built-in-loader.ts` 中的资源目录解析、全局目录解析、文件名枚举、首次启动复制和 atomic-copy helper。`workflow-service` 只扫描当前 Workspace 的 `workflows/<workflow-id>/definition.yaml`，不得再读取 `getDataSubPath("workflows")`、`getResourcesPath()/workflows/built-in` 或通过文件名把某个 definition 标记为 built-in。

`electron-builder.yml` 中的 `resources/**`/`asarUnpack` 通用规则可以继续服务应用图标等仍在使用的非 workflow 资源，但实现不得为 workflow 模板保留单独的打包、解包、复制或启动注入步骤；删除资源后，构建验收必须确认最终包不含 `resources/workflows/built-in/**`。不对已有 global `data/workflows`/`userData/workflows` 文件做迁移或自动删除，它们只能保持 inert，不能出现在 v2 list、trigger 或 Run reconcile 中。

因此，v2 definition list 不返回 `source: "built-in"`，编辑器不再拆分 built-in/custom 两组，不再显示“复制并保存”、内置只读或禁止删除分支。按 workflowId 返回的 Workspace definition 都遵循同一套保存和删除权限；删除 `BUILT_IN_WORKFLOW` 以及仅服务旧 name-to-file 写入的 `INVALID_WORKFLOW_NAME`，v2 YAML 的 name/field 错误统一由 definition validation contract 表达。

### 2. Definition 保存与 Phase 1 能力预检分离

保存时执行 YAML 语法和 definition-schema 的定义态校验。定义态合法但超出 Phase 1 execution profile 的 workflow 可以保存，供用户继续编辑；只有 `trigger_workflow` 在创建 Run 前执行 capability preflight，并在失败时返回结构化 reason、stageId/feature 定位信息且不创建 Run。

Phase 1 的可执行 profile 固定为：

- `requires` 为空；模板只允许 `run.*` 引用。
- `AgentStage` 只接受 `context: fresh`、`produces: freeform`，并只与 `gate.type: human` 组合执行。
- `ActionStage` 只接受 `op.type: exec` 的 `command` 和可选 `cwd`。
- `Transition`、`next.pass`/`next.fail`/`next.signal` 和 `maxLoops` 按 definition schema 执行。

`context: inherit`、Wait、expr/verdict、结构化产物/op、retry 和 idempotencyKey 必须在 preflight 拒绝，分别使用设计中已确定的 `WORKFLOW_CONTEXT_UNSUPPORTED` 或 `WORKFLOW_FEATURE_NOT_IMPLEMENTED` 分类。不能静默删掉字段、替换成空值或先执行部分 stage 后才发现不支持。

### 3. Workspace identity、Run 快照与原子性

新 definition 的目录为：

```text
appData/workspaces/<workspace-id>/workflows/
└── <workflow-id>/
    ├── definition.yaml
    └── runs/<run-id>/
        ├── <run-id>.json
        ├── sessions/<fresh-session-id>.jsonl
        └── action-outputs/<stage-id>.log
```

`workflowId` 创建时随机生成，与 YAML 的 `name` 解耦。更新通过 workflowId 定位；重命名只改 `definition.yaml` 内容，不移动目录，也不影响既有 runs。所有路径参数经过 storage identity 校验。

Run JSON 至少包含：

```ts
interface WorkflowRunSnapshot {
  snapshotSchemaVersion: 1;
  runId: string;
  workflowId: string;
  parentSessionId: string;
  frozenDefinition: WorkflowDefinition;
  status:
    | "awaiting_start_confirmation"
    | "running"
    | "awaiting_gate_decision"
    | "awaiting_action_confirmation"
    | "succeeded"
    | "failed"
    | "cancelled"
    | "interrupted";
  currentStageId: string;
  visitCounts: Record<string, number>;
  artifacts: Record<string, unknown>;
  pendingDecision?: { kind: "start" | "gate" | "action"; prompt: string; stageId?: string };
  agentSessionState?: { sessionId: string; acpSessionId?: string };
  actionState?: { stageId: string; logPath: string; exitCode?: number; signal?: string };
  error?: { code: string; message: string; stageId?: string };
  createdAt: string;
  updatedAt: string;
}
```

这里的 `frozenDefinition` 是完整 inline 副本；不使用 `workflowVersion`，也不使用仅 hash 或外部 definition 引用。创建 Run 时先完成读取、解析、preflight，组装完整 snapshot，再用 `writeFileAtomic` 写成功后才返回 runId。后续推进、人工决策和恢复只读取 snapshot 内的 definition，不重新读取 live `definition.yaml`。

每个 Run 维护串行事件队列/互斥区。有效状态变化通过 `advance(snapshot, event): snapshot` 纯函数计算，再一次性原子写回完整快照；ACP/Action 完成回调、IPC decision、parent deletion 和 shutdown 不得交错覆盖彼此的更新。

### 4. Execution runner 与资源边界

`AgentStage(context: fresh)` 在 stage 启动前生成并持久化 workflow 逻辑 session ID，然后通过 session domain `_public` 的 ACP/turn 能力创建 fresh `AcpSession`。该 session 使用 workflow owner、专用 session store 和 Run 下的 transcript，不写入 spawned session store、notification outbox 或 spawned list。ACP session resolve 后再把 `acpSessionId` patch 到 snapshot；重启不恢复活动中的 ACP turn。

fresh session 的 Workspace descriptor 和 filesystem 范围从 parent session 的冻结 Workspace snapshot 派生；不能以当前 primary 或 renderer 重新选择。最终 turn 文本写入 workflow transcript，并作为 `freeform` artifact 供 human gate 查看。Workflow runner 不调用 `SpawnedSessionManager.promptToAgent`。

`ActionStage(op.type: exec)` 复用现有 cross-spawn/辅助进程基础设施。`cwd` 缺省使用 parent session Workspace snapshot 的 primary Folder；显式 cwd 必须在同一冻结 snapshot 范围内解析和校验。命令 stdout/stderr 写入 `action-outputs/<stage-id>.log`，snapshot 记录相对日志路径、exitCode/signal、开始和结束时间。Phase 1 不添加 workflow 隐含 timeout；进程纳入 WorkflowEngine lifecycle，能在 parent 删除和 shutdown 时被取消。

Action 完成后根据 exitCode/signal 区分三种结果：

- **pass**：`exitCode === 0 && signal === null`。按 `next.pass` transition 推进。
- **fail**：`exitCode in [1..126]`。业务验证失败，按 `next.fail` transition 推进（可能回边到上游 stage 重试）。
- **error**：`exitCode === 127`（命令不存在）或 `signal !== null`（进程被信号终止）。执行环境错误，直接终止 workflow，status 进入 `failed`，并记录 `ACTION_EXECUTION_ERROR`。

这一区分确保环境问题（如命令拼写错误、权限问题）不会被误判为业务失败而触发无意义的回边循环，让用户能快速识别配置错误。

`confirm` 默认按 `true` 处理；需要确认时先落盘 `awaiting_action_confirmation`，批准后才创建子进程。start/action reject 直接进入 `cancelled`，human gate reject 按 `next.fail` 推进。成功/失败、循环超限和外部异常均写入结构化错误上下文并通知 Renderer。

### 5. 归属、并发与 trusted caller

Run 的身份是 `{ workspaceId, parentSessionId, runId }`；同一个 `{workspaceId, parentSessionId}` 最多允许一个 active Run。并发判断只在 Main 的 WorkflowEngine 内完成，MCP 和 Renderer 都不能各自做“先检查再创建”的竞态实现。

`trigger_workflow` 的输入只有 `workflowId`。`parentSessionId` 不信任 agent 自报值，由 bundled MCP 的 trusted Workspace/caller context 解析并传给 engine；Renderer 的 list/detail/decide 则必须验证 Workspace、parent session 和 Run owner。所有 Proposal target 仍以 `ProposalRef`/resolver 为准，workflow 不得借当前 primary 猜 owner。

### 6. Run IPC、wake + pull 与 renderer 结构

新建 `src/shared/ipc/automation/workflow-run.channels.ts`：

```ts
export const WorkflowRunChannels = {
  list: "automation:workflow-run:list",
  getDetail: "automation:workflow-run:getDetail",
  decide: "automation:workflow-run:decide",
  wake: "automation:workflow-run:wake",
} as const;
```

`list` 输入 `{workspaceId,parentSessionId}`；`getDetail` 输入 `{workspaceId,parentSessionId,runId}`；`decide` 输入同样的 owner 字段和 `decision: "approve" | "reject"`。Main 只返回经过 owner/status 校验的投影，Renderer 不能直接改 snapshot。`wake` payload 只有 `{workspaceId,runId}`。

每次有效推进、进入 awaiting 状态或进入终态，都由 Main debounce 后调用 `WorkspaceWindowManager.sendToWorkspace`。Renderer 仅在 workflow-run store 对该 run 有 active interest 时 pull `getDetail`；没有观察者时不做无用查询。所有 start/gate/action 确认共用 `decide`，不新增彼此独立的确认通道。

`ChatBackgroundActivityBar` 增加与 `SpawnedSessionActivityEntry` 平级的 `WorkflowRunActivityEntry`。它使用自己的 Pinia store、wake listener、interest ref-count 和 detail pull，不从 `useSpawnedSessionStore` 派生数据。条目显示运行中/等待用户处理/终态；点击 Agent fresh stage 的入口时打开 workflow transcript 对应的 fresh session 对话，但不增加 spawned-agent 计数。

### 7. Bundled MCP transport 与权限

`fyllo-workflow` 注册为显式的 HTTP-only bundled MCP server，提供：

- `list_workflows({})`：从当前 Workspace 的正式 workflow 目录实时读取 `workflowId/name/description`，不使用启动时静态缓存。
- `trigger_workflow({workflowId})`：返回 `{status:"accepted",runId,runStatus}`，或返回包含 code/message/stageId/feature/refs 的 rejected reason。

MCP server 子进程、bundled host 和 Main handler 之间使用 server-neutral envelope；每个 server 注册自己的 codec、schema 和 handler。`fyllo-spawn` 保持现有 request/response/version/error codec，不通过 `FylloSpawnRpcRequest` 的别名冒充 workflow 协议。Workflow handler 只允许可信 `chat` caller；workflow/spawned/unknown caller 返回 `status: "rejected"`、`reason.code: "WORKFLOW_INVALID_CALLER"`、包含 caller 定位信息的 message，不创建 Run并记录 warn。

Workflow fresh ACP activation 的 server allowlist 和 access grant allowlist 都必须显式等于 `["fyllo-specs", "fyllo-cortex"]`。正常 Chat session 仍可获得 `fyllo-workflow` 以触发 Run；fresh workflow session 看不到 `fyllo-workflow` 和 `fyllo-spawn`，形成 activation + handler 两层防护。

### 8. Proposal Apply/Archive 清理边界

依据当前 renderer 证据，`ChatProposalPanel.vue` 的真实 Apply/Archive 按钮已经只调用 `chatStore.sendMessage`，旧 workflow dropdown、`startRun`、`startArchive` 直接调用均被注释；`ProposalDetailSlideover.vue` 的旧运行入口也被注释。故删除：

- `proposal:apply:*` / `proposal:archive:*` 的 Main handlers、schemas、preload/API wrappers、stage stream 和 cancel 链路。
- `ApplyRunMeta` 中的 `workflowId/stages` 及旧 apply/archive run store、stage prompt、stage ACP session store、`apply-runs` storage helpers。
- renderer 对 `useProposalRunStore`、`ProposalApplySidePanel`、旧 runMeta/isArchiving props 的依赖和相关历史测试。

不删除：

- `src/mcp-servers/fyllo-specs/src/tools/apply-change.ts` 与 `archive-change.ts` 及其 OpenSpec/Workspace target 解析。
- Event Rail 的文字按钮与 `chatStore.sendMessage` 消息格式。
- Proposal watcher、status push、任务完成度派生的 `archiveReady` 状态和 owner-qualified `ProposalRef`。

这样 Apply/Archive 的有效入口不再有 `WorkflowStage` 或旧 engine 参与；新的通用 workflow engine 也不把 Proposal Apply/Archive 偷换成一个未在 Phase 1 定义的结构化 op。

### 9. Lifecycle wiring

删除 `initBuiltInWorkflows` 及其 abort promise；在 `src/main/bootstrap/runtime.ts` 的集中 wiring 中显式启动 WorkflowEngine，并在 host、session public capability 和 IPC 注册完成后开始 reconcile。

在 `SHUTDOWN_PHASES` 中增加 WorkflowEngine 的 named task：

- `quiesce`：设置 engine shutdown fence，拒绝新的 trigger 和新的 stage。
- `settle`：取消 timer、ACP turn、Action process，写入并保留终态；可恢复的 awaiting run 不再接受新操作。
- `terminate/force` 前：确保 WorkflowEngine 已完成尽力落盘；其底层 ACP/Action handle 不得晚于 process pool/auxiliary process disposal。

emergency shutdown 同样调用 begin/force dispose。`removeSession` 先调用 `cancelRunsByParentSession(workspaceId,parentSessionId)`，再删除 parent session store；非终态 Run 标记 `cancelled` 并保留 transcript/output。应用退出标记为 `interrupted`，不自动清理 Run 目录。

现有 `application-lifecycle-orchestration` 已经要求新长生命周期资源在 bootstrap 中集中声明并提供 quiesce/dispose/force，因此本变更通过实现该既有要求完成 lifecycle 接入，不重复创建另一个生命周期规范。

## Risks and Trade-offs

- **[Risk]** 旧 workflow 文件和旧 apply-runs 留在用户 appData 后可能被误认为仍可执行。  
  **→ Mitigation：** 新 service 只扫描 `<workflow-id>/definition.yaml`，旧 name-based 路径没有 fallback；测试明确验证旧路径不会出现在 list/trigger 结果中，并在文档中说明这是一次性 cutover。

- **[Risk]** 通用 `resources/**` 打包规则或旧全局目录可能让 built-in template 以隐蔽路径继续进入安装包或运行时列表。  
  **→ Mitigation：** 删除唯一的 workflow resource，移除 loader/runtime copy/shutdown resource，保留通用资源规则仅用于非 workflow 资源，并在打包清单、启动和 list 测试中断言没有 `resources/workflows/built-in/**`、global staging 或 built-in source。

- **[Risk]** 删除旧 Proposal run side panel 可能让历史 apply-runs 失去 UI。  
  **→ Mitigation：** 该路径当前没有真实启动者，且 Proposal status 已由 watcher/任务完成度驱动；保留 Chat/tool result 作为 Apply/Archive 反馈来源，并保留 Proposal detail 的只读文件和状态展示。旧运行文件不被重新执行。

- **[Risk]** Workflow fresh session 误拿到 `fyllo-workflow` 或 `fyllo-spawn` 会造成递归 Run/嵌套 session。  
  **→ Mitigation：** activation server allowlist 与 grant allowlist 双重过滤，handler 再校验 trusted caller owner；增加 allowlist、不可见工具和非法 caller 不创建 Run 的测试。

- **[Risk]** ACP/Action 完成回调与人工决策并发写快照会丢状态。  
  **→ Mitigation：** 每 Run 串行事件队列、纯 `advance`、完整 snapshot atomic write；测试交错事件和重复 decision。

- **[Risk]** 单文件 inline `frozenDefinition` 增大 Run JSON。  
  **→ Mitigation：** Phase 1 选择单文件原子一致性优先；无需跨文件 definition 副本和引用窗口，未来若 definition 过大另立 Proposal，不在本次引入 hash-only 方案。

- **[Risk]** bundled MCP host 抽象影响既有 fyllo-spawn RPC。  
  **→ Mitigation：** 保留 fyllo-spawn codec/fixture 作为回归基线，新协议只通过 per-server codec 注册加入；不修改 fyllo-spawn 的工具级语义。

- **[Risk]** workflow action 的 cwd 或文件范围越过 parent Workspace 授权边界。  
  **→ Mitigation：** 只从冻结 Workspace snapshot 派生 descriptor/cwd，跨 session 访问走 session `_public`，在 Main 做路径归一化和 membership/owner 校验。

## Migration Plan

本次是无真实用户旧 engine 的一次性替换，不执行数据迁移，也不建立兼容读写。实现顺序为：

1. 先增加 v2 shared schema、definition storage path、atomic Run snapshot store 和状态机单元测试；同时更新 Proposal/Workspace/OpenSpec delta 对新边界的描述。
2. 实现 definition CRUD 和 `/workflow` v2 YAML 编辑，使合法定义可保存、改名不改 ID，旧 name-based 文件不被读取。
3. 实现 WorkflowEngine、fresh ACP runner、Action exec、MCP allowlist/caller guard 和 server-neutral host codec。
4. 接入 `automation:workflow-run:*` IPC、Preload、Renderer store、WorkflowRunActivityEntry 和决策 UI；验证 wake 只作失效通知。
5. 接入 bootstrap/shutdown/parent deletion，再删除旧 workflow parser/service/built-in resource/loader/global staging、Proposal stage-stream chain、旧 run storage 和 renderer dead code。
6. 更新测试、README/源码路径说明（若存在旧 workflow engine 描述）以及相关工程 guideline；运行项目规定的类型检查、lint、格式检查和测试门禁。

旧 `workflow-name.yaml`、旧 `apply-runs/**` 和无法解析的旧快照不迁移、不删除也不恢复执行；如果未来需要清理 appData，应另行提供明确的数据清理变更。

## Open Questions

本次 Phase 1 没有阻塞性未决问题。以下事项明确留给后续 Proposal，而不是在实现中偷偷扩展范围：

- Phase 2 是否允许 agent 生成并临时保存 workflow，以及用户确认后如何沉淀为 Workspace asset。
- `context: inherit` 如何与 Chat turn gate、reminder 注入、并发和重启恢复组合。
- `ActionOp` 是否抽象为 `write.field`/`write.relation`/`notify`，以及 Provider capabilities 如何声明。
- 是否需要旧 workflow/appData 的显式用户清理工具；本次不做自动清理。
