## ADDED Requirements

### Requirement: ChatPrompt footer 显示当前 Context 使用率

系统 SHALL 在 ChatPrompt footer 已有 Context 环中基于当前 session 的 `tokenUsage.used / tokenUsage.size` 显示钳制到 0%–100% 的使用率进度；环内整数百分比 SHALL 向下取整，使显示值不先于实际使用率跨越风险阈值。系统 SHALL 保持现有挂载条件：仅当存在 active session 且 `tokenUsage.used > 0` 时显示 Context 环。

#### Scenario: 活跃会话显示 Context 使用率

- **WHEN** active session 的 `tokenUsage.used` 大于 0
- **THEN** ChatPrompt footer SHALL 显示 Context 环
- **AND** 环形进度 SHALL 表示钳制后的 `tokenUsage.used / tokenUsage.size` 百分比
- **AND** 环内 SHALL 显示向下取整的整数百分比

#### Scenario: 没有可用量时隐藏 Context 环

- **WHEN** 不存在 active session 或 active session 的 `tokenUsage.used` 等于 0
- **THEN** ChatPrompt footer SHALL NOT 显示 Context 环

### Requirement: Context 使用率按三个阈值分级着色

系统 SHALL 按原始的钳制后 Context 使用率分为四档：低于 75% 使用正常 success 色，达到 75% 且低于 90% 使用黄色 warning 色，达到 90% 且低于 95% 使用橙色，达到 95% 使用红色 error 色。

#### Scenario: 低于 75% 显示正常色

- **WHEN** Context 使用率低于 75%
- **THEN** Context 环 SHALL 使用 `text-success`

#### Scenario: 达到 75% 显示黄色

- **WHEN** Context 使用率达到 75% 且低于 90%
- **THEN** Context 环 SHALL 使用 `text-warning`

#### Scenario: 达到 90% 显示橙色

- **WHEN** Context 使用率达到 90% 且低于 95%
- **THEN** Context 环 SHALL 使用橙色 Tailwind text palette class

#### Scenario: 达到 95% 显示红色

- **WHEN** Context 使用率达到或超过 95%
- **THEN** Context 环 SHALL 使用 `text-error`

### Requirement: Tooltip 只显示 Context 与按需建议

系统 SHALL 让 Context 环 Tooltip 始终显示 label 为 `Context` 的用量行，并 SHALL NOT 显示 Remaining 或 Cost 行。当使用率低于 75% 时，Tooltip SHALL 只有 Context 行；达到 75% 后，Tooltip SHALL 增加 label 为 `建议` 的中文建议行。可见 Tooltip 与屏幕阅读器文本 SHALL 使用同一组 label 和 value。

#### Scenario: 低于 75% 只显示 Context

- **WHEN** Context 使用率低于 75%
- **THEN** Tooltip SHALL 只显示 `Context` 行
- **AND** Tooltip 与屏幕阅读器文本 SHALL NOT 包含 `建议`、`Remaining` 或 `Cost`

#### Scenario: 75% 至 90% 提醒留意用量

- **WHEN** Context 使用率达到 75% 且低于 90%
- **THEN** Tooltip SHALL 在 `Context` 行后显示 `建议：Context 占用过高，请留意后续用量`

#### Scenario: 90% 至 95% 建议新建会话或总结对话

- **WHEN** Context 使用率达到 90% 且低于 95%
- **THEN** Tooltip SHALL 在 `Context` 行后显示 `建议：请新建会话或总结当前对话`

#### Scenario: 95% 起警告下一次提问可能失败

- **WHEN** Context 使用率达到或超过 95%
- **THEN** Tooltip SHALL 在 `Context` 行后显示 `建议：下一次提问可能失败，请新建会话`

#### Scenario: usage 包含 cost 时仍不显示 Cost

- **WHEN** 当前 `TokenUsage` 包含 `cost`
- **THEN** Tooltip SHALL NOT 显示 `Cost` 行
- **AND** 系统 SHALL 保留 `TokenUsage.cost` 数据而不修改其契约
