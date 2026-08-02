## MODIFIED Requirements

### Requirement: 系统提供项目级工作脉络浏览数据

系统 SHALL 通过 `insight:lineage:getBrowser` 返回当前 `workspaceId` 全部 lineage subject 的只读 browser 投影，并 SHALL 按 subject `updatedAt` 从新到旧排序。Folder repository reverse index SHALL NOT 扩大可读取的 Workspace subject 集合。

#### Scenario: 成功加载工作脉络

- **WHEN** 用户进入 `/lineage` 且当前 Workspace 存在 lineage subjects
- **THEN** 系统 SHALL 返回每条 subject 的来源、任务快照、聚合状态、创建/更新时间和按 link 保留的 Session 列表
- **AND** 每个 Session SHALL 返回标题、Agent、时间、Plan links 与 Proposal links 的展示投影
- **AND** renderer SHALL NOT 直接读取 lineage subject、Workspace index 或 Folder reverse index 文件

#### Scenario: Workspace 没有工作脉络

- **WHEN** 当前 Workspace 没有 lineage subject
- **THEN** browser 查询 SHALL 成功返回空 entries
- **AND** 页面 SHALL 展示包含图标、标题和说明的工作脉络空状态
- **AND** SHALL NOT 读取共享 Folder 所关联的其他 Workspace subjects填充列表

### Requirement: Browser 投影补充现有对象元信息并隔离缺失

系统 SHALL 使用当前 Workspace 的 Session meta、Plan 文档与 owner Folder 的 Proposal metadata 补充 lineage links，同时保持 lineage link 中的稳定 ID 与完整 `ProposalRef` 可见。

#### Scenario: 关联元信息完整

- **WHEN** lineage Session、Plan 与 ProposalRef 均存在对应元信息
- **THEN** Session 投影 SHALL 包含会话标题、Agent 和更新时间
- **AND** Plan 投影 SHALL 包含 slug、goal 与 draft/approved 状态
- **AND** Proposal 投影 SHALL 包含 `folderId`、change ID、owner Folder名称、标题、实时 Proposal 状态与已有 Commit hash

#### Scenario: 单个关联对象元信息缺失

- **WHEN** 某个 Session meta、Plan 文档或 owner-qualified Proposal metadata 无法读取
- **THEN** browser 查询 SHALL 保留对应 session ID、plan slug 或 ProposalRef
- **AND** 缺失的补充字段 SHALL 使用空值或稳定 ID 回退
- **AND** 单个关联对象缺失 SHALL NOT 让其他 lineage entries 进入失败状态

#### Scenario: 跨 Folder 同名 Proposal

- **WHEN** 当前 Workspace subject关联 Folder A 与 Folder B 中相同 change ID
- **THEN** browser SHALL 保留两条 Proposal投影
- **AND** metadata lookup SHALL 分别使用各自 ProposalRef，不得按裸 change ID覆盖

### Requirement: Lineage 对象复用现有应用内入口

系统 SHALL 让工作脉络中的可操作对象使用现有应用内导航与详情能力，不新增平行实现。

#### Scenario: 打开关联会话

- **WHEN** 用户点击 Session 的打开会话操作
- **THEN** 系统 SHALL 通过现有 `useOpenChatSession` 进入 `/chat` 并选择目标 session ID

#### Scenario: 打开关联 Proposal

- **WHEN** 用户点击具有可用 metadata 的 Proposal 节点
- **THEN** 系统 SHALL 通过现有 Proposal detail slideover 按完整 `ProposalRef` 打开目标
- **AND** Folder filter或其他同名 change SHALL NOT改变已打开详情的owner

#### Scenario: 查看来源任务

- **WHEN** 用户点击已关联任务脉络的“查看任务”操作
- **THEN** 系统 SHALL 导航到 `/task`
- **AND** 系统 SHALL NOT 承诺自动打开特定任务详情

#### Scenario: 复制 Commit hash

- **WHEN** 用户点击 Commit 节点的复制操作
- **THEN** 系统 SHALL 尝试将完整 Commit hash 写入剪贴板
- **AND** 成功或失败 SHALL 通过非颜色文字反馈告知用户

### Requirement: Lineage 页面隔离加载、失败与项目切换状态

系统 SHALL 由 insight lineage store 持有 browser 数据、加载和错误状态，并以请求发起时的 `workspaceId` 与请求世代隔离异步结果，避免显示上一个 Workspace 或共享 Folder其他 Workspace 的内容。

#### Scenario: Browser 数据加载中

- **WHEN** 当前 Workspace 的 browser 查询尚未完成
- **THEN** 页面 SHALL 展示与双栏结构一致的加载状态
- **AND** SHALL NOT 将上一个 Workspace 的数据作为当前结果展示

#### Scenario: Browser 查询失败

- **WHEN** `insight:lineage:getBrowser` 返回失败
- **THEN** 页面 SHALL 展示错误说明
- **AND** SHALL NOT 展示不完整结果作为成功详情

#### Scenario: 用户切换 Workspace

- **WHEN** 当前 `workspaceId` 在 browser 请求期间发生变化
- **THEN** store SHALL 忽略旧 Workspace迟到的响应
- **AND** SHALL 为新 Workspace重新加载 browser数据并重置选择

### Requirement: Lineage Browser 保持现有持久化兼容

系统 SHALL 将 browser能力实现为当前 Workspace lineage subjects/index、Session meta、Plan 与 owner Folder Proposal 文件的只读投影。升级迁移 MAY 重建 Workspace index v2与Folder reverse index，但 browser读取 SHALL NOT修改subject或关联业务文件。

#### Scenario: 加载 Browser 数据

- **WHEN** 系统读取工作脉络 browser数据
- **THEN** SHALL NOT修改 `Subject`、Workspace lineage index、Folder reverse index、Session meta、Plan或Proposal文件
- **AND** SHALL NOT在读取时猜测缺失的Folder owner或跨Workspace补齐subject
