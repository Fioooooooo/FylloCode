## MODIFIED Requirements

### Requirement: Chat 主区域提供右侧会话事件栏

系统 SHALL 在 Chat 主区域提供一个会话事件栏结构，用于展示当前会话的结构化事件卡片。事件栏 SHALL 位于消息列表区域右侧，由 `ChatContainer.vue` 编排，并通过独立组件承载事件栏内部结构。

事件栏 SHALL 支持展示当前会话的执行计划事件、proposal 入口事件，以及当前 Chat 主会话消息中仍未处理的 Fyllo action 事件。待处理 Fyllo action 事件 SHALL 从当前 `activeSession.messages` 与 `activeSession.actionStates` 派生，不新增 IPC，不新增持久化字段，不读取 Apply / Archive 运行日志。

事件栏无可展示事件时 SHALL 不渲染可见容器，避免占用聊天主区域空间。

#### Scenario: 活跃会话存在 plan 时显示事件栏

- **WHEN** 当前为已建立 session
- **AND** `activeSession.plan` 含至少 1 条计划项
- **THEN** Chat 主区域右侧显示会话事件栏
- **AND** 事件栏内显示执行计划事件卡片

#### Scenario: 活跃会话存在待处理 Fyllo action 时显示事件栏

- **WHEN** 当前为已建立 Chat session
- **AND** 当前会话的 assistant text part 中包含至少 1 个 ready Fyllo action
- **AND** `activeSession.actionStates` 中不存在该 action id
- **THEN** Chat 主区域右侧显示会话事件栏
- **AND** 事件栏内显示该 Fyllo action 的待处理事件项

#### Scenario: 无事件时隐藏事件栏

- **WHEN** 当前为已建立 session
- **AND** `activeSession.plan` 为 `undefined` 或空数组
- **AND** 当前 session 没有可展示的 proposal 事件
- **AND** 当前 session 没有待处理 Fyllo action
- **THEN** Chat 主区域不显示会话事件栏的可见容器

#### Scenario: 草稿态不显示事件栏

- **WHEN** 当前处于草稿态（`activeSessionId === null`）
- **THEN** Chat 主区域不显示事件栏
- **AND** 不显示执行计划事件卡片
- **AND** 不显示 Fyllo action 待处理事件项

## ADDED Requirements

### Requirement: 事件栏展示未处理 Fyllo action

系统 SHALL 在 `ChatSessionEventRail` 中展示当前 Chat 主会话内所有未处理的 ready Fyllo action。未处理 SHALL 定义为：该 action 已完成解析并通过 payload schema 校验，且 `activeSession.actionStates[actionId]` 缺失。

系统 SHALL 使用与 action card 相同的 Chat action id 规则识别每个 action：`chat:{sessionId}:{messageIndex}:{partIndex}:{actionOrdinalInPart}`。系统 SHALL NOT 将 action type 写死为 `task.create`；rail item 的标题与 icon SHALL 来自注册的 Fyllo action definition，摘要文案 SHALL 通过 action definition 的通用扩展点生成，缺省时显示 action type 或通用标题。

`activeSession.actionStates[actionId]` 一旦存在，无论状态是 `succeeded`、`failed` 还是 `cancelled`，该 action SHALL 不再作为待处理 rail item 展示。失败 action 仍可在原 action card 中重试，但 rail 不再把它视为“用户未处理”。

#### Scenario: task.create 作为通用 Fyllo action item 展示

- **WHEN** 当前 Chat session 的 assistant text part 包含 ready `<fyllo-action type="task.create">`
- **AND** 该 action id 不存在于 `activeSession.actionStates`
- **THEN** 事件栏显示一个 Fyllo action 待处理事件项
- **AND** 该事件项使用 `task.create` 对应 action definition 的标题和 icon
- **AND** 该事件项摘要显示 payload 中可用于识别该 action 的简要内容

#### Scenario: 用户取消后 rail item 消失

- **WHEN** 事件栏正在显示某个 Fyllo action 待处理事件项
- **AND** 用户在原 action card 点击 `取消`
- **AND** `activeSession.actionStates[actionId].status` 更新为 `"cancelled"`
- **THEN** 事件栏不再显示该 action 的待处理事件项
- **AND** 该消失不依赖新增 assistant 消息

#### Scenario: 用户确认失败后 rail item 消失

- **WHEN** 事件栏正在显示某个 Fyllo action 待处理事件项
- **AND** 用户在原 action card 点击 `确认`
- **AND** action handler 失败并写入 `activeSession.actionStates[actionId].status = "failed"`
- **THEN** 事件栏不再显示该 action 的待处理事件项
- **AND** 原 action card 仍按 Fyllo action 规范允许用户重试

#### Scenario: invalid 和 streaming action 不进入事件栏

- **WHEN** assistant text part 中的 `<fyllo-action>` 仍处于 streaming pending 状态或解析结果为 invalid
- **THEN** 事件栏不显示该 action 的待处理事件项

### Requirement: 点击 Fyllo action 事件项定位到原 action card

系统 SHALL 允许用户点击事件栏中的 Fyllo action 待处理事件项，并将 Chat 消息列表滚动到对应 action card。定位 SHALL 基于 action id 查找原 action card 的 DOM anchor，不执行 action handler，不修改 `activeSession.actionStates`，不创建任务或其他业务对象。

当目标 action card 存在时，消息滚动容器 SHALL 将目标滚动到可见区域，优先居中展示。系统 MAY 对目标 action card 添加短暂视觉强调，但该强调 SHALL 仅作为 renderer 局部 UI 状态，不持久化。

#### Scenario: 点击事件项滚动到目标 action card

- **WHEN** 事件栏显示一个 Fyllo action 待处理事件项
- **AND** 用户点击该事件项
- **AND** 消息列表中存在带有相同 action id anchor 的 action card
- **THEN** Chat 消息滚动容器滚动到该 action card
- **AND** action card 保持原有 ready 状态
- **AND** 系统不调用该 action 的 confirm handler

#### Scenario: 目标 action card 暂不可定位

- **WHEN** 用户点击事件栏中的 Fyllo action 待处理事件项
- **AND** 当前 DOM 中找不到对应 action id anchor
- **THEN** 系统不抛出用户可见错误
- **AND** 不修改该 action 的 session meta state
