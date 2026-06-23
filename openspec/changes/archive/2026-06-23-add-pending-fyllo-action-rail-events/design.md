## Context

当前 `ChatSessionEventRail` 由 `ChatContainer.vue` 编排在消息列右侧，已用于展示会话级事件面板。现有 `chat-session-event-rail` 规范曾明确限制事件栏只承载 `activeSession.plan`，但代码已经增加 proposal panel；本次变更继续把事件栏作为结构化会话事件入口，用于提醒用户当前消息流中仍有待处理的 Fyllo action。

Fyllo action 的关键状态已存在：Chat 主会话中的 action id 由 `chat:{sessionId}:{messageIndex}:{partIndex}:{actionOrdinalInPart}` 稳定生成；`Session.actionStates` 从 session meta 恢复，并且规范规定缺失 state 表示默认 ready。用户点击确认、取消或确认失败时，`FylloActionShell` 会通过 session store 写入 `succeeded`、`cancelled` 或 `failed`，因此 renderer 可以仅依赖响应式 `activeSession.messages` 与 `activeSession.actionStates` 派生 rail items。

## Goals / Non-Goals

**Goals:**

- 在事件栏展示当前 Chat session 内所有未处理的 ready Fyllo action，而不是只处理 `task.create`。
- 复用既有 action id 规则与 `actionStates` 语义，不新增 session meta 字段。
- rail item 点击后滚动消息列表到原 action card，并让定位目标对用户可见。
- 用户确认、取消或失败后，rail item 通过 `activeSession.actionStates` 的响应式更新自动消失。
- 保持 action 展示与执行边界：rail item 只做提醒和定位，不执行 action handler。

**Non-Goals:**

- 不在 Apply / Archive side panel 中启用 pending action rail。
- 不展示 invalid、pending 流式未完成、非 Chat 主会话入口中的 Fyllo action。
- 不持久化 ready/running 状态，不把 payload hash、业务结果或错误详情写入 session meta。
- 不新增通用事件存储模型，不新增 IPC。

## Decisions

### Decision 1: 使用响应式派生而不是持久化 pending 状态

实现应新增纯函数，例如 `collectPendingFylloActionRailItems(session: Session | null): PendingFylloActionRailItem[]`，输入只包括 `session.messages`、`session.actionStates` 和本地 action definition/contract。该函数遍历 assistant 的 text parts，解析 ready `<fyllo-action>`，按既有 action id 规则生成 id，并过滤掉已经存在于 `session.actionStates` 的 action。

理由：`session-meta-storage` 已规定缺失 state 表示 ready，且 ready/running 不允许持久化。把 pending 状态再写入 meta 会与现有契约冲突，也会增加 stale state 风险。

备选：新增 `pendingActionIds` session meta 字段。否决，因为它重复表达 messages + actionStates 已能推导出的状态，并引入迁移与同步问题。

### Decision 2: 将 action id 生成逻辑抽成可复用函数

现有 `FylloActionNode.vue` 内联拼接 action id。实现时应抽出共享 helper，例如在 `src/renderer/src/utils/fyllo-action.ts` 或相邻 utility 中新增 `buildChatFylloActionId({ sessionId, messageIndex, partIndex, actionOrdinalInPart })`。`FylloActionNode.vue` 与 pending rail 收集函数都调用该 helper，避免 action card anchor 与 rail item 使用不同字符串。

备选：在 rail 收集函数里复制字符串拼接。否决，因为一旦 action id 格式调整，rail 定位和 meta 回显可能漂移。

### Decision 3: 用 DOM data attribute 作为 action card anchor

`FylloActionShell.vue` 已接收 `actionId`。实现应在根 `<section>` 增加 `:data-fyllo-action-id="props.actionId ?? undefined"`。点击 rail item 时，`ChatContainer.vue` 在消息滚动容器内用 `[data-fyllo-action-id="${CSS.escape(actionId)}"]` 查找目标，然后调用 `scrollIntoView({ block: "center", behavior: "smooth" })`。

理由：action id 包含冒号，直接作为 DOM `id` 使用时 selector 更容易出错；data attribute 表达的是内部定位语义，也不影响可访问名称。

备选：给每个 message 包一层 message id anchor。否决，因为一个 message/part 可能包含多个 action，定位到 message 不够精确。

### Decision 4: 事件栏 item 只负责提醒与定位

`ChatSessionEventRail` 应 emit 例如 `locate-action`，payload 至少包含 `actionId`。`ChatContainer.vue` 持有滚动容器 ref 并执行 DOM 查找与滚动。rail item 不直接 import task store、lineage API 或执行 action handler。

理由：执行 action 的唯一入口仍是原 action card，避免用户在 rail 中误触发业务 side effect，也保持现有 `FylloActionShell` 状态流转逻辑。

### Decision 5: 通用 action 文案来自 action definition

rail item 的 icon/title 应来自 `fylloActionDefinitions`。摘要应是通用扩展点，例如在 definition 上新增可选 `getSummary(payload)`，当前 `task.create` 返回任务标题。若某 action type 没有 summary，rail item 显示 definition title 与 action type，不读取业务模块。

理由：需求是通用 pending Fyllo action rail，不应把 `task.create` 的 payload 结构写死在事件栏组件里。

## Risks / Trade-offs

- [Risk] rail 收集函数与 MarkStream 渲染解析逻辑对 action ordinal 的理解不一致，导致找不到 card。→ 复用 `createFylloActionOrdinalResolver` 或等价的源码顺序收集逻辑，并用同一 `buildChatFylloActionId` helper；测试覆盖同一 text part 中多个 action。
- [Risk] 用户确认/取消后没有新消息，rail item 仍显示。→ pending items 必须是依赖 `activeSession.actionStates` 的 computed；测试通过直接更新 store 的 action state 验证 item 消失。
- [Risk] 点击时目标尚未渲染或被虚拟/批量渲染延迟影响。→ 先 `nextTick()` 后查找；找不到时不抛错，可保留 rail item 并不改变 action 状态。
- [Risk] 滚动到目标后用户仍难以识别 card。→ 实现可给目标添加短暂 highlight class 或 CSS data-state，测试至少验证 scroll 调用；视觉强调不改变行为契约。
- [Risk] 每次渲染都扫描长消息列表可能有性能压力。→ 收集函数在 computed 中运行，输入只绑定 active session；优先用现有轻量正则/解析函数，不引入全局 watcher 或持久化缓存。

## Migration Plan

无数据迁移。该变更只新增 renderer 派生状态、DOM anchor 和 OpenSpec 行为约束；旧 session 的 messages 与 actionStates 可直接参与计算。回滚时删除 rail pending action UI 与 anchor，不影响 session meta。
