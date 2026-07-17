# assistant-stream-indicator Specification

## Purpose

定义聊天界面中当前流式 assistant 消息的运行时状态指示边界，包括消息级定位、会话隔离计时、预设文案、自然单位耗时展示与不持久化约束。

## Requirements

### Requirement: 当前流式 assistant 消息展示消息级状态指示

系统 SHALL 仅在当前 renderer 会话中一条正在 stream 的 assistant 消息的内容之后展示 assistant stream indicator。该 indicator SHALL 包含 4×4 dot matrix 动画、使用 `UChatShimmer` 的轮换状态文案和实时回复经过时间；它 SHALL NOT 使用或替代 `UChatMessages` 的列表级 `indicator` slot。经过时间 SHALL 使用自然中文单位：不足一分钟显示秒，一小时内显示分和秒，一天内显示小时和分，超过一天显示天和小时。

#### Scenario: 首个 assistant 内容到达后显示 indicator

- **WHEN** 当前会话的 stream 首次收到会创建 assistant 消息的内容 chunk
- **THEN** renderer SHALL 在该临时 assistant 消息的所有 text、reasoning 与 tool 内容之后显示 indicator
- **AND** renderer SHALL 从该首个内容 chunk 的到达时刻开始计算经过时间

#### Scenario: 内容到达前不显示 indicator

- **WHEN** 会话 stream 状态为 `submitted`，但尚未收到会创建 assistant 消息的内容 chunk
- **THEN** renderer SHALL NOT 显示 assistant stream indicator
- **AND** renderer SHALL NOT 将等待 Agent 初始化或排队的时间计入回复经过时间

#### Scenario: 流结束后移除 indicator

- **WHEN** 对应会话的 stream 完成、失败或被取消
- **THEN** renderer SHALL 停止该消息的经过时间刷新并移除 indicator
- **AND** 已渲染的 assistant 消息内容 SHALL 保持可见

#### Scenario: 短时任务显示秒

- **WHEN** assistant 回复经过时间少于一分钟
- **THEN** indicator SHALL 显示秒单位，例如 `42 秒`
- **AND** indicator SHALL NOT 以 `00:42` 等纯数字时钟格式显示该时间

#### Scenario: 长时任务使用更高层级单位

- **WHEN** assistant 回复经过时间达到一分钟但少于一小时
- **THEN** indicator SHALL 显示分和秒，例如 `12 分 08 秒`
- **WHEN** assistant 回复经过时间达到一小时但少于一天
- **THEN** indicator SHALL 显示小时和分，例如 `1 小时 12 分`
- **WHEN** assistant 回复经过时间达到一天
- **THEN** indicator SHALL 显示天和小时，例如 `1 天 3 小时`

### Requirement: indicator 使用预设且不绑定 Agent 行为的状态文案

系统 SHALL 在 assistant stream indicator 中轮换组件预设的通用状态文案，并为文案切换提供视觉过渡。状态文案 SHALL NOT 根据 Agent 的 tool、reasoning、文本内容或其他 stream chunk 推断或宣称当前具体行为。

#### Scenario: 状态文案轮换

- **WHEN** assistant stream indicator 保持挂载
- **THEN** 系统 SHALL 在组件预设的通用状态文案之间循环切换
- **AND** 每次切换 SHALL 保持 dot matrix 动画与 shimmer 文案展示可用

#### Scenario: Agent 产生工具调用时状态文案保持通用

- **WHEN** 正在 stream 的 assistant 消息收到 tool call chunk
- **THEN** indicator SHALL 继续使用预设的通用状态文案
- **AND** indicator SHALL NOT 将预设文案改写为该工具的实际或推测操作描述

### Requirement: 并行会话的运行时计时相互隔离

系统 SHALL 以 `sessionId` 和该会话当前 `runId` 隔离 assistant stream indicator 的 renderer 运行时状态。每个运行期 indicator SHALL 关联 renderer 为该次 stream 临时生成的 assistant message ID；该 ID 只用于当前视图中定位 indicator。

#### Scenario: 两个会话并行 stream

- **WHEN** 两个不同 session 同时收到 assistant 内容 chunk
- **THEN** 系统 SHALL 分别记录每个 session 的开始时间和临时 assistant message ID
- **AND** 一个 session 的后续 chunk、完成、失败或取消 SHALL NOT 重置、隐藏或改写另一个 session 的 indicator

#### Scenario: 用户切换到仍在 stream 的会话

- **WHEN** 用户从一个会话切换到另一个已经开始 stream 的会话
- **THEN** renderer SHALL 在目标会话中仅为其匹配的临时 assistant 消息显示 indicator
- **AND** 经过时间 SHALL 由该目标会话的原始开始时间计算，而不是从切换时刻重新开始

#### Scenario: 过期 stream chunk 到达

- **WHEN** 一个 session 的旧 `runId` 在该 session 已启动新的 stream 后继续发送内容 chunk
- **THEN** renderer SHALL 忽略旧 run 的 indicator 状态更新
- **AND** 旧 run SHALL NOT 覆盖新 run 的开始时间或临时 assistant message ID

### Requirement: indicator 运行时状态不进入历史消息

系统 SHALL 将 assistant stream indicator 的开始时间与 renderer 临时 assistant message ID 保持为非持久化的 renderer 内存状态。系统 SHALL NOT 修改 `MessageMeta`、主进程持久化消息 ID 或 session JSONL 记录以保存 indicator 数据。

#### Scenario: 重载历史会话

- **WHEN** 应用重启或用户重新加载已经结束的会话消息
- **THEN** renderer SHALL 使用主进程持久化的消息 ID 正常渲染历史消息
- **AND** renderer SHALL NOT 为这些历史消息显示 assistant stream indicator 或回复经过时间

#### Scenario: renderer 与持久化消息 ID 不同

- **WHEN** 当前 stream 的 renderer 临时 assistant message ID 与主进程最终持久化消息 ID 不同
- **THEN** indicator SHALL 仅使用 renderer 临时 ID 定位当前视图中的消息
- **AND** 系统 SHALL NOT 尝试使两套消息 ID 相等或持久化该临时 ID

### Requirement: indicator 清理自身运行时资源

assistant stream indicator SHALL 在组件卸载或其 stream 终态到达后清理用于 dot matrix、文案轮换、文案过渡和经过时间刷新的运行时资源。

#### Scenario: 用户切换会话导致组件卸载

- **WHEN** 用户切换会话并使当前 assistant stream indicator 卸载
- **THEN** 组件 SHALL 清理所有 interval 和待执行的 animation frame
- **AND** 后台会话的绝对开始时间 SHALL 保留在其 session 独立运行时状态中

#### Scenario: 卸载后不再更新视图

- **WHEN** assistant stream indicator 已卸载
- **THEN** 组件 SHALL NOT 继续更新状态文案、dot matrix 或经过时间的响应式视图状态
