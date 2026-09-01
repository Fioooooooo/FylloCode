# Workflow Engine Phase 2 — Agent 动态生成 + 沉淀复用

状态：draft（P0 blocker 已收敛，待 proposal review）
日期：2026-09-01

本文档记录 workflow engine Phase 2 的架构决策：agent 在对话中动态生成 workflow YAML、生成后的确认流程、沉淀为可复用资产的路径。承接 [phase1-execution-design.md](phase1-execution-design.md) 的运行时地基与 [definition-schema.md](definition-schema.md) 的定义态语义，本文档不重复两者已定的内容，只覆盖 Phase 2 新增部分。

## 0. P0 阻塞决策总览（2026-09-01）

本节是给新 Agent 的单点入口。以下边界已经完成 blocker 讨论，后续 proposal 不应重新引入被明确排除的复杂事务、能力扩展或 UI 迁移。它们描述的是 Phase 2 的当前设计方向，不代表 proposal 已创建或已获用户批准。完整轮次、历史候选和决策传播记录见 [phase2-blocker-decision-log.md](phase2-blocker-decision-log.md)。

| 议题                     | Phase 2 当前边界                                                                                                                                                                                                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Proposal owner 与发现    | Proposal 是 session-owned transient state；owner 为 `workspaceId + parentSessionId + proposalId`，存放在 `workspaceDataDir/<workspaceId>/sessions/<parentSessionId>/workflow-proposals/<proposalId>/`，使用独立 `.meta.json` 和 `definition.yaml`。提供 owner-scoped `list/getDetail/confirm/cancel/wake`，同 session 多窗口共享，跨 session/workspace 隔离。 |
| Propose 校验             | `propose_workflow` 只做 owner/state、YAML/schema、`mode`/`workflowId`/`persist` 的基本校验；schema 合法但暂不支持执行的 definition 可以进入 proposal，不在 propose 阶段做完整 execution-profile gate。                                                                                                                                                        |
| Confirm 与执行           | confirm IPC 只做基本校验并把 definition 落到用户选择的 session/workspace 正式来源；不创建 Run、不调用 `trigger_workflow`、不等待执行。成功后发送 `role: user` handoff，包含有效 `workflowId`，提示主 Agent 调用 `trigger_workflow`。                                                                                                                          |
| Runtime preflight 与恢复 | `trigger_workflow` 是唯一权威的运行时能力校验入口，负责 unsupported 拒绝、Run 创建、尚未开始 Run 的启动，以及按已有 stage 进度恢复进行中的 Run；不重复播放已完成 stage。                                                                                                                                                                                      |
| Definition 来源          | Main 自动注入 session context；session definition 优先于 workspace definition。`(workspaceId, sessionId?, workflowId)` 唯一定位来源，Run snapshot 保留 provenance；`list_workflows` 仍只列 workspace 正式资产。                                                                                                                                               |
| `inherit` 与 turn        | Phase 2 不执行 `context: inherit`，但 schema 合法的定义可以先保存；`trigger_workflow` 返回结构化 unsupported，不新增 workflow ChatTurn kind 或通用 turn queue。                                                                                                                                                                                               |
| Decision reminder        | cancel 使用 session-owned `workflow-decisions/<proposalId>.json` 和现有五状态 notification outbox；confirm 使用最小 `role: user` handoff，不并入 cancel outbox。Renderer 不直接 claim。                                                                                                                                                                       |
| Agent-generated 安全边界 | 确认卡片完整展示 YAML；用户 review 后可按每个 stage 的 `confirm: false/true` 决定运行时是否保留人工关卡，不强制 Agent 生成的 exec 使用 `confirm: true`，不新增额外 checkbox 或安全策略。                                                                                                                                                                      |
| 触发行为                 | 首版只响应用户明确要求“保存/复用 workflow”，不实现 Agent 主动提议阈值或隐式复用判断；常驻提示只宣传入口和当前可执行 profile。                                                                                                                                                                                                                                 |
| UI 挂载                  | Proposal 与 Phase1 Run 都作为 `ChatBackgroundActivityBar` 的 sibling entry；可共享卡片视觉骨架，但必须保持 proposal/run store、wake、owner 和生命周期独立。Phase 2 不迁移 Phase1 Run 到 EventRail。                                                                                                                                                           |
| 明确不做                 | 不为假想崩溃窗口增加跨文件事务、target 锁、backup/restore、commit-intent/hash 协议；不扩展 Phase1 execution profile；不增加 EventRail contributor/attention 聚合协议。                                                                                                                                                                                        |

### 0.1 Proposal readiness

读完本文档后，Agent 可以直接为 proposal 展开 shared contract、Main service/IPC、preload/renderer wrapper、proposal card、decision reminder 和 `trigger_workflow` 恢复测试。原 blocker 记录中 P0-8/P0-9 曾出现的主动提议、propose 冲突门槛和 EventRail 挂载选择，本版按“显式触发 + trigger 冲突校验 + ActivityBar 双入口”的最小兼容默认收敛；它们不再是 proposal 前置 blocker。其余细节属于 proposal 的实现拆分与验收。Phase1 linked worktree 只作为运行时边界参照，本阶段不修改它。

---

## 1. 定位

Phase 1 里 workflow 只能由用户手写。Phase 2 让 agent 在对话过程中按 [definition-schema.md](definition-schema.md) 的 YAML schema 动态生成 workflow；“Agent 生成”只记录在 proposal metadata 和确认卡片中，不向 YAML 顶层增加未经 schema 定义的 `source` 字段。生成后引导用户确认，确认只同意并落盘内容；执行由后续 `trigger_workflow` 调用负责。用户可进一步选择是否将其沉淀为可复用的 workspace 资产。生成的目标既可以是一份全新 workflow，也可以是对某个已沉淀 workflow 的更新（第 3.2 节 `mode: "create" | "update"`）——这两条路径共享同一套生成、校验、确认机制，只在落盘目标的定位方式上有区别（第 10 节）。

---

## 2. 核心问题核对：这是否违反 Phase 1 "不依赖 agent 输出标签" 的原则

Phase 1 第 4 节的结论是：**触发用 MCP tool，展示不经过 fyllo-action**——因为 ACP 下无法可靠要求 agent 在 tool call 之后自己配合输出特定格式的文本标签，可靠性不能押注在提示词合规性上。

Phase 2 新增"生成后展示 YAML 供确认"这个动作，核对后结论是：**原则依然成立，不需要绕过**。原因：

- 生成动作本身是一次 **MCP tool call**（`propose_workflow`，见第 3 节），YAML 内容作为**结构化参数**直接传入，不是"agent 调用某工具后自己再吐一段文本、指望 Renderer 解析"。tool call 参数到达是 MCP server 实现的一部分，天然可靠，这与 `trigger_workflow` 传 `workflowId` 是同一类信道。
- 生成之后的确认展示，复用 Phase 1 已验证的 **wake + pull** 模式：`propose_workflow` 校验通过后落盘、触发 wake，Renderer 拉取详情展示确认卡片。全程不依赖 agent 输出文本被解析。

真正被排除的路径是"agent 先把 YAML 写成文件，MCP tool 只传文件路径"——这会引入 Phase 1 刻意避开的不确定性（文件是否写到约定路径、写入时机与 tool call 的先后关系在 ACP 下不可观察），详见第 3 节。

---

## 3. 生成信道：`describe_workflow_schema` + `propose_workflow`，渐进披露

### 3.0 为什么拆两个 tool，而不是把 schema 常驻进 system prompt

`fyllo-specs` 已有先例：`create-proposal` 的详细写作规则（[create-proposal.md](../../../src/mcp-servers/fyllo-specs/src/tools/instructions/create-proposal.md)）不是常驻 system prompt，而是通过 tool 调用返回值按需下发（`includeInstruction` 参数，见 [create-proposal.ts:34-40](../../../src/mcp-servers/fyllo-specs/src/tools/create-proposal.ts)）。本项目里已连接的 `visualize` MCP server 是另一个更直接的参照：`read_me`/`show_widget` 两个工具通过 description 互相声明调用顺序（"Call before your first show_widget call" / "IMPORTANT: Call read_me before your first show_widget call"），schema/规则本身完全不进 system prompt，只有在 agent 明确要动手画图时才用一次 tool call 换回来。

这正是 skill 的核心思想——先见 name+description 决定"要不要用"，需要时再取详情决定"怎么用"——落到 MCP tool 层面的具体形态。`fyllo-workflow` 应该采用同样的拆分，而不是延续 4.1 节曾设想的"整份 contract 常驻 system prompt"：workflow schema（[definition-schema.md](definition-schema.md) 第 1-9 节）与"这个能力存在、什么时候该碰它"是两个不同粒度的信息，前者体量大且只有真正要生成 YAML 时才用得上，后者需要常驻但应该极短。

### 3.1 `describe_workflow_schema`

`fyllo-workflow` MCP server 新增的信息查询工具，无副作用，返回 [definition-schema.md](definition-schema.md) 第 1-9 节的骨架：`WorkflowDefinition`/`Stage`（`AgentStage`/`ActionStage`/`WaitStage`）/`ActionOp`/`Gate`/`ArtifactSpec`/`Transition` 的字段与语义、第 9 节解析期校验清单。

```ts
describe_workflow_schema(input: {
  withExamples?: boolean;  // 默认 false，附带第 10 节的完整 YAML 示例
}): {
  schema: string;  // markdown 全文
}
```

不做成 `read_me` 那种按 `modules` 枚举划分的参数化查询：definition-schema 第 1-9 节各部分强耦合（写一个 `AgentStage` 必然牵扯 `Gate`/`Transition`/`ArtifactSpec`），不存在"只关心 Gate、完全不需要 Stage"这种典型场景，拆模块只会增加多次往返的负担，不会减少信息量。真正体量大、且个体独立性强、值得单独开关的只有第 10 节的示例部分，因此只用一个 `withExamples` 布尔量控制"要不要更多例子"，而不是模块选择。

`propose_workflow` 的 description 反向声明依赖顺序（第 3.2 节），与 `describe_workflow_schema` 的 description 构成 `read_me`/`show_widget` 式的双重提醒，不依赖 system prompt 强制。

### 3.2 `propose_workflow`

`fyllo-workflow` MCP server 新增的生成提交工具（在 Phase 1 已有的 `list_workflows`/`trigger_workflow` 之外）。**这个 tool 只做基本校验和 session-owned proposal 落盘，不创建 Run、不写入 session/workspace 的正式 definition**——正式落盘由用户确认后的 IPC 完成，执行由 handoff 后的 `trigger_workflow` 完成（第 7 节）。

```ts
propose_workflow(input: {
  yaml: string;           // workflow YAML 全文
  persist: "session" | "workspace";  // agent 对落盘目标的建议值，用户确认时可改选，见第 7.1 节
  mode: "create" | "update";  // 必填，无默认值——见下方"为什么 mode 必填"
  workflowId?: string;    // mode: "create" 时必须省略；mode: "update" 时必填
}): {
  status: "accepted";
  proposalId: string;    // 临时提案标识，非 run 标识，见下方"为什么不返回 runId"
} | {
  status: "rejected";
  errors: Array<{ rule: string; detail: string }>;  // 结构化校验错误
}
```

description 需明确写"call `describe_workflow_schema` first if you haven't already"，理由同第 3.1 节。

**校验边界**：此 tool 只做 owner/context、proposal 状态、YAML 可解析性、definition schema 以及 `mode`/`workflowId`/`persist` 的基本校验。schema 合法但超出 Phase 1 execution profile 的 definition 可以进入 proposal；能力是否能在当前运行时执行，统一由 `trigger_workflow` 在运行前预检（第 5 节和第 11.2 节）。

**为什么不在 `accepted` 分支返回 `runId`**：`runId` 是 Run 状态机的标识，而 Run 只应在用户确认、definition 正式落盘，并由主 Agent 后续调用 `trigger_workflow` 后才创建（第 7.1 节）。如果 `propose_workflow` 校验通过就返回 `runId`，等于暗示 Run 在提案阶段已经存在；如果确认 IPC 直接返回 `runId`，又会把“保存 definition”和“开始执行”耦合在一起，无法清楚表达用户确认后应用退出的恢复路径。因此 `propose_workflow` 返回的是 `proposalId`，对应第 3.2.1 节的 session-owned 提案记录；确认 IPC 只返回有效 `workflowId` 并交接给主 Agent，`trigger_workflow` 再按当前 Run 记录分配、启动或恢复 `runId`。

**`persist` 是 agent 的建议值，不是最终定案**：确认卡片底部固定展示"取消 / 仅本次执行 / 保存为可复用并执行"三个按钮（第 8.2 节），无论 agent 在 `propose_workflow` 里传的是 `session` 还是 `workspace`，用户都能点击任意一个——真正生效的 `persist` 以用户点击的按钮为准，随确认 IPC 一起传给主进程（第 7.1 节）。这里保留这个参数的意义在于：agent 需要有渠道表达一个初始建议（比如第 9.1 节"用户直接要求存下来复用"的场景，agent 据此把 `persist` 设为 `workspace`），确认卡片可以用这个建议值决定默认高亮哪个按钮，但不能限制用户的选择——决定权始终在用户，agent 的建议只是体验上的默认值，不是约束。

**为什么 agent 不接触任何文件路径**：无论提案最终被确认为临时用（`persist: "session"`）还是要沉淀（`persist: "workspace"`），落盘位置的拼接逻辑完全在主进程内部完成，agent 只表达"生成/更新了什么内容"和"倾向于怎么持久化"，不涉及"写到哪个具体路径"。这避免了 agent 因幻觉传错路径、或分两步操作（先写文件、再传路径）引入的中间态风险。

#### 3.2.1 校验通过后的临时落盘：session-owned proposal

`propose_workflow` 校验通过后，把 YAML 原文（连同 `mode`/`workflowId`/agent 建议的 `persist`）写入当前 parent session 所属的 proposal 目录：

```
appData/workspaces/<workspace-id>/sessions/<parent-session-id>/workflow-proposals/<proposal-id>/
├── definition.yaml
└── .meta.json
```

`.meta.json` 至少记录不可预测的 `proposalId`、`workspaceId`、`parentSessionId`、`mode`、目标 `workflowId`（如有）、Agent 建议的 `persist`、proposal 状态（`pending`/`confirming`/`confirmed`/`cancelled`）和时间戳。Proposal 是 session-owned transient state，不是 workspace 正式 workflow，也不是 Run snapshot。

写入 proposal 目录后触发独立的 workflow-proposal wake；Renderer 通过 owner-scoped `list/getDetail` 拉取详情。wake 只提示可能有变化，不承载 YAML 或状态事实；应用重启后，session 页面首次 `list` 仍必须能发现 `pending` proposal。同一 parent session 的多个窗口共享该 proposal，跨 session/workspace 的请求必须拒绝。

Proposal 的 `definition.yaml` 和 metadata 在终态后可保留到 parent session 生命周期结束，以支持状态查询和幂等返回；不设置任意 TTL。parent session 删除时级联清理 proposal 目录，workspace 删除由目录生命周期处理。

### 3.3 校验失败处理

`propose_workflow` 是同步的请求/响应：基本校验（[definition-schema.md](definition-schema.md) 第 9 节解析期规则，见第 5 节；以及第 3.2 节 `mode`/`workflowId`/`persist` 的组合校验）失败时，直接返回结构化错误列表，**不写入第 3.2.1 节的 proposal 目录、不触发 wake**。schema 合法但 execution profile 暂不支持的 definition 不属于 propose 阶段错误，仍可写入 proposal；agent 在同一轮对话里根据基本错误自行修正后重新调用，类比 TypeScript 编译错误的反馈循环。

不引入"先落为 draft 状态、再异步修复"的中间态——基本校验失败的 YAML 不构成任何值得让 Renderer 知道的状态变化，proposal 目录只保留通过 schema 基本校验的内容。这与 Phase 1"不合法 YAML 不允许静默落盘"（验收标准第 1 条）是同一条原则的延伸；运行时能力不支持则由 `trigger_workflow` 返回结构化错误。

---

## 4. 触发时机：常驻的只是"能力存在"，不是 schema 本身

### 4.1 为什么需要常驻，但常驻的内容要收窄

Phase 2 首版只响应**用户显式要求**，例如“把这个流程存成 workflow”或“保存为可复用流程”。不实现 Agent 主动判断、主动提议或询问隐式复用意图；这些行为会新增骚扰抑制、相似流程判断和用户可见触发契约，留到后续独立设计。

常驻 system prompt 只负责让 Agent 知道能力存在、知道显式触发时的调用顺序和当前运行时范围，不放完整 schema，也不放“至少几步才提议”之类的阈值：

> 当用户明确要求把当前流程保存或复用为 workflow 时，先调用 `describe_workflow_schema` 了解格式，再用 `propose_workflow` 提交生成结果供用户确认。合法但当前运行时不支持的 definition 可以先进入确认卡片；真正执行前由 `trigger_workflow` 做能力校验。

常驻提示建议由 chat system-reminder provider 放在 knowledge 内容之后、FylloAction/FylloSignal contract 之前。它只宣传入口和 Phase 1 当前可执行 profile（`fresh + exec + human`）；这里的 profile 只是提醒 Agent 运行时可能被 `trigger_workflow` 拒绝，不是 `propose_workflow` 的生成限制。具体 schema 通过 `describe_workflow_schema` 按需返回。

### 4.2 触发标准

“用户是否明确要求保存/复用”是首版唯一触发标准。简单 typo、单条命令、用户明确标注一次性或特例的请求，不自动调用 `propose_workflow`。不定义 Agent 主动提议的步数阈值、决策点阈值、隐式复用判断或 TTL。

---

## 5. 生成校验：沿用通用规则，不叠加 agent 专属限制

### 5.1 沿用 definition-schema 第 9 节

`propose_workflow` 复用 [definition-schema.md](definition-schema.md) 第 9 节的基本解析期校验规则，不区分来源。它检查 YAML 是否可解析、必填字段、stage id/引用、拓扑、模板字段的结构形状，以及 `mode`/`workflowId`/`persist` 的组合；不在此阶段完整判断 definition 是否落入 Phase 1 execution profile。

不新增"`exec`/`webhook` 强制 `confirm: true`"这类规则：`confirm` 字段控制的是**运行时**每次 `trigger_workflow` 执行到该 stage 是否需要人工二次确认，这与"agent 这次生成的内容需不需要人审阅"是两件不同的事——后者已经由第 7/8 节的确认卡片机制解决（生成结果必须经用户在确认卡片上审阅、确认后才落盘/执行，且第 8.3 节要求完整展示 `exec`/`webhook` 原文，不允许折叠）。若在 schema 层面永久禁止 `confirm: false`，等于让"生成时审阅一次"这个一次性关卡，变成"运行时永远关不掉的二次确认"，会挡住 workflow engine 未来"无人值守执行"这个可能方向——一份已经被用户审阅、确认、沉淀为可复用资产的 workflow，理应可以在后续复用时全自动跑完，而不是被 schema 强制卡在每次都要人工点确认。

`confirm` 该设为 `true` 还是 `false`，是 workflow 作者（此处是 agent，代其生成内容的用户对结果负责）对"这一步要不要在运行时也保留人工关卡"的正常判断，Phase 2 不比 Phase 1 的手写信任模型更严格地约束这个字段。

### 5.2 运行时能力校验留给 `trigger_workflow`

合法但超出 Phase 1 execution profile 的 definition 可以被 propose、展示和确认落盘。`trigger_workflow` 在创建新 Run、启动尚未执行的 Run 或恢复已有 Run 前，统一执行 runtime preflight；`context: inherit`、WaitStage、非 `exec` Action、非 `human` Gate、非 `freeform` produces、`retry`、`idempotencyKey` 以及其它当前未实现能力在此处返回带 YAML 路径/feature 定位的结构化 unsupported 错误，不启动 ACP、Action 或新的 Run。Phase 2 不引入 `minEngineVersion`、迁移格式或另一套 profile 版本协商。

### 5.3 不做的事：requires 上下文匹配

`propose_workflow` 只做 schema 结构校验，**不**检查 `requires` 声明的上下文（如 `requires: [task]`）是否与当前对话匹配。这类匹配校验留给 `trigger_workflow` 启动时按 Phase 1 已有逻辑处理。`propose_workflow` 与 `trigger_workflow` 的职责边界：前者只管"这是不是一份合法 YAML"，后者才管"这份 YAML 能不能在当前上下文启动"。

---

## 6. Prompt 自包含性：只做提示引导，不做机械校验

### 6.1 问题

`propose_workflow` 生成 `AgentStage.prompt` 时，agent 处于当前对话的沉浸语境里，容易写出依赖"当前对话隐含前提"的 prompt（"按上面讨论的方案改""像刚才那样处理"）。这类 prompt 一旦被沉淀复用，在脱离原对话语境的新 session（`context: fresh`）或者被沉淀后在全新对话里触发的 `context: inherit`（此时"当前对话"已经是另一个不相关的对话，见 6.3 节）中执行，会**悄悄地按错误的上下文推理**，而非明显地报错失败——这是最隐蔽的一类风险。

### 6.2 结论：`describe_workflow_schema` 提示 + 现有 gate/回边容错，不引入新机制

- **不做解析期机械检测**（如扫描"上面/刚才/如上"等指代词）。这类关键词黑名单和敏感词过滤是同一类脆弱机制：正常合理的句子可能凑巧命中而被误伤，真正的悬空引用完全可以不用这些词表达（"改那个 bug"）。规则精确率低，还会让用户困惑"我这句话哪里有问题"。
- 唯一的防线是 `describe_workflow_schema` 返回内容里明确写清楚这个心智模型：**这份 prompt 未来会在一个不知道当前对话内容的新 session 里执行，写的时候要把当前对话里所有隐含前提转成 prompt 里的显式文字**。这条提示属于"怎么写好一份 workflow"的内容，天然归入按需下发的 schema 详情，不需要常驻——常驻的判断入口只负责让 agent 想起来调用 `describe_workflow_schema`，具体怎么写是那次调用返回后才用得上的信息（呼应第 4.1 节的收窄）。
- 执行时的偏差依赖 [definition-schema.md](definition-schema.md) 已有的容错机制兜底：`fresh` stage 产出不理想会被后续 `gate`（`expr`/`human`）拦下，走 `next.fail` 的回边重试——这是 workflow 自身状态机设计已经覆盖的风险，不需要叠加新的语言层检测。
- 作为人工审阅的最后一道防线，见第 8.2 节：确认卡片必须完整展示 YAML 全部内容（含每个 stage 的 `prompt` 原文），不允许折叠摘要。

### 6.3 `context: inherit` 与生成/触发的关系

`context: inherit` 在 definition schema 中仍是合法结构，但 Phase 2 首版不执行它。Proposal 可以保存包含 `inherit` 的 definition，确认 IPC 也不因为该字段扩展自己的事务或执行策略；真正调用 `trigger_workflow` 时，runtime preflight 返回带 stage 定位的 unsupported 错误，不创建或推进 Run，不新增 workflow ChatTurn kind，也不扩展 `ChatTurnGate`。

未来如果实现 inherit，必须另起设计讨论，重新定义 ACP handle 复用、消息归属、队列/优先级、取消、重启恢复和幂等语义。本阶段只保留 schema 与人工审阅能力，不把“相对触发者”的潜在语义写成 Phase 2 的可执行承诺。

---

## 7. 确认流程与 run 状态机

### 7.1 确认动作本身：Renderer → Main IPC，只落盘，不创建 Run

`propose_workflow` 校验通过后只完成第 3.2.1 节的 session-owned proposal 落盘，内容还没有成为 session/workspace 正式 definition，也没有 Run。用户在确认卡片上点击“仅本次执行”（写入 session，随后由 Agent 触发执行）或“保存为可复用并执行”（写入 workspace，随后由 Agent 触发执行）后：

1. Renderer 发起一次 owner-scoped IPC，携带 `proposalId` 和用户最终选择的 `persist`。`yaml`、`mode`、`workflowId` 从 proposal metadata/definition 读取，不由 Renderer 重传；Main 校验 proposal owner、当前状态、schema 基本合法性和 `persist`。
2. Main 按 `mode` 与用户选择的 `persist` 将 definition 写入正式来源：`persist: session` 写入当前 parent session 的 workflow 目录，`persist: workspace` 写入 workspace 正式目录。`mode: create` 在需要时分配新的 `workflowId`；`mode: update` 复用提案中的目标 id。session 与 workspace 的来源语义见第 10 节。
3. 正式 definition 写入成功后，confirm IPC 将 proposal 标记为 `confirmed`，返回有效 `workflowId`，并发送一条 `role: user` 的 system-reminder 给主 Agent，说明 workflow 已落盘并提示调用 `trigger_workflow(workflowId)`。
4. 正式落盘成功后只更新 proposal metadata 为 `confirmed`，保留 `definition.yaml` 和 metadata 到 parent session 删除，以便 owner-scoped `list/getDetail` 返回确定的终态；取消同样只标记 `cancelled`，不依赖删除文件表示完成（第 7.3 节）。

正式 definition 或 proposal metadata 写入失败时，confirm IPC 返回基本的结构化错误，不发送 handoff、不创建 Run；用户可在修复原因后再次确认。Phase 2 不为部分写入、并发覆盖或假想崩溃窗口承诺跨文件补偿、回滚或 reconcile 协议。

同一 proposal 的重复点击只允许一个终态决定生效：已进入 `confirmed` 或 `cancelled` 后，后续相同操作返回当前终态，不再次写入 definition、创建 decision 或发送 handoff；这只是 proposal 级状态保护，不扩展为目标 workflow 的并发锁。

确认只代表用户接受 definition 并选择落盘范围，不代表 Run 已创建。若应用在 definition 落盘、handoff 或后续 Run 创建前退出，已落盘的 workflow 仍是有效事实；重启后用户让 Agent 再次调用 `trigger_workflow` 即可：没有 Run 时创建，已有但未开始的 Run 时启动，进行中的 Run 按持久化 stage 进度继续，不重放已完成 stage。Phase 2 不为这些故障窗口增加跨文件事务、target 锁或 backup/restore 协议。

### 7.2 用户关闭 UI / 无操作

不新增超时或自动丢弃机制。用户尚未点击确认时，session-owned proposal 目录中的 metadata 保持 `pending` 状态，用户下次回到该 session 仍能通过 owner-scoped `list/getDetail` 看到待确认卡片，不需要为"生成后未确认"这一场景单独设计过期策略。

### 7.3 用户点击"取消"：结果如何回传给 Agent

用户选择"取消"时：

- Main 将 proposal metadata 标记为 `cancelled`，不写入任何 session/workspace 正式 definition，不创建 Run。proposal record 可以保留到 parent session 删除，不设置任意 TTL，以便 list/detail 返回确定的终态。
- cancel 写入 `workflow-decisions/<proposalId>.json` decision record，使用现有的 `pending/dispatched/delivered/delivery_unknown/suppressed` notification 状态，由 Main 负责 claim 和投递。Renderer 不直接 claim。
- Agent 通过一条用户不可见的 `role: user` `<system-reminder>` 获知提案已取消；提醒内容不携带新的 workflow 执行指令。当前 ChatTurn 忙碌时保持 pending，释放后按既有 notification 机制重试；重启不自动重投 dispatched 记录，parent 删除将 pending 转为 suppressed。

### 7.4 决策提醒：复用现有 notification 投递

**现状**：`fyllo-spawn` 已有 owner-scoped durable notification outbox 和 `ChatTurnGate`（`src/main/services/session/chat/chat-turn-gate.ts:14`）。它通过 `claimSpawnNotificationTurn`/`executeNotificationTurn`（`chat-turn-service.ts:344`/`:251`）在 turn 空闲时投递 reminder，忙碌时保持 pending，释放后再尝试。这套 `notification` turn 语义与 workflow cancel reminder 相同，可以直接复用。

Phase 2 只增加一个 workflow decision service/adapter：它负责读取 `workflow-decisions/<proposalId>.json`、构造取消 reminder，并调用现有 Main notification 投递路径。workflow decision 使用已有 `notification` turn kind，不新增 `workflow` ChatTurn kind，不要求扩展 `SessionOwner`，也不把 spawn 与 workflow 强行合并为一个新公共协议。

如果实现过程中发现 spawn 与 workflow 之间存在稳定、可复用的重复代码，可以在保持现有行为的前提下做薄适配或等价重构，但“抽象通用排队服务”不是 Phase 2 proposal 的前置 blocker。这样可以避免为了一个取消提醒先引入新的队列、所有权或生命周期契约。

**可验证边界**：cancel decision 在 Main 生成并持久化；Renderer 只能提交 owner 与 opaque decision/notification id；Main 按现有 gate/notification 规则投递，保证 pending、重启和 parent 删除状态转换，不复制 ACP event switch。

---

## 8. 确认卡片：UI 形态

本节结论定位是**视觉/交互设计规范**，供实现阶段对照，不代表现在就要动手写组件。实现顺序仍是 Phase 1 运行时地基（run 状态机、`fyllo-workflow` MCP server、`workflow:run:*` 的 wake+pull channel）先落地，UI 卡片在有真实数据源之后再接入——现在讨论只是提前把视觉/交互方案定下来，避免运行时接近完成时才回头设计 UI、来回返工。

### 8.1 组件关系：同一组件的两种状态，不是两个组件；但两态背后是两种不同的数据源

审阅态（确认卡片）与运行态（run 状态展示）是**同一个组件的两种状态**，共享同一套 stage 拓扑布局，只是叠加/切换不同的信息层——审阅态的 stage 圆点是中性描边+kind 图标（agent/action/wait），运行态的圆点按 stage 实际状态换色（未执行灰色暗淡、执行中描边高亮+loading、已完成实心打勾、失败态红色叉）。

**为什么不做成两个独立组件**：用户从"审阅生成的 YAML"到"点击确认"到"看着它运行"是一条连贯的体验流——如果 UI 上审阅完之后卡片消失、换一套完全不同的组件重新渲染一遍相同的拓扑信息，会在本该连贯的体验里制造一次不必要的视觉跳变，用户还得在新组件里重新建立一次"这个 workflow 长什么样"的心智模型。

**审阅态与运行态的数据源不是同一个类型**：审阅态展示的是第 3.2.1 节的 session-owned proposal（`workflow-proposals/<proposalId>/definition.yaml` 及其 metadata），此时 Run 尚未创建，不存在 `WorkflowRunSnapshot`；运行态展示的是 Phase 1 定义的 `WorkflowRunSnapshot`，只在后续 `trigger_workflow` 成功创建 Run 之后才存在（第 7.1 节）。组件在两态之间切换时，本质是切换底层订阅的数据源（proposal detail → Run snapshot），而不是同一份数据随状态字段变化；实现时必须显式处理数据源切换，不能假设两态共用同一个 `getDetail` 返回结构。

### 8.2 布局：竖向时间线，底部固定操作栏

- Stage 拓扑用竖向时间线展示（从上到下排列，圆点+竖线连接），不用横向流程图。理由：确认卡片可能挂载在对话流内联或侧边栏这类宽度受限的容器（第 8.4 节），竖向布局天然适应窄容器，且与项目已有的消息流、列表类 UI 语汇一致，不需要引入横向滚动这种新交互模式。
- 确认/取消操作固定在卡片底部，不随内容滚动。理由：第 8.3 节要求完整展示 YAML 全部字段，内容可能较长，如果操作区跟着内容走，用户需要划到底才能操作；固定操作栏保证决策入口始终可达。审阅态操作栏是"取消 / 仅本次执行 / 保存为可复用并执行"三个按钮；两个确认按钮只决定 definition 的 session/workspace 落盘范围，随后由 confirm handoff 让 Agent 调用 `trigger_workflow`，不是在卡片 IPC 中直接执行。运行态收窄为一个"查看详情"入口，不需要重复暴露确认语义。

### 8.3 展示内容：完整、不折叠

确认卡片必须完整展示这份 workflow YAML 的**全部字段**，不只是 `prompt`，包括 stage 拓扑、每个 `ActionOp` 的具体内容（尤其 `exec`/`webhook` 的命令/URL 原文）、`confirm`/`idempotencyKey` 等所有字段，不允许折叠摘要。

**为什么不做摘要或额外预告**：命令字符串本身无法在不理解意图的情况下机械判断危险性（`rm -rf /tmp/foo` 安全、`rm -rf /` 危险，纯文本模式匹配拦不住变体又会误伤合法用途），这与"prompt 指代词黑名单"是同一类脆弱机制，Phase 2 不引入。唯一能兜底的就是让人真正看到完整内容——任何折叠、摘要、或额外生成一段"这个 workflow 会做什么"的自然语言总结，都是在原文之外制造一层可能失真的转译，反而在用户与真实内容之间引入审阅盲区。UI 只需要如实、完整地渲染 YAML 内容。

审阅态应重点高亮 `exec`/`webhook` 类型且 `confirm` 非 `true`（即显式 `false` 或未声明）的步骤（如角标"自动执行，不再确认"）——这类步骤一旦这次生成被确认、沉淀为可复用资产，未来每次执行都不会再弹出人工确认，这次审阅是它们被人看到的唯一机会，理应获得最高的注意力优先级。反之 `confirm: true` 的步骤运行时本身还会再触发一次 `awaiting_gate_decision` 式的人工确认（见 Phase 1 `ActionStage` 的 `confirm` 语义），此刻是否看漏代价较低，不需要额外的 UI 标记——两种状态都高亮等于没有高亮，用户无法一眼分辨"必须现在看清楚"和"以后还有机会看"的区别。同理，`gate.human` 的决策提示文案（`Gate.prompt` 字段）直接展示在对应 stage 下方，让用户提前知道后面会出现决策点，不是等跑到那一步才第一次看到。

### 8.4 挂载位置：`ChatBackgroundActivityBar` 双入口，保持 Phase 1 兼容

Proposal 与 Run 都挂载在 `ChatBackgroundActivityBar`，作为两个独立的 sibling entry：`WorkflowProposalActivityEntry` 展示 pending/confirming proposal，`WorkflowRunActivityEntry` 展示 Phase 1 Run。Phase 2 不把 Run 迁移到 `ChatEventRail`，不新增 EventRail contributor、attention 聚合或 overflow 协议。

Proposal entry 可以使用现有 ActivityBar 的入口与展开表面承载完整审阅内容；如果卡片内容较长，使用同一入口打开的详情面板或滑层，不改变 owner、store 或数据来源。完整展示要求属于卡片内容契约，不要求引入新的 EventRail 容器。

proposal 与 Run 可以共享卡片视觉骨架，但不共享同一份 store、owner 或生命周期。Proposal 在确认前展示 proposal detail；确认后由 `trigger_workflow` 创建 Run，Run entry 再从 Phase 1 的 Run 数据源读取状态。这样无需迁移 Phase 1 `WorkflowRunActivityEntry`，也不会把 proposal 文件伪装成 Run snapshot。

**`AgentStage(context: fresh)` 子 session 入口**：fresh session 对应 workflow 卡片时间线上的一个 `AgentStage` stage，点击该 stage 行可在同一张卡片内展开转录摘要，不另造 workflow turn 或 EventRail 入口。

允许同一 session 存在多个 pending proposal，不在 Phase 2 预先引入强制单队列、置顶/折叠或任意 TTL。若实际接入后发现 ActivityBar 入口难以发现，再另行设计 UI attention 机制；该问题不阻塞本阶段 proposal。数据获取链路统一走 wake + pull：`propose_workflow` 写入 session-owned proposal 后发 proposal wake，Renderer 通过 owner-scoped list/detail 拉取；`trigger_workflow` 创建或推进 Run 后发 Run wake。

### 8.5 运行态细节：gate 决策、回边、执行详情

- **gate.human 决策**：需要人工决策的 gate（`awaiting_gate_decision`）时，决策交互（提示文案 + pass/fail 按钮）直接嵌在运行卡片对应 stage 位置，不引导用户跳转到独立决策面板。理由：与 Phase 1 wake+pull 设计"减少用户操作路径长度"的目标一致，用户点开卡片就能直接决策。
- **回边/循环**：`maxLoops` 相关的回边（fail 走回头）在竖向时间线主干旁用虚线+箭头回指目标 stage，并标注"循环 N/M"。由于纯图形的弯箭头在竖向窄容器里视觉上不够醒目，失败态的 stage 说明文字应同时用文字冗余提示（如"失败，回到「实现」重试"），不单纯依赖图形连线让用户理解发生了什么。
- **执行详情展开**：`context: fresh` 的 AgentStage 执行中或已完成时，点击该 stage 行可在**同一张卡片内**行内展开/折叠一段子区域，显示对应子 session 的转录摘要，不跳转到独立页面或另开窗口。这是运行卡片"查看详情"入口的具体交互形态（呼应第 8.2 节），也与 Phase 1 第 5.1 节"fresh stage 用户可见、可点进去看"的透明度目标一致，只是用行内展开代替另开一个详情页/slideover。

### 8.6 实现参照

@nuxt/ui v4（当前项目使用 v4.10.0）自带 `UTimeline` 组件，支持 `orientation: "vertical"`，`items` 数组含 icon/title/description，并提供 `indicator`/`wrapper` 插槽支持自定义状态图标——第 8.1/8.2 节描述的骨架可以直接基于 `UTimeline` 搭建，不需要手工拼接 div+边框线。回边虚线（第 8.5 节）`UTimeline` 本身不直接支持，需要额外叠加一层 SVG 或绝对定位连线，属于局部小组件，不影响整体骨架选型。

---

## 9. 检索复用：复用 `list_workflows`，只补 `workflowId` 一个字段

### 9.1 结论

Agent 在生成前，先调用 Phase 1 已有的 `list_workflows`，自行判断是否有可直接复用、或值得在已有基础上更新的既有 workflow。这一步引导写在 `describe_workflow_schema` 返回内容里（第 3.1 节），作为"生成前先做什么"的第一条指引，不需要额外常驻。**不引入关键词/tag/embedding 检索机制**，也不扩展 `requires`、stage 数量概览这类"帮助判断要不要用"的字段——这部分结论不变，理由见第 9.2 节。

唯一的例外是 `workflowId`：`list_workflows` 原本只返回 `name` + `description`，现在需要补上 `workflowId`。这不是重新打开"要不要做检索基础设施"这个已经关闭的问题，而是第 3.2 节 `propose_workflow(mode: "update", workflowId)` 带来的硬性前提——agent 若要合法地表达"更新这一个既有 workflow"，必须先有渠道拿到它的 `workflowId`，而 `list_workflows` 是 agent 唯一能查询到 workspace 正式资产的入口。`workflowId` 是**定位标识**，不是**帮助判断候选是否相关**的元数据，与 9.2 节"不扩展检索用字段"的结论针对的是两类不同性质的字段，不矛盾。

Proposal 的 owner context 由 Main/MCP 自动注入，不由 Agent 传入 `sessionId`。session workflow 不进入 workspace `list_workflows`；确认成功后的 `role: user` handoff 会提供本次有效 `workflowId`，供 Agent 调用 `trigger_workflow`。如当前 session 与 workspace 存在同一 `workflowId`，`trigger_workflow` 按 session → workspace 的顺序解析，Run snapshot 记录命中的 definition source/provenance。

### 9.2 为什么不做更多

- `list_workflows` 的 `name`/`description` 本身就是为人类和 agent 都可读的自然语言设计的，人写 description 时天然会把适用场景写进去（类比函数注释），agent 生成时在 `describe_workflow_schema` 里提出同样要求即可，不需要额外的结构化元数据。
- workflow engine 是"深不广"的功能（参照 [[dynamic-workflow-engine-scope]]，退出摩擦的定位是先在少数高频动作上做扎实），可预见的 workflow 库数量级是几个到几十个，远没到需要检索基础设施才能解决"候选集过大"的规模。在问题真正出现之前引入这类设施，是这次讨论中反复出现的"不为不存在的问题背负担"原则的又一次应用（与 Phase 1 不引入 Temporal/XState 的论据一致）。
- 若未来 workflow 库规模增长到确实需要更精细的检索，这属于 Phase 3（"规模化"）的范畴，不是 Phase 2 需要预先解决的。

### 9.3 session 级临时 workflow 不参与检索

用户选择"仅本次执行"（`persist: "session"`）时，这份 workflow **不会**被 `list_workflows` 检索到（`list_workflows` 只列出 workspace 正式目录下的资产）。若同一 session 后续又出现类似需求，agent 会重新生成一次，即使内容与之前几乎相同——这是可接受的：

- "仅本次"这个选择本身就是用户当时判断"这次不值得被记住"的信号，重复生成的成本（一次 tool call）远低于为一次性用例设计跨 session 检索的复杂度。
- 如果用户发现自己确实反复需要同一个 workflow，那正是"保存为可复用"这个选项存在的意义，不需要引入额外机制替用户做这个判断。

---

## 10. 沉淀路径：确认后的正式落盘与 create/update 的语义

### 10.1 正式落盘发生在用户确认之后，由 IPC 触发，路径由主进程内部决定

延续第 7.1 节：`propose_workflow` 校验通过后只把内容写入 session-owned proposal 目录（第 3.2.1 节），**不涉及 `create`/`update`、`session`/`workspace` 的正式路径分支**。这些分支只在用户点击确认、Renderer 发起 owner-scoped IPC 之后才由 Main 执行。此时的 `persist` 是用户在确认卡片上点击的按钮对应的值，不是 Agent 调用 `propose_workflow` 时提交的建议值：

- `mode: "create"`：内部分配新 `workflow-id`，按用户选择的 `persist` 写入：
  - `persist: "session"` → `appData/workspaces/<workspace-id>/sessions/<session-id>/workflows/<workflow-id>.yaml`（Phase 1 第 8 节已预留此路径）
  - `persist: "workspace"` → `appData/workspaces/<workspace-id>/workflows/<workflow-id>/definition.yaml`（Phase 1 正式资产路径）
- `mode: "update"`：直接复用提案里记录的 `workflowId`，不重新分配 id。基本校验只要求该 id 能在当前 owner 的 session definition 或 workspace 正式 definition 中解析到；实际写入目标由用户最终选择的 `persist` 决定：
  - `persist: "session"` → 新内容写入 `appData/workspaces/<workspace-id>/sessions/<session-id>/workflows/<workflow-id>.yaml`（**同一个** `workflow-id`，但落在 session 目录），workspace 正式目录下的原 `definition.yaml` 此时不受影响。语义是"基于既有 workflow 改了一版，这次只临时跑跑看，不覆盖原资产"。
  - `persist: "workspace"` → 直接覆写 workspace 正式目录下同一 `workflow-id` 的 `definition.yaml`。语义是"这次修改就是要成为这份 workflow 的新版本"。

  这组语义的推论是：**`mode: "update"` 场景下 `persist` 的含义从"要不要沉淀一份新资产"变成"这次改动要不要覆盖原资产"**——不管选哪个，`workflow-id` 都不变，区别只在于是否已经覆盖 workspace 正式文件。这与 `mode: "create"` 下 `persist` 决定的是"全新内容存不存"是两种不同的问题，但复用同一个参数名不引入歧义：两种模式下 `persist: "session"` 都表示"这次落盘只到 session 目录，workspace 正式目录不变"，`persist: "workspace"` 都表示"这次落盘会（新建或覆盖）workspace 正式目录"，参数语义本身是一致的。

  无论 `create`/`update`，正式落盘成功后只将 proposal 标记为 `confirmed` 并发送 handoff；不在 confirm IPC 中创建 Run。proposal metadata/definition 可保留到 parent session 删除，Agent 全程不接触任何具体文件路径，第 3.2 节提交的 `mode`/`workflowId` 是硬性语义标记，`persist` 只是建议值，路径拼接完全由 Main 内部完成，且最终以用户在确认卡片上的选择为准。Run 由后续 `trigger_workflow` 创建或恢复。

### 10.2 `persist: "session"` 不提供事后补沉淀的入口

`persist: "session"` 一旦在确认时被用户选定，这份 workflow 就是纯粹的一次性产物：不提供"用户后来改主意，把已经在 session 目录里的 YAML 挪到 workspace 正式目录"这类独立的事后操作入口。如果用户运行完才发现这份 workflow 值得复用，唯一路径是让 agent 重新走一次生成流程——针对同一份内容调用 `propose_workflow(mode: "update" 或 "create")`，重新经过一次确认卡片，这次在卡片上点击"保存为可复用并执行"。

**为什么不额外做一个事后沉淀入口**：`persist` 的最终取值由用户在确认卡片上点击哪个按钮决定（第 3.2 节），确认即定案。如果确认过后还允许绕开这套"生成→确认卡片→用户选择"的流程、单独用一个 IPC 把 session 产物"转正"，就相当于给同一份内容开了第二条落盘路径，且这条路径不再让用户看一次完整的 YAML 确认卡片——这与第 8.3 节"完整展示、用户必须看清楚要落地的内容"的要求是矛盾的：重新走一次确认流程，用户看到的是当下真实要保存的内容；直接挪文件则可能让用户凭对"当初跑过一次"的模糊印象做决定，跳过了本该有的再次审阅。重新生成一次的成本只是一次 tool call，换来的是内容再次经过完整确认，这个代价是值得的。

### 10.3 更新既有 workflow：靠确认卡片提示，不设额外冲突拦截

`mode: "update"` 的目标由 `workflowId` 和当前 owner context 定位。目标可以是 workspace definition，也可以是当前 session shadow；proposal 阶段只需完成基本存在性和参数形状校验，不增加“目标正在运行所以不能提案”的前置冲突门槛。

`mode: "update"` 的确认卡片除了 8.3 节要求的“完整展示 YAML 全部字段”外，还必须明确提示“这是对已有 workflow『{name}』（`workflowId`: `{workflowId}`）的更新”。

- 当用户选择 `persist: session` 时，只更新当前 session shadow，不影响 workspace 正式 definition；
- 当用户选择 `persist: workspace` 时，更新 workspace 正式 definition。若目标只存在于 session shadow，则该选择返回基本的目标不存在/不可升格错误，不自动复制或升格；
- 当 workspace definition 正在被 Run 使用时，是否允许覆盖不在 propose 阶段另设冲突 UI；实际执行仍由 `trigger_workflow` 的 active Run 规则和 Run snapshot provenance 约束。
- 多个 proposal 同时更新同一 workspace target 时，按 Main 实际完成写入的顺序采用后写覆盖；Phase 2 不引入 revision/CAS、target 锁或冲突合并协议。Run 使用的是已创建 snapshot，不因后续 definition 覆写而改变。

### 10.4 Proposal 与 session definition 的生命周期

Proposal、decision record 与 session definition 都属于 workspace 下当前 session 的持久化状态，但生命周期和作用不同：

- **Proposal 目录**：`workflow-proposals/<proposalId>/definition.yaml` 与 `.meta.json` 是 session-owned transient state。confirm/cancel 后 metadata 分别进入 `confirmed`/`cancelled`，可以保留到 parent session 删除，不设置任意 TTL；parent session 删除时级联清理 proposal、decision record 和 session definition。
- **`persist: "session"` 的正式 definition**：写入 `appData/workspaces/<workspace-id>/sessions/<session-id>/workflows/<workflow-id>.yaml`，是已经生效的 session shadow，随 session 生命周期存在，不进入 `list_workflows`，也不提供自动升格到 workspace 的入口。若以后要复用或覆盖 workspace，Agent 重新走 `propose_workflow` 和确认卡片。
- **`mode: "update"` + `persist: "session"`**：可以使用与 workspace definition 相同的 `workflowId`，只更新当前 session shadow，不影响 workspace 正式 definition。Run snapshot 必须记录实际命中的 source/provenance；session definition 删除后历史 Run 仍保留并显示定义缺失/已变更，不静默改用另一来源。

---

## 11. `fyllo-workflow` MCP server：Phase 2 工具集

Phase 2 上线后，`fyllo-workflow` MCP server（`transportPolicy: "http-only"`，通过 Node `child_process` IPC 桥接到主进程）共提供四个工具。本节完整列出全部四个，其中两个是本阶段新增，另外两个是运行时已有能力的延续，一并列出是为了让本文档单独阅读时就能看清 Phase 2 上线那一刻 agent 实际可用的完整工具面，不需要跳去别处拼凑。

### 11.1 `list_workflows`（延续能力，返回值本阶段有扩展）

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

- 只列出 workspace 正式目录（`appData/workspaces/<workspace-id>/workflows/<workflow-id>/definition.yaml`）下已保存的 workflow，每次调用实时读取磁盘当前状态，不做静态快照缓存。
- `name`/`description` 取自 workflow YAML 顶层字段，供 agent 判断是否有可复用、或值得更新的既有 workflow（第 9.1 节）。
- 本阶段在原有基础上新增 `workflowId` 字段：`mode: "update"` 调用 `propose_workflow` 时必须提供目标 `workflowId`，而 `list_workflows` 是 agent 唯一能查询到这个 id 的入口（第 9.1 节）。

### 11.2 `trigger_workflow`（执行入口与运行时能力校验）

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
  reason: string;  // 如"已有 workflow 在运行"、"workflowId 不存在"、"WORKFLOW_FEATURE_NOT_IMPLEMENTED"
  details?: Array<{ rule: string; path?: string; detail: string }>;
}
```

- 只接受 `workflowId`，不接受 YAML 内容。Main/MCP 从可信 caller context 自动获得 `workspaceId` 和 `parentSessionId`，不接受 Agent 自报的 owner；定义解析按当前 session shadow → workspace 正式 definition 的顺序进行。
- 在创建新 Run、启动尚未执行的 Run 或恢复进行中的 Run 前，执行 Phase 1 execution-profile 和当前上下文 preflight。合法但未实现的 `inherit`、WaitStage、非 `exec` Action、非 `human` Gate、非 `freeform` produces、`retry`、`idempotencyKey` 或不满足 requires/template 约束的 definition 返回结构化 unsupported，不启动 ACP/Action，也不创建新的 Run。
- 没有 Run 时，校验通过后创建 Run；若 `confirmStart: true`，返回 `awaiting_start_confirmation` 并由既有 Run 决策流程等待用户批准，若为 `false` 或未声明则进入 `running`。
- 已有 Run 但尚未真正执行时，再次调用会按其状态处理：若仍是 `awaiting_start_confirmation`，返回既有等待状态并沿用 Phase1 的用户批准流程；若已获准但尚未开始，则启动该 Run。Run 执行到一半后再次调用会读取持久化 stage 进度继续推进，不重放已完成 stage。已有同一 `{workspaceId,parentSessionId}` 的 active Run 时返回结构化 `WORKFLOW_RUN_CONFLICT`，不创建第二个 Run。
- Run snapshot 沿用 Phase1 的完整 inline `frozenDefinition`，并记录实际命中的 definition source/provenance；session definition 删除后历史 Run 仍可查看并显示定义缺失/已变更，不静默改用 workspace definition。

### 11.3 `describe_workflow_schema`（本阶段新增）

无副作用的信息查询工具，返回 workflow YAML 的 schema 骨架：`WorkflowDefinition`/`Stage`（`AgentStage`/`ActionStage`/`WaitStage`）/`ActionOp`/`Gate`/`ArtifactSpec`/`Transition` 的字段与语义、解析期校验清单，并明确当前 Phase 2 只在 `trigger_workflow` 运行前对未实现能力做 runtime preflight。

```ts
describe_workflow_schema(input: {
  withExamples?: boolean;  // 默认 false，附带完整 YAML 示例
}): {
  schema: string;  // markdown 全文
}
```

- schema 内容体量大且只有 agent 真正要生成/更新 YAML 时才用得上，因此不常驻 system prompt，改为按需调用换回来（第 3.0 节）。
- 只用一个 `withExamples` 布尔量控制"要不要更多示例"，不做模块化参数查询——schema 各部分强耦合，拆模块只增加往返次数、不减少信息量（第 3.1 节）。
- 返回内容里应包含"生成前先查 `list_workflows` 判断是否有可复用/可更新的既有 workflow"（第 9.1 节）、"prompt 需自包含、不依赖当前对话隐含前提"（第 6.2 节）等写作指引。
- 返回内容应把“schema 合法、当前不可执行”的定义与“schema 非法”的定义区分开：前者允许进入 proposal，后者由 `propose_workflow` 直接返回结构化错误；`trigger_workflow` 才是执行前能力校验的唯一入口。

### 11.4 `propose_workflow`（本阶段新增）

生成提交工具，Agent 通过它提交新生成或更新的 workflow YAML，供用户确认。**这个 tool 只做基本校验和 session-owned proposal 落盘，不创建 Run，也不写入 session/workspace 的正式 definition**——真正生效以用户点击确认卡片后由 Renderer 发起的确认 IPC 为准。

```ts
propose_workflow(input: {
  yaml: string;           // workflow YAML 全文
  persist: "session" | "workspace";  // agent 对落盘目标的建议值，用户确认时可改选
  mode: "create" | "update";  // 必填，无默认值
  workflowId?: string;    // mode: "create" 时必须省略；mode: "update" 时必填
}): {
  status: "accepted";
  proposalId: string;    // 临时提案标识，不是 runId——run 此刻尚未创建
} | {
  status: "rejected";
  errors: Array<{ rule: string; detail: string }>;  // 结构化校验错误
}
```

- **基本校验**：先执行 workflow YAML 的解析期结构校验（stage 拓扑、`goto` 引用、`maxLoops`、模板变量命名空间等），失败直接返回 `status: "rejected"` 与结构化错误列表，不落盘、不触发 wake，Agent 在同一轮对话里自行修正后重新调用。再校验 `mode`/`workflowId`/`persist` 的形状：`mode: "create"` 时 `workflowId` 必须为空；`mode: "update"` 时 `workflowId` 必填，并且能在当前 owner 的 session definition 或 workspace 正式 definition 中解析到；`persist` 必须是 `session` 或 `workspace`。这些是提案阶段的基本校验，不执行完整 execution-profile preflight，也不在这里检查 active Run 冲突。
- **schema 合法但暂不支持执行的 definition**：`context: inherit`、WaitStage、未实现的 Action/Gate、`retry`、`idempotencyKey` 等只要符合 definition schema，就可以进入 proposal。是否能在当前运行时执行，统一由 `trigger_workflow` 在创建、启动或恢复 Run 前判断（第 5.2 节和第 11.2 节）。
- **校验通过后的 session-owned 落盘**：把 YAML 原文和 `mode`/`workflowId`/Agent 建议的 `persist` 写入第 3.2.1 节的 `sessions/<parent-session-id>/workflow-proposals/<proposal-id>/{definition.yaml,.meta.json}`，并触发独立 proposal wake。Proposal 不是 workspace 正式资产、session 已生效 definition 或 Run snapshot；应用重启后仍由 owner-scoped `list/getDetail` 发现。终态 metadata 保留到 parent session 删除，不用删除文件表示完成。
- **用户点击确认**：确认卡片固定展示“取消 / 仅本次执行 / 保存为可复用并执行”三个选项，无论 Agent 建议的 `persist` 是什么，用户都能选择最终范围。Renderer 只携带 `proposalId` 和用户选择的 `persist`；Main 从 proposal 读取 `yaml`/`mode`/`workflowId`，重新做 owner、状态、schema 和 `persist` 基本校验，然后按第 10 节写入 session 或 workspace 正式 definition。成功后标记 proposal 为 `confirmed`，返回 `workflowId`，并发送 `role: user` system-reminder 提示主 Agent 调用 `trigger_workflow`；确认 IPC 不创建 Run、不分配 `runId`、不等待执行。
- **用户点击取消**：不写入任何正式 definition、不创建 Run；Main 将 proposal 标记为 `cancelled`，写入 session-owned `workflow-decisions/<proposalId>.json`，通过现有 notification outbox 投递用户不可见的 `<system-reminder>` 告知 Agent 提案被否决。Proposal 与 decision record 按第 7.3 节保留到 parent session 删除。
- 无论 `create`/`update`，Agent 全程不接触具体文件路径，只表达 `mode` 与对 `persist` 的建议；owner、路径、来源解析和 Run provenance 均由 Main/MCP 根据可信 caller context 决定。

### 11.5 workflow engine 内部创建 fresh 子 session 不经过 MCP

`AgentStage(context: fresh)` 的子 session 由 workflow engine 在主进程内部直接创建（调用底层会话管理能力），不经过 `fyllo-workflow` 这层 MCP 协议——这是主进程调度代码之间的调用，不是"agent 发起一次 tool call"，不属于本节工具集范围。

---

## 12. 验收标准（粗粒度）

不追求 scenario 级别的完整性，只列 proposal 应该覆盖的验收方向，具体 scenario 由写 proposal 的 agent 展开，风格与 [phase1-execution-design.md](phase1-execution-design.md) 第 11 节一致。

1. `describe_workflow_schema` 能返回 [definition-schema.md](definition-schema.md) 第 1-9 节的骨架内容，并明确“schema 合法不等于当前运行时可执行”；`withExamples: true` 时额外附带第 10 节的完整 YAML 示例。
2. `propose_workflow` 对不满足 [definition-schema.md](definition-schema.md) 第 9 节解析期规则，或不满足 `mode`/`workflowId`/`persist` 基本组合的请求，返回 `status: "rejected"` 与结构化错误列表，不创建 proposal、不写入正式 definition、不触发 wake。
3. `propose_workflow` 的 owner 必须由可信 Main/MCP caller context 注入；`mode: "create"` 不接受 `workflowId`，`mode: "update"` 必须能在当前 session shadow 或 workspace 正式 definition 中解析到目标。跨 session/workspace 的 proposal 或 update 请求必须被拒绝。
4. schema 合法但超出当前 execution profile 的 definition（如 `context: inherit`、WaitStage、未实现的 Action/Gate、`retry` 或 `idempotencyKey`）可以写入第 3.2.1 节的 session-owned proposal 目录并触发独立 wake；proposal 不出现在 workspace `list_workflows`，也不直接成为 Run。
5. 应用重启后，尚未确认的 proposal 仍可由当前 session 首次 `list` 发现并通过 `getDetail` 拉取；同一 parent session 的多个窗口共享它，跨 owner 不可见。confirm/cancel 后 metadata 与 definition 保留终态，parent session 删除时级联清理。
6. Renderer 收到 wake 后 `getDetail` 拉取到的是 proposal detail（不是 `WorkflowRunSnapshot`，见第 8.1 节）；确认卡片完整展示 YAML 全部字段、不折叠，`exec`/`webhook` 且 `confirm` 非 `true` 的步骤有醒目标记；`mode: "update"` 的卡片标注目标 workflow 名称和 `workflowId`。Proposal 与 Run 均作为 `ChatBackgroundActivityBar` sibling entry，不要求 EventRail 迁移。
7. 用户点击“仅本次执行”或“保存为可复用并执行”时，confirm IPC 使用当前窗口绑定的 owner context（不由 Agent 自报或 Renderer 任意改写），并携带 `proposalId` 和最终 `persist`；Main 重新执行基本 owner/state/schema/persist 校验并将 definition 写入第 10 节规定的 session 或 workspace 来源；成功后标记 proposal 为 `confirmed`、返回 `workflowId`，发送 `role: user` handoff 提示主 Agent 调用 `trigger_workflow`，且不创建 Run、不分配 `runId`、不等待执行。重复操作只返回已有终态，不重复产生副作用。
8. `trigger_workflow` 从 session shadow → workspace 正式 definition 解析来源，并在创建、启动或恢复 Run 前执行 runtime preflight；unsupported 返回结构化 rule/path/detail，不启动 ACP/Action、不创建或推进不支持的 Run。无 Run 时创建；已有 `awaiting_start_confirmation` 时保持等待并沿用用户批准；已获准但尚未开始时启动；进行中按持久化 stage 进度继续，不重放已完成 stage；active Run 冲突按 Phase1 规则返回。成功创建的 Run 沿用 Phase1 完整 inline `frozenDefinition` 并记录 source/provenance。
9. 用户点击“取消”时，Main 不写入正式 definition、不创建 Run，标记 proposal 为 `cancelled`，写入 session-owned `workflow-decisions/<proposalId>.json`，并通过现有五状态 notification outbox 与 `ChatTurnGate` 投递不可见 reminder；busy、重启、parent 删除的状态转换遵循第 7.3/7.4 节。
10. 端到端跑通“生成 → review → confirm 落盘 → role:user handoff → trigger 执行/恢复 → list 复用”：`mode: "create"` 能创建 workspace asset，`mode: "update"` 能更新 session shadow 或 workspace asset，Run snapshot 记录实际 definition source/provenance，后续复用不会因 session shadow 与 workspace 同 ID 而读错来源。

---

## 13. 待后续讨论的问题

- 多个 pending proposal 同时存在于 `ChatBackgroundActivityBar` 时，如何提高入口的可发现性（置顶、折叠或 attention 标记均留到有真实使用数据后再评估，不改变本阶段 owner、store 或生命周期）。
- `context: inherit`、WaitStage、非 `exec` Action、非 `human` Gate、`retry`/`idempotencyKey` 等能力的运行时实现；在实现前必须另起设计，不能把本阶段“schema 可保存、trigger 拒绝”误读为已支持。
- `gate.type: human` 决策表单、WaitStage 等待信号在运行卡片上的具体字段/交互细节（第 8.5 节只定了“嵌入卡片、不跳转”这个方向，具体表单形态未展开）。
- 若未来需要更强的 cwd/env/网络隔离、definition 版本迁移或跨文件恢复保证，另起安全/可靠性增强设计，不回填为本阶段 confirm 或 propose 的隐含前置条件。

---

## 14. 参照代码位置

供写 proposal / 实现时对照，而非最终真实性保证——本次讨论后代码可能已变化，动手前应重新核对当前代码。

**排队投递机制现状（`fyllo-spawn`，Phase 2 复用现有 notification 路径，见第 7.4 节）**

- `src/main/services/session/chat/chat-turn-gate.ts:14`（`ChatTurnGate` 类，`tryAcquire(workspaceId, sessionId, kind)` 互斥锁，业务无关，可直接复用）
- `src/main/services/session/chat/chat-turn-service.ts:203`（`createRendererChatTurn`，`kind: "user"` 抢锁方）、`:251`（`executeNotificationTurn`）、`:344`（`claimSpawnNotificationTurn`，`kind: "notification"` 抢锁方）
- `src/main/services/session/spawn/spawn-notification-service.ts:44`（`SpawnNotificationService` 单例，`buildReminder` 负责 reminder 文本构造；workflow decision 通过薄适配复用同类投递逻辑）
- `src/main/services/session/chat/session-registry.ts:10`（`SessionOwner` 类型定义；Phase 2 不新增 `"workflow"` owner，workflow proposal/decision 由现有 parent session owner context 绑定）

**Phase 1 已有信道与状态机（Phase 2 直接复用，不重新设计）**

- 见 [phase1-execution-design.md](phase1-execution-design.md) 第 4/6/8 节：`fyllo-workflow` MCP server 结构、wake+pull 展示信道、`WorkflowRunSnapshot` 状态机与存储路径。

**渐进披露参照（`describe_workflow_schema`/`propose_workflow` 的分层设计，见第 3 节）**

- `src/mcp-servers/fyllo-specs/src/tools/create-proposal.ts:34-40`（`includeInstruction` 参数，`description` 里说明"first call 默认带 instruction，后续 follow-up 可关闭"）与 `src/mcp-servers/fyllo-specs/src/tools/instructions/create-proposal.md`（instruction 全文，作为 tool 返回值按需下发而非常驻 system prompt 的先例）
- 本会话已连接的 `visualize` MCP server：`read_me`/`show_widget` 两个工具通过各自 `description` 互相声明调用顺序（"Call before your first show_widget call" / "IMPORTANT: Call read_me before your first show_widget call"），是"双重提醒 + 详情按需查询"这一模式在 MCP tool description 层面的直接参照。

## 15. Proposal 起草清单（无新增 blocker）

后续 Agent 起草 proposal 时，按以下已收敛边界拆分任务即可，不需要再次发明事务协议或等待新的产品选择：

1. **Shared contract**：定义 proposal metadata/detail、owner-scoped list/getDetail/confirm/cancel/wake、session/workspace definition source、Run provenance 和 `trigger_workflow` 的结构化 unsupported 错误。
2. **Main/MCP**：实现 `describe_workflow_schema`、`propose_workflow` 的基本校验与 session-owned 落盘；确认 IPC 只负责基本校验和正式 definition 落盘；`trigger_workflow` 负责 runtime preflight、Run 创建/启动/恢复。
3. **Reminder**：确认成功发送最小 `role: user` handoff；取消使用 session-owned decision record 和既有五状态 notification outbox，不新增 workflow ChatTurn kind 或通用队列。
4. **Renderer**：接入 proposal wake/list/detail 与确认卡片，完整展示 YAML 和 stage-level `confirm` 语义；Proposal、Run 分别作为 `ChatBackgroundActivityBar` sibling entry，store/owner/lifecycle 独立。
5. **Verification**：覆盖 malformed/schema 错误、schema 合法但 runtime unsupported、跨 owner 隔离、重启发现、确认落盘后 handoff、trigger 三种 Run 路径、取消 reminder、session shadow 优先解析和 provenance；不把 target 锁、backup/restore、commit-intent/hash、主动提议阈值或 EventRail 迁移列为本阶段验收前置条件。

以上清单与第 0 节的决策总览一致；如果实现中发现需要改变这些行为边界，应先单独更新设计并重新进行 proposal 范围确认。
