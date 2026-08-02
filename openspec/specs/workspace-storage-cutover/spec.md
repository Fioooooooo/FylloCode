# workspace-storage-cutover Specification

## Purpose

定义旧版 Project 数据向稳定 Workspace 与 Folder 命名空间迁移的强制切换流程、全局预检、数据保留与转换规则，以及启动门禁、失败退出和恢复提示的用户可见契约。

## Requirements

### Requirement: Project cutover 是已注册的 required migration

系统 SHALL 通过现有 main migration registry 注册一个不可变 ID 的 Project → Workspace/Folder required cutover；脚本 SHALL 服从现有账本、baseline、失败后继续和失败不重试语义，并依赖已落地的单实例启动门。

#### Scenario: Legacy install 执行 required cutover

- **WHEN** 没有覆盖 required ID 的 baseline 或 executed record
- **AND** app-data 中存在合法 legacy Project
- **THEN** runner SHALL 执行并记录 required cutover

#### Scenario: Fresh install baseline 覆盖 cutover

- **WHEN** app-data 不含 migration store、legacy marker 或 Workspace marker
- **THEN** runner SHALL 用最后 migration ID 建立 baseline
- **AND** bootstrap gate SHALL 视 required cutover 已满足
- **AND** 系统 SHALL NOT 要求预先存在 Workspace/Folder meta

### Requirement: Legacy Project 保留 ID 并转换为 Folder Workspace

每个合法 legacy Project SHALL 生成同 ID 的 `FolderMeta` 与 `kind: "folder"` 的 `WorkspaceMeta`；`workspaceId === folderId === legacyProjectId`，唯一成员和 primary 均为该 ID，health/timestamps SHALL 保留。

#### Scenario: Legacy ID 与 path 编码不一致

- **WHEN** `legacyProject.id !== encodeProjectPath(legacyProject.path)`
- **THEN** migrated Workspace 与 Folder SHALL 保留 legacy ID
- **AND** 系统 SHALL 使用当前有效 canonical path 建立 registry 反向解析
- **AND** 系统 SHALL NOT 按 path 重新计算 ID

#### Scenario: Legacy path missing

- **WHEN** legacy Project path 当前不存在
- **THEN** Folder meta SHALL 保留最后已知绝对路径并标记 missing
- **AND** Workspace SHALL 进入不可正常打开的 repair 状态

### Requirement: Legacy app-data source 只由当前 meta path 定位

Cutover SHALL 使用 `candidateLegacyAppDataKey = encodeProjectPath(legacyProject.path)` 定位 `<appData>/projects/<candidate>`，不得用 legacy ID、历史 path 目录或迁移后的 Folder path 替代。

#### Scenario: Path 更新后存在两个历史目录

- **WHEN** `<projects>/<legacyId>` 与当前 meta path 的 candidate 目录包含不同数据
- **THEN** cutover SHALL 只复制当前 meta path 指向的 source
- **AND** 旧 ID/历史目录 SHALL 保持原样且不被合并

#### Scenario: Candidate 编码碰撞

- **WHEN** 多个 legacy Project 的不同 path 得到同一 candidate key
- **THEN** 各 Workspace SHALL 服从旧 helper 读取同一既有 source
- **AND** 碰撞组内 Workspace SHALL NOT 保存 `legacyAppDataKey`
- **AND** shared legacy source SHALL 保持未认领

### Requirement: Cutover 转换完整 Workspace-owned 数据形态

Cutover SHALL 将当前 source 的 sessions/messages/attachments、plans、tasks、workflows、integration config、knowledge、Workspace lineage subjects、MCP events 与 run records 复制到 `<appData>/workspaces/<workspaceId>`，并将目标 JSON 的顶层作用域从 `projectId` 转换为 `workspaceId`。Repository reverse data SHALL 写入 `<appData>/workspace-folders/<folderId>`。

#### Scenario: Legacy Session 缺少 Workspace snapshot

- **WHEN** legacy Session 只有 Project identity/path
- **THEN** migration SHALL 写入单成员 Workspace snapshot
- **AND** snapshot SHALL 包含明确的 `folderId`、`folderName`、`folderPath`、primary、`cwd` 与空 `additionalDirectories`

#### Scenario: Legacy task 不猜 repository hint

- **WHEN** legacy task 被迁移
- **THEN** `projectId` SHALL 转换为 `workspaceId`
- **AND** `targetFolderIds` SHALL 保持省略

### Requirement: Cutover 在写入前检测冲突并保留原数据

脚本 SHALL 在开始写入前完成旧 schema、ID mapping、candidate 分组、target shape 和 canonical path 冲突检查；只转换可明确识别的数据，保留无关字段和文件，写入失败 SHALL 抛给 runner。

#### Scenario: 两个 legacy ID 指向同一 canonical path

- **WHEN** 不同 legacy Project ID 的有效 path canonicalize 后相同
- **THEN** required cutover SHALL 失败并报告全部冲突 ID/path
- **AND** 系统 SHALL NOT 自动选择、合并或覆盖任一 source/target

#### Scenario: 一致的部分 target 可补齐

- **WHEN** source 与已存在 target 的 ID mapping 和 schema 一致
- **THEN** migration MAY 补齐缺失目标
- **AND** source/target 冲突时 SHALL 保留两侧并失败

### Requirement: Bootstrap 明确验证 required cutover

`runAllMigrations()` 返回后，bootstrap SHALL 读取 ledger 与目标数据：executed 中 required ID 只有 `success` 通过；未执行时只有 `baselineId >= requiredId` 通过；failed record SHALL NOT 被 baseline 覆盖。

#### Scenario: Required migration 失败

- **WHEN** ledger 包含 required ID 的 `failed` record
- **THEN** bootstrap gate SHALL 失败
- **AND** 系统 SHALL NOT 启动 bundled MCP、IPC、workflow、Launcher 或 Agent warmup

#### Scenario: Success record 但目标数据不完整

- **WHEN** legacy install 的 ledger 记录 required cutover success
- **AND** Workspace/Folder target 无法通过完整性校验
- **THEN** bootstrap gate SHALL 失败
- **AND** 系统 SHALL NOT 把半迁移数据交给正常 runtime

### Requirement: Cutover 失败显示原生阻塞错误并退出

Gate 失败时系统 SHALL 使用原生对话框显示“Workspace 数据升级失败”、数据未删除说明、失败 migration ID 和日志位置；仅提供“打开日志目录”和“退出 FylloCode”，两条路径最终都 SHALL 退出应用。

#### Scenario: 用户打开日志目录

- **WHEN** 用户在升级失败对话框选择“打开日志目录”
- **THEN** 系统 SHALL 通过系统 shell 打开日志目录
- **AND** 系统 SHALL 随后退出 FylloCode

#### Scenario: 用户直接退出

- **WHEN** 用户选择“退出 FylloCode”或关闭对话框
- **THEN** 系统 SHALL 退出应用
- **AND** 系统 SHALL NOT 提供继续启动或重试同一 migration 的操作

### Requirement: 首次 cutover 保留全部 legacy source

系统 SHALL 在本 proposal 中保留 legacy Project meta、`<appData>/projects/**` 和无法安全归属的 orphan；不得移动、删除或把 candidate key 当作删除授权。Cleanup SHALL 由新的、更晚 migration ID 或显式永久删除 contract 负责。

#### Scenario: Cutover 成功后 legacy 数据仍存在

- **WHEN** required cutover 成功完成
- **THEN** migrated Workspace SHALL 从新 namespace 正常读取
- **AND** 对应 legacy source 与 meta SHALL 仍保持原样
