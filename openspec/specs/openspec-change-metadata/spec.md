# openspec-change-metadata Specification

## Purpose

TBD - created by archiving change add-created-timestamp-to-openspec-change. Update Purpose after archive.

## Requirements

### Requirement: Created timestamp is written for new OpenSpec changes

系统 SHALL 在 `fyllo-specs` runtime 创建 OpenSpec change 并写回 `.openspec.yaml` 时，将 `created` 字段写为当前 `new Date().toISOString()` 的结果。

#### Scenario: Generated change metadata already has created

- **WHEN** `createChange(projectRoot, changeName)` 调用 OpenSpec CLI 创建 change，且 CLI 生成的 `.openspec.yaml` 已包含 `created`
- **THEN** 系统 SHALL 用当前 `new Date().toISOString()` 的结果覆盖原有 `created`
- **AND** 系统 SHALL 将 `status` 写为 `creating`
- **AND** 写回后的 YAML SHALL 让 `created` 字段出现在 `status` 字段之前

#### Scenario: Generated change metadata lacks created

- **WHEN** `createChange(projectRoot, changeName)` 调用 OpenSpec CLI 创建 change，且 CLI 生成的 `.openspec.yaml` 不包含 `created`
- **THEN** 系统 SHALL 新增 `created` 字段，值为当前 `new Date().toISOString()` 的结果
- **AND** 系统 SHALL 将 `status` 写为 `creating`
- **AND** 写回后的 YAML SHALL 让 `created` 字段出现在 `status` 字段之前

#### Scenario: Existing change remains untouched

- **WHEN** `createChange(projectRoot, changeName)` 被调用且目标 change 的 `.openspec.yaml` 已存在
- **THEN** 系统 SHALL 保持现有早退行为
- **AND** 系统 SHALL NOT 覆盖该文件中的 `created` 或 `status`
