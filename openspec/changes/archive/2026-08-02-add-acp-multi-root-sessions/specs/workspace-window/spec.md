## MODIFIED Requirements

### Requirement: Collection Workspace 在 ACP multi-root 前禁止 Agent 启动

系统 SHALL 允许 primary Folder 可用的 Folder 或 Collection Workspace 进入 Chat shell。系统 SHALL 仅在目标 Session snapshot 的 `additionalDirectories` 非空时要求 Agent 支持 ACP `additionalDirectories`；activity bar、路由进入、Chat empty state 与 Main activation SHALL 使用同一 capability evaluator，且不得在 Agent 不兼容时回退为只授权 primary Folder。

#### Scenario: Collection Workspace 查看与进入 Chat shell

- **WHEN** 用户打开 primary Folder 可用的 Collection Workspace
- **THEN** Workspace 管理与 Chat shell SHALL 可用
- **AND** Chat empty state SHALL 按每个 Agent 的 additional directories 能力显示可选、不可选或待检测状态

#### Scenario: 单根有效目录不限制 Agent

- **WHEN** Folder Workspace 或 degraded Collection Workspace 的新 Session snapshot 只有一个可用 Folder
- **THEN** Chat gate SHALL NOT 要求 Agent 支持 `additionalDirectories`
- **AND** 现有单根 Agent 可用性 SHALL 保持不变

#### Scenario: 多根目录 Agent 不兼容

- **WHEN** Workspace 新 Session snapshot 需要一个或多个 additional directories，且所选 Agent 已确认不支持该能力
- **THEN** Chat empty state SHALL 显示明确的不兼容原因
- **AND** navigation、probe、create、load、resume 与 stream Main入口 SHALL 拒绝启动该 Agent Session
- **AND** Main SHALL NOT 创建只使用 primary Folder 的降权 Session

#### Scenario: Primary Folder missing

- **WHEN** Workspace primary Folder path missing
- **THEN** Chat capability gate SHALL 拒绝 Agent 启动
- **AND** UI SHALL 引导用户先修复 primary Folder

## ADDED Requirements

### Requirement: Chat header 区分 Session scope 与当前 Workspace

Chat header SHALL 使用 active Session 的 `SessionWorkspaceSnapshot` 展示 Agent 实际授权 Folder，并 SHALL 将其与当前 Workspace 解析结果的差异归一化为 current-only Folder、snapshot-only Folder、primary 变化与同 ID Folder 显示名称变化。组件 SHALL NOT 使用当前 Workspace Folder 列表冒充已有 Agent Session 的授权范围。

#### Scenario: Workspace 新增成员后查看旧 Session

- **WHEN** 当前 Workspace 比 active Session snapshot 多一个可用 Folder
- **THEN** Chat header SHALL 标记该 Folder 为 current-only
- **AND** SHALL 提示新建 Session 才能让 Agent 获得该成员

#### Scenario: Session snapshot 与当前 primary 不同

- **WHEN** Workspace primary 在 Session 创建后发生变化
- **THEN** Chat header SHALL 继续以 snapshot primary 表示当前 Agent `cwd`
- **AND** SHALL 展示 current primary 与 snapshot primary 的差异

#### Scenario: Folder 显示名称变化

- **WHEN** 同一 `folderId` 的当前名称与 snapshot `folderName` 不同
- **THEN** Chat header SHALL 展示名称变化而不改写历史 snapshot
