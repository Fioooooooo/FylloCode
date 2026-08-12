## MODIFIED Requirements

### Requirement: Created timestamp is written for new OpenSpec changes

系统 SHALL 在 `fyllo-specs` runtime 创建 OpenSpec change 并写回 `.openspec.yaml` 时，将 `created` 字段写为当前 `new Date().toISOString()` 的结果，并将该 ISO 时间字符串序列化为不带单引号或双引号的 YAML plain scalar。

#### Scenario: Generated change metadata already has created

- **WHEN** `createChange(projectRoot, changeName)` 调用 OpenSpec CLI 创建 change，且 CLI 生成的 `.openspec.yaml` 已包含 `created`
- **THEN** 系统 SHALL 用当前 `new Date().toISOString()` 的结果覆盖原有 `created`
- **AND** 系统 SHALL 将 `status` 写为 `creating`
- **AND** 写回后的 YAML SHALL 让 `created` 字段出现在 `status` 字段之前
- **AND** `created` 的 ISO 时间值 SHALL NOT 带单引号或双引号

#### Scenario: Generated change metadata lacks created

- **WHEN** `createChange(projectRoot, changeName)` 调用 OpenSpec CLI 创建 change，且 CLI 生成的 `.openspec.yaml` 不包含 `created`
- **THEN** 系统 SHALL 新增 `created` 字段，值为当前 `new Date().toISOString()` 的结果
- **AND** 系统 SHALL 将 `status` 写为 `creating`
- **AND** 写回后的 YAML SHALL 让 `created` 字段出现在 `status` 字段之前
- **AND** `created` 的 ISO 时间值 SHALL NOT 带单引号或双引号

#### Scenario: Existing change remains untouched

- **WHEN** `createChange(projectRoot, changeName)` 被调用且目标 change 的 `.openspec.yaml` 已存在
- **THEN** 系统 SHALL 保持现有早退行为
- **AND** 系统 SHALL NOT 覆盖该文件中的 `created` 或 `status`

## ADDED Requirements

### Requirement: Fyllo-specs lifecycle metadata serialization remains consistent

`fyllo-specs` runtime SHALL 让 Create、MCP Apply 与 Archive 三条 `.openspec.yaml` 写入路径使用同一 metadata YAML 序列化规则。每次写回 SHALL 保留文档中的其他 metadata 字段和值，并 SHALL 将 ISO 时间字符串输出为不带单引号或双引号的 YAML plain scalar。

#### Scenario: Apply writes status without quoting created

- **WHEN** `loadApplyState(projectRoot, changeName)` 将现有 change 的 `status` 更新为 `applying`
- **THEN** 写回后的 `.openspec.yaml` SHALL 包含 `status: applying`
- **AND** 原有 `created` ISO 时间值 SHALL 保持不变且不带单引号或双引号
- **AND** 其他 metadata 字段和值 SHALL 保持不变

#### Scenario: Archive writes status without quoting created

- **WHEN** confirmed `archiveChange(projectRoot, changeName)` 将归档目录 metadata 的 `status` 更新为 `archived`
- **THEN** 写回后的 `.openspec.yaml` SHALL 包含 `status: archived`
- **AND** 原有 `created` ISO 时间值 SHALL 保持不变且不带单引号或双引号
- **AND** 其他 metadata 字段和值 SHALL 保持不变
