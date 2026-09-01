# Workflow Engine Phase 1 执行设计

## 修订记录

| 版本                    | 状态                   | 时间       | 说明                                                                                                                                                                                   |
| ----------------------- | ---------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| draft                   | 讨论结论，未评审       | 2026-08-25 | -                                                                                                                                                                                      |
| revision-2026-08-31     | 增加阻塞问题的解决方案 | 2026-08-31 | 见[phase1-blocker-decision-log.md](phase1-blocker-decision-log.md)，明确 Phase1 执行 profile、Run 状态与恢复策略、ACP runner 边界、Action exec 契约、workflow IPC/MCP 边界和验收标准。 |
| cross-review-2026-09-01 | 交叉评审结论           | 2026-09-01 | N1：Run IPC 归入 `automation:workflow-run:*`，沿用 automation domain 的共享、主进程、Preload 与 Renderer 分层                                                                          |

本文档记录 workflow engine Phase 1 的架构决策：手写 YAML、agent 触发、主进程调度、Fyllo Action 之外的独立展示信道。`Stage`/
`Gate`/`Transition` 等定义态语义以 [definition-schema.md](../definition-schema.md) 为准，本文档只覆盖运行态。

---

## 1. 产品定位与三阶段划分

FylloCode 面向企业推广的核心命题：Coding Agent 进入企业后，耗时大头不再是编码，而是操作项目管理平台、与人沟通。产品要消解两头摩擦：

- **进入摩擦**：任务只读集成（`/task` 页面接云效等平台工作项），让 agent 不离开 FylloCode 就能获得任务上下文。价值标准是"
  广不深"。
- **退出摩擦**：dynamic workflow engine，agent 干完后把动作写回企业系统。价值标准是"深不广"，必须先在少数高频动作上做扎实。

两条线共享同一个 Provider 抽象，是同一条价值链的入口与出口，不是互相独立验证的假设。

Workflow engine 按三阶段推进，每阶段单独验证、单独可上线：

- **Phase 1**（本文档）：`source: manual`，手写 YAML + agent 触发 + 主进程调度 + 独立展示信道。验证执行语义和运行时持久化模型是否站得住。经本轮讨论，执行能力有意收窄为
  `Agent(fresh, freeform)` + `Action(exec)` + `Gate(human)`，以先验证调度、展示和持久化骨架。
- **Phase 2**：`source: agent`，agent 在对话中动态生成 workflow，涉及 system-reminder 改写、reminder 动态注入，生成后引导用户确认是否沉淀复用。
- **Phase 3**：YAML 结构进一步抽象（op 形状收敛为 `write.field`/`write.relation`/`notify` 等，而非每个动作一个 op
  变体）、Provider 能力扩展（`ProviderCapabilities` 声明式模型）、YAML 图形化展示（复杂 workflow 靠人眼已经不好分析，需要节点/连线/环路的可视化）。

---

## 2. Phase 1 范围边界

**做什么**：

1. `/workflow` 页面提供 YAML 编辑器，新增/修改 workflow，保存为 workspace 资产。
2. Agent 通过 MCP server 查询可用 workflow、触发执行。
3. 主进程 workflow engine 负责调度，run 在主进程中运行，不受 Renderer 页面切换影响。
4. 需要用户参与的决策点（gate、confirm）通过独立信道推送状态、由用户在 UI 上处理。

**明确不做**：

- Agent 动态生成 workflow（Phase 2）。
- YAML 内容的安全防护（命令来源控制、危险命令拦截）——Phase 1 假设手写 YAML 内容可信，安全防护是未来扩展，不是主线。
- `AgentStage(context: inherit)`，需要 Chat turn 互斥、后台 turn 和 system-reminder 注入。
- `gate.type: expr` 与 `gate.type: verdict`，前者需要安全表达式求值器，后者需要结构化产物解析。
- 结构化产物解析（`diff`/`verdict`/`plan`/`test-report` schema 从 agent 自由文本产出中抽取）。
- `WaitStage`，需要外部信号来源和 signal 命令通道。
- 结构化 `ActionOp`（`git.*`/`scm.*`/`tracker.*`/`webhook`）、`retry` 和 `idempotencyKey`，需要 provider/幂等存储抽象。
- YAML 图形化展示（Phase 3）。

`definition-schema.md` 仍作为未来完整定义态 schema；Phase 1 不另造一套 YAML。保存时只做定义态合法性校验，`trigger_workflow`
在创建 Run 前做 Phase 1 能力预检；合法但未实现的能力以结构化错误拒绝，不创建 Run，避免已执行部分副作用后才发现能力缺失。

---

## 3. 为什么不引入第三方 workflow/状态机库

调研过 Temporal、Restate、XState、Windmill 等方案，结论是均不引入：

- **Temporal / Restate / Windmill**：核心价值是分布式、跨进程、多 worker 的可靠调度，代价是需要独立部署的 server
  或平台。FylloCode 是单机 Electron 应用，workflow 执行环境就是本机主进程，没有分布式需求，引入这类库等于为不存在的问题背运维负担。
- **XState**：纯内存状态机库，官方定位是"在事件循环里跑"，跨进程/跨重启持久化需要自己接。Phase 1 的状态机模型比 XState
  简单得多——没有并行状态、没有嵌套状态、没有 actor 模型，只是"当前 stage id + 每个 stage 访问次数 + transition 表"，引入
  XState 是为不需要的表达能力换来额外抽象层。

**结论**：自己写一个状态机执行器，核心是一个 `advance(snapshot, event): snapshot`
纯函数，直接照 [definition-schema.md](definition-schema.md) 的 Stage/Transition/Gate/maxLoops 语义实现。持久化模式借鉴
XState 的 snapshot 思路（`getPersistedSnapshot`/`createActor({snapshot})`：每次有效推进后整份快照原子写盘，重启时读盘恢复），但不依赖
XState 本身。

---

## 4. Agent 交互信道：MCP server，不是 fyllo-action

### 4.1 关键约束

ACP 协议下，FylloCode 不能稳定观察到 agent 调用了哪个 MCP tool。这意味着：

- 任何需要"agent 调用某个东西后，紧接着做点什么被用户看到"的设计，如果依赖 agent 主动配合输出特定格式（例如要求 agent 在调用
  MCP tool 后自己再输出一个 `<fyllo-action>` 标签），可靠性完全押注在提示词能不能让模型每次都照做，没有程序化的强制手段。
- `fyllo-action` 机制本身（`task.create`/`plan.create` 等）依赖的正是"agent 在回复文本里输出合法标签，Renderer 解析后展示"
  这条路径——这是在"FylloCode 无法扩展 Agent 原生工具 + 需要定制 UI"这个约束下的折中方案，不是没有代价的通用模式。

### 4.2 结论：触发用 MCP tool，展示不经过 fyllo-action

Workflow run 是**主进程自己管理的状态机**，类比 `fyllo-spawn` 管理的子 agent session——它的状态变化（推进到某个
stage、卡在需要人工确认的 gate）完全发生在主进程内部，不需要 agent 在对话里说任何话来"通知"这件事发生。

- **Agent 查询/触发**：新增 `fyllo-workflow` MCP server，仿照 `fyllo-spawn` 的耦合模式——`transportPolicy: "http-only"`
  （强依赖主进程运行时状态，无 stdio fallback），通过 Node `child_process` IPC 双向 RPC 桥接到主进程（参考
  `fyllo-spawn/src/rpc-client.ts` 的 `SpawnRpcClient` 模式：`requestId` 关联请求/响应，`process.send`/
  `process.on("message")`）。工具集：
  - `list_workflows`：列出当前 workspace 可用 workflow（不需要 system-reminder 静态注入 index，agent 随时查询更准确）。
  - `trigger_workflow`：触发执行，返回 `{runId, status}`。
- **Run 状态展示、人工决策点**：完全不经过 `fyllo-action`。走 `spawned-session` 的"wake 信号 + Renderer 拉取详情"模式（详见第
  6 节），因为这条链路的可靠性锚定在主进程自身状态机，不依赖模型输出格式。

`fyllo-spawn` 的 MCP tool 是"把主进程能力包一层 MCP 协议暴露给 agent 用"，workflow engine 内部创建 fresh 子 session 时*
_不通过 MCP_*，而是调用从 ACP session/turn 公共能力中提取出的 workflow runner——因为 workflow engine 是主进程内部调度代码，不是
agent，不存在"发起 ACP tool call"这个概念，经过 MCP 协议是把两个不同层次的东西混在一起。Workflow runner 不调用
`SpawnedSessionManager.promptToAgent`，也不写入 spawned-session store 或 notification outbox。

---

## 5. 执行模型：混合执行体

Run 状态机不是纯同步的 `advance` 循环，`AgentStage` 的推进跨越了一整轮 agent 交互，引擎在此期间处于挂起态：

| Stage kind                      | 执行体                                                                                      | 完成判定                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `ActionStage`                   | 引擎直接调用 `op.type: exec`                                                                | 引擎拿到进程退出结果，直接判定 pass/fail                                     |
| `AgentStage` (`context: fresh`) | Workflow 独立 runner 调用提取后的 ACP session/turn 公共能力，创建**用户可见**的 ACP session | 等待这一轮 turn 结束，读取 workflow 自己的 transcript 得到 freeform artifact |
| 其他 Stage/Gate 组合            | Phase 1 不执行；`trigger_workflow` 能力预检拒绝                                             | 不创建 Run，返回 `WORKFLOW_FEATURE_NOT_IMPLEMENTED`                          |

### 5.1 `context: fresh`

对用户**可见**——不做成黑盒。但不混入 `ChatBackgroundActivityBar` 现有的"子 Agent N 个正在运行"入口（
`SpawnedSessionActivityEntry`
，见 [SpawnedSessionActivityEntry.vue](../../../src/renderer/src/features/spawned-session-inspector/ui/SpawnedSessionActivityEntry.vue)
）——那个入口的列表数据来自 `useSpawnedSessionStore`，语义是"用户/agent 手动 spawn 的子 agent"，workflow 内部触发的 fresh
session 混进去会让用户分不清"这是我自己开的子 agent"还是"这是 workflow 内部的一步"，两者生命周期和归属也不同（前者独立，后者受
run 状态机管辖，run 终止/失败时应能一并处理）。

可见性通过第 6 节的 `WorkflowRunActivityEntry` 提供：该 run 处于 `AgentStage(fresh)` 期间时，其条目应能展示"当前在跑一个子
session"并可点击跳转查看该子 session 的对话内容。Workflow runner 复用 ACP session、turn driver 和 `MessageAssembler`
等公共能力，但使用 workflow 自己的 session store 和 transcript 路径；入口挂在 `WorkflowRunActivityEntry` 下，不挂在
`SpawnedSessionActivityEntry` 下。理由：隐藏会让用户对"这个 stage 在做什么"产生疑惑，透明度优先；但透明度的实现方式是"从
workflow 入口能看到里面的 session"，不是"把两种不同性质的东西塞进同一个列表"。

Workflow runner 需要增加独立的 `workflow` session owner 和 workflow 专用 `AcpSessionStore`，以便复用 ACP 生命周期而不复用
spawned-session 的存储、列表和通知语义。Workflow session 的逻辑 `sessionId` 在 Run 快照中记录，ACP `acpSessionId`
在解析后补写；应用重启不尝试恢复活跃 ACP turn。

### 5.2 `context: inherit` 延后

Phase 1 不执行 `context: inherit`。该能力需要通用 Chat turn gate/queue、用户 turn 与 workflow turn 的互斥、隐藏 reminder
注入以及重启后的 Chat turn 语义；定义态 parser 可以接受它，但 trigger 能力预检必须拒绝并返回
`WORKFLOW_FEATURE_NOT_IMPLEMENTED`。

### 5.3 产出 → Gate 判定

`AgentStage` 产出的是这一轮 turn 的最终响应文本，写入 workflow Run 的 transcript 并作为 freeform artifact。Phase 1 只保证：

- `produces.schema: freeform` + `gate.type: human`：文本原样作为 artifact，人工阅读后决策。**Phase 1 唯一支持的 Agent/Gate
  组合。**
- `expr`、`verdict`、结构化 artifact 和 `WaitStage` 均不在 Phase 1 执行 profile 内。

### 5.4 `ActionStage(op.type: exec)`

Phase 1 的 Action 只支持定义态已有的 `command` 和可选 `cwd` 字段：

- `cwd` 缺省时使用 Run 所属 parent session 的 workspace primary folder；显式 `cwd` 按该 session 的 workspace snapshot
  解析和校验。
- 通过现有 cross-spawn/子进程基础设施执行命令，退出码为 `0` 判定 pass，非 `0`、启动失败或被信号终止判定 fail，并按
  `Transition` 推进。
- `exec` 没有 workflow 定义的 timeout 字段，Phase 1 不引入固定的隐含超时；进程必须纳入 workflow lifecycle，能够在 parent
  session 删除或应用 shutdown 时被取消并清理。
- stdout 与 stderr 写入 Run 的 `action-outputs/<stage-id>.log`，快照记录退出码、信号、日志相对路径和起止时间，供 Run detail
  展示。
- `confirm` 默认按 `true` 处理。确认前不创建子进程；批准后执行。拒绝 Action confirmation 时 Run 进入 `cancelled`，不执行
  `fail` 分支。
- `retry` 与 `idempotencyKey` 属于未来能力。定义态可以解析，但 Phase 1 trigger 预检发现它们时返回
  `WORKFLOW_FEATURE_NOT_IMPLEMENTED`，不创建 Run。

---

## 6. 展示信道：复用 spawned-session 的 wake + pull 模式

### 6.1 与 fyllo-action 的本质区别

|          | spawned-session 模式（workflow run 采用）                       | fyllo-action                                                            |
| -------- | --------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 触发源   | 主进程状态机自身事件，与 agent 输出文本无关                     | Renderer 解析 agent 输出文本中的标签后主动发起                          |
| 通信方向 | Main → Renderer 主动推（`webContents.send` + `ipcRenderer.on`） | Renderer → Main 请求，Main 应答（`invoke`/`handle`），Main 永不主动发送 |
| Payload  | 只推"失效信号"，真实数据靠 Renderer 再 `invoke` 拉取            | 请求/响应直接携带完整状态                                               |
| 可靠性   | 不依赖 agent 输出格式是否规范、是否被截断                       | 依赖 agent 严格输出合法闭合标签，格式错误则状态永远不会被创建           |

### 6.2 落地设计

新开一组 channel（不复用 `session:spawned-session:*`，因为标识符 shape 不同），复用 `WorkspaceWindowManager.sendToWorkspace`
这个通用推送出口：

```ts
// src/shared/ipc/automation/workflow-run.channels.ts（提议路径）
export const WorkflowRunChannels = {
  list: "automation:workflow-run:list", // invoke
  getDetail: "automation:workflow-run:getDetail", // invoke
  decide: "automation:workflow-run:decide", // invoke
  wake: "automation:workflow-run:wake", // Main -> Renderer push
} as const;
```

Run IPC 属于固定六域中的 `automation` domain，`workflow-run` 是独立 area。共享 channel 常量与 schema 放在 `src/shared/ipc/automation/workflow-run.*`，主进程 handler 放在 `src/main/ipc/automation/workflow-run.ts` 并由 automation registry 注册，Preload 暴露为 `window.api.automation.workflowRun`，Renderer 通过 `src/renderer/src/api/automation/workflow-run.ts` 调用；不得新增顶层 `workflow` domain。

三个 invoke channel 的输入分别为：`list({workspaceId, parentSessionId})`、
`getDetail({workspaceId, parentSessionId, runId})`、
`decide({workspaceId, parentSessionId, runId, decision: "approve" | "reject"})`。Main 必须校验 workspace、parent
session、Run 归属和当前状态；Renderer 不能直接修改快照。`wake` 是 Main → Renderer 的失效通知，payload 只含
`{workspaceId, runId}`。

流程：run 状态机任意有效推进（stage 切换、进入人工等待、进入终态等）→ debounce 后
`sendToWorkspace(workspaceId, wake, {workspaceId, runId})` → Renderer 收到 wake，若当前有组件对该 run 声明了 interest，才发起
`getDetail` 拉取最新快照 → Pinia store 更新 → UI 重渲染。

**需要用户确认的场景统一走这条链路**，不单独设计其他机制：

- `confirmStart: true` 的 workflow：`trigger_workflow` 到达后，若需确认，run 直接以 `awaiting_start_confirmation`
  状态创建并落盘，wake 通知，工具调用立刻返回 `{runId, status: "awaiting_start_confirmation"}`，不需要 agent 等待或二次确认。
- `gate.type: human`：stage 完成后引擎将 run 置为 `awaiting_gate_decision`，wake+pull，用户在 UI 决策后通过 IPC 请求驱动
  run 继续。
- `ActionStage` 的 `confirm: true`：run 置为 `awaiting_action_confirmation`，同样走 wake+pull；批准后才创建子进程。
- `start` 或 `action` 决策被拒绝时，run 进入 `cancelled`；human gate 决策为 reject 时按 `fail` 转移。
- 异常终止路径（`maxLoops` 超限、进程失败、ACP turn 失败）统一进入终态并 wake 通知；`WaitStage` 不属于 Phase 1。

UI 挂载点：`ChatBackgroundActivityBar`
（当前仅是布局容器，见 [ChatBackgroundActivityBar.vue](../../../src/renderer/src/components/chat/ChatBackgroundActivityBar.vue)
）新增 `WorkflowRunActivityEntry`，作为与 `SpawnedSessionActivityEntry`（子 Agent
入口）完全独立的兄弟组件平级放置——不是同一个入口下的分支或子状态，是两个各自持有数据源（各自的 Pinia store、各自的 wake/pull
订阅）、各自控制自身 `v-if` 可见性的组件，仅在布局上相邻。`WorkflowRunActivityEntry` 展示"workflow 正在执行 / 等待你处理"
；5.1 节提到的 `AgentStage(fresh)` 子 session 可见性由这个组件内部提供入口（点击 run 条目能看到并跳转到对应的 fresh
session 对话），不通过 `SpawnedSessionActivityEntry` 展示。

---

## 7. 并发与归属

- **Run 归属**：一个 workflow run 归属于发起它的 chat session（`workspaceId` + `parentSessionId`），类比 spawned-session
  的绑定模式。
- **并发限制**：一个 `{workspaceId, parentSessionId}` 最多关联一个 active 状态的 workflow run。存在 active run 时，
  `trigger_workflow` 直接拒绝启动第二个；并发校验只放在主进程 workflow engine，由 MCP 和 Renderer 共同调用，避免入口之间出现竞态。
- **推进串行化**：每个 Run 维护自己的事件队列/互斥区；状态机事件、人工决策、ACP/Action 完成回调都必须串行进入
  `advance(snapshot, event)`，成功推进后再原子写入快照。

---

## 8. 存储结构

```
appData/workspaces/<workspace-id>/workflows/
└── <workflow-id>/
    ├── definition.yaml                   # workflow YAML 原文件
    └── runs/
        └── <run-id>/
            ├── <run-id>.json              # 执行快照（run 状态机）
            ├── sessions/
            │   └── <fresh-session-id>.jsonl  # fresh AgentStage 产生的子 session 对话记录
            └── action-outputs/
                └── <stage-id>.log        # exec 的 stdout/stderr 记录
```

**`<workflow-id>` 的生成方式**：创建 workflow 时随机分配（如 nanoid），与 `name` 完全解耦——用户在 `/workflow` 页面重命名一份
workflow 只改 YAML 内的 `name` 字段，不影响 `workflow-id`、不需要重命名目录。理由：`workflow-id` 是这份 workflow
在存储路径与后续引用中的唯一标识，`name` 是随时可能被用户调整的展示名，如果两者绑定（例如从 `name` 做
slug），每次改名都要考虑"目录要不要跟着改、改了会不会影响已经持有旧路径的 run"这类连带问题；解耦后重命名是纯粹的内容编辑，不牵扯路径迁移。

**Phase 2 预留**：agent 生成的 workflow 先落在 session 临时存储
`appData/workspaces/<workspace-id>/sessions/<session-id>/workflows/<workflow-id>.yaml`，用户同意持久化后再 copy
到上述正式目录。Phase 1 不实现，但目录设计已兼容。

### 8.1 Run 快照结构（提议）

```ts
interface WorkflowRunSnapshot {
  runId: string;
  workflowId: string;
  workflowVersion: 2;
  parentSessionId: string;
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
  visitCounts: Record<string, number>; // maxLoops 校验
  artifacts: Record<string, unknown>; // freeform stage 产出及可观察运行结果
  pendingDecision?: {
    kind: "start" | "gate" | "action";
    prompt: string;
    stageId?: string;
  };
  agentSessionState?: {
    sessionId: string;
    acpSessionId?: string;
    status: "starting" | "running" | "completed" | "interrupted";
  };
  actionState?: {
    status: "pending" | "running" | "completed" | "failed" | "cancelled";
    exitCode?: number;
    signal?: string;
    outputLogPath?: string;
    startedAt?: string;
    completedAt?: string;
  };
  error?: {
    code: string;
    message: string;
    stageId?: string;
    feature?: string;
  };
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  cancelledAt?: string;
  interruptedAt?: string;
}
```

每次有效推进后整份快照原子写盘（使用 `writeFileAtomicSync` 原语）。终态 Run 的快照和关联 transcript/output 在 Phase 1
不自动清理；这只是当前保留策略，不是永久保留承诺。重启时，人工等待状态可以原样恢复并重新进入 active index；正在执行的
ACP/Action stage 没有可恢复的 live handle 时，保留已有 `visitCounts`/`artifacts` 并将 Run 置为 `interrupted`，不尝试恢复或重放副作用。

---

## 9. `fyllo-workflow` MCP server：Phase 1 工具集

Phase 1 新增的 `fyllo-workflow` MCP server，`transportPolicy: "http-only"`（第 4.2 节），提供两个工具，均通过 Node
`child_process` IPC 桥接到主进程，不做本地计算。

### 9.1 `list_workflows`

无副作用的查询工具，列出当前 workspace 已保存的 workflow。

```ts
list_workflows(input
:
{
}
):
{
  workflows: Array<{
    workflowId: string;
    name: string;
    description?: string;
  }>;
}
```

- 只列出 workspace 正式目录（第 8 节 `appData/workspaces/<workspace-id>/workflows/<workflow-id>/definition.yaml`）下已保存的
  workflow，每次调用实时读取磁盘当前状态，不做启动时的静态快照缓存（第 11 节验收标准第 3 条）。
- `name`/`description` 取自 workflow YAML 顶层字段（definition-schema 第 2 节），供 agent 判断是否有可复用的既有 workflow。

### 9.2 `trigger_workflow`

触发一次 workflow 执行。

```ts
trigger_workflow(input
:
{
  workflowId: string;
}
):
{
  status: "accepted";
  runId: string;
  runStatus: "running" | "awaiting_start_confirmation";
}
|
{
  status: "rejected";
  reason: {
    code:
      |
    "WORKFLOW_NOT_FOUND"
    | "WORKFLOW_RUN_CONFLICT"
    | "WORKFLOW_CONTEXT_UNSUPPORTED"
    | "WORKFLOW_FEATURE_NOT_IMPLEMENTED";
    message: string;
    stageId ? : string;
    feature ? : string;
    refs ? : string[];
  }
  ;
}
```

- `trigger_workflow` 首先读取并解析目标 workflow，然后执行 Phase 1 能力预检：`requires` 必须为空，只允许 `run.*` 模板引用，只允许
  `Agent(fresh, freeform)`、`Action(exec)`、`Gate(human)`；不满足时返回结构化 `reason`，不创建 Run。
- 若目标 workflow 所在 `{workspaceId, parentSessionId}` 已存在 active 状态的 run（第 7 节并发限制），直接返回
  `status: "rejected"`，错误码为 `WORKFLOW_RUN_CONFLICT`，并说明已有 workflow 在运行。
- 若目标 workflow `confirmStart: true`（definition-schema 第 2.2 节），run 以 `awaiting_start_confirmation` 状态创建并落盘、触发
  wake（第 6 节），工具调用立即返回，不阻塞等待用户确认。
- 若 `confirmStart: false`，run 直接进入 `running` 并开始推进第一个 stage，工具调用返回时不代表 stage 已执行完，只代表 run
  已成功创建并开始推进。
- `trigger_workflow` 不接受 workflow YAML 内容本身，只接受 `workflowId`——Phase 1 里 workflow 只能来自用户在 `/workflow`
  页面手写保存的 workspace 资产（第 2 节范围边界），agent 不生成 YAML 内容。

### 9.3 workflow engine 内部创建 fresh 子 session 不经过 MCP

第 4.2 节已定：workflow engine 创建 `AgentStage(context: fresh)` 的子 session 时，调用提取出的 ACP session/turn 公共能力，不经过
`fyllo-workflow` 这层 MCP 协议——因为这是主进程内部调度代码之间的调用，不是"agent 发起一次 tool call"，不属于本节工具集范围。

---

## 10. 生命周期与 MCP/IPC 边界

### 10.1 Workflow engine 生命周期

`WorkflowEngine` 是主进程中唯一负责 Run 状态和推进的服务，至少提供以下生命周期入口：

- `start()`：在主进程 runtime wiring 完成后启动，扫描 workspace 下的 workflow Run 快照并执行 reconcile。
- `cancelRunsByParentSession(workspaceId, parentSessionId)`：由 parent session 删除流程调用，取消当前 ACP/Action，清理该
  Run 的 timer，将非终态 Run 标记为 `cancelled` 并保留记录。
- `beginShutdown()`：停止接受新的 trigger，并阻止新的 stage 启动。
- `dispose()`：取消 active ACP/Action、清理 timer、将因应用关闭而中断的 Run 标记为 `interrupted`，并在 ACP process pool
  终止前完成尽力落盘。

启动 reconcile 遵循以下规则：处于 `awaiting_start_confirmation`、`awaiting_gate_decision` 或
`awaiting_action_confirmation` 的 Run 没有进行中的外部执行，可恢复原状态并重新加入 `activeRuns`；处于 `running` 且没有
live ACP/Action handle 的 Run 标记为 `interrupted`，不自动重放 stage。`visitCounts`、已有 artifacts 和错误上下文不得被清除。

在主进程 shutdown phases 中，`beginShutdown`/`dispose` 必须位于 ACP process pool 和 auxiliary process terminate
之前；workflow engine 的 timer、子进程和 ACP session 不得成为未登记的后台资源。

### 10.2 `fyllo-workflow` RPC

`fyllo-workflow` 是独立的 HTTP-only bundled MCP server，只负责把 `list_workflows` 和 `trigger_workflow` 通过 Node IPC RPC
暴露给 agent。调用方向固定为：

```text
fyllo-workflow MCP 子进程
        -> bundled MCP Host 的 server-neutral RPC envelope
        -> fyllo-workflow codec/handler
        -> WorkflowEngine
        -> ACP/Action 公共执行能力
```

Workflow engine 内部创建 fresh session 不经过 MCP，也不调用 `SpawnedSessionManager.promptToAgent`。Renderer 的 Run
查询和人工决策走独立的 `automation:workflow-run:*` IPC，不经过 MCP 子进程。

现有 `bundled-mcp-host.ts` 的 IPC request/response/protocol 类型目前绑定 `fyllo-spawn`，因此 Phase 1 实施时必须将 Host
的线协议处理抽象为 server-neutral envelope，并让每个 server 注册自己的 runtime codec/handler。`fyllo-spawn` 保留现有
codec，`fyllo-workflow` 使用独立 protocol/version/schema；不能只增加 TypeScript 泛型，也不能复制一套 proxy/token/backend
lifecycle。

新增 server 仍由现有显式 registry 和 `scripts/build-mcp-servers.mjs` 构建列表控制；registry 只增加 server name 与
`http-only` policy，bundle 路径继续由 `resolveBundlePath` 统一解析。RPC handler 注册、MCP server 子进程和 host 的统一停止流程都必须纳入
runtime/shutdown wiring。

实施边界至少包括：`bundled-mcp-host.ts` 的运行时中立分发与 per-server codec 注册、现有 `fyllo-spawn` codec 的保持、新增
`fyllo-workflow` RPC 类型/schema/client/handler、`bundled-mcp-registry.ts` 与 `scripts/build-mcp-servers.mjs` 的显式注册，以及
`src/main/bootstrap/runtime.ts` 和 `shutdown.ts` 的启动/停止接入。不能通过增加一个复用 `FylloSpawnRpcRequest`
类型的别名来规避协议隔离。

---

## 11. 验收标准（粗粒度）

不追求 scenario 级别的完整性，只列 proposal 应该覆盖的验收方向，具体 scenario 由写 proposal 的 agent 展开：

1. 用户能在 `/workflow` 页面创建、编辑一份合法 workflow YAML，保存后落在第 8 节的 `definition.yaml` 路径；保存不合法
   YAML（未通过 [definition-schema.md](definition-schema.md) 第 9 节解析期校验）应被拒绝并提示具体错误，不允许静默落盘。定义态合法但超出
   Phase 1 执行 profile 的 workflow 可以保存，但 `trigger_workflow` 必须在创建 Run 前结构化拒绝。
2. 每次创建 workflow 都应分配一个唯一的 `workflow-id`（第 8 节，随机生成，与 `name` 解耦）；用户在 `/workflow` 页面修改一份已保存
   workflow 的 `name` 字段后重新保存，`workflow-id` 与目录路径应保持不变，不应因改名产生新目录或迁移已有 `runs/` 历史。
3. Agent 通过 `fyllo-workflow` MCP server 的 `list_workflows` 能查到当前 workspace 已保存的
   workflow；查询结果应反映最新保存状态（不是启动时的静态快照）。
4. Agent 调用 `trigger_workflow` 后：若目标 workflow `confirmStart: true`，run 以 `awaiting_start_confirmation` 落盘并触发
   wake，工具调用应立即返回，不阻塞等待用户确认；若 `confirmStart: false`，run 直接进入 `running` 并开始推进第一个 stage。
5. 同一 session 已存在 `active` 状态 run 时，再次 `trigger_workflow` 应被拒绝，且拒绝原因需说明"已有 workflow 在运行"
   ，不是通用错误。
6. Phase 1 支持的 `ActionStage(op.type: exec)`
   执行结果（pass/fail）应驱动状态机按 [definition-schema.md](definition-schema.md) 的 `Transition` 规则推进；`maxLoops`
   超出后 run 应终止在失败态，并且快照能说明"卡在哪个 stage、循环了几次"。`confirm: true` 时必须先进入
   `awaiting_action_confirmation`，批准后才执行。
7. `AgentStage(context: fresh)` 触发时，应能通过 `WorkflowRunActivityEntry`（而非 `ChatBackgroundActivityBar` 现有的子
   Agent 入口）看到并点击进入这个子 session 查看其对话内容；该 session 不应出现在"子 Agent N 个正在运行"的计数与列表中。子
   session 完成后，其最终响应文本应被正确读取为该 stage 的 artifact。
8. `AgentStage(context: inherit)`、`WaitStage`、`gate.type: expr/verdict`、结构化 artifact/op、`retry` 或 `idempotencyKey`
   出现在 workflow 时，`trigger_workflow` 应返回包含 feature/stage 定位信息的 `WORKFLOW_FEATURE_NOT_IMPLEMENTED` 或
   `WORKFLOW_CONTEXT_UNSUPPORTED`，且不创建 Run。
9. `gate.type: human` 触发时，run 应进入 `awaiting_gate_decision` 并 wake 通知；用户在 UI 上给出决策后，run 应据此继续（pass
   走向 `next.pass` 的 goto，fail 走向 `next.fail` 的 goto），不允许在没有用户决策的情况下自动通过。
10. `confirmStart: true` 和 `ActionStage.confirm: true` 应分别进入 `awaiting_start_confirmation` 和
    `awaiting_action_confirmation`，使用同一个 `automation:workflow-run:decide` 命令通道；start/action reject 不执行对应操作并将 Run
    标记为 `cancelled`。
11. 任意有效状态推进都应触发一次 wake（`automation:workflow-run:wake`），且 Renderer 只有在存在活跃订阅时才应发起 `getDetail`
    拉取——验证"无人观看时不做无用查询"这条设计约束确实生效。
12. 应用重启后，处于人工等待的 Run 应从磁盘快照恢复原状态并重新进入 active index；正在执行 ACP/Action stage 的 `running`
    Run 因没有可恢复的 live handle 应标记为 `interrupted`，不得恢复或重放 ACP turn/副作用，且不得丢失已有 `visitCounts`/
    `artifacts`。
13. `Agent(fresh, freeform)` + `Action(exec)` + `gate.type: human` 的组合应端到端跑通一次完整 workflow（至少两个 stage、一次
    gate 决策、一次 `maxLoops` 回边）作为 Phase 1 最小验收路径。
14. 父 session 删除和应用 shutdown 时，active Run 必须分别落为 `cancelled`/`interrupted`，清理其 timer、ACP session 和
    Action 子进程，并保留 Run 快照与已写入的 transcript/output。

---

## 12. 参照代码位置

供写 proposal / 实现时对照，而非最终真实性保证——本次讨论后代码可能已变化，动手前应重新核对当前代码。

**MCP server 双向 RPC 模式（`fyllo-spawn`，`fyllo-workflow` 应仿照此结构）**

- `src/main/infra/mcp/bundled-mcp-registry.ts:5`（`BundledMcpServerName` 联合类型）、`:25-26`（`fyllo-spawn` 的
  `transportPolicy: "http-only"` 声明）
- `src/main/infra/mcp/bundled-mcp-host.ts:425`（`spawnBackend`，主进程 spawn 子进程）、`:351`（`handleRpcRequest`）、`:302`（
  `sendRpcResponse`）、`:114`（`registerBundledMcpRpcHandler`，业务 handler 注册入口）
- `src/mcp-servers/fyllo-spawn/src/server.ts:14`（`FYLLO_MCP_TRANSPORT !== "http"` 时直接抛错，无 stdio fallback）
- `src/mcp-servers/fyllo-spawn/src/rpc-client.ts:34`（`SpawnRpcClient` 类）、`:83-107`（`requestId` 生成与 `pending` Map
  关联请求/响应）

**主进程状态自驱动 wake + Renderer pull 模式（`spawned-session`，`workflow run` 展示应仿照此结构）**

- `src/main/services/session/spawn/spawned-session-manager.ts:246`（`SpawnedSessionManager` 类）、`:266`（
  `setViewWakeHandler`）、`:365`/`:631`/`:684`/`:860`/`:1041`/`:1086`/`:1356`（各状态变化点调用 `scheduleViewWake`
  的位置，可作为"哪些时机该触发 wake"的参照清单）
- `src/main/ipc/session/spawned-session.ts:32`（`viewWakeHandler` 实现，调用 `manager.sendToWorkspace(...)`）、`:37`/`:46`（
  `list`/`getDetail` 的 `ipcMain.handle` 绑定）
- `src/main/bootstrap/workspace-window-manager.ts:224`（`sendToWorkspace`，Main→Renderer 推送的通用出口）
- `src/shared/ipc/session/spawned-session.channels.ts`（`SpawnedSessionChannels` 三个 channel 常量定义，`automation:workflow-run:*`
  应仿照此文件的组织方式新建）

**状态机迁移与并发写保护参照（`fyllo-action`，`WorkflowRunSnapshot` 的状态迁移与落盘应参照此模式，但落盘路径不同，见下）**

- `src/shared/fyllo-action/state.ts:3`（`isFylloActionResolved`）、`:7`（`requiresFylloActionAttention`）、`:87`（
  `FylloActionStateMachineError`，非法迁移时的错误类型）
- `src/main/services/session/action/action-service.ts:14`（`patchSessionMeta` 用于持久化，**订正**：fyllo-action 的落盘实际走
  `@main/infra/storage/session-store` 的 `patchSessionMeta`，不是直接调用 `writeFileAtomicSync`；`WorkflowRunSnapshot`
  若要复用"原子写 + revision"这个思路，应参照 `session-store` 里 `patchSessionMeta` 的实现方式，或直接使用
  `src/main/infra/storage/atomic-write.ts` 的 `writeFileAtomicSync` 原语自行实现落盘，两条路都可行，需在 proposal 阶段选定）

**任务/云效相关（Phase 3 会用到，Phase 1 不涉及，仅备查）**

- `src/main/infra/integration/yunxiao/projex/`（`createWorkitem`/`updateWorkitem` 已实现但零调用方）
- `src/renderer/src/stores/automation/task.ts`（`TaskAdapter` 接口，当前只有 `list`/`get`）
