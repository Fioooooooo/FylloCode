## Context

ACP `tool_call` / `tool_call_update` 已经由 `acp-mapper/tool-call-mapper.ts` 转换为 `StreamContentEvent`，并由 `acp-stream-driver.ts` 同时交给 Main `MessageAssembler` 和 Renderer stream。当前链路存在三类断点：

- mapper 会拒绝 ACP 合法的 `pending`，把未携带 status 的 update 强行当作 `in_progress`；两套 assembler 又把 `failed` 和 `completed` 都写成 AI SDK `output-available`。
- `diff` 与 `locations` 已存在于共享事件，但 Main 和 Renderer assembler 都未写入 `DynamicToolUIPart`，Renderer 的 `ChatToolDetails` 也只消费 Input/Output。
- `MessageMeta` 只有 `sessionId` 与 `createdAt`。Renderer 先持久化 user message，Main 在 Prompt 实际 dispatch 后才得到经过恢复/override 的最终 config snapshot，因此不能靠事后读取 session 当前配置准确还原某轮实际使用的 model/effort。

Main 与 Renderer assembler 的分离是既有设计约束：Main 负责可在 Renderer 退出后继续完成的权威组装与持久化，Renderer 负责临时响应式消息、独立 message ID、reasoning `streaming/done` 和 `liveOutput`。本变更保持该边界，但消除两套工具事件转换规则的漂移。

## Goals / Non-Goals

**Goals:**

- 从 ACP mapper、共享事件、Main/Renderer assembler、JSONL 到工具 UI 完整保留四态、diff 和 location。
- 让实时消息与 Main 持久化后重新加载的消息具有相同工具状态、diff、location、输入、输出和失败信息。
- 为所有新产生的 user/assistant `UIMessage` 记录 `updatedAt`，并在实际 Prompt dispatch 后记录该轮 `model` 与 `effort`。
- 保持旧消息可读，不对已有 JSONL 执行批量迁移。

**Non-Goals:**

- 不处理或重构 `usage_update`，不启用当前废弃的 `PromptResponse.outputTokens` 取值。
- 不改变 `available_commands_update`、`config_option_update`、`plan`/`agenda_update`、刻意过滤的 `session_info_update` 或待废弃的 `current_mode_update`。
- 不持久化 plan，不引入 v1 不存在的 `plan_update` / `plan_removed`。
- 不在消息中重复记录 Agent；Agent 继续由 session meta 固定，已开始会话不可更换 Agent。
- 当前消息组件不展示 `updatedAt`、`model` 或 `effort`。
- 不合并 Main/Renderer assembler，不同步两边 message ID，也不持久化 Renderer 的 `liveOutput`、indicator、临时 ID 或 reasoning 展示状态。

## Decisions

### 1. 共享 ACP 工具状态，保留 update 的 patch 语义

在 `src/shared/types/stream-event.ts` 定义统一 `ToolCallStatus = "pending" | "in_progress" | "completed" | "failed"`。`tool_call_start.status` 使用 ACP 提供值，缺失时回退 `pending`；`tool_call_update.status` 保持可选，缺失表示“不修改现有状态”，不得再自动改成 `in_progress`。孤立 update 没有可继承状态时才回退 `in_progress`。

ACP 0.25 的 update contract 明确规定 `content` 和 `locations` 是 replacement collection。mapper 因此必须区分：

- 字段未出现：内部事件不携带对应属性，assembler 保留旧值；
- 字段出现但为 `null`、空数组或不含 diff：内部事件携带空数组，assembler 清除旧值；
- 字段出现且包含有效值：assembler 以本次数组替换旧值。

该规则同时适用于从 `content` 提取的 `diff` 与 `locations`。无效单项仍被过滤，但不能把“显式替换为空”误判为“字段缺失”。

备选方案是简单追加每次 update 的数组；它会在 Agent 重发 replacement snapshot 时制造重复或保留已撤销位置，因此不采用。

### 2. 在 shared 中集中纯工具 part 归并，assembler 继续各自拥有生命周期

新增 `src/shared/chat/tool-call-assembly.ts`，提供框架无关的纯 reducer 和工具元数据读取函数。Reducer 接受已有 `DynamicToolUIPart`、当前 start/update event 与已累计 output delta，返回替换后的 part、下一份累计输出和终态信息。它统一负责：

- title、toolName、input、toolKind、`parentToolCallId`、subagent 摘要的保留/合并；
- `acpStatus`、diff、locations 的 replacement；
- ACP 状态到 AI SDK part 状态的映射：`pending → input-streaming`、`in_progress → input-available`、`completed → output-available`、`failed → output-error`；
- completed 使用 `output`，failed 使用 `errorText`，不能再把失败写为成功 output。

Main `MessageAssembler` 与 Renderer `useUIMessageAssembler` 继续各自查找/创建消息、维护 active part index 和 output delta map。Renderer 在 reducer 结果之上维护 `toolMetadata.liveOutput`，并在终态删除；Main 不写入该临时字段。两边使用同一组共享 fixture 验证 reducer 输入输出，并各自保留生命周期测试。

备选方案是让 Renderer 直接消费 Main 的持久化消息或把两套 assembler 合并；这会失去首个 chunk 即时显示、临时 reasoning 状态和 Renderer 关闭后独立持久化能力，因此不采用。

### 3. 将工具可观测字段持久化在 toolMetadata，并由现有工具详情消费

`DynamicToolUIPart.toolMetadata` 增加稳定字段：

- `acpStatus`
- `diff`
- `locations`

它们与现有 `toolKind`、`parentToolCallId`、`subagent` 一起进入 Main 最终 JSONL；Renderer 临时 part 使用同一形状。旧消息没有 `acpStatus` 时，展示 helper 按 AI SDK state 回退推导：input state 视为运行中，`output-available` 视为完成，`output-error` 视为失败。

`src/renderer/src/utils/chatTool.ts` 增加状态、错误、diff、location 的安全读取和格式化函数。`ChatToolItem.vue` / `ChatActivityGroup.vue` 继续使用 `UChatTool` 的现有折叠结构，但每个具体工具必须用文字表达“等待执行 / 正在执行 / 已完成 / 失败”，不能只依赖颜色或 spinner。Activity group 顶层摘要仍按既有规则显示类别统计，不增加整组状态前缀。

`ChatToolDetails.vue` 在已有 Input/Output 之外按可用性增加：

- `Error`：展示 `output-error.errorText`；
- `Changes`：按事件顺序展示每个 path。新文件只展示新增内容；修改文件以“修改前 / 修改后”两个只读、限高可滚动代码区展示完整 `oldText` / `newText`；
- `Locations`：展示 path 与可选 line，点击时调用 `@renderer/features/local-file-preview` 的公共 `useLocalFilePreview()`，以 `path:line` 形式复用现有窗口级 Slideover 和授权校验。

不新建另一套文件读取 IPC，不让组件直接访问 `window.api`，也不引入新的 diff 依赖。

### 4. Prompt dispatch 产生非 ACP 的 turn audit 事件

模型和 effort 必须来自 `AcpSession.runPrompt()` 实际 dispatch 使用的 `configOptions`，而不是 Renderer 发送前的可变 session snapshot。新增内部 `turn_metadata` 事件，字段为：

- `userMessageId`
- `dispatchedAt`
- 可选 `model`
- 可选 `effort`

`model` 与 `effort` 分别按 config option `category === "model"` 与 `category === "thought_level"` 读取 select option 的 `currentValue`；缺失时保持 undefined，不按 option id、显示名称或 Agent 类型猜测。

`AcpSession` 在底层 `connection.prompt()` 已被调用且现有 `onPromptDispatched` 成功后发出内部 dispatch 通知。`driveAcpTurn` 在启动前注册监听，并使用调用方传入的 `userMessageId` 将通知转换为 `turn_metadata`：

- Main assembler 缓存 model/effort，在 assistant 首个内容到达时写入；若 assistant 已创建则更新其 metadata，但 metadata 事件本身不创建空 assistant message。
- `driveAcpStream` 把同一事件发送给 Renderer；Renderer patch 对应 user message，并缓存/更新当前临时 assistant metadata。
- 各持久化流程通过 hook 按 message ID patch 已经 durable append 的 user message，避免按“最后一条 user”猜测身份。

Chat、Proposal Apply、Proposal Archive、spawned turn 与自动 spawn notification 都复用这条路径；已经存在的 spawned turn config summary 保持不变，不作为 `MessageMeta` 的替代来源。

备选方案是在 Renderer 提交 user message 时直接记录当前配置；ACP resume/load/recovery 和 turn override 可能改变实际 dispatch snapshot，审计结果不可靠，因此不采用。

### 5. MessageMeta 采用向后兼容字段并明确 updatedAt 语义

`MessageMeta` 增加：

```ts
updatedAt?: Date;
model?: string;
effort?: string;
```

字段在类型上保持可选以兼容旧 JSONL；所有新版 message constructor 必须写入 `updatedAt`。语义如下：

- 创建 user message 时 `updatedAt === createdAt`；插入 reminder、写入 dispatch metadata 或其他消息内容/metadata 变化时推进。
- 创建 assistant message 时 `updatedAt === createdAt`；每个实际改变 part 或 metadata 的事件推进。
- 仅重复、无有效字段变化的 update 不推进 `updatedAt`。
- 历史加载时缺少 `updatedAt` 则在内存中回退到 `createdAt`；缺少 model/effort 保持缺失，不推测。

为避免 append 与 metadata patch 互相覆盖，抽取按 message file 串行的 JSONL mutation helper：append、reminder rewrite 和按 message ID patch metadata 必须进入同一 per-file queue；读改写失败时不得跳过损坏行。写回使用现有原子写辅助能力或等价 temp-file + rename，避免中途失败截断整个历史文件。

Renderer `normalizeMessage()` 同时恢复 `createdAt` / `updatedAt` 为 `Date`，但 `ChatMessageActions` 与 `MessageTime` 保持只展示 `createdAt`。

### 6. 实时/历史一致性以契约测试而不是 ID 对齐验证

新增共享 fixture 覆盖：pending start、无 status patch、孤立 update、显式清空 diff/location、completed、failed、延迟 parent/subagent、重复无变化 update。对同一 fixture：

- Main assembler flush 后的持久字段；
- Renderer assembler reset 前的临时消息去除 `liveOutput` 和 reasoning 展示专属 state 后；

必须相等。测试不比较 message ID、createdAt/updatedAt 的绝对值或 Renderer 专属运行时字段。

组件测试覆盖直接工具和 Activity group 子工具的四态文字、Error、Changes、Locations、点击 location 复用预览入口，以及旧历史 part 的状态回退。

## Risks / Trade-offs

- [为 user message 回填 dispatch metadata 需要改写 JSONL] → 按精确 message ID patch，并把 append/reminder/metadata rewrite 收敛到同一 per-file queue 和原子写，防止并发覆盖或截断。
- [ACP replacement 与字段缺失难以区分] → mapper 在字段显式出现时保留空数组，reducer 使用属性存在性判断，不使用 truthy 判断。
- [AI SDK state 不能完整表达 ACP 语义] → `toolMetadata.acpStatus` 保存权威四态，AI SDK state 只作为组件兼容映射。
- [diff 内容可能很大] → 数据不截断；UI 使用默认折叠和限高滚动，只有用户展开工具时渲染详情，不创建常驻 Monaco/diff editor。
- [旧消息没有新增字段] → updatedAt 回退 createdAt，工具状态从 AI SDK state 回退，model/effort 保持缺失。
- [Main/Renderer 仍可能在非工具逻辑上分叉] → 本次只共享工具 reducer，并用契约测试覆盖当前需要一致的持久字段；Renderer 专属生命周期继续独立测试。

## Migration Plan

1. 先扩展可选 shared contract、纯 reducer 和兼容读取，不改变现有 JSONL 可读性。
2. 接入 ACP mapper、Main/Renderer assembler 与 turn audit dispatch，再接入各消息存储 writer。
3. 最后启用 Renderer 工具展示与本地文件预览复用。
4. 不批量重写历史消息；新版首次读取只做内存 fallback。

回滚时旧版本会忽略 `toolMetadata` 和 `MessageMeta` 中未知 JSON 字段；AI SDK 已支持 `output-error`。因此无需降级迁移，但旧 UI 不会展示新增信息。

## Open Questions

无。范围、排除项、双 assembler 边界和审计字段展示策略均已确认。
