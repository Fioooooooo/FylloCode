# Workflow Engine Phase 2 — Agent 动态生成 + 沉淀复用

状态：draft（讨论结论，未评审）
日期：2026-08-26

本文档记录 workflow engine Phase 2 的架构决策：agent 在对话中动态生成 workflow YAML、生成后的确认流程、沉淀为可复用资产的路径。承接 [phase1-execution-design.md](phase1-execution-design.md) 的运行时地基与 [definition-schema.md](definition-schema.md) 的定义态语义，本文档不重复两者已定的内容，只覆盖 Phase 2 新增部分。

---

## 1. 定位

Phase 1 里 workflow 只能由用户手写（`source: manual`）。Phase 2 让 agent 在对话过程中按 [definition-schema.md](definition-schema.md) 的 YAML schema 动态生成 workflow（`source: agent`），生成后引导用户确认，确认即同意内容并触发执行；用户可进一步选择是否将其沉淀为可复用的 workspace 资产。生成的目标既可以是一份全新 workflow，也可以是对某个已沉淀 workflow 的更新（第 3.2 节 `mode: "create" | "update"`）——这两条路径共享同一套生成、校验、确认机制，只在落盘目标的定位方式上有区别（第 10 节）。

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

`fyllo-workflow` MCP server 新增的生成提交工具（在 Phase 1 已有的 `list_workflows`/`trigger_workflow` 之外）。**这个 tool 只做校验和临时落盘，不创建 run、不写入 session/workspace 的正式位置**——真正的落盘与执行留给用户确认后的 IPC 触发（第 7 节）。

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

**为什么不在 `accepted` 分支返回 `runId`**：`runId` 是 run 状态机的标识，而 run 只应该在用户确认之后才被创建（第 7.1 节）。如果 `propose_workflow` 校验通过就返回 `runId`，等于暗示 run 在这一刻已经存在，"用户确认"就会退化成一个内容已经生效之后才补的、没有实际决定权的仪式动作——用户点"取消"时，到底是在撤销一个从未存在过的东西，还是在终止一个已经跑起来的 run，会变得含糊。因此 `propose_workflow` 返回的是 `proposalId`，对应第 3.2.1 节的临时提案文件；只有用户确认后，Renderer 发起的 IPC 才真正创建 run 并分配 `runId`。

**`persist` 是 agent 的建议值，不是最终定案**：确认卡片底部固定展示"取消 / 仅本次执行 / 保存为可复用并执行"三个按钮（第 8.2 节），无论 agent 在 `propose_workflow` 里传的是 `session` 还是 `workspace`，用户都能点击任意一个——真正生效的 `persist` 以用户点击的按钮为准，随确认 IPC 一起传给主进程（第 7.1 节）。这里保留这个参数的意义在于：agent 需要有渠道表达一个初始建议（比如第 9.1 节"用户直接要求存下来复用"的场景，agent 据此把 `persist` 设为 `workspace`），确认卡片可以用这个建议值决定默认高亮哪个按钮，但不能限制用户的选择——决定权始终在用户，agent 的建议只是体验上的默认值，不是约束。

**为什么 agent 不接触任何文件路径**：无论提案最终被确认为临时用（`persist: "session"`）还是要沉淀（`persist: "workspace"`），落盘位置的拼接逻辑完全在主进程内部完成，agent 只表达"生成/更新了什么内容"和"倾向于怎么持久化"，不涉及"写到哪个具体路径"。这避免了 agent 因幻觉传错路径、或分两步操作（先写文件、再传路径）引入的中间态风险。

#### 3.2.1 校验通过后的临时落盘：只写提案文件，不进入 session/workspace 正式位置

`propose_workflow` 校验通过后，把 YAML 原文（连同 `mode`/`workflowId`/agent 建议的 `persist` 这几个随请求一起提交的参数）写入 workspace 下一个独立的临时区：

```
appData/workspaces/<workspace-id>/.tmp/workflows/<proposal-id>.yaml
```

- `.tmp/` 前缀明确标注这是**未决提案**，不是任何用户资产——既不是 `workflows/` 下的正式资产，也不是 `sessions/<session-id>/workflows/` 下"已经选择只本次执行"的 session 产物（第 8 节）。这条路径与这两类目录平级但语义完全独立：提案在被用户确认之前不构成任何"生效"的内容，纯粹是"等待人工审阅"的暂存态。
- 不直接复用系统临时目录（如 `/tmp`）：应用重启后系统临时目录可能被操作系统清空，而提案对应的 wake 通知、确认卡片状态是持久化在 workspace 下的，如果文件本身在系统重启后消失，会出现"UI 显示有提案待确认、实际找不到内容"的不一致。放在 `appData/workspaces/<workspace-id>/.tmp/` 下，就和其他 workspace 数据一样能跨应用重启存活，同时 `.tmp` 命名足够清楚地表达"这不是正式资产"。
- 不复用 `appData/workspaces/<workspace-id>/proposals/`：这个名字已经被 `fyllo-specs` 的 openspec 提案占用，两者语义不同（一个是变更提案文档，一个是待确认的 workflow YAML），复用会造成目录含义混淆。

写入这份临时文件后，触发 wake 通知 Renderer；Renderer 拉取到的是这份**提案**的详情，不是 `WorkflowRunSnapshot`（run 此刻还不存在）——两种数据源的区分见第 8.1 节，用户确认后的落盘与创建 run 流程见第 7.1 节。

### 3.3 校验失败处理

`propose_workflow` 是同步的请求/响应：校验（[definition-schema.md](definition-schema.md) 第 9 节解析期规则，见第 5 节，不叠加 agent 专属规则；以及第 3.2 节 `mode`/`workflowId` 的组合校验）失败时，直接返回结构化错误列表，**不写入 3.2.1 节的临时提案文件、不触发 wake**。agent 在同一轮对话里根据错误自行修正后重新调用，类比 TypeScript 编译错误的反馈循环。

不引入"先落为 draft 状态、再异步修复"的中间态——校验失败的 YAML 不构成任何值得让 Renderer 知道的状态变化，临时落盘只保留给校验通过的合法内容，磁盘上不会积累半成品草稿。这与 Phase 1"不合法 YAML 不允许静默落盘"（验收标准第 1 条）是同一条原则的延伸。

---

## 4. 触发时机：常驻的只是"能力存在"，不是 schema 本身

### 4.1 为什么需要常驻，但常驻的内容要收窄

Phase 2 要支持两条触发路径，且两者最终都收敛到同一个 `propose_workflow` 调用：

- **用户显式要求**："把这个流程存成 workflow"之类的直接指令。
- **agent 主动判断提议**：agent 认为当前对话已经产生了一个值得固化的多步骤过程，主动向用户提议。

如果连"这个能力存在"都只在用户说出触发语句之后才临时注入，第二条路径永远无法触发——agent 没有任何线索知道该主动提议什么。这一点仍然需要常驻。

但第 3 节已经把 schema 本身拆到了 `describe_workflow_schema`，常驻 system prompt 的内容因此收窄为**触发判断**这一层，不需要再带 `WorkflowDefinition`/`Stage`/`Gate` 等字段细节——那些留给 agent 决定要生成时再按需查询。常驻内容大致是这个量级（措辞由实现阶段定稿，方向是"够长到讲清楚判断标准和调用入口，不需要更多"）：

> 当用户明确要求把当前流程存为可复用 workflow，或你判断这段对话已经沉淀出一个值得固化的多步骤过程（不是随手改了几行代码）时，先调用 `describe_workflow_schema` 了解格式，再用 `propose_workflow` 提交生成结果供用户确认。

**长度上的取舍**：不能压到一句"有个 workflow 能力"就完事——过短的常驻提示信息密度不够，agent 容易当噪音略过，等于没写。也不需要塞进字段级细节——那是 `describe_workflow_schema` 的职责，常驻只需要交代清楚"什么时候该想起这个能力"和"想起来之后第一步调用谁"，让 agent 能可靠地接上第 3 节的渐进披露链路。

### 4.2 触发标准的度：contract 措辞细节，非架构分歧

"agent 何时可以主动提议"这条标准写得太保守，用户会觉得这个功能形同虚设；写得太宽松，每次改完代码都被提议存 workflow，变成骚扰。这是 prompt 措辞层面的细节，不需要架构层面的决策，交给实现阶段自行拟定初稿并迭代。

---

## 5. 生成校验：沿用通用规则，不叠加 agent 专属限制

### 5.1 沿用 definition-schema 第 9 节

`propose_workflow` 复用 [definition-schema.md](definition-schema.md) 第 9 节的全部解析期校验规则，不区分来源。

不新增"`exec`/`webhook` 强制 `confirm: true`"这类规则：`confirm` 字段控制的是**运行时**每次 `trigger_workflow` 执行到该 stage 是否需要人工二次确认，这与"agent 这次生成的内容需不需要人审阅"是两件不同的事——后者已经由第 7/8 节的确认卡片机制解决（生成结果必须经用户在确认卡片上审阅、确认后才落盘/执行，且第 8.3 节要求完整展示 `exec`/`webhook` 原文，不允许折叠）。若在 schema 层面永久禁止 `confirm: false`，等于让"生成时审阅一次"这个一次性关卡，变成"运行时永远关不掉的二次确认"，会挡住 workflow engine 未来"无人值守执行"这个可能方向——一份已经被用户审阅、确认、沉淀为可复用资产的 workflow，理应可以在后续复用时全自动跑完，而不是被 schema 强制卡在每次都要人工点确认。

`confirm` 该设为 `true` 还是 `false`，是 workflow 作者（此处是 agent，代其生成内容的用户对结果负责）对"这一步要不要在运行时也保留人工关卡"的正常判断，Phase 2 不比 Phase 1 的手写信任模型更严格地约束这个字段。

### 5.2 不做的事：requires 上下文匹配

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

`context: inherit` 语义是**相对触发者**，不是绑定生成它的那个特定 session：无论 workflow 是刚生成的临时产物还是沉淀后被复用，`inherit` 每次都指向"这一次 `trigger_workflow` 发生所在的那个 session"——因为 workflow 目前唯一的触发方式就是"由某个 chat session 里的 agent 调用 `trigger_workflow`"，这个引用语义天然稳定。

因此**不需要**为"沉淀为可复用"的 workflow 强制禁止 `inherit` stage（曾考虑过这条限制，讨论后确认是伪问题：`inherit` 不存在"绑定原 session 导致未来复用时失效"的风险）。但正因为 `inherit` 在新对话中复用时会自然接上一个完全不相关的语境，第 6.2 节的自包含性提示对 `inherit`/`fresh` 两种 stage 同等适用，不因为选了 `inherit` 就豁免。

---

## 7. 确认流程与 run 状态机

### 7.1 确认动作本身：Renderer → Main IPC，此时才真正落盘、才创建 run

`propose_workflow` 校验通过后只完成了第 3.2.1 节的临时落盘（写入 `.tmp/workflows/<proposal-id>.yaml`），**内容还没有生效，也没有任何 run 被创建**。用户在确认卡片上点击"确认"后：

1. Renderer 发起一次 IPC 调用，携带 `proposalId` 和用户在卡片上点击的按钮对应的 `persist` 值（`yaml`/`mode`/`workflowId` 不需要 Renderer 重新传，直接从第 3.2.1 节的临时提案文件读取，避免和 `propose_workflow` 调用时的参数产生二次校验分歧；唯独 `persist` 必须由这次 IPC 携带，因为它可能与 agent 在提案里给出的建议值不同——第 3.2 节已定，用户在确认卡片上可以选择"仅本次执行"或"保存为可复用并执行"，不受 agent 传入值的约束）。
2. 主进程按 `mode`（读自提案文件）与用户本次选择的 `persist` 把内容写入真正的目标位置（第 10.1 节：`create` 分配新 `workflow-id`、`update` 复用已有 `workflow-id`；`persist: session` 写 session 目录、`persist: workspace` 写 workspace 正式目录）。
3. 写入正式位置成功后，**这一步才创建 run**、分配 `runId`：复用 Phase 1 已有的 `confirmStart` 分支语义——若 YAML 的 `confirmStart` 为 `false`（或未声明），run 直接进入 `running`；若为 `true`，run 进入 `awaiting_start_confirmation`（Phase 1 已有状态，走既有的二次确认流程）。
4. 第 3.2.1 节的临时提案文件在正式落盘成功后删除（第 7.3 节取消分支同理清理，见下）。

**"确认"因此是唯一有实际决定权的动作**：在此之前，磁盘上只有一份不生效的临时提案；点击确认才第一次把内容写入 session/workspace 的正式位置、第一次创建 run。`confirmStart` 字段的语义区分度体现在**未来**：这份 workflow 被沉淀后，某次新对话直接调用 `trigger_workflow`（不经过 `propose_workflow`/确认卡片）触发时，才轮到"内容已经是正式资产、现在只是要不要为这次启动单独确认"发挥作用，这与 Phase 1 原始设计完全一致，不是新增语义。

### 7.2 用户关闭 UI / 无操作

不新增超时或自动丢弃机制。用户尚未点击确认时，`.tmp/workflows/<proposal-id>.yaml` 就一直以"待确认"状态留在磁盘上——这个状态本身就是无时限的挂起态，用户下次回到该 session 仍能看到待确认卡片（Renderer 重新 `getDetail` 时该临时文件仍然存在），不需要为"生成后未确认"这一场景单独设计过期策略。

### 7.3 用户点击"取消"：结果如何回传给 agent，临时文件如何清理

用户选择"取消"时：

- **临时提案文件被删除**：`.tmp/workflows/<proposal-id>.yaml` 从未构成任何用户资产，取消即意味着这份提案作废，不留孤儿文件——这与"仅本次执行"确认后落在 session 目录的产物不同（第 10.4 节，那是已经生效、用户主动选择不沉淀的正式内容，理应保留），这里是从未被接受过的草稿，应当随取消动作一并清理。
- **agent 需要得到"提议被拒绝"这个反馈**，否则永远不知道自己刚才的生成结果被否决。方案：注入一条用户不可见的 `<system-reminder>`，告知 agent 确认结果（接受/取消）。这条 reminder 的投递时机复用 `fyllo-spawn` 已有的"抢锁排队补 turn"机制（见第 7.4 节），而非简单的单播通知。

### 7.4 前置重构：抽象通用的排队投递服务

**现状**：`fyllo-spawn` 已有一套类似机制——子 session 完成后需要唤起主 chat session 的 agent 处理下一步，通过 `ChatTurnGate`（`src/main/services/session/chat/chat-turn-gate.ts:14`，纯粹的 `workspaceId+sessionId+kind` 互斥锁，与业务无关，可直接复用）判断当前是否有 turn 在跑；若空闲，直接注入 reminder 并单独发起一轮新 turn（`claimSpawnNotificationTurn`/`executeNotificationTurn`，`chat-turn-service.ts:344`/`:251`）；若忙碌，排队等待锁释放后再补。

但目前"排队补 turn"这部分与 spawn 业务强耦合：`SessionOwner` 类型（`session-registry.ts:10`）硬编码为 `"chat" | "apply" | "archive" | "spawn"`，`claimSpawnNotificationTurn`/`executeNotificationTurn`/`notificationMessage`/`spawnNotificationService.buildReminder` 均按 `SpawnedTurnRecord` 数据结构书写，没有抽象出与业务无关的通用接口。

**Phase 2 需要的重构**（作为本阶段实施的一部分，不单列前置任务）：

1. `SessionOwner` 新增 `"workflow"`。
2. 将 `claimSpawnNotificationTurn`/`executeNotificationTurn` 的通用部分（抢锁 → 判定忙闲 → 注入 reminder 消息 → 发起/排队新 turn → 结算投递状态）抽出为与业务无关的排队投递服务，spawn 和 workflow 各自提供自己的"记录类型"与"reminder 文本构造"作为该服务的参数/回调，而不是复制一份平行实现。
3. workflow 侧参照 `SpawnNotificationService`（`spawn-notification-service.ts:44`）的模式实现等价的确认结果通知服务。

**为什么本轮先做通用层而非平行实现**：这不是"预先为未验证的未来需求建设施"（Phase 2 其余多处决策，如 `list_workflows` 不改造、prompt 不做机械校验，都遵循"不为未验证的需求预先建设施"），而是此刻已经存在两个真实、同时需要这套能力的消费者（spawn 现在就在用，workflow 马上要用）。在有两个真实需求时才抽象，风险远低于预判未来可能出现的第三个消费者。

**为什么写进本文档而非独立前置任务**：这次重构的动机完全来自 workflow 需求，脱离 workflow 场景单独做这次重构缺少验证抽象是否合理的真实第二调用方，容易做出"看起来通用、实际只服务一个调用方设想"的过度抽象。

---

## 8. 确认卡片：UI 形态

本节结论定位是**视觉/交互设计规范**，供实现阶段对照，不代表现在就要动手写组件。实现顺序仍是 Phase 1 运行时地基（run 状态机、`fyllo-workflow` MCP server、`workflow:run:*` 的 wake+pull channel）先落地，UI 卡片在有真实数据源之后再接入——现在讨论只是提前把视觉/交互方案定下来，避免运行时接近完成时才回头设计 UI、来回返工。

### 8.1 组件关系：同一组件的两种状态，不是两个组件；但两态背后是两种不同的数据源

审阅态（确认卡片）与运行态（run 状态展示）是**同一个组件的两种状态**，共享同一套 stage 拓扑布局，只是叠加/切换不同的信息层——审阅态的 stage 圆点是中性描边+kind 图标（agent/action/wait），运行态的圆点按 stage 实际状态换色（未执行灰色暗淡、执行中描边高亮+loading、已完成实心打勾、失败态红色叉）。

**为什么不做成两个独立组件**：用户从"审阅生成的 YAML"到"点击确认"到"看着它运行"是一条连贯的体验流——如果 UI 上审阅完之后卡片消失、换一套完全不同的组件重新渲染一遍相同的拓扑信息，会在本该连贯的体验里制造一次不必要的视觉跳变，用户还得在新组件里重新建立一次"这个 workflow 长什么样"的心智模型。

**审阅态与运行态的数据源不是同一个类型**：审阅态展示的是第 3.2.1 节的临时提案（`.tmp/workflows/<proposal-id>.yaml` 及其 `mode`/`workflowId`/`persist` 参数），此时 run 尚未创建，不存在 `WorkflowRunSnapshot`；运行态展示的才是 Phase 1 定义的 `WorkflowRunSnapshot`，只在用户点击确认、IPC 触发正式落盘并创建 run 之后才存在（第 7.1 节）。组件在两态之间切换时，本质是切换了底层订阅的数据源（提案详情 → run 快照），而不是同一份数据随状态字段变化——这一点在实现时需要显式处理数据源切换，不能假设两态共用同一个 `getDetail` 返回结构。

### 8.2 布局：竖向时间线，底部固定操作栏

- Stage 拓扑用竖向时间线展示（从上到下排列，圆点+竖线连接），不用横向流程图。理由：确认卡片可能挂载在对话流内联或侧边栏这类宽度受限的容器（第 8.4 节），竖向布局天然适应窄容器，且与项目已有的消息流、列表类 UI 语汇一致，不需要引入横向滚动这种新交互模式。
- 确认/取消操作固定在卡片底部，不随内容滚动。理由：第 8.3 节要求完整展示 YAML 全部字段，内容可能较长，如果操作区跟着内容走，用户需要划到底才能操作；固定操作栏保证决策入口始终可达。审阅态操作栏是"取消 / 仅本次执行 / 保存为可复用并执行"三个按钮；运行态收窄为一个"查看详情"入口，不需要重复暴露确认语义。

### 8.3 展示内容：完整、不折叠

确认卡片必须完整展示这份 workflow YAML 的**全部字段**，不只是 `prompt`，包括 stage 拓扑、每个 `ActionOp` 的具体内容（尤其 `exec`/`webhook` 的命令/URL 原文）、`confirm`/`idempotencyKey` 等所有字段，不允许折叠摘要。

**为什么不做摘要或额外预告**：命令字符串本身无法在不理解意图的情况下机械判断危险性（`rm -rf /tmp/foo` 安全、`rm -rf /` 危险，纯文本模式匹配拦不住变体又会误伤合法用途），这与"prompt 指代词黑名单"是同一类脆弱机制，Phase 2 不引入。唯一能兜底的就是让人真正看到完整内容——任何折叠、摘要、或额外生成一段"这个 workflow 会做什么"的自然语言总结，都是在原文之外制造一层可能失真的转译，反而在用户与真实内容之间引入审阅盲区。UI 只需要如实、完整地渲染 YAML 内容。

审阅态应重点高亮 `exec`/`webhook` 类型且 `confirm` 非 `true`（即显式 `false` 或未声明）的步骤（如角标"自动执行，不再确认"）——这类步骤一旦这次生成被确认、沉淀为可复用资产，未来每次执行都不会再弹出人工确认，这次审阅是它们被人看到的唯一机会，理应获得最高的注意力优先级。反之 `confirm: true` 的步骤运行时本身还会再触发一次 `awaiting_gate_decision` 式的人工确认（见 Phase 1 `ActionStage` 的 `confirm` 语义），此刻是否看漏代价较低，不需要额外的 UI 标记——两种状态都高亮等于没有高亮，用户无法一眼分辨"必须现在看清楚"和"以后还有机会看"的区别。同理，`gate.human` 的决策提示文案（`Gate.prompt` 字段）直接展示在对应 stage 下方，让用户提前知道后面会出现决策点，不是等跑到那一步才第一次看到。

### 8.4 挂载位置：`ChatEventRail`，取代 Phase 1 `WorkflowRunActivityEntry`

结论：确认卡片（及其运行态，见 8.1 节）挂载在 `ChatEventRail` 侧边栏，不落对话流内联，也不落 `ChatBackgroundActivityBar`。

**候选对比**：`ChatBackgroundActivityBar`（新增的 workflow 状态常驻组件所在容器，见 Phase 1 第 6 节 `WorkflowRunActivityEntry`）定位是"后台运行、大多数情况只需关注状态"，常驻区域假设极窄（名称+状态），详情靠 popover/modal 按需展开。这与第 8.3 节的硬性要求冲突：确认卡片必须完整、不折叠地展示 YAML 全部字段（尤其未声明 `confirm` 的 `exec`/`webhook` 步骤，"这次审阅是它们被人看到的唯一机会"），内容量不可控，不适合塞进为"低打扰、按需展开"设计的浮层——窄小的 popover 反而会诱导用户草草扫过就点确认，与 8.3 节"防止折叠审阅盲区"的意图正面冲突。`ChatEventRail`（"需要用户参与、提醒或关注的内容"）与确认卡片"需要用户参与决策、且决策不可逆"的性质更贴合，且第 8.2 节的竖向时间线布局本就是为适应 Rail 的宽度限制而设计，不存在削足适履的问题。

**为什么运行态也要跟着搬、不能审阅态在 Rail、运行态留在 ActivityBar**：第 8.1 节已定审阅态与运行态是同一组件的两种状态，共享同一套 stage 拓扑。若运行态留在 `WorkflowRunActivityEntry`（ActivityBar），用户确认后组件要从 Rail "搬家"到 ActivityBar，这本身就是一次比"审阅完卡片消失、换组件重渲染"更大的视觉跳变，与 8.1 节"避免视觉跳变、避免用户重建心智模型"的论据直接矛盾。因此本组件**取代** Phase 1 `WorkflowRunActivityEntry`，Phase 1 第 5.1/6/10 节中挂载于 `ChatBackgroundActivityBar` 的表述以本节为准更新（不重复维护两套挂载点）。

**`AgentStage(context: fresh)` 子 session 入口的位置随之确定**：不再需要 Phase 1 设想的、挂在 `WorkflowRunActivityEntry` 下的独立入口。fresh session 对应 workflow 卡片时间线上的一个 `AgentStage` stage，其"查看子 session 对话"的入口就是第 8.5 节已经定义的 stage 行内展开区域（点击该 stage 行，在同一张卡片内展开转录摘要）——这是同一套"stage 行内展开"机制的直接复用，不需要为 fresh session 单独设计一个入口。

**多个 workflow 并存时的注意力问题**：`ChatEventRail` 可能同时展示多个待确认 workflow 卡片（加上其他类型的提醒项），存在"确认按钮被淹没、用户漏看"的风险。已讨论过若干方向（Rail 内部置顶+折叠、独立的一次性提醒条/角标、强制单队列），但结论是**留到实际接入、跑一段时间观察真实使用情况后再决定**，不在本次讨论中预先设计——这与本文档多处"不为未验证的需求预先建设施"的原则一致。数据获取链路不受挂载位置或未来提醒机制影响：无论如何演化，都统一走 Phase 1 的 wake + pull 模式（`propose_workflow` 成功后落盘 → wake → Renderer `getDetail` 拉取详情），UI 容器只是下游渲染选择。

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

延续第 7.1 节：`propose_workflow` 校验通过后只把内容写入 `.tmp/workflows/<proposal-id>.yaml` 这一份临时提案（第 3.2.1 节），**不涉及 `create`/`update`、`session`/`workspace` 的正式路径分支**。这些分支只在用户点击确认、Renderer 发起 IPC 之后才由主进程执行，此时的 `persist` 是用户在确认卡片上点击的按钮对应的值，不是 agent 调用 `propose_workflow` 时提交的建议值（第 3.2 节）：

- `mode: "create"`：内部分配新 `workflow-id`，按用户选择的 `persist` 写入：
  - `persist: "session"` → `appData/workspaces/<workspace-id>/sessions/<session-id>/workflows/<workflow-id>.yaml`（Phase 1 第 8 节已预留此路径）
  - `persist: "workspace"` → `appData/workspaces/<workspace-id>/workflows/<workflow-id>/definition.yaml`（Phase 1 正式资产路径）
- `mode: "update"`：直接复用提案里记录的 `workflowId`（`propose_workflow` 调用时已校验其对应的 `definition.yaml` 已存在于 workspace 正式目录），不重新分配 id：
  - `persist: "session"` → 新内容写入 `appData/workspaces/<workspace-id>/sessions/<session-id>/workflows/<workflow-id>.yaml`（**同一个** `workflow-id`，但落在 session 目录），workspace 正式目录下的原 `definition.yaml` 此时不受影响。语义是"基于既有 workflow 改了一版，这次只临时跑跑看，不覆盖原资产"。
  - `persist: "workspace"` → 直接覆写 workspace 正式目录下同一 `workflow-id` 的 `definition.yaml`。语义是"这次修改就是要成为这份 workflow 的新版本"。

  这组语义的推论是：**`mode: "update"` 场景下 `persist` 的含义从"要不要沉淀一份新资产"变成"这次改动要不要覆盖原资产"**——不管选哪个，`workflow-id` 都不变，区别只在于是否已经覆盖 workspace 正式文件。这与 `mode: "create"` 下 `persist` 决定的是"全新内容存不存"是两种不同的问题，但复用同一个参数名不引入歧义：两种模式下 `persist: "session"` 都表示"这次落盘只到 session 目录，workspace 正式目录不变"，`persist: "workspace"` 都表示"这次落盘会（新建或覆盖）workspace 正式目录"，参数语义本身是一致的。

  无论 `create`/`update`，正式落盘成功后紧接着创建 run（第 7.1 节），随后删除 `.tmp/workflows/<proposal-id>.yaml`；agent 全程不接触任何具体文件路径，第 3.2 节提交的 `mode`/`workflowId` 是硬性语义标记，`persist` 只是建议值，路径拼接完全由主进程内部完成，且最终以用户在确认卡片上的选择为准。

### 10.2 `persist: "session"` 不提供事后补沉淀的入口

`persist: "session"` 一旦在确认时被用户选定，这份 workflow 就是纯粹的一次性产物：不提供"用户后来改主意，把已经在 session 目录里的 YAML 挪到 workspace 正式目录"这类独立的事后操作入口。如果用户运行完才发现这份 workflow 值得复用，唯一路径是让 agent 重新走一次生成流程——针对同一份内容调用 `propose_workflow(mode: "update" 或 "create")`，重新经过一次确认卡片，这次在卡片上点击"保存为可复用并执行"。

**为什么不额外做一个事后沉淀入口**：`persist` 的最终取值由用户在确认卡片上点击哪个按钮决定（第 3.2 节），确认即定案。如果确认过后还允许绕开这套"生成→确认卡片→用户选择"的流程、单独用一个 IPC 把 session 产物"转正"，就相当于给同一份内容开了第二条落盘路径，且这条路径不再让用户看一次完整的 YAML 确认卡片——这与第 8.3 节"完整展示、用户必须看清楚要落地的内容"的要求是矛盾的：重新走一次确认流程，用户看到的是当下真实要保存的内容；直接挪文件则可能让用户凭对"当初跑过一次"的模糊印象做决定，跳过了本该有的再次审阅。重新生成一次的成本只是一次 tool call，换来的是内容再次经过完整确认，这个代价是值得的。

### 10.3 覆盖既有 workflow：靠确认卡片提示，不设冲突拦截分支

`mode: "update"` 的落盘目标必然是一份已存在的 workspace 资产，因此"覆盖"是这条路径的**预期结果**，不是需要被拦截的异常。不需要"目标 id 已存在则拒绝、交给用户手动决定覆盖"这类冲突处理分支——`propose_workflow` 已经在校验层面把"是否要覆盖已有资产"这件事收敛成 agent 必须显式声明的 `mode`，第 7.1 节又统一要求所有提案都要经用户在确认卡片上点击确认才会真正落地。两条结论叠加后，"用户确认"本身就是唯一且必经的关卡，不需要在它之外再加一层单独的冲突拦截逻辑——多一层拦截只是把同一个决策（"要不要接受这次改动"）问用户两次。

**确认卡片必须显式标注这是一次更新，而非可选的体验优化**：`mode: "update"` 的确认卡片除了 8.3 节要求的"完整展示 YAML 全部字段"外，还必须明确提示"这是对已有 workflow『{name}』（`workflow-id`: `{workflowId}`）的更新"。这条提示与 `persist` 的选择无关，两个按钮都要展示——但"覆盖"是否真正发生取决于用户点的是哪个按钮：点击"保存为可复用并执行"（`persist: workspace`）才会覆盖 workspace 正式目录下的原 `definition.yaml`，该按钮需要额外强调"确认后将覆盖原 workflow，原版本不再默认可查"；点击"仅本次执行"（`persist: session`）不影响 workspace 正式资产，只是这次临时按新内容跑一遍，不需要展示覆盖警告。理由是覆盖属于不可逆操作（原版本内容不再默认可查），而"完整展示 YAML 原文"这一条只能让用户看清楚**新内容长什么样**，无法让用户意识到**点击其中某个按钮会替换掉一份已有的东西**——用户若没有主动去对比新旧内容，单看 8.3 节的完整展示是发现不了这一点的。这条提示因此是覆盖场景下的最低限度告知，与 8.3 节"不做摘要、不做折叠"的原则并不冲突：8.3 节管的是 YAML 内容本身如何呈现，这里加的是内容之外、关于"这次操作性质"的一句独立提示。

### 10.4 未被持久化的临时文件如何清理

两类"临时文件"的清理规则不同，需要分开看：

- **第 3.2.1 节 `.tmp/workflows/<proposal-id>.yaml`（尚未被确认的提案）**：用户点击确认或取消后都会被删除（确认后内容已经写入正式位置，提案文件失去意义；取消后提案作废，不留孤儿文件，见第 7.1/7.3 节）。这份文件从未构成任何用户资产，不需要随 session 生命周期保留。
- **`persist: "session"` 确认后落在 `appData/workspaces/<workspace-id>/sessions/<session-id>/workflows/<workflow-id>.yaml` 的正式产物**：这是用户已经确认、选择只本次执行的生效内容，不主动清理，随 session 自身的生命周期存在（同目录下还有 `fresh` AgentStage 产生的 transcript）。如果未来 session 本身有清理/归档机制，这份文件跟着一起处理即可，不需要为它单独设计清理流程。`mode: "update"` + `persist: "session"` 产生的同名文件同样适用这条规则——即便它携带的 `workflow-id` 与一份 workspace 正式资产相同，只要没有被确认为覆盖 workspace 正式目录，它就只是 session 目录下的一份已生效但不沉淀的内容，不影响、也不需要与 workspace 正式目录做任何同步或清理联动。

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

### 11.2 `trigger_workflow`（延续能力，不变）

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
  reason: string;  // 如"已有 workflow 在运行"、"workflowId 不存在"
}
```

- 若目标 workflow 所在 session 已存在 `active` 状态的 run，直接返回 `status: "rejected"`，`reason` 明确说明"已有 workflow 在运行"。
- 若目标 workflow `confirmStart: true`，run 以 `awaiting_start_confirmation` 状态创建并落盘、触发 wake，工具调用立即返回，不阻塞等待用户确认；若 `confirmStart: false`，run 直接进入 `running` 并开始推进第一个 stage。
- 只接受 `workflowId`，不接受 YAML 内容——`trigger_workflow` 触发的是一份已经存在（无论是用户手写还是经 `propose_workflow` 生成确认后沉淀）的 workspace 资产，生成新内容或更新既有内容是 `propose_workflow` 的职责，与触发执行是两个独立动作。

### 11.3 `describe_workflow_schema`（本阶段新增）

无副作用的信息查询工具，返回 workflow YAML 的 schema 骨架：`WorkflowDefinition`/`Stage`（`AgentStage`/`ActionStage`/`WaitStage`）/`ActionOp`/`Gate`/`ArtifactSpec`/`Transition` 的字段与语义、解析期校验清单。

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

### 11.4 `propose_workflow`（本阶段新增）

生成提交工具，agent 通过它提交新生成或更新的 workflow YAML，供用户确认。**这个 tool 只做校验和临时落盘，不创建 run，也不写入 session/workspace 的正式位置**——真正生效以用户点击确认卡片后由 Renderer 发起的 IPC 为准。

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

- **校验**：先跑 workflow YAML 的解析期结构校验（stage 拓扑、`goto` 引用、`maxLoops`、模板变量命名空间等），失败直接返回 `status: "rejected"` 与结构化错误列表，不落盘、不触发 wake，agent 在同一轮对话里自行修正后重新调用。再校验 `mode`/`workflowId` 的组合：`mode: "create"` 时 `workflowId` 必须为空（内部分配新 id）；`mode: "update"` 时 `workflowId` 必填，且必须对应一个已持久化在 workspace 正式目录的 workflow（`list_workflows` 能查到、`definition.yaml` 已存在于磁盘的那个 id）——不允许指向尚未沉淀、只存在于某个 session 临时目录的 workflow。任意一条不满足同样返回 `status: "rejected"`。
- **校验通过后只做临时落盘**：把 YAML 原文连同 `mode`/`workflowId`/agent 建议的 `persist` 写入 `appData/workspaces/<workspace-id>/.tmp/workflows/<proposal-id>.yaml`——`.tmp/` 前缀表明这是未决提案，既不是 workspace 正式资产，也不是 session 已生效的产物，纯粹是等待人工审阅的暂存态；不使用系统临时目录，因为提案需要在应用重启后仍可被 Renderer 拉取到，系统临时目录可能被操作系统清空。写入完成后触发 wake 通知 Renderer 拉取提案详情、展示确认卡片。
- **用户点击确认**：确认卡片固定展示"仅本次执行"和"保存为可复用并执行"两个按钮，无论 agent 建议的 `persist` 是什么，用户都能点任意一个——最终生效的 `persist` 以用户这次点击为准，不是 agent 传入值的直接延续。Renderer 发起 IPC，携带 `proposalId` 与用户选择的 `persist`（`yaml`/`mode`/`workflowId` 从临时文件读取，不需要重传），主进程此时才把内容写入真正的目标位置——`mode: "create"` 分配新 `workflow-id`，`mode: "update"` 复用已有 `workflow-id` 覆盖原内容；`persist: "session"` 写 session 目录，`persist: "workspace"` 写 workspace 正式目录。写入正式位置成功后才创建 run、分配 `runId`（按 YAML 的 `confirmStart` 决定 run 直接进入 `running` 还是 `awaiting_start_confirmation`），随后删除 `.tmp/workflows/<proposal-id>.yaml`。
- **用户点击取消**：不写入任何正式位置、不创建 run，直接删除 `.tmp/workflows/<proposal-id>.yaml`，并注入一条用户不可见的 `<system-reminder>` 告知 agent 这次提案被否决。
- 无论 `create`/`update`，agent 全程不接触具体文件路径，只表达 `mode` 与对 `persist` 的建议，路径拼接完全由主进程内部完成，最终 `persist` 值由用户在确认卡片上定案。

### 11.5 workflow engine 内部创建 fresh 子 session 不经过 MCP

`AgentStage(context: fresh)` 的子 session 由 workflow engine 在主进程内部直接创建（调用底层会话管理能力），不经过 `fyllo-workflow` 这层 MCP 协议——这是主进程调度代码之间的调用，不是"agent 发起一次 tool call"，不属于本节工具集范围。

---

## 12. 验收标准（粗粒度）

不追求 scenario 级别的完整性，只列 proposal 应该覆盖的验收方向，具体 scenario 由写 proposal 的 agent 展开，风格与 [phase1-execution-design.md](phase1-execution-design.md) 第 11 节一致。

1. `describe_workflow_schema` 能返回 [definition-schema.md](definition-schema.md) 第 1-9 节的骨架内容；`withExamples: true` 时额外附带第 10 节的完整 YAML 示例，`withExamples: false`（或未传）时不包含。
2. `propose_workflow` 对不满足 [definition-schema.md](definition-schema.md) 第 9 节解析期规则的 YAML，应返回 `status: "rejected"` 与结构化错误列表（第 3.3 节），且不写入 `.tmp/workflows/` 临时区、不触发 wake。
3. `propose_workflow(mode: "create")` 若同时传了 `workflowId`，应被拒绝；`propose_workflow(mode: "update")` 若未传 `workflowId`，或 `workflowId` 不对应一个已存在于 workspace 正式目录的 `definition.yaml`，应被拒绝（第 3.2 节）——包括"只存在于某个 session 临时目录、尚未沉淀"的 workflow-id 也应被拒绝。
4. `propose_workflow` 校验全部通过后，应只写入 `appData/workspaces/<workspace-id>/.tmp/workflows/<proposal-id>.yaml` 并触发 wake（第 3.2.1 节），不应创建 run、不应写入 session 或 workspace 的正式位置；此时 `list_workflows` 不应能查到这份内容，`trigger_workflow` 也不应能引用到它。
5. Renderer 收到 wake 后 `getDetail` 拉取到的是这份提案的详情（不是 `WorkflowRunSnapshot`，见第 8.1 节），确认卡片应完整展示 YAML 全部字段、不折叠（第 8.3 节）；`exec`/`webhook` 且 `confirm` 非 `true` 的步骤应有醒目标记；`mode: "update"` 的卡片应额外标注"这是对已有 workflow『{name}』的更新"（第 10.3 节）。
6. 用户在确认卡片上点击"仅本次执行"：内容应写入 `appData/workspaces/<workspace-id>/sessions/<session-id>/workflows/<workflow-id>.yaml`；若 `mode: "update"`，workspace 正式目录下的原 `definition.yaml` 不应发生任何变化；写入成功后应创建 run，并按 YAML 的 `confirmStart` 决定 run 初始状态是 `running` 还是 `awaiting_start_confirmation`（第 7.1 节）；`.tmp/workflows/<proposal-id>.yaml` 应被删除。
7. 用户在确认卡片上点击"保存为可复用并执行"：`mode: "create"` 时应在 workspace 正式目录下新建 `<workflow-id>/definition.yaml`；`mode: "update"` 时应直接覆写该 `workflow-id` 已有的 `definition.yaml`；写入成功后同样应创建 run；`.tmp/workflows/<proposal-id>.yaml` 应被删除；此后 `list_workflows` 应能查询到这份最新内容（含其 `workflowId`，用于后续可能的再次 `mode: "update"`）。
8. 用户在确认卡片上点击"取消"：不应创建 run、不应写入任何 session 或 workspace 正式位置，`.tmp/workflows/<proposal-id>.yaml` 应被删除；agent 应收到一条用户不可见的 `<system-reminder>`，告知这次提案被否决（第 7.3 节）；这条 reminder 的投递应遵循 `ChatTurnGate` 排队机制——若当前有 turn 在跑，应排队等待锁释放后补投，不丢失也不重复投递（第 7.4 节）。
9. 应用重启后，尚未被用户确认的 `.tmp/workflows/<proposal-id>.yaml` 仍应能被 Renderer 通过 `getDetail` 正常拉取并展示确认卡片，验证该临时区不会因应用重启或系统临时目录清理策略而丢失（第 3.2.1 节"为什么不用系统临时目录"）。
10. 端到端跑通一次"生成 → 确认 → 复用"闭环：agent 通过 `list_workflows` 查到一个既有 workflow 的 `workflowId`，调用 `propose_workflow(mode: "update", workflowId)` 生成一版修改，用户在确认卡片上选择"保存为可复用并执行"，成功覆盖原资产并跑完一次 run，作为 Phase 2 最小验收路径。

---

## 13. 待后续讨论的问题

- `ChatEventRail` 内多个待确认 workflow 卡片并存时，如何避免确认操作被淹没、用户漏看（第 8.4 节已列出候选方向：Rail 内置顶+折叠、独立一次性提醒条/角标、强制单队列，留待实际接入运行一段时间、观察真实使用情况后再定）。
- Agent 主动提议固化的具体判断标准（contract 措辞细节，第 4.2 节已说明是实现阶段自行拟定并迭代的内容，非架构分歧）。
- `gate.type: human` 决策表单、`WaitStage` 等待信号在运行卡片上的具体字段/交互细节（第 8.5 节只定了"嵌入卡片、不跳转"这个方向，具体表单形态未展开）。

---

## 14. 参照代码位置

供写 proposal / 实现时对照，而非最终真实性保证——本次讨论后代码可能已变化，动手前应重新核对当前代码。

**排队投递机制现状（`fyllo-spawn`，Phase 2 需要在此基础上抽象通用层，见第 7.4 节）**

- `src/main/services/session/chat/chat-turn-gate.ts:14`（`ChatTurnGate` 类，`tryAcquire(workspaceId, sessionId, kind)` 互斥锁，业务无关，可直接复用）
- `src/main/services/session/chat/chat-turn-service.ts:203`（`createRendererChatTurn`，`kind: "user"` 抢锁方）、`:251`（`executeNotificationTurn`）、`:344`（`claimSpawnNotificationTurn`，`kind: "notification"` 抢锁方）
- `src/main/services/session/spawn/spawn-notification-service.ts:44`（`SpawnNotificationService` 单例，`buildReminder` 负责 reminder 文本构造）
- `src/main/services/session/chat/session-registry.ts:10`（`SessionOwner` 类型定义，当前为 `"chat" | "apply" | "archive" | "spawn"`，Phase 2 需新增 `"workflow"`）

**Phase 1 已有信道与状态机（Phase 2 直接复用，不重新设计）**

- 见 [phase1-execution-design.md](phase1-execution-design.md) 第 4/6/8 节：`fyllo-workflow` MCP server 结构、wake+pull 展示信道、`WorkflowRunSnapshot` 状态机与存储路径。

**渐进披露参照（`describe_workflow_schema`/`propose_workflow` 的分层设计，见第 3 节）**

- `src/mcp-servers/fyllo-specs/src/tools/create-proposal.ts:34-40`（`includeInstruction` 参数，`description` 里说明"first call 默认带 instruction，后续 follow-up 可关闭"）与 `src/mcp-servers/fyllo-specs/src/tools/instructions/create-proposal.md`（instruction 全文，作为 tool 返回值按需下发而非常驻 system prompt 的先例）
- 本会话已连接的 `visualize` MCP server：`read_me`/`show_widget` 两个工具通过各自 `description` 互相声明调用顺序（"Call before your first show_widget call" / "IMPORTANT: Call read_me before your first show_widget call"），是"双重提醒 + 详情按需查询"这一模式在 MCP tool description 层面的直接参照。
