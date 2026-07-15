# lineage-browser Specification

## Purpose

定义项目级工作脉络浏览能力的只读数据投影、状态聚合、筛选与详情交互边界，并约束 Session、Plan、Proposal、Commit 元信息补充及现有持久化格式兼容行为。

## Requirements

### Requirement: 系统提供项目级工作脉络浏览数据

系统 SHALL 通过 `insight:lineage:getBrowser` 返回当前项目全部 lineage subject 的只读 browser 投影，并 SHALL 按 subject `updatedAt` 从新到旧排序。

#### Scenario: 成功加载工作脉络

- **WHEN** 用户进入 `/lineage` 且当前项目存在 lineage subjects
- **THEN** 系统 SHALL 返回每条 subject 的来源、任务快照、聚合状态、创建/更新时间和按 link 保留的 Session 列表
- **AND** 每个 Session SHALL 返回标题、Agent、时间、Plan links 与 Proposal links 的展示投影
- **AND** renderer SHALL NOT 直接读取 lineage subject 或 index 文件

#### Scenario: 项目没有工作脉络

- **WHEN** 当前项目没有 lineage subject
- **THEN** browser 查询 SHALL 成功返回空 entries
- **AND** 页面 SHALL 展示包含图标、标题和说明的工作脉络空状态

### Requirement: Browser 投影补充现有对象元信息并隔离缺失

系统 SHALL 使用现有 Session meta、Plan 文档与 Proposal metadata 补充 lineage links，同时保持 lineage link 中的稳定 ID 可见。

#### Scenario: 关联元信息完整

- **WHEN** lineage Session、Plan 与 Proposal 均存在对应元信息
- **THEN** Session 投影 SHALL 包含会话标题、Agent 和更新时间
- **AND** Plan 投影 SHALL 包含 slug、goal 与 draft/approved 状态
- **AND** Proposal 投影 SHALL 包含 change ID、标题、实时 Proposal 状态与已有 Commit hash

#### Scenario: 单个关联对象元信息缺失

- **WHEN** 某个 Session meta、Plan 文档或 Proposal metadata 无法读取
- **THEN** browser 查询 SHALL 保留对应 session ID、plan slug 或 change ID
- **AND** 缺失的补充字段 SHALL 使用空值或稳定 ID 回退
- **AND** 单个关联对象缺失 SHALL NOT 让其他 lineage entries 进入失败状态

### Requirement: 工作脉络状态采用稳定聚合规则

系统 SHALL 将每条工作脉络聚合为 `applying`、`planned`、`completed` 或 `discussion`，并在所有列表与详情入口使用相同结果。

#### Scenario: 存在实现中的 Proposal

- **WHEN** 工作脉络中任一 Proposal 状态为 `applying`
- **THEN** 工作脉络聚合状态 SHALL 为 `applying`

#### Scenario: 工作尚在规划

- **WHEN** 工作脉络没有 `applying` Proposal，但存在 `creating`/`draft` Proposal、状态无法解析的 Proposal 或至少一个 Plan
- **THEN** 工作脉络聚合状态 SHALL 为 `planned`

#### Scenario: 所有 Proposal 已归档

- **WHEN** 工作脉络至少包含一个 Proposal，且所有 Proposal 状态均为 `archived`
- **THEN** 工作脉络聚合状态 SHALL 为 `completed`

#### Scenario: 只有讨论记录

- **WHEN** 工作脉络不包含 Plan 或 Proposal
- **THEN** 工作脉络聚合状态 SHALL 为 `discussion`

### Requirement: Lineage 页面支持状态筛选与稳定选择

系统 SHALL 在 `/lineage` 左栏提供“全部 / 推进中 / 已归档 / 待关联”筛选，并 SHALL NOT 在本能力中提供文本搜索。

#### Scenario: 按推进状态筛选

- **WHEN** 用户选择“推进中”
- **THEN** 页面 SHALL 展示聚合状态不是 `completed` 的工作脉络
- **AND** 用户选择“已归档”时 SHALL 只展示 `completed` 工作脉络

#### Scenario: 筛选待关联脉络

- **WHEN** 用户选择“待关联”
- **THEN** 页面 SHALL 只展示任务快照为空的工作脉络

#### Scenario: 当前选择不再可见

- **WHEN** 筛选变化或数据刷新导致当前选中的 subject 不在可见列表中
- **THEN** 页面 SHALL 自动选择第一条可见脉络
- **AND** 当筛选结果为空时 SHALL 展示筛选空状态而不是旧详情

### Requirement: Lineage 详情按 Session 展示演进路径

系统 SHALL 在右侧详情中先展示任务或对话起点，再按 lineage link 顺序分组展示各 Session 及其 Plan、Proposal 和 Commit 信息。

#### Scenario: 展示任务来源脉络

- **WHEN** 选中的工作脉络包含任务快照
- **THEN** 详情 SHALL 展示任务来源标识、任务引用、任务标题和描述摘要
- **AND** SHALL 展示 Session、Plan 与 Proposal 数量以及最近更新时间

#### Scenario: 展示自由讨论脉络

- **WHEN** 选中的工作脉络没有任务快照
- **THEN** 详情 SHALL 使用对话作为起点
- **AND** SHALL 明确提示该脉络尚未关联任务

#### Scenario: 展示 Session 内事件

- **WHEN** 某个 Session 包含 Plan 或 Proposal links
- **THEN** 页面 SHALL 在该 Session 分组内展示 Plan slug/goal/status 与 Proposal change ID/title/status
- **AND** 当 Proposal link 包含 Commit hash 时 SHALL 展示对应 Commit 节点

#### Scenario: Session 只有讨论

- **WHEN** 某个 Session 不包含 Plan 或 Proposal
- **THEN** 页面 SHALL 保留 Session 分组
- **AND** SHALL 显示尚未形成 Plan 或 Proposal 的明确说明

### Requirement: Lineage 对象复用现有应用内入口

系统 SHALL 让工作脉络中的可操作对象使用现有应用内导航与详情能力，不新增平行实现。

#### Scenario: 打开关联会话

- **WHEN** 用户点击 Session 的打开会话操作
- **THEN** 系统 SHALL 通过现有 `useOpenChatSession` 进入 `/chat` 并选择目标 session ID

#### Scenario: 打开关联 Proposal

- **WHEN** 用户点击具有可用 metadata 的 Proposal 节点
- **THEN** 系统 SHALL 通过现有 Proposal detail slideover 打开对应 change ID

#### Scenario: 查看来源任务

- **WHEN** 用户点击已关联任务脉络的“查看任务”操作
- **THEN** 系统 SHALL 导航到 `/task`
- **AND** 系统 SHALL NOT 承诺自动打开特定任务详情

#### Scenario: 复制 Commit hash

- **WHEN** 用户点击 Commit 节点的复制操作
- **THEN** 系统 SHALL 尝试将完整 Commit hash 写入剪贴板
- **AND** 成功或失败 SHALL 通过非颜色文字反馈告知用户

### Requirement: Lineage 页面隔离加载、失败与项目切换状态

系统 SHALL 由 insight lineage store 持有 browser 数据、加载和错误状态，并避免显示上一个项目的过期结果。

#### Scenario: Browser 数据加载中

- **WHEN** 当前项目的 browser 查询尚未完成
- **THEN** 页面 SHALL 展示与双栏结构一致的加载状态
- **AND** SHALL NOT 将上一个项目的数据作为当前结果展示

#### Scenario: Browser 查询失败

- **WHEN** `insight:lineage:getBrowser` 返回失败
- **THEN** 页面 SHALL 展示错误说明
- **AND** SHALL NOT 展示不完整结果作为成功详情

#### Scenario: 用户切换项目

- **WHEN** 当前项目 ID 在 browser 请求期间发生变化
- **THEN** store SHALL 忽略旧项目迟到的响应
- **AND** SHALL 为新项目重新加载 browser 数据并重置选择

### Requirement: Lineage Browser 保持现有持久化兼容

系统 SHALL 将 browser 能力实现为现有 lineage、session、plan 与 proposal 文件的只读投影。

#### Scenario: 加载 Browser 数据

- **WHEN** 系统读取工作脉络 browser 数据
- **THEN** SHALL NOT 修改 `Subject`、`LineageIndex`、Session meta、Plan 或 Proposal 文件
- **AND** SHALL NOT 要求现有项目执行数据迁移
