## MODIFIED Requirements

### Requirement: Dynamic overview area preserves active proposal interactions

系统 SHALL 在动态数据区域展示当前 Workspace 可见 Folder 中的进行中提案，并保留现有 proposal 详情打开能力。每个 active change SHALL 携带完整 `ProposalRef` 和 owner Folder metadata；task/session enrichment SHALL 只来自当前 Workspace subject/reference。

#### Scenario: Active proposal cards open proposal detail

- **WHEN** overview 页面展示进行中的提案
- **THEN** 每个可见提案 SHALL 展示提案标题、owner Folder、当前 Workspace 来源任务信息或自由讨论回退、proposal 状态和创建时间信息
- **AND** 当提案使用 linked worktree 且 active change metadata 包含 `worktreePath` 时，提案卡片 SHALL 展示 linked worktree icon
- **AND** 用户 hover 或 focus linked worktree icon 时 SHALL 能看到该提案使用的完整 `worktreePath`
- **AND** 当 active change metadata 没有 `worktreePath` 时，提案卡片 SHALL NOT 展示 linked worktree icon
- **AND** 用户点击提案卡片时 SHALL 使用完整 ProposalRef 打开对应 proposal detail slideover

#### Scenario: Active proposal status uses proposal model

- **WHEN** `insight:overview:getProjectOverview` 返回 `activeChanges`
- **THEN** 每个 active change SHALL 暴露 proposal 的非归档状态，取值为 `creating`、`draft` 或 `applying`
- **AND** 系统 SHALL NOT 将这些状态映射为 overview 专属的 `drafting` 或 `proposal`
- **AND** 状态为 `archived` 的 proposal SHALL NOT 出现在 `activeChanges` 中

#### Scenario: Active proposal linked worktree metadata remains available

- **WHEN** active change 对应一个使用 linked worktree 的 proposal
- **THEN** active change SHALL 暴露与 proposal metadata 一致的 `worktreePath`
- **AND** 系统 SHALL 复用该 path 展示 linked worktree indicator

#### Scenario: Same-name active proposals remain separate

- **WHEN** 两个 Folder 都有相同 changeId 的 active proposal
- **THEN** overview SHALL 同时展示两个 owner-qualified cards
- **AND** SHALL NOT 按 changeId 去重或合并状态

#### Scenario: Shared proposal has no current Workspace subject

- **WHEN** repository proposal 的 origin 属于其他 Workspace，且当前 Workspace 没有 subject/reference
- **THEN** active change 的 task title 与 task ref SHALL 为 null
- **AND** overview SHALL NOT 读取 origin Workspace 的 subject、task 或 session 内容

#### Scenario: Active proposals empty state remains explicit

- **WHEN** overview 数据中的 `activeChanges` 为空
- **THEN** 动态数据区域 SHALL 展示进行中提案的空状态
- **AND** 空状态 SHALL NOT 移除最近脉络区域或静态治理区域

### Requirement: Static governance area summarizes health and evolution

系统 SHALL 在静态治理区域展示按 Folder 聚合的治理健康、知识沉淀、规约增长和准则演化。Repository counts 和 evolution SHALL 只汇总状态为 ready 的 Folder，返回 completeness 与未计入 Folder；跨 Folder 同名对象 SHALL 分别计数。Workspace knowledge SHALL 继续只读当前 Workspace 一次。

#### Scenario: Governance health summarizes ready Folder stats

- **WHEN** overview 页面展示静态治理区域
- **THEN** 治理健康 SHALL 展示 specs、archives、guidelines 的 ready Folder 汇总和 repository completeness
- **AND** partial aggregate SHALL 明确标注未计入 Folder，SHALL NOT 把数字表示为完整总数
- **AND** 治理健康 SHALL 突出展示当前 Workspace subject 的溯源覆盖率，覆盖率由 `taskLinkedRatio` 派生
- **AND** guideline 数量 SHALL 在每个 ready Folder 中按 `guidelines/**/*.md` 递归统计

#### Scenario: Existing stat navigation remains available

- **WHEN** 用户点击治理健康中的能力规约入口
- **THEN** 系统 SHALL 导航到 `/specs`
- **AND** 当用户点击治理健康中的归档提案入口
- **THEN** 系统 SHALL 导航到 `/proposal`
- **AND** 当用户点击治理健康中的项目准则入口
- **THEN** 系统 SHALL 导航到 `/guidelines`
- **AND** 当用户点击治理健康入口网格中的知识沉淀入口
- **THEN** 系统 SHALL 导航到 `/knowledge`

#### Scenario: Knowledge summary remains independently visible

- **WHEN** 当前 Workspace knowledge browser index 成功加载
- **THEN** 治理健康卡片 SHALL 在首个分隔线下以每排三个入口的网格展示治理入口
- **AND** 知识沉淀 SHALL 与能力规约、归档提案和项目准则使用相同入口样式，并以不带单位的数字展示正常条目与扫描错误总数
- **AND** 当至少一个条目为 `suspect`、`unknown` 或存在扫描错误时，入口 SHALL 展示可访问的需关注提示
- **AND** knowledge count SHALL NOT 按 Folder 重复读取或累加

#### Scenario: Knowledge summary loading or failure is isolated

- **WHEN** knowledge browser index 正在加载或加载失败
- **THEN** 知识沉淀入口 SHALL 分别展示加载状态或“暂不可用”状态
- **AND** 入口 SHALL 继续允许用户导航到 `/knowledge` 查看详细状态
- **AND** knowledge failure SHALL NOT 让 overview 主数据进入页面级错误状态

#### Scenario: Governance evolution content remains owner-qualified

- **WHEN** overview 页面展示静态治理区域
- **THEN** 规约增长 SHALL 展示 ready Folder 的 owner-qualified cumulative trends
- **AND** 准则演化 SHALL 展示带 Folder owner 的最近更新列表或对应空状态
- **AND** Folder reader error SHALL NOT 删除其他 Folder evolution 数据

## ADDED Requirements

### Requirement: Overview separates Workspace work from repository governance reads

Main SHALL 以 `workspaceId` 解析一次 Workspace scope。Task-linked ratio、subject count 与 recent lineage SHALL 只从该 Workspace data directory 读取一次；proposal/spec/guideline/archive/Git governance SHALL 对每个 Folder repository 独立读取。Overview 被动读取 SHALL NOT 写入 lineage origin 或 reference。

#### Scenario: Collection Workspace overview loads

- **WHEN** Collection Workspace 包含两个可用 Folder
- **THEN** Main SHALL 只列举一次该 Workspace subjects
- **AND** SHALL 分别读取两个 Folder 的 repository governance
- **AND** recent lineage SHALL 只包含当前 Workspace subjects

#### Scenario: Secondary Folder fails governance scan

- **WHEN** secondary Folder governance reader 失败而 primary ready
- **THEN** Workspace work SHALL 保持可用
- **AND** primary repository data SHALL 保留
- **AND** overview SHALL 返回 partial completeness 与 secondary Folder error

#### Scenario: Overview read remains passive

- **WHEN** Overview 浏览共享 Folder 中由其他 Workspace 创建的 proposal
- **THEN** repository reverse index SHALL NOT 新增当前 Workspace reference
- **AND** 当前 Workspace 没有 subject link 时 SHALL 不补充其他 Workspace 内容
