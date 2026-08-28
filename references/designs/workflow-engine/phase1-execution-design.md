# Workflow Engine Phase 1 执行设计

状态：draft（讨论结论，未评审）
日期：2026-08-25

本文档记录 workflow engine Phase 1 的架构决策：手写 YAML、agent 触发、主进程调度、Fyllo Action 之外的独立展示信道。`Stage`/`Gate`/`Transition` 等定义态语义以 [definition-schema.md](definition-schema.md) 为准，本文档只覆盖运行态。

---

## 1. 产品定位与三阶段划分

FylloCode 面向企业推广的核心命题：Coding Agent 进入企业后，耗时大头不再是编码，而是操作项目管理平台、与人沟通。产品要消解两头摩擦：

- **进入摩擦**：任务只读集成（`/task` 页面接云效等平台工作项），让 agent 不离开 FylloCode 就能获得任务上下文。价值标准是"广不深"。
- **退出摩擦**：dynamic workflow engine，agent 干完后把动作写回企业系统。价值标准是"深不广"，必须先在少数高频动作上做扎实。

两条线共享同一个 Provider 抽象，是同一条价值链的入口与出口，不是互相独立验证的假设。

Workflow engine 按三阶段推进，每阶段单独验证、单独可上线：

- **Phase 1**（本文档）：`source: manual`，手写 YAML + agent 触发 + 主进程调度 + 独立展示信道。验证执行语义和运行时持久化模型是否站得住。
- **Phase 2**：`source: agent`，agent 在对话中动态生成 workflow，涉及 system-reminder 改写、reminder 动态注入，生成后引导用户确认是否沉淀复用。
- **Phase 3**：YAML 结构进一步抽象（op 形状收敛为 `write.field`/`write.relation`/`notify` 等，而非每个动作一个 op 变体）、Provider 能力扩展（`ProviderCapabilities` 声明式模型）、YAML 图形化展示（复杂 workflow 靠人眼已经不好分析，需要节点/连线/环路的可视化）。

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
- 结构化产物解析（`diff`/`verdict`/`plan`/`test-report` schema 从 agent 自由文本产出中抽取）——Phase 1 只保证 `produces.schema: freeform` 配 `gate.type: human` 这一种组合可靠工作。
- `gate.type: verdict`（agent 判定）——Phase 1 只实现 `expr`（引擎判定）与 `human`（用户判定）。
- YAML 图形化展示（Phase 3）。

---

## 3. 为什么不引入第三方 workflow/状态机库

调研过 Temporal、Restate、XState、Windmill 等方案，结论是均不引入：

- **Temporal / Restate / Windmill**：核心价值是分布式、跨进程、多 worker 的可靠调度，代价是需要独立部署的 server 或平台。FylloCode 是单机 Electron 应用，workflow 执行环境就是本机主进程，没有分布式需求，引入这类库等于为不存在的问题背运维负担。
- **XState**：纯内存状态机库，官方定位是"在事件循环里跑"，跨进程/跨重启持久化需要自己接。Phase 1 的状态机模型比 XState 简单得多——没有并行状态、没有嵌套状态、没有 actor 模型，只是"当前 stage id + 每个 stage 访问次数 + transition 表"，引入 XState 是为不需要的表达能力换来额外抽象层。

**结论**：自己写一个状态机执行器，核心是一个 `advance(snapshot, event): snapshot` 纯函数，直接照 [definition-schema.md](definition-schema.md) 的 Stage/Transition/Gate/maxLoops 语义实现。持久化模式借鉴 XState 的 snapshot 思路（`getPersistedSnapshot`/`createActor({snapshot})`：每次有效推进后整份快照原子写盘，重启时读盘恢复），但不依赖 XState 本身。

---

## 4. Agent 交互信道：MCP server，不是 fyllo-action

### 4.1 关键约束

ACP 协议下，FylloCode 不能稳定观察到 agent 调用了哪个 MCP tool。这意味着：

- 任何需要"agent 调用某个东西后，紧接着做点什么被用户看到"的设计，如果依赖 agent 主动配合输出特定格式（例如要求 agent 在调用 MCP tool 后自己再输出一个 `<fyllo-action>` 标签），可靠性完全押注在提示词能不能让模型每次都照做，没有程序化的强制手段。
- `fyllo-action` 机制本身（`task.create`/`plan.create` 等）依赖的正是"agent 在回复文本里输出合法标签，Renderer 解析后展示"这条路径——这是在"FylloCode 无法扩展 Agent 原生工具 + 需要定制 UI"这个约束下的折中方案，不是没有代价的通用模式。

### 4.2 结论：触发用 MCP tool，展示不经过 fyllo-action

Workflow run 是**主进程自己管理的状态机**，类比 `fyllo-spawn` 管理的子 agent session——它的状态变化（推进到某个 stage、卡在需要人工确认的 gate）完全发生在主进程内部，不需要 agent 在对话里说任何话来"通知"这件事发生。

- **Agent 查询/触发**：新增 `fyllo-workflow` MCP server，仿照 `fyllo-spawn` 的耦合模式——`transportPolicy: "http-only"`（强依赖主进程运行时状态，无 stdio fallback），通过 Node `child_process` IPC 双向 RPC 桥接到主进程（参考 `fyllo-spawn/src/rpc-client.ts` 的 `SpawnRpcClient` 模式：`requestId` 关联请求/响应，`process.send`/`process.on("message")`）。工具集：
  - `list_workflows`：列出当前 workspace 可用 workflow（不需要 system-reminder 静态注入 index，agent 随时查询更准确）。
  - `trigger_workflow`：触发执行，返回 `{runId, status}`。
- **Run 状态展示、人工决策点**：完全不经过 `fyllo-action`。走 `spawned-session` 的"wake 信号 + Renderer 拉取详情"模式（详见第 6 节），因为这条链路的可靠性锚定在主进程自身状态机，不依赖模型输出格式。

`fyllo-spawn` 的 MCP tool 是"把主进程能力包一层 MCP 协议暴露给 agent 用"，workflow engine 内部创建 fresh 子 session 时**不通过 MCP**，直接调用 `SpawnedSessionManager`（或其更底层能力）——因为 workflow engine 是主进程内部调度代码，不是 agent，不存在"发起 ACP tool call"这个概念，经过 MCP 协议是把两个不同层次的东西混在一起。

---

## 5. 执行模型：混合执行体

Run 状态机不是纯同步的 `advance` 循环，`AgentStage` 的推进跨越了一整轮 agent 交互，引擎在此期间处于挂起态：

| Stage kind                        | 执行体                                                                                                                                                                            | 完成判定                                                                             |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `ActionStage`                     | 引擎直接调用（如 `exec`）                                                                                                                                                         | 引擎同步/异步拿到结果，直接判定 pass/fail                                            |
| `AgentStage` (`context: fresh`)   | 引擎直接调用 `SpawnedSessionManager` 底层能力（不经 MCP），创建**用户可见**的 ACP session                                                                                         | 等待这一轮 turn 结束，读取 `fyllo-spawn` 既有的 transcript/response 落盘机制拿到产出 |
| `AgentStage` (`context: inherit`) | 在发起 workflow 的主 chat session 里追加一轮 turn，状态维持在 chat store 中，按 session 区分，不受页面切换影响；需要主 agent"接手"时注入一条用户不可见的 `<system-reminder>` 唤起 | 同上，等这轮 turn 结束后取产出                                                       |
| `WaitStage`                       | 挂起等待外部信号（CI/人工）                                                                                                                                                       | 收到 signal 后判定                                                                   |

### 5.1 `context: fresh`

对用户**可见**——不做成黑盒。但不混入 `ChatBackgroundActivityBar` 现有的"子 Agent N 个正在运行"入口（`SpawnedSessionActivityEntry`，见 [SpawnedSessionActivityEntry.vue](../../../src/renderer/src/features/spawned-session-inspector/ui/SpawnedSessionActivityEntry.vue)）——那个入口的列表数据来自 `useSpawnedSessionStore`，语义是"用户/agent 手动 spawn 的子 agent"，workflow 内部触发的 fresh session 混进去会让用户分不清"这是我自己开的子 agent"还是"这是 workflow 内部的一步"，两者生命周期和归属也不同（前者独立，后者受 run 状态机管辖，run 终止/失败时应能一并处理）。

可见性通过第 6 节的 `WorkflowRunActivityEntry` 提供：该 run 处于 `AgentStage(fresh)` 期间时，其条目应能展示"当前在跑一个子 session"并可点击跳转查看该子 session 的对话内容（复用 `fyllo-spawn` 现有的 transcript 展示能力，但入口挂在 `WorkflowRunActivityEntry` 下，不挂在 `SpawnedSessionActivityEntry` 下）。理由：隐藏会让用户对"这个 stage 在做什么"产生疑惑，透明度优先；但透明度的实现方式是"从 workflow 入口能看到里面的 session"，不是"把两种不同性质的东西塞进同一个列表"。

### 5.2 `context: inherit`

不新起 session，直接复用发起 workflow 的主 chat session 的 turn 执行路径。因为"一个 session 最多一个 active workflow"（见第 7 节），`inherit` stage 和用户手动聊天之间的互斥问题被简化为"这个 session 当前是否被 workflow 占用"，不需要额外的排队/抢占设计。

### 5.3 产出 → Gate 判定

`AgentStage` 产出的是这一轮 turn 的最终响应文本（`fyllo-spawn` 现有机制落盘）。Phase 1 只保证：

- `produces.schema: freeform` + `gate.type: human`：文本原样作为 artifact，人工阅读后决策。**唯一保证可靠工作的组合。**
- 其余 `produces.schema`（`diff`/`verdict`/`plan`/`test-report`）配 `expr` gate 需要从自由文本结构化解析，Phase 1 不做，推后到后续 phase。

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

新开一组 channel（不复用 `session:spawned-session:*`，因为标识符 shape 不同），复用 `WorkspaceWindowManager.sendToWorkspace` 这个通用推送出口：

```ts
// src/shared/ipc/workflow/workflow-run.channels.ts（提议路径）
export const WorkflowRunChannels = {
  list: "workflow:run:list", // invoke
  getDetail: "workflow:run:getDetail", // invoke
  wake: "workflow:run:wake", // Main -> Renderer push
} as const;
```

流程：run 状态机任意有效推进（stage 切换、进入 `awaiting_gate_decision`、进入终态等）→ debounce 后 `sendToWorkspace(workspaceId, wake, {workspaceId, runId})` → Renderer 收到 wake，若当前有组件对该 run 声明了 interest，才发起 `getDetail` 拉取最新快照 → Pinia store 更新 → UI 重渲染。

**需要用户确认的场景统一走这条链路**，不单独设计其他机制：

- `confirmStart: true` 的 workflow：`trigger_workflow` 到达后，若需确认，run 直接以 `awaiting_start_confirmation` 状态创建并落盘，wake 通知，工具调用立刻返回 `{runId, status: "awaiting_start_confirmation"}`，不需要 agent 等待或二次确认。
- `gate.type: human`：stage 完成后引擎将 run 置为 `awaiting_gate_decision`，wake+pull，用户在 UI 决策后通过 IPC 请求驱动 run 继续。
- `ActionStage` 的 `confirm: true`：同样走 wake+pull。
- 异常终止路径（`maxLoops` 超限、`WaitStage` 的 `onTimeout`）：统一进入某个终态并 wake 通知，不设计额外机制。

UI 挂载点：`ChatBackgroundActivityBar`（当前仅是布局容器，见 [ChatBackgroundActivityBar.vue](../../../src/renderer/src/components/chat/ChatBackgroundActivityBar.vue)）新增 `WorkflowRunActivityEntry`，作为与 `SpawnedSessionActivityEntry`（子 Agent 入口）完全独立的兄弟组件平级放置——不是同一个入口下的分支或子状态，是两个各自持有数据源（各自的 Pinia store、各自的 wake/pull 订阅）、各自控制自身 `v-if` 可见性的组件，仅在布局上相邻。`WorkflowRunActivityEntry` 展示"workflow 正在执行 / 等待你处理"；5.1 节提到的 `AgentStage(fresh)` 子 session 可见性由这个组件内部提供入口（点击 run 条目能看到并跳转到对应的 fresh session 对话），不通过 `SpawnedSessionActivityEntry` 展示。

---

## 7. 并发与归属

- **Run 归属**：一个 workflow run 归属于发起它的 chat session（`parentSessionId`），类比 spawned-session 的绑定模式。
- **并发限制**：一个 session 最多关联一个 `active` 状态的 workflow run。存在 active run 时，`trigger_workflow` 直接拒绝启动第二个。此约束在 MCP server 入口或主进程 engine 入口做校验（具体位置留待实现时定）。

---

## 8. 存储结构

```
appData/workspaces/<workspace-id>/workflows/
└── <workflow-id>/
    ├── definition.yaml                   # workflow YAML 原文件
    └── runs/
        └── <run-id>/
            ├── <run-id>.json              # 执行快照（run 状态机）
            └── sessions/
                └── <fresh-session-id>.jsonl  # fresh AgentStage 产生的子 session 对话记录
```

**`<workflow-id>` 的生成方式**：创建 workflow 时随机分配（如 nanoid），与 `name` 完全解耦——用户在 `/workflow` 页面重命名一份 workflow 只改 YAML 内的 `name` 字段，不影响 `workflow-id`、不需要重命名目录。理由：`workflow-id` 是这份 workflow 在存储路径与后续引用中的唯一标识，`name` 是随时可能被用户调整的展示名，如果两者绑定（例如从 `name` 做 slug），每次改名都要考虑"目录要不要跟着改、改了会不会影响已经持有旧路径的 run"这类连带问题；解耦后重命名是纯粹的内容编辑，不牵扯路径迁移。

**Phase 2 预留**：agent 生成的 workflow 先落在 session 临时存储 `appData/workspaces/<workspace-id>/sessions/<session-id>/workflows/<workflow-id>.yaml`，用户同意持久化后再 copy 到上述正式目录。Phase 1 不实现，但目录设计已兼容。

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
    | "waiting_signal"
    | "succeeded"
    | "failed";
  currentStageId: string;
  visitCounts: Record<string, number>; // maxLoops 校验
  artifacts: Record<string, unknown>; // 各 stage 产出，供模板变量和 expr gate 消费
  pendingDecision?: {
    kind: "gate-human" | "wait-signal" | "start-confirmation";
    prompt: string;
  };
  startedAt: string;
  updatedAt: string;
}
```

每次有效推进后整份快照原子写盘（复用 `fyllo-action` 已用的 `writeFileAtomicSync` 模式）。

---

## 9. `fyllo-workflow` MCP server：Phase 1 工具集

Phase 1 新增的 `fyllo-workflow` MCP server，`transportPolicy: "http-only"`（第 4.2 节），提供两个工具，均通过 Node `child_process` IPC 桥接到主进程，不做本地计算。

### 9.1 `list_workflows`

无副作用的查询工具，列出当前 workspace 已保存的 workflow。

```ts
list_workflows(input: {}): {
  workflows: Array<{
    workflowId: string;
    name: string;
    description?: string;
  }>;
}
```

- 只列出 workspace 正式目录（第 8 节 `appData/workspaces/<workspace-id>/workflows/<workflow-id>/definition.yaml`）下已保存的 workflow，每次调用实时读取磁盘当前状态，不做启动时的静态快照缓存（第 11 节验收标准第 3 条）。
- `name`/`description` 取自 workflow YAML 顶层字段（definition-schema 第 2 节），供 agent 判断是否有可复用的既有 workflow。

### 9.2 `trigger_workflow`

触发一次 workflow 执行。

```ts
trigger_workflow(input: {
  workflowId: string;
}): {
  status: "accepted";
  runId: string;
  runStatus: "running" | "awaiting_start_confirmation";
} | {
  status: "rejected";
  reason: string;  // 如"已有 workflow 在运行"（第 7 节并发限制）、"workflowId 不存在"
}
```

- 若目标 workflow 所在 session 已存在 `active` 状态的 run（第 7 节并发限制），直接返回 `status: "rejected"`，`reason` 需明确说明"已有 workflow 在运行"，不是通用错误文案。
- 若目标 workflow `confirmStart: true`（definition-schema 第 2.2 节），run 以 `awaiting_start_confirmation` 状态创建并落盘、触发 wake（第 6 节），工具调用立即返回，不阻塞等待用户确认。
- 若 `confirmStart: false`，run 直接进入 `running` 并开始推进第一个 stage，工具调用返回时不代表 stage 已执行完，只代表 run 已成功创建并开始推进。
- `trigger_workflow` 不接受 workflow YAML 内容本身，只接受 `workflowId`——Phase 1 里 workflow 只能来自用户在 `/workflow` 页面手写保存的 workspace 资产（第 2 节范围边界），agent 不生成 YAML 内容。

### 9.3 workflow engine 内部创建 fresh 子 session 不经过 MCP

第 4.2 节已定：workflow engine 创建 `AgentStage(context: fresh)` 的子 session 时，直接调用 `SpawnedSessionManager`（或其更底层能力），不经过 `fyllo-workflow` 这层 MCP 协议——因为这是主进程内部调度代码之间的调用，不是"agent 发起一次 tool call"，不属于本节工具集范围。

---

## 10. 待实现时确认的收尾细节

以下问题不影响架构方向，可在实现阶段顺手决定：

1. `trigger_workflow` 的并发校验（第 7 节）具体放在 MCP server 侧还是主进程 engine 侧。
2. `WorkflowRunSnapshot` 的 `status` 枚举是否需要更细粒度拆分（如区分 `waiting_signal` 的具体 signal kind）。

---

## 11. 验收标准（粗粒度）

不追求 scenario 级别的完整性，只列 proposal 应该覆盖的验收方向，具体 scenario 由写 proposal 的 agent 展开：

1. 用户能在 `/workflow` 页面创建、编辑一份合法 workflow YAML，保存后落在第 8 节的 `definition.yaml` 路径；保存不合法 YAML（未通过 [definition-schema.md](definition-schema.md) 第 9 节解析期校验）应被拒绝并提示具体错误，不允许静默落盘。
2. 每次创建 workflow 都应分配一个唯一的 `workflow-id`（第 8 节，随机生成，与 `name` 解耦）；用户在 `/workflow` 页面修改一份已保存 workflow 的 `name` 字段后重新保存，`workflow-id` 与目录路径应保持不变，不应因改名产生新目录或迁移已有 `runs/` 历史。
3. Agent 通过 `fyllo-workflow` MCP server 的 `list_workflows` 能查到当前 workspace 已保存的 workflow；查询结果应反映最新保存状态（不是启动时的静态快照）。
4. Agent 调用 `trigger_workflow` 后：若目标 workflow `confirmStart: true`，run 以 `awaiting_start_confirmation` 落盘并触发 wake，工具调用应立即返回，不阻塞等待用户确认；若 `confirmStart: false`，run 直接进入 `running` 并开始推进第一个 stage。
5. 同一 session 已存在 `active` 状态 run 时，再次 `trigger_workflow` 应被拒绝，且拒绝原因需说明"已有 workflow 在运行"，不是通用错误。
6. `ActionStage` 执行结果（pass/fail）应驱动状态机按 [definition-schema.md](definition-schema.md) 的 `Transition` 规则推进；`maxLoops` 超出后 run 应终止在失败态，并且快照能说明"卡在哪个 stage、循环了几次"。
7. `AgentStage(context: fresh)` 触发时，应能通过 `WorkflowRunActivityEntry`（而非 `ChatBackgroundActivityBar` 现有的子 Agent 入口）看到并点击进入这个子 session 查看其对话内容；该 session 不应出现在"子 Agent N 个正在运行"的计数与列表中。子 session 完成后，其最终响应文本应被正确读取为该 stage 的 artifact。
8. `AgentStage(context: inherit)` 触发时，不应新建任何 session；应在主 chat session 里追加一轮 turn，且这轮 turn 在用户切换到其他页面/会话后仍能在后台跑完；跑完后若需要唤起主 agent 处理下一步，应注入一条用户不可见的 `<system-reminder>`（用户在消息列表中看不到这条 reminder 本身）。
9. `gate.type: expr` 失败时该 stage 直接判定为 fail，不产生任何用户可见的等待态。
10. `gate.type: human` 触发时，run 应进入 `awaiting_gate_decision` 并 wake 通知；用户在 UI 上给出决策后，run 应据此继续（pass 走向 `next.pass` 的 goto，fail 走向 `next.fail` 的 goto），不允许在没有用户决策的情况下自动超时通过。
11. 任意有效状态推进都应触发一次 wake（`workflow:run:wake`），且 Renderer 只有在存在活跃订阅时才应发起 `getDetail` 拉取——验证"无人观看时不做无用查询"这条设计约束确实生效。
12. 应用重启后，处于非终态（`running`/`awaiting_*`/`waiting_signal`）的 run 应能从磁盘快照恢复，恢复后的状态与重启前一致，不丢失 `visitCounts`/`artifacts`。
13. `produces.schema: freeform` + `gate.type: human` 的组合应端到端跑通一次完整 workflow（至少两个 stage、一次 gate 决策）作为最小验收路径；其余 `produces.schema` 与 `gate.type: expr`/`verdict` 的组合不要求在 Phase 1 验收范围内。

---

## 12. 参照代码位置

供写 proposal / 实现时对照，而非最终真实性保证——本次讨论后代码可能已变化，动手前应重新核对当前代码。

**MCP server 双向 RPC 模式（`fyllo-spawn`，`fyllo-workflow` 应仿照此结构）**

- `src/main/infra/mcp/bundled-mcp-registry.ts:5`（`BundledMcpServerName` 联合类型）、`:25-26`（`fyllo-spawn` 的 `transportPolicy: "http-only"` 声明）
- `src/main/infra/mcp/bundled-mcp-host.ts:425`（`spawnBackend`，主进程 spawn 子进程）、`:351`（`handleRpcRequest`）、`:302`（`sendRpcResponse`）、`:114`（`registerBundledMcpRpcHandler`，业务 handler 注册入口）
- `src/mcp-servers/fyllo-spawn/src/server.ts:14`（`FYLLO_MCP_TRANSPORT !== "http"` 时直接抛错，无 stdio fallback）
- `src/mcp-servers/fyllo-spawn/src/rpc-client.ts:34`（`SpawnRpcClient` 类）、`:83-107`（`requestId` 生成与 `pending` Map 关联请求/响应）

**主进程状态自驱动 wake + Renderer pull 模式（`spawned-session`，`workflow run` 展示应仿照此结构）**

- `src/main/services/session/spawn/spawned-session-manager.ts:246`（`SpawnedSessionManager` 类）、`:266`（`setViewWakeHandler`）、`:365`/`:631`/`:684`/`:860`/`:1041`/`:1086`/`:1356`（各状态变化点调用 `scheduleViewWake` 的位置，可作为"哪些时机该触发 wake"的参照清单）
- `src/main/ipc/session/spawned-session.ts:32`（`viewWakeHandler` 实现，调用 `manager.sendToWorkspace(...)`）、`:37`/`:46`（`list`/`getDetail` 的 `ipcMain.handle` 绑定）
- `src/main/bootstrap/workspace-window-manager.ts:224`（`sendToWorkspace`，Main→Renderer 推送的通用出口）
- `src/shared/ipc/session/spawned-session.channels.ts`（`SpawnedSessionChannels` 三个 channel 常量定义，`workflow:run:*` 应仿照此文件的组织方式新建）

**状态机迁移与并发写保护参照（`fyllo-action`，`WorkflowRunSnapshot` 的状态迁移与落盘应参照此模式，但落盘路径不同，见下）**

- `src/shared/fyllo-action/state.ts:3`（`isFylloActionResolved`）、`:7`（`requiresFylloActionAttention`）、`:87`（`FylloActionStateMachineError`，非法迁移时的错误类型）
- `src/main/services/session/action/action-service.ts:14`（`patchSessionMeta` 用于持久化，**订正**：fyllo-action 的落盘实际走 `@main/infra/storage/session-store` 的 `patchSessionMeta`，不是直接调用 `writeFileAtomicSync`；`WorkflowRunSnapshot` 若要复用"原子写 + revision"这个思路，应参照 `session-store` 里 `patchSessionMeta` 的实现方式，或直接使用 `src/main/infra/storage/atomic-write.ts` 的 `writeFileAtomicSync` 原语自行实现落盘，两条路都可行，需在 proposal 阶段选定）

**任务/云效相关（Phase 3 会用到，Phase 1 不涉及，仅备查）**

- `src/main/infra/integration/yunxiao/projex/`（`createWorkitem`/`updateWorkitem` 已实现但零调用方）
- `src/renderer/src/stores/automation/task.ts`（`TaskAdapter` 接口，当前只有 `list`/`get`）
