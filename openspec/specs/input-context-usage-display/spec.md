# input-context-usage-display 规范

## Purpose

在 Chat 输入框区域显示当前 session 的 context 消耗，帮助用户判断何时需要开启新 session。

## Requirements

### Requirement: 输入框区域显示当前 session 的 context 消耗

系统 SHALL 在 `ChatContainer.vue` 的 `UChatPrompt` footer slot 中，Agent 选择器左侧显示当前 session 的 context 消耗环形进度条。进度 SHALL 基于当前 session 的 `tokenUsage.used / tokenUsage.size` 计算。当无活跃 session 时，该指示器 SHALL 隐藏。

#### Scenario: 活跃 session 显示环形 context 用量

- **WHEN** 用户处于活跃 session 状态
- **THEN** 输入框 footer 区域显示 context 消耗环形进度条
- **AND** 环形进度表示当前 session 的 `tokenUsage.used / tokenUsage.size` 百分比
- **AND** 进度颜色根据百分比分级显示：低于 50% 为 `text-success`，50% 至 80% 为 `text-warning`，高于 80% 为 `text-error`

#### Scenario: Hover 显示 context 明细（k/m 单位）

- **WHEN** 用户 hover context 消耗环形进度条
- **THEN** 系统通过 tooltip 显示 `Context: used / size tokens (percent%)`，其中 used 和 size 以 k 或 m 为单位（≥ 1,000,000 显示为 m，否则显示为 k；整数时不显示小数，非整数时保留一位小数，如 `12.3k / 128k tokens`、`1.5m / 2m tokens`）
- **AND** tooltip 显示 `Remaining: size - used tokens`，remaining 同样以 k/m 为单位
- **AND** 当当前 usage update 包含 `cost` 时，tooltip 显示 `Cost: amount currency`（货币格式不变）

#### Scenario: 草稿态隐藏 token 用量

- **WHEN** 用户处于草稿态（无选中 session）
- **THEN** 输入框 footer 区域不显示 token 用量指示器

#### Scenario: 流式过程中实时更新

- **WHEN** 前端流式过程中收到 `usage_update` chunk
- **THEN** 系统 SHALL 更新当前 active session 的 `tokenUsage.used` 为 chunk 中的 `used`
- **AND** 系统 SHALL 更新当前 active session 的 `tokenUsage.size` 为 chunk 中的 `size`
- **AND** 环形进度条 SHALL 实时反映最新百分比

#### Scenario: 切换 session 时更新显示

- **WHEN** 用户从 session A 切换到 session B
- **THEN** context 消耗环形进度条 SHALL 显示 session B 的 `tokenUsage.used / tokenUsage.size` 百分比
