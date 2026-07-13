# Fyllo Action 架构整改参考方案

状态：参考设计草案

本文档记录 Fyllo Action 的完整整改方向。它是讨论结论和后续 OpenSpec Proposal 的输入，不是已批准的实现计划。方案会改变 Action 持久化状态、IPC 命令、用户可见提醒和模块组织；修改业务代码前仍需创建并批准正式 Proposal。

Renderer feature 的通用分层、调用顺序、公开入口和依赖规则以 `guidelines/RendererFeatures.md` 为准。本方案只记录 Fyllo Action 对该 guideline 的具体落地，不另行定义第二套 feature 组织规则。

## 1. 结论摘要

本方案采用以下核心边界：

1. Renderer 继续负责识别和解析 Fyllo Action。
2. Markstream 解析到合法 Action 且状态为 ready 后，Renderer 立即通过 IPC 向 Main 注册。
3. Main 不解析 Markdown、不引入 Markstream，也不生成 Action ID；Main 只负责幂等注册、状态迁移、安全校验和持久化。
4. 保留当前 Action ID 规则，不迁移到 messageId，也不处理 Main/Renderer assistant message ID 不一致。
5. session list IPC 和 Session 数据模型保持现状，继续返回由 session meta 映射出的 Session 数据。
6. SessionItem 内部通过通用 `useSessionAttention(session)` composable 派生 attentionCount；组件不直接包含 Fyllo Action 规则，也不维护可变提醒状态。
7. 当前只实现未处理 Fyllo Action 提醒；未来其他提醒来源通过同一个前端 attention 聚合入口接入，但本期不实现 proposal apply/archive completion 提醒。

核心数据流：

```text
Markstream 解析消息
        │
        ├─ parseResult = ready ──> 立即展示 Action UI
        │
        └─ registerAction IPC
                  │
                  ▼
        Main create-if-absent
                  │
                  ▼
        session meta.actionStates[actionId] = ready
                  │
                  ▼
        listSessions 重启恢复 actionStates
                  │
                  ▼
        Renderer 计算 attentionCount
                  │
                  ▼
        SessionItem 显示带数量的红点
```

## 2. 已确认的设计决策

### 2.1 Renderer 是唯一 Action 解析者

Fyllo Action 的发现继续沿用当前链路：

```text
Markdown stream
  -> Markstream
  -> FylloActionNode
  -> parseResult
  -> FylloActionShell / registration controller
```

Main 不复制以下逻辑：

- Fyllo Action 标签识别；
- Markdown/Markstream node 定位；
- streaming pending/ready 判断；
- Action payload 的 UI 映射；
- Inline 或 EventRail 展示投影。

Main 可以使用 shared schema 校验 Renderer 注册请求中的 type、status 和字段形状，但不从消息正文重新发现 Action。

### 2.2 保留当前 Action ID

当前规则保持不变：

```text
chat:{sessionId}:{messageIndex}:{partIndex}:{actionOrdinalInPart}
```

字段含义：

- sessionId：当前 FylloCode session ID；
- messageIndex：消息在 session.messages 中的位置；
- partIndex：part 在 message.parts 中的位置；
- actionOrdinalInPart：该 text part 中 Action 的源码顺序，从 0 开始。

本方案接受当前会话消息按追加顺序持久化和恢复的既有约束，不引入：

- Action ID v1；
- messageId 派生 ID；
- Main 分配 Action ID；
- Main/Renderer messageId 统一；
- Action ID 历史迁移。

如果未来产品允许编辑、插入或重排历史 assistant messages，应重新评估当前位置型 identity；这不属于本次整改范围。

### 2.3 不修改 Session/listSessions 模型

本方案不拆分 SessionSummary 与 SessionDetail，不改变 listSessions 的返回模型，也不向 Session 增加持久化 attention 字段。

Renderer 从现有 Session.actionStates 派生提醒数量。纯 selector 负责当前 Fyllo Action 规则：

```ts
function getFylloActionAttentionCount(session: Session): number {
  return Object.values(session.actionStates ?? {}).filter(
    (state) => state.status === "ready" || state.status === "failed"
  ).length;
}
```

SessionItem 内部调用通用 attention composable：

```ts
const props = defineProps<{
  session: Session;
}>();

const { attentionCount } = useSessionAttention(toRef(props, "session"));
```

`useSessionAttention` 负责聚合提醒来源；当前只调用 Fyllo Action selector，未来可在不修改 SessionItem 公共接口的前提下接入 proposal completion 等来源。SessionItem 只消费 composable 返回的派生值，不读取 Fyllo Action store、不解析 Action、不理解 Action type，也不持有可变的 attentionCount。

### 2.4 不做历史会话全量回填

默认范围：

- 新版本运行后被 Renderer 识别的 Action 会立即注册 ready；
- 已注册 ready 的 Action 可在重启后恢复红点；
- 升级前从未持久化 ready 的旧 pending Action，不在启动时扫描全部历史消息；
- 用户打开旧会话后，Renderer 正常解析并按新规则补注册。

这样避免启动时读取所有 session message JSONL，也不要求 Main 复制 Renderer parser。

## 3. 问题清单

### 3.1 Action 生命周期与提醒

1. 当前 actionStates 只持久化 succeeded、failed、cancelled，不记录 Action 已被发现。
2. 应用重启后，未打开会话没有 messages，无法得知有哪些 pending Action。
3. failed 在 Shell 中允许重试，但 EventRail 把任何已有 state 都视为已处理。
4. Action 注册、执行和状态同步没有明确的状态机和迁移约束。
5. SessionItem 没有通用的提醒派生边界，未来新增提醒时容易直接耦合 Action store、parser 或上层 prop plumbing。

### 3.2 状态写入与副作用一致性

1. 当前 Renderer 可以提交完整 type、status 和 updatedAt，Main 缺少可信状态机。
2. 当前状态写入是 last-write-wins，没有 expected revision 或合法迁移检查。
3. task.create 先执行副作用，再单独持久化 Action state；状态写失败后重试可能重复建任务。
4. knowledge.flag capture message 没有等待 durable append 就可能标记 succeeded。
5. 批量 knowledge flags 通过多个独立 IPC 写入，可能部分成功。
6. Renderer 乐观更新 actionStates 后，IPC 失败不会完整回滚或提供“只重试状态同步”。
7. handler 使用 current project/current active session 组装上下文，存在切换竞态。
8. task store 的 read-modify-write 缺少项目级锁，并发创建可能互相覆盖。

### 3.3 IPC、存储与安全

1. sessionId 只校验非空，未统一限制为安全路径段。
2. Action state IPC 没有充分绑定发送窗口所属 project。
3. Main 接受 Renderer 自报时间戳，没有由 Main 生成 authoritative updatedAt。
4. storage 通过当前 enabled Action registry 过滤历史状态，禁用或删除 Action type 时可能静默丢数据。
5. 持久化 envelope 没有 schema version。
6. 未知历史 Action record 不能安全保留和诊断。

### 3.4 Shared 协议组织

当前能力分散在：

```text
src/shared/types/fyllo-action.ts
src/shared/schemas/fyllo-action.ts
src/shared/constants/fyllo-action-contracts.ts
src/shared/utils/fyllo-action.ts
```

问题：

1. 类型、schema、registry、parser 和 prompt formatter 没有形成 capability 边界。
2. constants 文件混合 runtime schema、交互元数据、Prompt 文案和示例。
3. Shared registry、Renderer registry、dispatcher handler map 重复枚举 Action type。
4. Renderer registry 不是编译期穷尽 Record，缺项只会在运行时抛错。
5. presentation 和 interaction 在多层重复声明，且没有完整驱动行为。
6. 缺少通用 Fyllo Action OpenSpec，核心协议主要由代码承载。

### 3.5 Renderer 文件组织与单一职责

1. Fyllo Action 横跨 config、utils、composables、components、stores 多个技术目录。
2. FylloActionShell 同时承担 UI、执行状态机、错误状态、单条/批量持久化。
3. fyllo-action-rail.ts 同时遍历消息、解析标签、生成 ID、过滤状态和映射 UI DTO。
4. knowledge.flag handler 依赖 Rail 展示 DTO，形成 application 到 presentation 的反向依赖。
5. plan.create handler 从 Vue SFC 导入结果类型。
6. useFylloActionDispatcher 实质是 application service，却以普通 composable 形式存在。
7. 每个 FylloActionNode 都重新装配 handlers、stores 和 overlays。
8. Inline node、Rail collector、ordinal context 存在多条解析/identity 路径。
9. EventRail 在响应式变化时扫描完整 transcript，长会话下成本持续增加。
10. ESLint 没有约束 Fyllo Action feature 内部的 application/UI/infra 依赖方向。

### 3.6 System reminder 与 Knowledge 安全

1. 动态字段包含尖括号时，整份 Chat system-reminder 可能被丢弃。
2. 空 knowledge index 时省略规范要求的 knowledge block。
3. knowledge.flag summary 允许换行，拼入高优先级 system-reminder 时数据边界不够强。
4. candidate 只转义尖括号，不能防止伪字段或指令型文本。
5. Knowledge review autosave 后台失败可能产生未处理 Promise rejection。
6. slideover 卸载时没有可靠 flush debounce 内的 dirty 内容。

## 4. 目标文件组织

### 4.1 Shared capability

```text
src/shared/fyllo-action/
├── protocol.ts
├── schemas.ts
├── registry.ts
├── parser.ts
├── identity.ts
├── state.ts
└── prompt.ts
```

职责：

- protocol.ts：FylloActionType、payload 判别联合、handler result 等纯类型；
- schemas.ts：payload、持久化 record、IPC input 的 strict schemas；
- registry.ts：编译期穷尽的 Action contract registry；
- parser.ts：标签 source 收集和 payload schema 验证；
- identity.ts：保留当前位置型 Action ID 构造和 source 类型；
- state.ts：ready/failed/succeeded/cancelled 状态、终态谓词和迁移规则；
- prompt.ts：把 registry 中的结构化 Prompt 描述渲染为可直接注入 system-reminder 的字符串。

### 4.2 prompt.ts 的具体内容

prompt.ts 不是新的 Prompt 数据源，也不保存 UI 文案。结构化 Action 描述仍由 registry.ts 提供，prompt.ts 只负责确定性格式化。

registry entry 建议包含：

```ts
interface FylloActionContract<Type extends FylloActionType> {
  type: Type;
  payloadSchema: ZodType<FylloActionPayloadByType[Type]>;
  presentation: "inline" | "rail";
  interaction: "confirm";
  prompt: {
    purpose: string;
    payloadFields: readonly {
      name: string;
      required: boolean;
      description: string;
    }[];
    constraints: readonly string[];
    example: FylloActionPayloadByType[Type];
  };
}
```

prompt.ts 提供纯函数：

```ts
export interface FylloActionPromptSection {
  id: "fyllo-action-contract";
  content: string;
}

export function buildFylloActionPromptSection(): FylloActionPromptSection;

export function renderFylloActionPromptContract(): string;
```

renderFylloActionPromptContract() 输出完整、可直接注入的稳定文本，例如：

```text
<fyllo-action-contract>
Rules:
- Only emit enabled action types.
- The only allowed attribute is type.
- The body must be a strict JSON object.
- Encode literal angle brackets inside JSON strings.

Enabled actions:
- task.create
  Purpose: ...
  Required fields: title
  Optional fields: description
  Example:
  <fyllo-action type="task.create">
  {"title":"..."}
  </fyllo-action>
</fyllo-action-contract>
```

约束：

1. 输出是 plain string，不依赖 Electron、Vue、AI SDK 或 TextUIPart。
2. Main system-reminder provider 决定注入时机和外层组合。
3. formatter 只消费开发者维护的静态 registry，不拼接用户输入、项目路径或会话内容。
4. example 使用 JSON.stringify 生成，禁止手写不一致 JSON。
5. registry 顺序固定，确保 snapshot test 稳定。
6. prompt.ts 不导出 payload parser，不被 storage 导入。
7. Renderer UI title、icon、confirmLabel、component 不进入 shared prompt contract。

因此答案是：prompt.ts 的产物应当已经结构化完成并可直接注入 system-reminder；但它只负责 Fyllo Action contract section，Main provider 仍负责把该 section 放进完整 Chat system-reminder。

### 4.3 Renderer capability

```text
src/renderer/src/features/fyllo-action/
├── README.md
├── index.ts
├── model/
│   ├── selectors.ts
│   └── pending-actions.ts
├── application/
│   ├── registration.ts
│   ├── execution-controller.ts
│   ├── execution-runtime.ts
│   ├── ports.ts
│   └── handlers/
├── ui/
│   ├── FylloActionShell.vue
│   ├── FylloActionNode.vue
│   └── actions/
└── integration/
    ├── markstream.ts
    ├── event-rail.ts
    └── renderer-registry.ts
```

目录职责、外部导入方式和依赖约束遵守 `guidelines/RendererFeatures.md`。依赖只允许由外向内：UI/integration 可以依赖 application/model，application 可以依赖 model，反向依赖禁止。feature 外部默认只从 `index.ts` 导入；Markstream 和 EventRail 的宿主装配如需独立入口，必须在 README 中显式列出。

Renderer 仍消费 Markstream 提供的 parseResult，不自建另一套 Markdown parser。

`pending-actions.ts` 只做 feature-owned 纯投影：

```text
Session messages + actionStates
  -> PendingFylloAction[]
```

它不返回 EventRail DTO，不包含 icon、展开状态、定位回调或 panel props。`integration/event-rail.ts` 再把 `PendingFylloAction[]` 映射为 EventRail contributor。这样 model 不依赖宿主展示结构，EventRail 也只消费 Fyllo Action 的公开投影。

原本含混的 `execution-state.ts` 不保留为单文件：

- ready/failed/succeeded/cancelled、终态和 attention 谓词由 `src/shared/fyllo-action/state.ts` 统一拥有；Renderer 不复制持久化状态定义；
- running、retrying、side-effect-succeeded-but-sync-pending 等 Renderer 临时控制状态放入 `application/execution-runtime.ts`；
- hover、expanded、局部 dialog open 等单组件状态留在 `ui/` 对应组件内部；
- application runtime 不写入 session meta，也不进入 shared IPC contract。

registration.ts 负责：

- 监听 parseResult 从 pending/invalid 进入 ready；
- 要求 actionId 已解析；
- 检查本地 persistedState 是否存在；
- 使用 in-flight Set 对并发和 remount 去重；
- 调用 registerAction IPC；
- 用 Main 返回的 authoritative record 更新 store；
- 注册失败时保留 Action UI，并提供可重试的同步状态。

FylloActionShell 负责：

- 展示 pending/invalid/ready/running/failed/terminal；
- 发出 confirm/cancel/retry 意图；
- 展示执行错误和持久化错误；
- 不直接装配 domain stores；
- 不遍历其他 Action；
- 不负责批量 IPC。

execution-controller.ts 负责：

- 冻结 projectId、sessionId、actionId；
- 选择 typed handler；
- 区分业务副作用失败与状态同步失败；
- 处理批量 completedActionIds；
- 调用单条或批量 transition API。

### 4.4 Main capability

```text
src/main/services/session/action/
├── action-service.ts
├── action-state-machine.ts
└── action-execution-idempotency.ts
```

Main 明确不包含 parser/projector。

action-service.ts 负责：

- registerAction create-if-absent；
- transitionAction；
- transitionActions batch；
- project/session/sender 绑定校验；
- Main authoritative timestamp；
- revision/CAS；
- 返回当前 Action record。

action-state-machine.ts 负责合法迁移：

```text
不存在 -> ready
ready -> succeeded | failed | cancelled
failed -> succeeded | failed | cancelled
succeeded -> terminal
cancelled -> terminal
```

running 保持 Renderer runtime 状态，不要求持久化。dismissed 不改变 ready。

action-execution-idempotency.ts 只提供 durable side-effect 的 actionId 幂等支持；具体 executor 仍属于 task、proposal、knowledge 等原 domain。

## 5. Ready 注册方案

### 5.1 Shared state

```ts
export type FylloActionStateStatus = "ready" | "succeeded" | "failed" | "cancelled";

export interface FylloActionState {
  type: FylloConfirmActionType;
  status: FylloActionStateStatus;
  revision: number;
  updatedAt: string;
}
```

共享谓词：

```ts
export function isFylloActionResolved(state: FylloActionState): boolean {
  return state.status === "succeeded" || state.status === "cancelled";
}

export function requiresFylloActionAttention(state: FylloActionState): boolean {
  return state.status === "ready" || state.status === "failed";
}
```

所有 Inline、Rail、badge 和 batch collector 必须复用这些谓词，禁止各自使用“是否存在 state”判断。

### 5.2 Register IPC

建议新增：

```ts
registerAction({
  projectId,
  sessionId,
  actionId,
  type,
});
```

Main 行为：

1. 校验 sender 所属 project；
2. 校验 sessionId 安全性和 session 归属；
3. 校验 actionId 非空、type 为支持的 confirm Action；
4. 若 actionId 不存在，写入 ready/revision=1；
5. 若 actionId 已存在且 type 一致，原样返回；
6. 若 actionId 已存在但 type 不一致，返回冲突错误；
7. 不允许 ready 覆盖 failed、succeeded 或 cancelled；
8. 幂等命中时不更新 session.updatedAt，避免 remount 导致列表重排。

Main 不校验该 Action 是否真的存在于 Markdown；这延续当前 Renderer 信任边界。安全防护聚焦于路径、project ownership、schema 和合法状态迁移。

### 5.3 Transition IPC

将 Renderer “提交完整目标 state”收窄为命令：

```ts
transitionAction({
  projectId,
  sessionId,
  actionId,
  command: "succeed" | "fail" | "cancel",
  expectedRevision,
});
```

批量 knowledge flags 使用：

```ts
transitionActions({
  projectId,
  sessionId,
  actionIds,
  command: "succeed",
  expectedRevisions,
});
```

Main 在一次 session meta patch 中完成批量更新。

## 6. Renderer attentionCount

### 6.1 聚合入口

建议新增 Renderer 纯 selector 或 composable：

```text
src/renderer/src/features/session-attention/
├── selectors.ts
└── useSessionAttention.ts
```

当前只注册一个 contributor：

```ts
function countFylloActionAttention(session: Session): number {
  return Object.values(session.actionStates ?? {}).filter(requiresFylloActionAttention).length;
}
```

纯聚合 API：

```ts
interface SessionAttention {
  count: number;
}

function getSessionAttention(session: Session): SessionAttention;
```

组件侧 API：

```ts
function useSessionAttention(session: MaybeRefOrGetter<Session>): {
  attentionCount: ComputedRef<number>;
};
```

`useSessionAttention` 是提醒来源的组件侧编排边界：它读取 session ref，调用纯 selector，并在未来按 session ID 组合其他提醒 store。各 contributor 只返回自己的数量，不依赖 SessionItem。

未来 proposal completion 可以新增 contributor，但不改变 SessionItem 及其 props：

```ts
count = countFylloActionAttention(session) + countFutureProposalAttention(session.id);
```

本期不新增共享 SessionAttentionSummary 类型，也不把 attention 写入 session meta。

### 6.2 SessionItem 内部派生

ChatSidebar 保持简单，只传已有的 session：

```vue
<SessionItem v-for="session in sessions" :key="session.id" :session="session" />
```

SessionItem 不新增 attentionCount prop，而是在 setup 内获取派生值：

```ts
const props = defineProps<{
  session: Session;
}>();

const { attentionCount } = useSessionAttention(toRef(props, "session"));
```

职责边界：

- SessionItem 负责决定“会话条目如何展示提醒”；
- `useSessionAttention` 负责聚合“这个会话有多少提醒”；
- contributor/selector 负责判断“某类事件是否需要提醒”；
- Main 和 session meta 只保存来源状态，不保存 attentionCount 这个视图派生值。

展示约束：

- attentionCount <= 0 时不显示；
- 1 至 99 显示实际数字；
- 大于 99 显示 99+；
- 提供 aria-label，例如“3 项待处理”；
- 不只依赖红色表达状态；
- 与现有 running pulse 分开；
- 不阻挡 hover menu 和点击会话行为。

## 7. 执行一致性整改

### 7.1 副作用幂等

所有 durable side-effect command 应携带 actionId：

- task.create：actionId 作为 task creation idempotency key；
- knowledge capture：同批 Action IDs 作为 capture request idempotency key；
- 文档保存：由文档自身 revision/内容语义保证，不重复创建副本。

Main/domain service 必须能在重复请求时返回第一次结果，而不是再次执行。

### 7.2 状态同步失败

Renderer execution controller 区分：

```text
业务副作用未成功
业务副作用成功，但 Action state 未同步
全部成功
```

第二种状态只能重试 transition，不能重新调用业务 handler。

### 7.3 Task store

- 对同一项目 tasks.json 的 read-modify-write 加队列锁；
- 使用 temp file + rename；
- 幂等键命中时返回已有 task；
- 增加两个并发 task.create 不丢数据的测试。

### 7.4 Knowledge capture

- sendMessage 必须能返回用户消息已 durable append 的确认；
- durable append 成功后才能 batch succeed；
- batch transition 失败时保留明确的“消息已发送、状态待同步”恢复信息；
- failed flags 仍留在 pending collection 中。

## 8. Security 与 Prompt 整改

### 8.1 Session ID 和 sender

- 抽取 shared safeSessionIdSchema；
- IPC schema 校验安全路径段；
- storage resolve 后再次做目录 containment 防守；
- IPC handler 从 sender/window context 校验 project ownership；
- Renderer 提供的 projectId 不能单独作为授权依据。

### 8.2 持久化版本

session meta 中为 Action state container 增加版本：

```ts
interface PersistedFylloActionStates {
  version: 1;
  records: Record<string, FylloActionState>;
}
```

读取策略：

- 支持现有无 envelope 的 legacy map；
- 未知 version 保留原始数据并报告诊断，不静默覆写；
- 未知 Action type 不因当前 registry 禁用而被删除；
- storage 只做结构校验，不依赖 prompt registry。

### 8.3 System reminder

- 动态路径、标题等字段编码尖括号，不因单字段异常丢弃整份 reminder；
- 空 knowledge index 仍输出固定 knowledge admission/flag 指令；
- prompt.ts 的 Fyllo Action contract 作为纯静态 section 注入；
- system-reminder provider 负责 section 顺序和总装，不复制 Action contract 文案。

### 8.4 Knowledge candidate

- summary schema 拒绝 CR/LF，落实“一句话”；
- candidate 列表用 JSON.stringify 生成；
- reminder 明确标注 candidate 为不可信数据；
- 不使用 YAML-like 无引号拼接；
- 增加伪指令、反引号、尖括号和多行输入测试。

### 8.5 Knowledge review autosave

- 后台 debounce save 消费 rejection，错误进入本地状态；
- 显式确认/关闭仍 await save 并阻止丢数据；
- unmount 时 flush 或明确阻止带 dirty state 的销毁；
- 增加 autosave failure 和 teardown 测试。

## 9. Registry 与依赖方向

Shared registry 使用穷尽 Record：

```ts
const contracts = {
  "task.create": ...,
  "plan.create": ...,
  "knowledge.flag": ...,
  "knowledge.review": ...
} satisfies Record<FylloActionType, FylloActionContract<FylloActionType>>;
```

Renderer 只维护 concrete UI override：

```ts
const rendererDefinitions = {
  "task.create": { component: TaskCreateAction, title: "...", icon: "..." },
  ...
} satisfies Record<FylloActionType, RendererActionDefinition>;
```

presentation 和 interaction 从 shared contract 获取，Renderer 不重复定义。

依赖约束：

```text
shared protocol
      ↓
renderer model/application
      ↓
renderer UI/integration

renderer registration/execution
      ↓ IPC
main session/action service
      ↓
domain-owned services
      ↓
infra storage
```

Renderer feature 内部的详细允许/禁止依赖以 `guidelines/RendererFeatures.md` 为准。Fyllo Action 的具体约束补充如下：

禁止：

- handler import Vue SFC；
- handler import Rail DTO；
- infra import prompt.ts；
- storage import Renderer registry；
- UI 直接 import Main/infra；
- Action service 直接吞并各 domain 的业务实现。

## 10. 实施阶段

### Phase 1：规范与回归基线

1. 新增通用 Fyllo Action OpenSpec。
2. 更新 knowledge spec，允许通用 ready actionStates，但仍禁止 knowledge 专用 projection。
3. 固化当前 Action ID 规则为明确约束。
4. 为现有 parser、Rail、Shell、state persistence 建立回归测试。
5. 以 `guidelines/RendererFeatures.md` 作为 Renderer feature 重组的目录和依赖验收基线。

### Phase 2：Shared capability 重组

1. 创建 src/shared/fyllo-action。
2. 迁移 protocol、schemas、registry、parser、identity、state、prompt。
3. 提供临时 re-export，避免一次性打断全部 import。
4. 增加 exhaustive registry 和 prompt snapshot 测试。

### Phase 3：Main Action service

1. 新建 session/action service。
2. 新增 registerAction。
3. 新增单条和批量 transition。
4. Main 生成 updatedAt/revision。
5. 增加 safe session ID、sender/project 校验。
6. 改造 storage version 和 legacy decoder。

### Phase 4：Renderer feature 重组

1. 移动 handlers、Shell、Node、registry override。
2. 增加 registration controller。
3. 用 `model/pending-actions.ts` 输出 feature-owned 纯投影，由 `integration/event-rail.ts` 转换宿主 DTO。
4. 删除含混的 Renderer `execution-state.ts`：持久化谓词归 shared state，临时运行状态归 `application/execution-runtime.ts`，局部展示状态归 UI。
5. 拆分 Shell 与 execution controller。
6. 统一 isResolved/requiresAttention selector。
7. Rail 不再通过“存在 state”过滤。
8. Dispatcher 在 Chat host 装配一次。
9. 冻结 action execution context。
10. 增加 feature README、受控 `index.ts` 和 integration entry 说明。

### Phase 5：attentionCount

1. 新增 renderer session-attention selector/composable。
2. 当前 contributor 只计算 ready/failed Fyllo Actions。
3. SessionItem 内部调用 `useSessionAttention(session)`，不新增 attentionCount prop。
4. ChatSidebar 继续只向 SessionItem 传 session。
5. SessionItem 显示数量、aria-label 和 tooltip。
6. 不修改 Session/listSessions 模型。

### Phase 6：执行一致性

1. task.create actionId 幂等。
2. task store lock + atomic write。
3. knowledge message durable append。
4. batch transition。
5. 只重试状态同步。
6. 修复 project/session 切换竞态。

### Phase 7：Prompt 与可靠性

1. system-reminder 安全编码和空 knowledge block。
2. knowledge candidate JSON 边界。
3. autosave rejection/flush。
4. 根据最终实现回查 Architecture、MainProcess、RendererProcess、Renderer Feature Architecture、Testing、Quality Gates guidelines；只更新与落地事实不一致的内容。

### Phase 8：清理

1. 删除旧兼容 re-export。
2. 删除重复 registry 和旧 rail DTO 依赖。
3. 增加 ESLint feature boundary。
4. 测试目录镜像新结构。

## 11. 测试矩阵

### Shared

- ready state schema；
- 状态终态/attention 谓词；
- 当前 Action ID 确定性；
- registry 穷尽；
- prompt contract snapshot；
- payload strict schema；
- legacy/new persistence envelope。

### Main

- register create-if-absent；
- remount 重复注册不更新 updatedAt；
- ready 不覆盖 terminal；
- type mismatch conflict；
- revision/CAS；
- batch transition 原子性；
- sender/project/session 校验；
- path traversal；
- unknown Action type preservation；
- concurrent task create；
- idempotent side effect retry。

### Renderer

- Markstream ready 后立即展示 UI；
- ready 后只发一次 register IPC；
- registration failure 可重试；
- persisted ready 恢复 Shell ready；
- ready/failed 留在 EventRail；
- succeeded/cancelled 从 pending 集合移除；
- state sync failure 不重跑副作用；
- session/project 切换保持原上下文；
- attentionCount 聚合；
- SessionItem 数量、99+、aria-label；
- running pulse 与 attention badge 共存。

### Integration/E2E

1. Agent 输出 Action，Renderer 立即展示。
2. register IPC 成功后退出应用。
3. 重启但不打开会话，SessionItem 显示正确数量。
4. 打开会话并取消一个 Action，数量减一。
5. 执行失败后数量不减少。
6. retry 成功后数量减少。
7. 多个 Action batch succeed 后一次性清除。
8. 业务副作用成功、状态写失败后只重试状态同步。
9. 旧会话首次打开后 lazy 注册 pending Actions。
10. Main 全程不解析 Markdown、不依赖 Markstream。

## 12. 验收标准

1. Renderer streaming UI 与当前体验一致，不等待 Main 解析或 turn 完成。
2. 每个合法 ready Action 至多创建一条持久化 ready state。
3. ready 和 failed 在重启后驱动 attentionCount。
4. succeeded 和 cancelled 不计入 attentionCount。
5. EventRail、Inline 和 Session badge 使用同一状态谓词。
6. Session/listSessions 模型保持不变。
7. SessionItem 通过 `useSessionAttention(session)` 消费派生的 attentionCount，不包含具体提醒来源规则，也不维护可变提醒状态。
8. 当前 Action ID 格式保持不变。
9. Main 不生成 Action ID、不解析 Markdown、不引入 Markstream。
10. 重复操作不会重复创建 durable 业务对象。
11. sessionId traversal 和跨项目状态写入被拒绝。
12. prompt contract 可由 shared prompt.ts 直接生成并注入 system-reminder。
13. Fyllo Action 文件按 capability 聚合，并符合 `guidelines/RendererFeatures.md` 的四层语义、公开入口和依赖方向；关键边界可由 lint 验证。

## 13. 明确不纳入

- Action ID v1；
- 基于 messageId 的 Action identity；
- Main/Renderer assistant messageId 统一；
- Main 解析 Fyllo Action；
- SessionSummary/SessionDetail 拆分；
- Session model 增加 attention 字段；
- Main 持久化通用 attention projection；
- 启动时全量扫描历史 transcript；
- proposal apply/archive completion 提醒；
- 通用通知中心或 reminder event log。

## 14. Proposal 建议

正式实施时建议创建一个 umbrella OpenSpec Proposal：

```text
stabilize-fyllo-action-architecture
```

Proposal 应按本文 Phase 划分可独立验证的任务批次，并明确：

- Renderer parsing authority 不变；
- ready 注册是新增行为契约；
- Main 只负责 action state application service；
- 当前 Action ID 和 Session/listSessions 模型保持不变；
- references 文档只作为设计输入，最终以批准后的 OpenSpec artifacts 为准。
