# proposal-list 规范

## Purpose

定义 Proposal 列表页能力，包括概览统计、状态筛选、卡片元数据展示和排序规则。

## Requirements

### Requirement: Proposal 列表页展示概览统计

系统 SHALL 在列表页顶部展示三个统计数字：全部 proposal 数量、进行中（applying 状态）数量、已归档数量。

统计 SHALL 基于 `proposal:list` 返回的全部 ProposalMeta 计数，不区分 worktree 来源；worktree 来源的 active change 计入 "进行中"，主仓库 archive 来源计入"已归档"。

#### Scenario: 统计反映当前数据

- **WHEN** 用户进入 `/proposal` 页面
- **THEN** 页面顶部显示全部、进行中、已归档三个统计数字
- **AND** 数字与当前 project 的所有 proposal（含 worktree 来源）一致

#### Scenario: worktree applying change 计入进行中

- **WHEN** 列表中存在 worktree 来源、status 为 `applying` 的 ProposalMeta
- **THEN** "进行中"统计包含该条

### Requirement: Proposal 列表支持状态筛选

系统 SHALL 提供状态筛选，支持按全部、创建中、草稿、实现中、已归档过滤列表。

#### Scenario: 按状态筛选

- **WHEN** 用户点击某个状态筛选项
- **THEN** 列表只显示该状态的 proposal
- **AND** 其他状态的 proposal 不可见

#### Scenario: 默认显示全部

- **WHEN** 用户进入列表页，未选择任何筛选
- **THEN** 显示全部 proposal

### Requirement: Proposal 卡片展示关键元数据

每张 proposal 卡片 SHALL 展示：标题（目录名格式化）、状态 badge、Why 摘要（2 行截断）、创建日期、任务完成进度（完成数/总数）。

#### Scenario: 卡片渲染元数据

- **WHEN** 列表中存在 proposal
- **THEN** 每张卡片显示标题、状态 badge、why 摘要、日期和任务进度

#### Scenario: Why 文本截断

- **WHEN** Why 摘要超过 2 行
- **THEN** 超出部分以省略号截断

### Requirement: Proposal 列表按创建时间倒序排列

系统 SHALL 按 `.openspec.yaml` 中的 `created` 字段倒序排列 proposal 列表。

#### Scenario: 最新项优先

- **WHEN** 列表页加载完成
- **THEN** 创建日期最新的 proposal 排在最前

### Requirement: Proposal 列表聚合主仓库与 linked worktrees

系统 SHALL 在生成 proposal 列表时，扫描以下三处目录并合并结果：

1. 主仓库 `<projectPath>/openspec/changes/`（排除 `archive` 子目录）。
2. 主仓库 `<projectPath>/openspec/changes/archive/`。
3. 主仓库下每个 linked worktree 的 `<projectPath>/.worktrees/<name>/openspec/changes/`（worktree 内的 `archive` 子目录 SHALL NOT 被扫描）。

`<projectPath>/.worktrees/` 目录不存在时 SHALL 返回该段为空数组，整体 list SHALL NOT 报错。

#### Scenario: 仅主仓库

- **WHEN** `<projectPath>/.worktrees/` 不存在
- **THEN** `proposal:list` 返回的 ProposalMeta 数组仅包含主仓库 `openspec/changes/*` 与 `openspec/changes/archive/*`
- **AND** 所有条目的 `worktreePath` 字段为 `undefined`

#### Scenario: 主仓库与单个 worktree 共存

- **WHEN** 主仓库 `openspec/changes/foo/` 不存在
- **AND** `<projectPath>/.worktrees/foo/openspec/changes/foo/.openspec.yaml` 存在
- **THEN** list 包含 id 为 `foo` 的条目
- **AND** 该条目 `worktreePath === path.resolve(<projectPath>/.worktrees/foo)`

#### Scenario: 多个 worktree 各自一份 change

- **WHEN** `<projectPath>/.worktrees/foo` 与 `<projectPath>/.worktrees/bar` 各含一份不同 change
- **THEN** list 同时包含 id 为 `foo` 与 `bar` 的两条
- **AND** 各自 `worktreePath` 字段不同
- **AND** 各自 `worktreePath` 均为 `path.resolve` 后的绝对路径

#### Scenario: worktree 内 archive 路径不被扫描

- **WHEN** `<projectPath>/.worktrees/foo/openspec/changes/archive/2026-05-19-xx/` 存在
- **THEN** list 不包含 id 为 `2026-05-19-xx` 的来自该 worktree 的条目
- **AND** （这条目录不应在正常工作流中出现，因为 P4 archive 编排在 archive 完成后会删除 worktree；本场景仅作鲁棒性约束）

### Requirement: Proposal 列表按 changeId 去重且 worktree 优先

系统 SHALL 在合并主仓库 active / 主仓库 archive / worktree active 三段结果时执行去重：

- 用 `Map<changeId, ProposalMeta>` 收敛，按"主仓库 active → 主仓库 archive → worktree active"顺序写入；后写入 SHALL 覆盖先写入。
- 主仓库 archive 的 changeId SHALL 含日期前缀（`/^\d{4}-\d{2}-\d{2}-/`），与活跃 change 不冲突，因此去重 Map 实际上只在主仓库 active 与 worktree active 同名时才会触发覆盖。

#### Scenario: 同名活跃 change 取 worktree 版本

- **WHEN** 主仓库 `openspec/changes/foo/.openspec.yaml` 与 `<projectPath>/.worktrees/foo/openspec/changes/foo/.openspec.yaml` 同时存在
- **THEN** list 中 id 为 `foo` 的条目来自 worktree
- **AND** 该条目 `worktreePath` 非空
- **AND** 主仓库 `foo` 那一份在最终结果中不出现

#### Scenario: archive 后短窗口期同时存在两条

- **WHEN** worktree 内 OpenSpec 已 archive 移动到 `archive/2026-05-19-foo/`
- **AND** worktree 尚未被 remove（archive 编排断在 worktree-remove 前）
- **AND** 主仓库已 merge 进归档 commit（`<projectPath>/openspec/changes/archive/2026-05-19-foo/.openspec.yaml` 存在）
- **THEN** list 同时包含来自主仓库 archive 的 `2026-05-19-foo` 与来自 worktree active 的 `foo`
- **AND** 两条 changeId 不同，不参与去重
- **AND** worktree 来源那条状态为 active 名（`foo`），但 status 已是 `archived`，且 `worktreePath` 非空

### Requirement: ProposalMeta 在来源为 worktree 时暴露 worktreePath

`ProposalMeta` 实例的 `worktreePath` 字段 SHALL 按以下规则赋值：

- 来源主仓库 active：`worktreePath` 为 `undefined`。
- 来源主仓库 archive：`worktreePath` 为 `undefined`。
- 来源某 linked worktree：`worktreePath` 为 `path.resolve(<projectPath>/.worktrees/<wt-name>)`，绝对路径，无 trailing slash。

序列化（IPC / JSON.stringify）时 `worktreePath: undefined` 的字段 SHALL 被自然省略，不出现 `"worktreePath": null` 噪声。

#### Scenario: 主仓库来源不带 worktreePath

- **WHEN** ProposalMeta 来源于主仓库 `openspec/changes/`
- **THEN** `worktreePath` 为 `undefined`
- **AND** JSON 序列化中该字段不出现

#### Scenario: 主仓库 archive 来源不带 worktreePath

- **WHEN** ProposalMeta 来源于主仓库 `openspec/changes/archive/`
- **THEN** `worktreePath` 为 `undefined`

#### Scenario: worktree 来源 worktreePath 规范化

- **WHEN** worktree 路径在文件系统上是 `/Users/foo/myapp/.worktrees/bar/`（含 trailing slash）
- **THEN** ProposalMeta.worktreePath === `/Users/foo/myapp/.worktrees/bar`（path.resolve 剥离 trailing slash 后）

### Requirement: Proposal 卡片标记来源为 worktree 的 changes

前端 proposal 列表卡片组件 SHALL 在 `ProposalMeta.worktreePath` 非空时显示视觉标记，向用户暗示该 change 当前驻留在 linked worktree。标记的具体形式（badge / icon / 文案）由实现决定，但 SHALL：

- 不遮挡现有的 status badge / Why 摘要 / 任务进度等核心信息。
- 在卡片悬浮时（通过 `title=` 原生属性或 Tooltip 组件）展示 `worktreePath` 完整字符串供用户参考。
- 仅在 `worktreePath` 非空时渲染（v-if 守卫）；空时整段标记 DOM 不出现。

#### Scenario: 主仓库 change 无 worktree 标记

- **WHEN** 渲染 `worktreePath` 为 `undefined` 的 ProposalMeta
- **THEN** 卡片不显示 worktree 标记 DOM

#### Scenario: worktree change 显示标记 + tooltip

- **WHEN** 渲染 `worktreePath` 为 `/abs/.worktrees/foo` 的 ProposalMeta
- **THEN** 卡片显示 worktree 标记元素
- **AND** 用户 hover / focus 标记元素时，能看到 `worktreePath` 完整字符串
- **AND** 标记位置不与 status badge / Why 文本重叠

### Requirement: Proposal 列表页作为顶层 /proposal 路由

系统 SHALL 将 proposal 列表页实现为 `src/renderer/src/pages/proposal.vue` 对应的顶层 `/proposal` 路由。系统 SHALL NOT 为 proposal 列表保留仅渲染 `RouterView` 的 `src/renderer/src/pages/proposal.vue` 空壳，也 SHALL NOT 继续依赖 `src/renderer/src/pages/proposal/index.vue` 作为嵌套路由入口。

#### Scenario: 访问 proposal 列表

- **WHEN** 用户导航到 `/proposal`
- **THEN** 应用在共享应用外壳内渲染 proposal 列表页
- **AND** 渲染组件来自 `src/renderer/src/pages/proposal.vue`

#### Scenario: 删除嵌套路由空壳

- **WHEN** 应用生成文件系统路由
- **THEN** 不生成 `/proposal/` 嵌套路由记录
- **AND** 不生成 `/proposal/:id` 详情路由记录

### Requirement: Proposal 列表卡片打开详情 Slideover

Proposal 列表卡片 SHALL 保持现有元数据展示与筛选行为，但点击卡片时 SHALL 通过 programmatic overlay 打开 proposal 详情 Slideover，而不是执行路由跳转。

#### Scenario: 点击 proposal 卡片

- **WHEN** 用户点击 proposal 列表中的 proposal 卡片
- **THEN** 应用调用 proposal 详情 Slideover 打开入口，并传入该卡片的 `proposal.id`
- **AND** 当前路由保持 `/proposal`
- **AND** `router.push('/proposal/<id>')` SHALL NOT 被调用

#### Scenario: creating 状态 proposal 仍可打开

- **WHEN** 用户点击 `status === "creating"` 的 proposal 卡片
- **THEN** 应用仍打开 proposal 详情 Slideover
- **AND** Slideover 在缺少 markdown 文件时展示已有空态或 loading/error 状态
