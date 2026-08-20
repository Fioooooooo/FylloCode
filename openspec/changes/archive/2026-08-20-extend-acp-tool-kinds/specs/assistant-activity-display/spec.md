## ADDED Requirements

### Requirement: Activity group SHALL summarize all recognized ACP tool kinds

Activity group SHALL 将 delete、move、think、fetch 与 switch_mode 纳入现有类别统计、代表性图标和折叠子项规则。新增类型 SHALL NOT 改变 Activity group 的连续 part 边界、streaming 判定、默认折叠或原始顺序。

#### Scenario: Activity group summarizes mixed legacy and new tools

- **WHEN** 连续 activity run 包含 Read、Delete、Fetch、Switch mode 或其他既有工具
- **THEN** header SHALL 按类别首次出现顺序生成各自计数摘要
- **AND** 新类别 SHALL 与既有 Read/Write/Edit/Search/Run 文案共存

#### Scenario: Representative icon follows the last relevant tool

- **WHEN** group 内存在新增 tool kind
- **THEN** 无 streaming tool 时 header SHALL 使用原有代表性规则选择最后一个 tool 的 kind icon
- **AND** 有 streaming tool 时 SHALL 使用最后一个 streaming tool 的 kind icon
- **AND** group 完全没有 tool 时仍 SHALL 使用 reasoning 的 brain icon

#### Scenario: New tool details retain ordinary tool behavior

- **WHEN** 用户展开 Activity group 中的 delete、move、think、fetch 或 switch_mode 工具
- **THEN** 工具 SHALL 继续使用普通工具的 Input、Output、Error、diff/location、shimmer 和折叠规则
- **AND** 新 kind SHALL NOT 触发 Agent-specific 或子 Agent-specific UI
