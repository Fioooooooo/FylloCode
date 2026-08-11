# acp-tool-event-fidelity Specification

## Purpose

定义 ACP 工具调用事件从协议映射、跨进程传输到 Main 与 Renderer 组装及历史加载的保真边界，确保状态、差异、位置和父子工具元数据遵循统一契约。

## Requirements

### Requirement: ACP 工具状态完整归一化

系统 SHALL 将 ACP `tool_call` 与 `tool_call_update` 的 `pending`、`in_progress`、`completed`、`failed` 四种合法状态保留到共享事件和最终工具消息。update 未携带 status 时 SHALL 保留工具已有状态；只有缺少 start 的孤立 update 且没有状态时才 SHALL 回退为 `in_progress`。系统 SHALL NOT 丢弃合法 `pending` 或把 `failed` 表示为成功终态。

#### Scenario: pending start 进入共享事件

- **WHEN** Agent 发送 status 为 `pending` 的 `tool_call`
- **THEN** mapper SHALL 产生 status 为 `pending` 的共享工具事件
- **AND** Main 与 Renderer 工具 part SHALL 保留等待执行语义

#### Scenario: update 未携带 status

- **WHEN** 已知工具收到只更新 title、input、content、diff 或 locations 且未携带 status 的 update
- **THEN** 两套 assembler SHALL 保留该工具此前状态
- **AND** 系统 SHALL NOT 自动把状态改为 `in_progress`

#### Scenario: 孤立 update 没有 status

- **WHEN** Agent 跳过 start 并发送没有 status 的孤立 tool update
- **THEN** assembler SHALL 惰性创建该工具 part
- **AND** 该工具 SHALL 回退为 `in_progress` 而不是丢弃 update

#### Scenario: 工具执行失败

- **WHEN** tool update 的规范状态为 `failed`，或公共 mapper 根据现有 rawOutput 矛盾规则确认失败
- **THEN** 最终 DynamicToolUIPart SHALL 使用 AI SDK `output-error`
- **AND** 可用错误文本 SHALL 写入 `errorText`
- **AND** 系统 SHALL NOT 为该失败写入 `output-available`

#### Scenario: 工具执行完成

- **WHEN** tool update 的规范状态为 `completed`
- **THEN** 最终 DynamicToolUIPart SHALL 使用 `output-available`
- **AND** 最终 content 或已累计 output delta SHALL 作为 output

### Requirement: diff 与 locations 遵循 ACP replacement 语义

系统 SHALL 区分 tool update 中 `content` / `locations` 字段缺失与显式 replacement。字段缺失 SHALL 保留已组装值；字段显式为 `null`、空集合或不再包含有效 diff/location 时 SHALL 以空集合清除旧值；字段携带有效项时 SHALL 按原始顺序替换旧集合。无效单项 SHALL 被过滤，且 SHALL NOT 使显式空 replacement 退化为字段缺失。

#### Scenario: update 不包含 diff 或 locations 字段

- **WHEN** 已有工具包含 diff 与 locations，随后 update 完全未提供对应 ACP 字段
- **THEN** Main 与 Renderer assembler SHALL 保留已有集合

#### Scenario: update 显式清空 replacement collection

- **WHEN** 后续 update 将 content 或 locations 显式替换为 `null`、空数组或不含对应有效项的集合
- **THEN** 两套 assembler SHALL 清除相应旧 diff 或 locations
- **AND** 历史持久化结果 SHALL 不再包含已清除项

#### Scenario: update 替换现有集合

- **WHEN** 后续 update 提供一组新的有效 diff 或 locations
- **THEN** 两套 assembler SHALL 以新集合替换旧集合
- **AND** SHALL NOT 把 replacement 重复追加到旧集合

#### Scenario: 新文件 diff

- **WHEN** ACP diff 的 `oldText` 为 null 且 `newText` 为字符串
- **THEN** 内部工具 metadata SHALL 保留 path 与完整 newText
- **AND** SHALL 以缺失 oldText 表示新文件

### Requirement: Main 与 Renderer 使用同一工具归并语义

Main 持久化 assembler 与 Renderer 实时 assembler SHALL 对同一工具事件序列复用同一纯归并规则，产生相同的持久字段：tool identity、title、input、output/error、ACP status、tool kind、diff、locations、parentToolCallId 与 subagent 摘要。两套 assembler SHALL 继续拥有各自的消息生命周期和 message ID；Renderer 专属 `liveOutput` 与 reasoning 展示 state SHALL NOT 进入 Main 持久化结果。

#### Scenario: 实时流完成后重新加载

- **WHEN** Renderer 实时消费一轮含工具状态、diff 和 locations 的事件，Main 随后持久化并重新加载该轮 assistant message
- **THEN** 实时消息与历史消息的工具可观测字段 SHALL 一致
- **AND** message ID 不同 SHALL NOT 被视为不一致

#### Scenario: 仅包含 diff 或 location 的 update

- **WHEN** update 没有 title、input、text output 或 output delta，但包含 diff 或 locations replacement
- **THEN** 两套 assembler SHALL 都更新现有工具 part
- **AND** SHALL NOT 因其他字段为空而忽略该 update

#### Scenario: Renderer 保留临时展示状态

- **WHEN** in-progress 工具持续收到 output delta
- **THEN** Renderer MAY 使用 `liveOutput` 提供实时展示
- **AND** Main 最终消息 SHALL NOT 持久化 `liveOutput`
- **AND** 工具终态到达后 Renderer SHALL 删除该临时字段

#### Scenario: 共享契约覆盖孤立和延迟事件

- **WHEN** 工具 update 先于 start，或 parentToolCallId、subagent、diff、locations 在后续事件才到达
- **THEN** Main 与 Renderer SHALL 按同一规则补齐已有工具 part
- **AND** 后续缺失字段 SHALL NOT 清除不属于 replacement collection 的既有元数据

### Requirement: 历史工具消息向后兼容

Renderer SHALL 能加载缺少 `acpStatus`、diff 或 locations 的旧 DynamicToolUIPart。缺少 `acpStatus` 时，系统 SHALL 仅从既有 AI SDK part state 做兼容回退；SHALL NOT 根据 title、toolName、output 文本或 Agent 身份猜测状态。

#### Scenario: 旧成功工具消息

- **WHEN** 历史工具只有 `state: "output-available"` 且没有 `acpStatus`
- **THEN** Renderer SHALL 将其作为已完成工具展示

#### Scenario: 旧运行中工具消息

- **WHEN** 历史工具只有 input state 且没有 `acpStatus`
- **THEN** Renderer SHALL 将其作为未终结工具展示
- **AND** SHALL NOT 伪造 completed 或 failed
