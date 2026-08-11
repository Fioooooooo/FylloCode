## ADDED Requirements

### Requirement: 普通工具展示明确执行状态与失败信息

Renderer SHALL 为每个可见普通工具显示可读的 ACP 执行状态，并 SHALL 同时使用文字表达等待执行、正在执行、已完成或失败，不能只依赖颜色、icon 或 streaming spinner。失败工具 SHALL 在可折叠详情中使用独立 `Error` 分区展示可用 errorText。Activity group 顶层 SHALL 保持既有类别统计、代表图标和 streaming 规则，不增加整组状态前缀。

#### Scenario: pending 工具

- **WHEN** 普通工具的 acpStatus 为 pending
- **THEN** 该具体工具 SHALL 显示“等待执行”文字状态
- **AND** SHALL NOT 显示为已完成

#### Scenario: in-progress 工具

- **WHEN** 普通工具的 acpStatus 为 in_progress
- **THEN** 该具体工具 SHALL 显示“正在执行”文字状态
- **AND** 现有 streaming 视觉 MAY 同时显示

#### Scenario: completed 工具

- **WHEN** 普通工具的 acpStatus 为 completed
- **THEN** 该具体工具 SHALL 显示“已完成”文字状态
- **AND** 可用 output SHALL 继续显示在 Output 分区

#### Scenario: failed 工具

- **WHEN** 普通工具进入 failed / output-error 终态
- **THEN** 该具体工具 SHALL 显示“失败”文字状态
- **AND** 用户展开工具后 SHALL 在 Error 分区看到可用错误文本
- **AND** 失败 SHALL NOT 被呈现为成功 Output

#### Scenario: Activity group 子工具

- **WHEN** 用户展开 Activity group 并查看其中一个具体工具
- **THEN** 该子工具 SHALL 使用与直接工具相同的状态文字和 Error 详情
- **AND** Activity group header SHALL 继续使用既有类别摘要

### Requirement: 普通工具详情展示 diff 与 locations

Renderer SHALL 在普通工具详情中展示 toolMetadata 已有的完整 diff 与 locations，且 SHALL 复用直接工具与 Activity group 子工具的同一详情组件。没有对应值时 SHALL 不产生空分区；展示 SHALL NOT 修改或截断底层消息数据。

#### Scenario: 修改文件 diff

- **WHEN** 工具包含 path、oldText 与 newText 的 diff
- **THEN** 用户展开工具后 SHALL 在 Changes 分区看到该 path
- **AND** SHALL 分别看到标记为“修改前”与“修改后”的完整只读内容

#### Scenario: 新文件 diff

- **WHEN** 工具 diff 的 oldText 缺失
- **THEN** Changes 分区 SHALL 将该项标记为新增文件
- **AND** SHALL 展示完整 newText 而不创建虚假旧内容

#### Scenario: 多个 diff 保持顺序

- **WHEN** 工具包含多个 diff
- **THEN** Renderer SHALL 按 metadata 原始顺序展示每个 path
- **AND** 每项内容 SHALL 在限高区域内滚动而不是截断

#### Scenario: location 包含行号

- **WHEN** 工具 location 包含 path 与 line
- **THEN** Locations 分区 SHALL 同时显示路径与行号
- **AND** 可预览路径 SHALL 提供键盘可访问的打开操作

#### Scenario: location 不含行号

- **WHEN** 工具 location 只有 path
- **THEN** Locations 分区 SHALL 显示该 path
- **AND** SHALL NOT 伪造行号

#### Scenario: 工具没有 diff 或 location

- **WHEN** 工具 metadata 不包含 diff 或 locations
- **THEN** Renderer SHALL 不显示对应 Changes 或 Locations 空分区
- **AND** Input、Output、Error 与折叠行为 SHALL 保持正常
