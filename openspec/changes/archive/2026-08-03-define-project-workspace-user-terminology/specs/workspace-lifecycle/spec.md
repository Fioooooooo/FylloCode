## ADDED Requirements

### Requirement: Workspace lifecycle UI 遵守 Project/Workspace 呈现术语

Workspace lifecycle 的 renderer 呈现 SHALL 根据内部 kind 动态将 Folder Workspace 称为 Project、将 Collection Workspace 称为 Workspace；Folder member SHALL 称为 Project，path 操作 SHALL 称为项目目录。创建、编辑、成员管理、重定位、删除、恢复、永久清理、确认和结果提示 SHALL 遵守同一映射，但 Main lifecycle、error code、Workspace/Folder identity 与持久化状态 SHALL 保持内部术语。

共同管理两种 kind 的删除恢复入口 SHALL 使用中性的“回收站”。UI SHALL 将 `restorable`、`purging`、`cleanup-failed` 映射为用户状态及合法动作，不得直接显示 raw cleanup state。永久删除说明 SHALL 明确 FylloCode 数据与磁盘项目目录/Git repository 的边界，不得用“共享 Folder”或“历史 orphan”等内部术语承担主要用户解释。

#### Scenario: 编辑 Folder Workspace

- **WHEN** 用户编辑一个 active Folder Workspace
- **THEN** editor SHALL 将目标呈现为 Project，并将唯一 Folder path 呈现为项目目录
- **AND** SHALL 说明如需组合多个 Project 应创建 Workspace
- **AND** 内部成员 mutation 约束 SHALL 保持不变

#### Scenario: 创建单成员 Collection Workspace

- **WHEN** 用户以一个 Project 创建 `kind: "collection"` 的 Workspace
- **THEN** 创建与后续编辑界面 SHALL 始终将它呈现为 Workspace
- **AND** SHALL NOT 因 member 数量为 1 改称 Project

#### Scenario: 共同回收站展示两种 kind

- **WHEN** 回收站同时包含 Folder Workspace 与 Collection Workspace tombstone
- **THEN** 入口和列表容器 SHALL 使用中性名称
- **AND** 每个 item 的删除、恢复、永久清理和结果提示 SHALL 按其 kind 使用 Project 或 Workspace

#### Scenario: Cleanup state 不直接展示

- **WHEN** tombstone 的 `cleanupState` 为 `restorable`、`purging` 或 `cleanup-failed`
- **THEN** UI SHALL 显示对应的可恢复、正在永久删除或清理失败状态与合法动作
- **AND** SHALL NOT 将 raw enum value 作为状态文案

#### Scenario: 永久删除说明保持边界准确

- **WHEN** 用户准备永久删除 Project 或 Workspace
- **THEN** 确认说明 SHALL 使用目标 kind 对应术语，并说明受影响的是该对象的 FylloCode 数据
- **AND** SHALL 说明磁盘项目目录或 Git repository 不会因此被删除
- **AND** 对无法安全归属的数据 SHALL 使用用户可理解的保留说明
