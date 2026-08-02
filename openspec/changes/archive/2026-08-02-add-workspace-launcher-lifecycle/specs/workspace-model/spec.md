## MODIFIED Requirements

### Requirement: Folder registry 原子维护 canonical path 唯一性

系统 SHALL 由 Main 中的单一 registry mutation boundary 维护有效 canonical path 与稳定 `folderId` 的反向映射。新 Folder SHALL 使用与路径无关的不透明 ID；同一 canonical path SHALL 最多对应一个 Folder。`resolveOrCreateFolder()` 与 `relocateFolder()` SHALL 共享同一串行化 mutation boundary，reader 只能观察 mutation 前或后的完整状态。

#### Scenario: 并发解析同一路径

- **WHEN** 两个窗口并发调用 `resolveOrCreateFolder()` 处理同一 canonical path
- **THEN** 系统 SHALL 返回同一个 `folderId`
- **AND** registry SHALL 只创建一份 Folder meta

#### Scenario: Missing legacy path 不进入反向索引

- **WHEN** migrated Folder 的最后已知绝对路径当前不存在
- **THEN** 系统 SHALL 保留该 path 并标记 missing
- **AND** 系统 SHALL NOT 将其加入 canonical path 反向索引

#### Scenario: 重定位到已占用 canonical path

- **WHEN** `relocateFolder()` 的目标 canonical path 已属于另一个 Folder
- **THEN** 系统 SHALL 返回 `FOLDER_RELOCATION_CONFLICT`
- **AND** 报告 SHALL 包含占用目标的 Folder identity 与 path
- **AND** registry SHALL 保持不变

#### Scenario: 重定位导致引用 Workspace 成员冲突

- **WHEN** 目标 Folder 被多个 Workspace 引用
- **AND** 新路径会使其中任一 Workspace 出现重复、ancestor 或 descendant 成员
- **THEN** 系统 SHALL 拒绝整次重定位且不产生部分更新
- **AND** `workspaceConflicts` SHALL 只列出实际冲突的 Workspace、Folder 和路径关系

#### Scenario: 解除冲突后重试重定位

- **WHEN** 用户通过报告入口解除所有占用与成员冲突后使用相同目标路径重试
- **THEN** 系统 SHALL 更新原 `folderId` 的 path
- **AND** 系统 SHALL NOT 创建第二个 Folder 或修改引用 Workspace 的稳定 ID
