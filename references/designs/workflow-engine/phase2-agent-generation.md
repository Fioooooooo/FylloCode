# Workflow Engine Phase 2 — Agent 动态生成 + 沉淀复用

状态：draft（讨论结论，未评审）
日期：2026-08-26

本文档记录 workflow engine Phase 2 的架构决策：agent 在对话中动态生成 workflow YAML、生成后的确认流程、沉淀为可复用资产的路径。承接 [phase1-execution-design.md](phase1-execution-design.md) 的运行时地基与 [definition-schema.md](definition-schema.md) 的定义态语义，本文档不重复两者已定的内容，只覆盖 Phase 2 新增部分。

---

## 1. 定位

Phase 1 里 workflow 只能由用户手写（`source: manual`）。Phase 2 让 agent 在对话过程中按 [definition-schema.md](definition-schema.md) 的 YAML schema 动态生成 workflow（`source: agent`），生成后引导用户确认，确认即同意内容并触发执行；用户可进一步选择是否将其沉淀为可复用的 workspace 资产。

---

## 2. 核心问题核对：这是否违反 Phase 1 "不依赖 agent 输出标签" 的原则

Phase 1 第 4 节的结论是：**触发用 MCP tool，展示不经过 fyllo-action**——因为 ACP 下无法可靠要求 agent 在 tool call 之后自己配合输出特定格式的文本标签，可靠性不能押注在提示词合规性上。

Phase 2 新增"生成后展示 YAML 供确认"这个动作，核对后结论是：**原则依然成立，不需要绕过**。原因：

- 生成动作本身是一次 **MCP tool call**（`propose_workflow`，见第 3 节），YAML 内容作为**结构化参数**直接传入，不是"agent 调用某工具后自己再吐一段文本、指望 Renderer 解析"。tool call 参数到达是 MCP server 实现的一部分，天然可靠，这与 `trigger_workflow` 传 `workflowId` 是同一类信道。
- 生成之后的确认展示，复用 Phase 1 已验证的 **wake + pull** 模式：`propose_workflow` 校验通过后落盘、触发 wake，Renderer 拉取详情展示确认卡片。全程不依赖 agent 输出文本被解析。

真正被排除的路径是"agent 先把 YAML 写成文件，MCP tool 只传文件路径"——这会引入 Phase 1 刻意避开的不确定性（文件是否写到约定路径、写入时机与 tool call 的先后关系在 ACP 下不可观察），详见第 3 节。

---

## 3. 生成信道：单一 MCP tool，直接传 YAML 内容

### 3.1 `propose_workflow`

`fyllo-workflow` MCP server 新增一个工具（在 Phase 1 已有的 `list_workflows`/`trigger_workflow` 之外）：

```ts
propose_workflow(input: {
  yaml: string;           // workflow YAML 全文
  persist: "session" | "workspace";  // 落盘目标，见第 7 节
}): {
  status: "accepted";
  runId: string;
  workflowId: string;
} | {
  status: "rejected";
  errors: Array<{ rule: string; detail: string }>;  // 结构化校验错误
}
```

**为什么 agent 不接触任何文件路径**：无论生成产物最终是临时用（`persist: "session"`）还是要沉淀（`persist: "workspace"`），落盘位置的拼接逻辑完全在主进程内部完成，agent 只表达"生成了什么内容"和"这次的持久化意图是什么"，不涉及"写到哪个具体路径"。这避免了 agent 因幻觉传错路径、或分两步操作（先写文件、再传路径）引入的中间态风险——参见第 7.1 节的进一步收口。

### 3.2 校验失败处理

`propose_workflow` 是同步的请求/响应：校验（[definition-schema.md](definition-schema.md) 第 9 节解析期规则 + 本文档第 5 节新增的 agent 专属规则）失败时，直接返回结构化错误列表，**不落盘、不触发 wake**。agent 在同一轮对话里根据错误自行修正后重新调用，类比 TypeScript 编译错误的反馈循环。

不引入"先落为 draft 状态、再异步修复"的中间态——校验失败的 YAML 不构成任何值得让 Renderer 知道的状态变化，落盘只保留给校验通过的合法内容，磁盘上不会积累半成品草稿。这与 Phase 1"不合法 YAML 不允许静默落盘"（验收标准第 1 条）是同一条原则的延伸。

---

## 4. 触发时机：静态 system-reminder 常驻注入

### 4.1 为什么常驻而非按需注入

Phase 2 要支持两条触发路径，且两者最终都收敛到同一个 `propose_workflow` 调用：

- **用户显式要求**："把这个流程存成 workflow"之类的直接指令。
- **agent 主动判断提议**：agent 认为当前对话已经产生了一个值得固化的多步骤过程，主动向用户提议。

如果 schema/contract 只在用户说出触发语句之后才临时注入，第二条路径永远无法触发——agent 在没看到 contract 之前根本不知道这个能力存在，无从谈"主动判断"。因此 workflow schema 与 `propose_workflow` 的调用 contract（类比 `fyllo-action` 的 `prompt.ts` 模式）需要**常驻**注入 system prompt。

代价是占用 system prompt token，contract 措辞需要控制长度，这是实现阶段的细节，不影响本节的架构结论。

### 4.2 触发标准的度：contract 措辞细节，非架构分歧

"agent 何时可以主动提议"这条标准写得太保守，用户会觉得这个功能形同虚设；写得太宽松，每次改完代码都被提议存 workflow，变成骚扰。这是 prompt 措辞层面的细节，不需要架构层面的决策，交给实现阶段自行拟定初稿并迭代。

---

## 5. 生成校验：`source: agent` 专属规则

### 5.1 沿用 definition-schema 第 9 节

`propose_workflow` 复用 [definition-schema.md](definition-schema.md) 第 9 节的全部解析期校验规则，不区分来源。

### 5.2 新增规则：`exec`/`webhook` 强制 `confirm: true`（仅 `source: agent`）

`propose_workflow` 收到的 YAML 中，若 `exec` 或 `webhook` 类型的 `ActionStage` 显式将 `confirm` 设为 `false`，直接拒绝。

**为什么不做命令内容审查**：命令字符串本身无法在不理解意图的情况下机械判断危险性（`rm -rf /tmp/foo` 安全、`rm -rf /` 危险，纯文本模式匹配拦不住变体又会误伤合法用途）。这与"prompt 指代词黑名单"是同一类脆弱机制——关键词过滤精确率低，且让用户困惑"为什么我这句话被拦"。真正可靠的防线是结构性的：强制 `confirm: true` 保证不管命令内容是什么，执行前必然有人肉眼看过原文才会放行。这正是 [definition-schema.md](definition-schema.md) 第 3.2 节 `confirm` 字段的本意——"对外可见、回滚代价高、代价评估不了的操作保持默认 true"，`exec`/`webhook` 恰恰是引擎完全无法评估回滚代价的一类，理应被约束得更强而非例外。

**为什么仅限 `source: agent`**：Phase 1 明确假设"手写 YAML 内容可信"，手写者自己为 `confirm: false` 负责。这条新规则针对的是"agent 自主生成内容不可完全信任"这个 Phase 2 新增的风险面，不应追溯到已有的手写信任模型。

### 5.3 不做的事：requires 上下文匹配

`propose_workflow` 只做 schema 结构校验，**不**检查 `requires` 声明的上下文（如 `requires: [task]`）是否与当前对话匹配。这类匹配校验留给 `trigger_workflow` 启动时按 Phase 1 已有逻辑处理。`propose_workflow` 与 `trigger_workflow` 的职责边界：前者只管"这是不是一份合法 YAML"，后者才管"这份 YAML 能不能在当前上下文启动"。

---

## 6. Prompt 自包含性：只做提示引导，不做机械校验

### 6.1 问题

`propose_workflow` 生成 `AgentStage.prompt` 时，agent 处于当前对话的沉浸语境里，容易写出依赖"当前对话隐含前提"的 prompt（"按上面讨论的方案改""像刚才那样处理"）。这类 prompt 一旦被沉淀复用，在脱离原对话语境的新 session（`context: fresh`）或者被沉淀后在全新对话里触发的 `context: inherit`（此时"当前对话"已经是另一个不相关的对话，见 6.3 节）中执行，会**悄悄地按错误的上下文推理**，而非明显地报错失败——这是最隐蔽的一类风险。

### 6.2 结论：contract 提示 + 现有 gate/回边容错，不引入新机制

- **不做解析期机械检测**（如扫描"上面/刚才/如上"等指代词）。这类关键词黑名单和敏感词过滤是同一类脆弱机制：正常合理的句子可能凑巧命中而被误伤，真正的悬空引用完全可以不用这些词表达（"改那个 bug"）。规则精确率低，还会让用户困惑"我这句话哪里有问题"。
- 唯一的防线是 `propose_workflow` 的常驻 contract 里明确写清楚这个心智模型：**这份 prompt 未来会在一个不知道当前对话内容的新 session 里执行，写的时候要把当前对话里所有隐含前提转成 prompt 里的显式文字**。
- 执行时的偏差依赖 [definition-schema.md](definition-schema.md) 已有的容错机制兜底：`fresh` stage 产出不理想会被后续 `gate`（`expr`/`human`）拦下，走 `next.fail` 的回边重试——这是 workflow 自身状态机设计已经覆盖的风险，不需要叠加新的语言层检测。
- 作为人工审阅的最后一道防线，见第 8.2 节：确认卡片必须完整展示 YAML 全部内容（含每个 stage 的 `prompt` 原文），不允许折叠摘要。

### 6.3 `context: inherit` 与生成/触发的关系

`context: inherit` 语义是**相对触发者**，不是绑定生成它的那个特定 session：无论 workflow 是刚生成的临时产物还是沉淀后被复用，`inherit` 每次都指向"这一次 `trigger_workflow` 发生所在的那个 session"——因为 workflow 目前唯一的触发方式就是"由某个 chat session 里的 agent 调用 `trigger_workflow`"，这个引用语义天然稳定。

因此**不需要**为"沉淀为可复用"的 workflow 强制禁止 `inherit` stage（曾考虑过这条限制，讨论后确认是伪问题：`inherit` 不存在"绑定原 session 导致未来复用时失效"的风险）。但正因为 `inherit` 在新对话中复用时会自然接上一个完全不相关的语境，第 6.2 节的自包含性提示对 `inherit`/`fresh` 两种 stage 同等适用，不因为选了 `inherit` 就豁免。

---

## 7. 确认流程与 run 状态机

### 7.1 确认 = 同意内容 + 触发执行，一步到位

`propose_workflow` 校验通过后：

1. 按 `persist` 参数落盘（`session` 或 `workspace`，见第 7.3 节），wake 通知 Renderer。
2. Renderer 拉取详情，展示确认卡片（第 8 节）。
3. 用户在卡片上确认后：**同一次操作**同时完成"接受这份内容"和"是否要开始执行"两件事——复用 Phase 1 已有的 `confirmStart` 分支语义：若 YAML 的 `confirmStart` 为 `false`（或未声明），run 直接进入 `running`；若为 `true`，run 进入 `awaiting_start_confirmation`（Phase 1 已有状态，走既有的二次确认流程）。

**不存在"确认内容"和"确认启动"两次独立确认**——生成后的这次确认卡片本身就是内容第一次被人工审阅的时刻，`confirmStart` 字段的语义区分度体现在**未来**：这份 workflow 被沉淀后，某次新对话直接调用 `trigger_workflow`（不经过 `propose_workflow`/确认卡片）触发时，才轮到"内容已经确认过、现在只是要不要为这次启动单独确认"发挥作用，这与 Phase 1 原始设计完全一致，不是新增语义。

### 7.2 用户关闭 UI / 无操作

不新增超时或自动丢弃机制。校验通过但用户尚未点击确认的 workflow，其 run 直接以 `awaiting_start_confirmation`（或等价的待确认态）落盘——这个状态本身就是无时限的挂起态，用户下次回到该 session 仍能看到待确认卡片，行为与 Phase 1 `confirmStart: true` 的既有等待语义一致，不需要为"生成后未确认"这一新场景单独设计过期策略。

### 7.3 用户点击"取消"：结果如何回传给 agent

用户选择"取消"（既不执行也不保存）时，agent 需要得到"提议被拒绝"这个反馈，否则永远不知道自己刚才的生成结果被否决。

**方案**：注入一条用户不可见的 `<system-reminder>`，告知 agent 确认结果（接受/取消）。这条 reminder 的投递时机复用 `fyllo-spawn` 已有的"抢锁排队补 turn"机制（见第 7.4 节），而非简单的单播通知。

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

本节结论定位是**视觉/交互设计规范**，供实现阶段对照，不代表现在就要动手写组件。实现顺序仍是 Phase 1 运行时地基（run 状态机、`fyllo-workflow` MCP server、`workflow:run:*` 的 wake+pull channel）先落地，UI 卡片在有真实 `WorkflowRunSnapshot` 数据源之后再接入——现在讨论只是提前把视觉/交互方案定下来，避免运行时接近完成时才回头设计 UI、来回返工。

### 8.1 组件关系：同一组件的两种状态，不是两个组件

审阅态（确认卡片）与运行态（run 状态展示）是**同一个组件的两种状态**，共享同一套 stage 拓扑布局，只是叠加/切换不同的信息层——审阅态的 stage 圆点是中性描边+kind 图标（agent/action/wait），运行态的圆点按 stage 实际状态换色（未执行灰色暗淡、执行中描边高亮+loading、已完成实心打勾、失败态红色叉）。

**为什么不做成两个独立组件**：用户从"审阅生成的 YAML"到"点击确认"到"看着它运行"是一条连贯的体验流，第 7.1 节已经定了"确认=同意内容+触发执行一步到位"——如果 UI 上审阅完之后卡片消失、换一套完全不同的组件重新渲染一遍相同的拓扑信息，会在本该连贯的体验里制造一次不必要的视觉跳变，用户还得在新组件里重新建立一次"这个 workflow 长什么样"的心智模型。

### 8.2 布局：竖向时间线，底部固定操作栏

- Stage 拓扑用竖向时间线展示（从上到下排列，圆点+竖线连接），不用横向流程图。理由：确认卡片可能挂载在对话流内联或侧边栏这类宽度受限的容器（第 8.4 节），竖向布局天然适应窄容器，且与项目已有的消息流、列表类 UI 语汇一致，不需要引入横向滚动这种新交互模式。
- 确认/取消操作固定在卡片底部，不随内容滚动。理由：第 8.3 节要求完整展示 YAML 全部字段，内容可能较长，如果操作区跟着内容走，用户需要划到底才能操作；固定操作栏保证决策入口始终可达。审阅态操作栏是"取消 / 仅本次执行 / 保存为可复用并执行"三个按钮；运行态收窄为一个"查看详情"入口，不需要重复暴露确认语义。

### 8.3 展示内容：完整、不折叠

确认卡片必须完整展示这份 workflow YAML 的**全部字段**，不只是 `prompt`，包括 stage 拓扑、每个 `ActionOp` 的具体内容（尤其 `exec`/`webhook` 的命令/URL 原文）、`confirm`/`idempotencyKey` 等所有字段，不允许折叠摘要。

**为什么不做摘要或额外预告**：第 5.2 节已经确认"结构性约束（`confirm` 字段）替代不了内容审查"，那么唯一能兜底的就是让人真正看到完整内容——任何折叠、摘要、或额外生成一段"这个 workflow 会做什么"的自然语言总结，都是在原文之外制造一层可能失真的转译，反而在用户与真实内容之间引入审阅盲区。`confirm` 字段本身已经是 YAML 里的结构化信息，UI 只需要如实、完整地渲染出来——审阅态可以在视觉上高亮 `confirm: true` 的步骤（如角标"需确认"），这是纯渲染层细节，不需要额外生成解释性文案。同理，`gate.human` 的决策提示文案（`Gate.prompt` 字段）直接展示在对应 stage 下方，让用户提前知道后面会出现决策点，不是等跑到那一步才第一次看到。

### 8.4 挂载位置：待定

确认卡片渲染在对话流内联还是 `ChatEventRail` 侧边栏，尚未决定，留作后续讨论。**数据获取链路不受此影响**：无论最终挂载在哪，都统一走 Phase 1 的 wake + pull 模式（`propose_workflow` 成功后落盘 → wake → Renderer `getDetail` 拉取详情）。wake+pull 的本质是"主进程广播失效信号，谁关心谁去 pull"，UI 容器只是 pull 到详情后的下游渲染选择，与数据产生和传递方式解耦——这是 Phase 1 设计 `sendToWorkspace` 时就刻意做到的（通用推送出口，不绑定具体挂载点），因此可以先定链路、后定容器，不会有返工风险。

### 8.5 运行态细节：gate 决策、回边、执行详情

- **gate.human 决策**：需要人工决策的 gate（`awaiting_gate_decision`）时，决策交互（提示文案 + pass/fail 按钮）直接嵌在运行卡片对应 stage 位置，不引导用户跳转到独立决策面板。理由：与 Phase 1 wake+pull 设计"减少用户操作路径长度"的目标一致，用户点开卡片就能直接决策。
- **回边/循环**：`maxLoops` 相关的回边（fail 走回头）在竖向时间线主干旁用虚线+箭头回指目标 stage，并标注"循环 N/M"。由于纯图形的弯箭头在竖向窄容器里视觉上不够醒目，失败态的 stage 说明文字应同时用文字冗余提示（如"失败，回到「实现」重试"），不单纯依赖图形连线让用户理解发生了什么。
- **执行详情展开**：`context: fresh` 的 AgentStage 执行中或已完成时，点击该 stage 行可在**同一张卡片内**行内展开/折叠一段子区域，显示对应子 session 的转录摘要，不跳转到独立页面或另开窗口。这是运行卡片"查看详情"入口的具体交互形态（呼应第 8.2 节），也与 Phase 1 第 5.1 节"fresh stage 用户可见、可点进去看"的透明度目标一致，只是用行内展开代替另开一个详情页/slideover。

### 8.6 实现参照

@nuxt/ui v4（当前项目使用 v4.10.0）自带 `UTimeline` 组件，支持 `orientation: "vertical"`，`items` 数组含 icon/title/description，并提供 `indicator`/`wrapper` 插槽支持自定义状态图标——第 8.1/8.2 节描述的骨架可以直接基于 `UTimeline` 搭建，不需要手工拼接 div+边框线。回边虚线（第 8.5 节）`UTimeline` 本身不直接支持，需要额外叠加一层 SVG 或绝对定位连线，属于局部小组件，不影响整体骨架选型。

---

## 9. 检索复用：复用 `list_workflows`，不改造接口

### 9.1 结论

Agent 在生成前，通过 contract 引导先调用 Phase 1 已有的 `list_workflows`（返回 `name` + `description`），自行判断是否有可直接复用或简单改造的既有 workflow。**不引入关键词/tag/embedding 检索机制**，不扩展 `list_workflows` 的返回字段（如 `requires`、stage 数量概览）。

### 9.2 为什么

- `list_workflows` 的 `name`/`description` 本身就是为人类和 agent 都可读的自然语言设计的，人写 description 时天然会把适用场景写进去（类比函数注释），agent 生成时在 contract 里提出同样要求即可，不需要额外的结构化元数据。
- workflow engine 是"深不广"的功能（参照 [[dynamic-workflow-engine-scope]]，退出摩擦的定位是先在少数高频动作上做扎实），可预见的 workflow 库数量级是几个到几十个，远没到需要检索基础设施才能解决"候选集过大"的规模。在问题真正出现之前引入这类设施，是这次讨论中反复出现的"不为不存在的问题背负担"原则的又一次应用（与 Phase 1 不引入 Temporal/XState 的论据一致）。
- 若未来 workflow 库规模增长到确实需要更精细的检索，这属于 Phase 3（"规模化"）的范畴，不是 Phase 2 需要预先解决的。

### 9.3 session 级临时 workflow 不参与检索

用户选择"仅本次执行"（`persist: "session"`）时，这份 workflow **不会**被 `list_workflows` 检索到（`list_workflows` 只列出 workspace 正式目录下的资产）。若同一 session 后续又出现类似需求，agent 会重新生成一次，即使内容与之前几乎相同——这是可接受的：

- "仅本次"这个选择本身就是用户当时判断"这次不值得被记住"的信号，重复生成的成本（一次 tool call）远低于为一次性用例设计跨 session 检索的复杂度。
- 如果用户发现自己确实反复需要同一个 workflow，那正是"保存为可复用"这个选项存在的意义，不需要引入额外机制替用户做这个判断。

---

## 10. 沉淀路径：持久化触发与冲突处理

### 10.1 落盘路径由 `propose_workflow` 内部决定，agent 不接触路径

延续第 3.1 节：`propose_workflow(yaml, persist)` 的 `persist` 参数只是语义标记，不是路径。工具内部按值直接写入：

- `persist: "session"` → `appData/workspaces/<workspace-id>/sessions/<session-id>/workflows/<workflow-id>.yaml`（Phase 1 第 8 节已预留此路径）
- `persist: "workspace"` → `appData/workspaces/<workspace-id>/workflows/<workflow-id>/definition.yaml`（Phase 1 正式资产路径）

### 10.2 "保存为可复用"的触发方式：纯 Renderer → Main IPC，不经 agent

用户在确认卡片上点击"保存为可复用"，把已经落在 session 目录、且已通过校验的 YAML 挪到 workspace 正式目录，这一步是**纯粹的用户操作**，通过 IPC 直接完成（类比 `getDetail` 一类既有 invoke channel），**不需要 agent 重新调用一次 `propose_workflow`**。

**为什么不经 agent**：生成是 agent 的意图表达，必须经过 agent（内容是它想出来的）；沉淀是用户对既有内容的处置决定，是纯粹的用户侧动作。参照 Phase 1 `gate.type: human` 的决策模式——"用户在 UI 上处理，通过 IPC 请求驱动 run 继续"（第 6.2 节），人工决策点应该直接落在 Renderer→Main IPC，不需要绕回 agent 再转发一次相同内容，多一次转发只会增加出错的可能，没有带来额外保证。

### 10.3 workflow-id 冲突处理

沉淀时若目标 `workflow-id` 已存在于 workspace 正式目录（重名或 agent 误判为更新已有 workflow），IPC 层拒绝静默覆盖，返回错误让 UI 提示用户"同名 workflow 已存在"，由用户决定重命名或手动确认覆盖。这与"校验失败不允许静默落盘"是同一条原则的延伸：写操作面对不确定性时不应该替用户猜测意图。

### 10.4 未被持久化的 session 临时 YAML 不需要额外清理

用户选择"仅本次执行"后，落在 session 临时目录的 YAML 文件不主动清理，随 session 自身的生命周期存在（同目录下还有 `fresh` AgentStage 产生的 transcript）。如果未来 session 本身有清理/归档机制，这份文件跟着一起处理即可，不需要为它单独设计清理流程。

---

## 11. 待后续讨论的问题

- 确认卡片的具体挂载位置：对话流内联卡片 vs `ChatEventRail` 侧边栏（第 8.4 节已确认数据链路不受此影响，可独立于本轮结论后续再定）。
- Agent 主动提议固化的具体判断标准（contract 措辞细节，第 4.2 节已说明是实现阶段自行拟定并迭代的内容，非架构分歧）。
- `gate.type: human` 决策表单、`WaitStage` 等待信号在运行卡片上的具体字段/交互细节（第 8.5 节只定了"嵌入卡片、不跳转"这个方向，具体表单形态未展开）。

---

## 12. 参照代码位置

供写 proposal / 实现时对照，而非最终真实性保证——本次讨论后代码可能已变化，动手前应重新核对当前代码。

**排队投递机制现状（`fyllo-spawn`，Phase 2 需要在此基础上抽象通用层，见第 7.4 节）**

- `src/main/services/session/chat/chat-turn-gate.ts:14`（`ChatTurnGate` 类，`tryAcquire(workspaceId, sessionId, kind)` 互斥锁，业务无关，可直接复用）
- `src/main/services/session/chat/chat-turn-service.ts:203`（`createRendererChatTurn`，`kind: "user"` 抢锁方）、`:251`（`executeNotificationTurn`）、`:344`（`claimSpawnNotificationTurn`，`kind: "notification"` 抢锁方）
- `src/main/services/session/spawn/spawn-notification-service.ts:44`（`SpawnNotificationService` 单例，`buildReminder` 负责 reminder 文本构造）
- `src/main/services/session/chat/session-registry.ts:10`（`SessionOwner` 类型定义，当前为 `"chat" | "apply" | "archive" | "spawn"`，Phase 2 需新增 `"workflow"`）

**Phase 1 已有信道与状态机（Phase 2 直接复用，不重新设计）**

- 见 [phase1-execution-design.md](phase1-execution-design.md) 第 4/6/8 节：`fyllo-workflow` MCP server 结构、wake+pull 展示信道、`WorkflowRunSnapshot` 状态机与存储路径。
