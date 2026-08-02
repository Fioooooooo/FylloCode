## ADDED Requirements

### Requirement: Workspace 与 Folder 使用稳定且分离的身份

系统 SHALL 将 Workspace 作为窗口和用户工作历史的顶层身份，将 Folder 作为 repository/path 成员身份；`workspaceId` SHALL NOT 用于推导 repository path，`folderId` SHALL NOT 由当前 path 编码或重新计算。

#### Scenario: Folder Workspace 使用同 ID 单成员

- **WHEN** 系统读取 `kind: "folder"` 的 Workspace
- **THEN** `folderIds` SHALL 恰好包含一个 Folder
- **AND** `workspaceId`、唯一 `folderId` 与 `primaryFolderId` SHALL 相等

#### Scenario: Collection Workspace 保留显式 kind

- **WHEN** 系统读取 `kind: "collection"` 且只有一个 Folder 的 Workspace
- **THEN** 系统 SHALL 保持 `kind: "collection"`
- **AND** 系统 SHALL NOT 根据成员数量将其改写为 Folder Workspace

### Requirement: Workspace meta 强制成员与 tombstone 不变量

系统 SHALL 只接受 `kind: "folder" | "collection"`、1–16 个去重成员和属于成员集合的唯一 primary。Active meta SHALL 为 `isDeleted: false` 且不含 deletion fields；deleted meta SHALL 包含 `deletedAt` 与合法 `cleanupState`，且只有 `restorable` 可恢复。

#### Scenario: 第十七个成员被拒绝

- **WHEN** 创建、编辑或 repair 试图保存 17 个 Folder
- **THEN** 系统 SHALL 拒绝整次写入
- **AND** 原成员与 primary SHALL 保持不变

#### Scenario: Folder Workspace 形态损坏

- **WHEN** Folder Workspace 的成员数不为一或 primary/ID 不相等
- **THEN** 系统 SHALL 拒绝把该记录作为正常 Workspace 打开
- **AND** 系统 SHALL 返回结构化 repair error

### Requirement: Folder registry 原子维护 canonical path 唯一性

系统 SHALL 由 Main 中的单一 registry mutation boundary 维护有效 canonical path 与稳定 `folderId` 的反向映射。新 Folder SHALL 使用与路径无关的不透明 ID；同一 canonical path SHALL 最多对应一个 Folder。

#### Scenario: 并发解析同一路径

- **WHEN** 两个窗口并发调用 `resolveOrCreateFolder()` 处理同一 canonical path
- **THEN** 系统 SHALL 返回同一个 `folderId`
- **AND** registry SHALL 只创建一份 Folder meta

#### Scenario: Missing legacy path 不进入反向索引

- **WHEN** migrated Folder 的最后已知绝对路径当前不存在
- **THEN** 系统 SHALL 保留该 path 并标记 missing
- **AND** 系统 SHALL NOT 将其加入 canonical path 反向索引

### Requirement: Workspace resolver 显式投影运行期目录

系统 SHALL 通过 `ResolvedWorkspace` 返回 `workspaceId`、kind、Workspace data dir、完整 Folder identity/path、primary、available/missing 集合、`cwd` 与 `additionalDirectories`，不得让消费者从 Workspace meta 猜测 repository path。

#### Scenario: Migrated Folder Workspace resolution

- **WHEN** resolver 解析一个 path 可用的 migrated Folder Workspace
- **THEN** `cwd` SHALL 等于唯一 Folder 的 `folderPath`
- **AND** `additionalDirectories` SHALL 为空
- **AND** `workspaceDataDir` SHALL 只由稳定 `workspaceId` 定位

#### Scenario: Primary path missing

- **WHEN** primary Folder path 不可用
- **THEN** resolver SHALL 返回 primary missing 状态
- **AND** 系统 SHALL NOT 生成可启动 Agent 的 `cwd`

### Requirement: Repository target 必须属于 Workspace 成员

系统 SHALL 使用 `{ workspaceId, folderId, worktreePath }` 解析 repository-owned 操作，校验 Folder 是当前 Workspace 的有效成员，且 worktree 是该 Folder repository 的 main 或 registered worktree。

#### Scenario: 非成员 owner 被拒绝

- **WHEN** repository-owned use case 提供不属于当前 Workspace 的 `folderId`
- **THEN** resolver SHALL 拒绝请求
- **AND** resolver SHALL NOT 使用 primary Folder 或 caller absolute path 作为回退

#### Scenario: 非注册 worktree 被拒绝

- **WHEN** `worktreePath` 不等于 Folder root 且不属于该 repository 的 registered worktree
- **THEN** resolver SHALL 拒绝该 target

### Requirement: 新运行期 contract 不暴露 Project identity

系统 SHALL 在 shared types、IPC、preload、renderer store、runtime key 和新持久化 schema 中使用 `workspaceId` / `folderId`；`projectId`、`ProjectMeta` 与 Project window role 只允许出现在 upgrade migration 的 legacy input 类型和历史 inventory 中。

#### Scenario: Runtime contract inventory

- **WHEN** 检查正常启动会加载的源码与公开 schema
- **THEN** 不存在接受或返回 `projectId` 的 runtime contract
- **AND** 不存在通过 `encodeProjectPath()` 恢复 Workspace 或 Folder identity 的逻辑
