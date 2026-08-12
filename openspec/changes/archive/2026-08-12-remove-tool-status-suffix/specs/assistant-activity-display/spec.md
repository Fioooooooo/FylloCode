## MODIFIED Requirements

### Requirement: 普通工具展示明确执行状态与失败信息

Renderer SHALL NOT 为 pending、in_progress、completed 或 failed 普通工具渲染状态 suffix，也 SHALL NOT 为这些状态提供屏幕阅读器专用状态文字。pending 与 in_progress SHALL 使用现有 Nuxt UI shimmer 表达非终态，completed SHALL 使用无 shimmer 的稳定工具名称。失败工具 SHALL 仅让具体工具 icon 使用 error 语义色，并在可折叠详情中使用独立 `Error` 分区展示可用 errorText。Activity group 顶层 SHALL 保持既有类别统计、代表图标和 streaming 规则，不增加整组状态前缀。

#### Scenario: pending 工具

- **WHEN** 普通工具的 acpStatus 为 pending
- **THEN** 该具体工具 SHALL 只以工具名称作为标题并显示 shimmer
- **AND** SHALL NOT 渲染“等待执行”状态 suffix 或屏幕阅读器专用状态文字

#### Scenario: in-progress 工具

- **WHEN** 普通工具的 acpStatus 为 in_progress
- **THEN** 该具体工具 SHALL 只以工具名称作为标题并显示 shimmer
- **AND** SHALL NOT 渲染“正在执行”状态 suffix 或屏幕阅读器专用状态文字

#### Scenario: completed 工具

- **WHEN** 普通工具的 acpStatus 为 completed
- **THEN** 该具体工具 SHALL 只显示无 shimmer 的稳定工具名称
- **AND** SHALL NOT 渲染“已完成”状态 suffix 或屏幕阅读器专用状态文字
- **AND** 可用 output SHALL 继续显示在 Output 分区

#### Scenario: failed 工具

- **WHEN** 普通工具进入 failed / output-error 终态
- **THEN** 该具体工具 SHALL NOT 渲染“失败”状态 suffix 或屏幕阅读器专用状态文字
- **AND** 该具体工具的 leading icon SHALL 使用 error 语义色
- **AND** 用户展开工具后 SHALL 在 Error 分区看到可用错误文本
- **AND** 失败 SHALL NOT 被呈现为成功 Output

#### Scenario: Activity group 子工具

- **WHEN** 用户展开 Activity group 并查看其中一个具体工具
- **THEN** 该子工具 SHALL 使用与直接工具相同的无 suffix 标题、shimmer 和失败 icon 规则
- **AND** 展开多个子工具 SHALL NOT 通过隐藏状态节点扩大消息列的横向滚动范围
- **AND** Activity group header SHALL 继续使用既有类别摘要、代表图标和 streaming 视觉
