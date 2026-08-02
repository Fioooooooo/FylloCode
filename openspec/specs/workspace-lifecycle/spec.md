# workspace-lifecycle Specification

## Purpose

定义 Workspace 从 launcher 创建、编辑、重定位、软删除、恢复到永久清理的生命周期边界，以及成员引用保护、历史 Session 确认和可重试清理的行为契约。

## Requirements

### Requirement: Collection Workspace 创建保持显式 kind 与原子成员校验

系统 SHALL 允许用户以名称、1–16 个 Folder 和属于成员集合的唯一 primary 创建 `kind: "collection"` 的 Workspace；Main SHALL canonicalize 并复用 Folder registry identity，在保存前拒绝重复、嵌套、缺失或超限成员，并且失败时不得保存部分 Workspace mutation。

#### Scenario: 单成员 Collection 仍保持 collection

- **WHEN** 用户使用一个有效 Folder 创建 Workspace
- **THEN** 系统 SHALL 保存新的稳定 `workspaceId` 与 `kind: "collection"`
- **AND** 系统 SHALL NOT 将其转换为该 Folder 的 Folder Workspace

#### Scenario: 第十七个成员被拒绝

- **WHEN** 用户提交包含 17 个 Folder 的创建请求
- **THEN** 系统 SHALL 拒绝整次创建
- **AND** 系统 SHALL NOT 留下 Workspace meta 或部分成员关系

#### Scenario: 成员路径重复或嵌套

- **WHEN** canonicalized Folder 集合包含相同路径或 ancestor/descendant 关系
- **THEN** 系统 SHALL 返回所有相关 Folder identity 和路径关系
- **AND** 系统 SHALL NOT 保存 Workspace

### Requirement: Workspace 编辑遵守 kind 与成员引用边界

系统 SHALL 允许所有 active Workspace 修改显示名称；Folder Workspace SHALL 拒绝增加、移除、排序成员或修改 primary，Collection Workspace SHALL 原子支持这些成员操作。修改 primary SHALL 只影响当前 Workspace 解析与后续新 Session，不得改写已有 Session snapshot。

#### Scenario: Folder Workspace 成员 mutation 被拒绝

- **WHEN** 用户尝试向 Folder Workspace 添加成员或修改 primary
- **THEN** Main SHALL 返回 `WORKSPACE_MEMBER_MUTATION_FORBIDDEN`
- **AND** 原 Workspace 与 Folder registry SHALL 保持不变

#### Scenario: Collection 成员与 primary 原子更新

- **WHEN** 用户提交合法的新成员顺序和属于该集合的 primary
- **THEN** 系统 SHALL 以一次 Workspace meta 写入保存完整结果
- **AND** Workspace-owned 数据目录 SHALL 保持原 `workspaceId`

#### Scenario: Active runtime 阻止成员移除

- **WHEN** 被移除 Folder 仍被 active probe/chat/create/apply/archive、watcher、pending action 或 preview dispatch 引用
- **THEN** 系统 SHALL 返回 `WORKSPACE_MEMBER_ACTIVE_REFERENCE`
- **AND** 错误 SHALL 列出相关 Workspace、Session、run 或 runtime identity
- **AND** Workspace meta SHALL 保持不变

#### Scenario: 历史 Session 需要显式确认

- **WHEN** 被移除 Folder 只被非 active Session snapshot 引用
- **AND** 请求没有确认历史影响
- **THEN** 系统 SHALL 返回 `WORKSPACE_MEMBER_REMOVAL_CONFIRMATION_REQUIRED` 和受影响 Session 摘要
- **AND** task `targetFolderIds` SHALL NOT 阻止移除

#### Scenario: 确认后重新检查并移除成员

- **WHEN** 用户确认历史 Session 影响并重试成员移除
- **THEN** Main SHALL 在写入前重新检查 active 与历史引用
- **AND** 只有最新检查仍无 active 阻塞时才 SHALL 保存成员变更
- **AND** 已有 Session snapshot SHALL 保持不变

### Requirement: Folder 重定位保持稳定 identity 并显式报告影响

系统 SHALL 允许从 Folder Workspace 或引用该 Folder 的 Collection Workspace 重新定位 Folder；成功 SHALL 只更新同一 `folderId` 的 canonical path，并影响所有引用 Workspace 的当前解析和后续 Session，不得移动 Workspace-owned 数据或改写历史 Session snapshot。

#### Scenario: Missing Collection member 可以被修复

- **WHEN** Collection Workspace 中没有独立 Folder Workspace 的 missing Folder 被重新定位到合法路径
- **THEN** 系统 SHALL 保留原 `folderId`
- **AND** 所有引用 Workspace SHALL 从后续解析中看到新路径

#### Scenario: Active runtime 阻止重定位

- **WHEN** 任一引用 Workspace 的 active Agent 或 proposal runtime 正在使用目标 Folder
- **THEN** 系统 SHALL 返回 `FOLDER_RELOCATION_ACTIVE_RUNTIME` 和引用摘要
- **AND** Folder registry SHALL 保持旧路径

#### Scenario: 历史 Session 需要重定位确认

- **WHEN** 目标 Folder 只有非 active Session snapshot 引用
- **AND** 用户尚未确认历史路径失效
- **THEN** 系统 SHALL 返回 `FOLDER_RELOCATION_CONFIRMATION_REQUIRED`
- **AND** UI SHALL 说明这些 Session 不会切换到新路径

### Requirement: Soft delete 关闭 runtime 后保留可恢复 tombstone

系统 SHALL 仅对 active Workspace 执行 soft delete：Main SHALL 先关闭该 Workspace 窗口并安全停止 Workspace runtime，再原子写入 `isDeleted: true`、`deletedAt` 与 `cleanupState: "restorable"`；Workspace meta、成员和全部 Workspace-owned 数据 SHALL 保留。

#### Scenario: Soft delete 成功

- **WHEN** 用户确认删除且所有 Workspace runtime 已安全停止
- **THEN** 系统 SHALL 写入 restorable tombstone
- **AND** launcher 默认列表与普通 open SHALL 排除该 Workspace
- **AND** Folder registry、repository 和其他 Workspace SHALL 不受影响

#### Scenario: Runtime 无法停止

- **WHEN** soft delete 无法安全停止任一 Workspace runtime
- **THEN** 系统 SHALL 拒绝删除并返回阻塞引用
- **AND** 系统 SHALL NOT 写入 tombstone

### Requirement: Deleted Workspace 可发现且仅按合法状态恢复

launcher SHALL 提供始终可达的已删除 Workspace 视图。系统 SHALL 只允许恢复 `cleanupState: "restorable"` 的 tombstone，恢复 SHALL 保留原 `workspaceId`、成员关系和 Workspace-owned 数据，并清除所有 deletion fields；`purging` 或 `cleanup-failed` SHALL 只允许继续或重试永久清理。

#### Scenario: Restorable Workspace 恢复

- **WHEN** 用户恢复 `cleanupState: "restorable"` 的 Workspace
- **THEN** 系统 SHALL 将其恢复为 active 且保持原 ID 和数据
- **AND** primary missing 时 SHALL 继续展示修复入口而不是伪装可打开

#### Scenario: Cleanup-failed Workspace 不可恢复

- **WHEN** 用户尝试恢复 `cleanupState: "cleanup-failed"` 的 Workspace
- **THEN** 系统 SHALL 拒绝恢复
- **AND** launcher SHALL 只提供重试永久清理

### Requirement: 永久清理可重试且不扩大删除范围

系统 SHALL 只永久清理 tombstone。Main SHALL 先持久化 `cleanupState: "purging"`，再删除目标 Workspace-owned 数据、Workspace window state，以及仅由 `legacyAppDataKey` 证明唯一归属的 active legacy source/record，最后删除 Workspace meta。任何必需步骤失败 SHALL 保留 `cleanup-failed` tombstone 和失败对象，并允许幂等重试。

#### Scenario: 有 provenance 的 migrated Workspace 清理成功

- **WHEN** tombstone 持有 `legacyAppDataKey`
- **AND** current 与对应 legacy 数据均可删除
- **THEN** 系统 SHALL 最后删除 Workspace meta
- **AND** 系统 SHALL NOT 删除 Folder meta、repository worktree 或其他 Workspace 数据

#### Scenario: 无 provenance 时跳过 legacy source

- **WHEN** tombstone 不含 `legacyAppDataKey`
- **THEN** 系统 SHALL 只清理 current Workspace 数据和 window state
- **AND** 编码碰撞组或历史 orphan 的 legacy source SHALL 保留

#### Scenario: Legacy source 删除失败

- **WHEN** provenance 指向的 legacy source 无法删除
- **THEN** 系统 SHALL 保留或重建 Workspace meta 并标记 `cleanup-failed`
- **AND** 系统 SHALL NOT 改用 workspaceId、当前 Folder path 或目录扫描选择其他 source
- **AND** 系统 SHALL NOT 报告永久删除成功

#### Scenario: 重启后重试部分清理

- **WHEN** 应用重启后读取到 `purging` 或 `cleanup-failed` tombstone
- **THEN** launcher SHALL 提供继续或重试永久清理
- **AND** 已经不存在的目标 SHALL 视为幂等完成
