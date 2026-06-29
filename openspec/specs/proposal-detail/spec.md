# proposal-detail 规范

## Purpose

定义 Proposal 详情页能力，包括独立详情路由、顶部基础信息展示，以及 proposal/design/tasks markdown 文件的 tab 渲染。

## Requirements

### Requirement: Proposal 详情页 header 展示基础信息

详情 Slideover 顶部 SHALL 展示：proposal 标题、状态 badge、创建日期、任务完成进度，并提供关闭按钮。

状态 badge 的显示规则：

- `draft`：默认状态，显示"草稿"
- `creating`：显示"创建中"
- `applying`：显示"实施中"（高亮色）
- `archived`：显示"已归档"

#### Scenario: Header 渲染元数据

- **WHEN** 用户打开 proposal 详情 Slideover
- **THEN** 顶部显示标题、状态 badge、日期和任务进度
- **AND** 顶部显示关闭按钮

#### Scenario: applying 状态的 badge

- **WHEN** proposal 的 status 为 `applying`
- **THEN** 状态 badge 显示"实施中"，使用高亮色（primary 色）

### Requirement: Proposal 详情页以 tabs 渲染 markdown 文件

详情 Slideover SHALL 以 tab 形式渲染 proposal.md、design.md、tasks.md 与 proposal specs delta，顺序固定为 Proposal → Design → Tasks → Specs。proposal.md、design.md、tasks.md 文件不存在时不渲染对应 tab；`specs/` 目录不存在或没有可解析 capability delta 时不渲染 Specs tab。

#### Scenario: 三个 markdown 文件和 specs delta 都存在

- **WHEN** change 目录下存在 proposal.md、design.md、tasks.md 和至少一个 `specs/<capability>/spec.md`
- **THEN** 详情 Slideover 显示 Proposal、Design、Tasks、Specs 四个 tab

#### Scenario: design.md 缺失

- **WHEN** change 目录下不存在 design.md
- **THEN** 详情 Slideover 不显示 Design tab
- **AND** 仍按 Proposal → Tasks → Specs 的相对顺序展示存在的 tab

#### Scenario: specs delta 缺失

- **WHEN** change 目录下不存在 specs 目录，或 specs 目录下没有可解析的 capability delta
- **THEN** 详情 Slideover 不显示 Specs tab

#### Scenario: Markdown tab 内容渲染 markdown

- **WHEN** 用户切换到 Proposal、Design 或 Tasks tab
- **THEN** 对应 markdown 文件内容以渲染格式展示

### Requirement: 详情页提供 apply 触发入口

详情 Slideover SHALL 在 `status === "draft"` 时显示"开始实现"按钮（已有实现），点击后弹出 workflow 选择菜单，选择后触发 `useProposalRunStore.startRun(projectId, changeId, workflowId)`。

#### Scenario: 选择 workflow 后触发 apply

- **WHEN** 用户在"开始实现"下拉菜单中选择一个 workflow
- **THEN** 调用 `useProposalRunStore.startRun(projectId, changeId, workflowId)`
- **AND** SidePanel 自动打开
- **AND** 按钮变为不可点击状态（`isStreaming === true`）

#### Scenario: applying 状态时不显示"开始实现"按钮

- **WHEN** `proposal.status === "applying"`
- **THEN** "开始实现"按钮不显示（已有实现：`v-if="proposal.status === 'draft'"`）

### Requirement: 详情页提供 archive 入口

详情 Slideover SHALL 在 `status === "applying"` 且 apply run 已完成时显示"归档"按钮；点击后触发归档流程。归档完成并刷新 proposal 元数据后，若 archived proposal 的 id 从原始 changeId 变为 `YYYY-MM-DD-<changeId>`，详情 Slideover SHALL 使用新的 id 重新读取 markdown 与 specs delta，而不是通过 router 替换 URL。

#### Scenario: apply run 已完成

- **WHEN** proposal.status 为 `applying` 且 apply run 的状态为 `done`
- **THEN** header 显示"归档"按钮
- **AND** 点击按钮触发 archive IPC

#### Scenario: apply run 仍在运行

- **WHEN** proposal.status 为 `applying` 但 apply run 的状态不是 `done`
- **THEN** header 不显示"归档"按钮

#### Scenario: archive 后 patch 当前 Slideover changeId

- **WHEN** 归档完成后 `proposal:list` 返回 id 为 `YYYY-MM-DD-<changeId>` 的 archived proposal
- **THEN** 当前详情 Slideover 使用该 archived id 重新读取详情内容
- **AND** 应用 SHALL NOT 调用 `router.replace('/proposal/<archivedId>')`

### Requirement: 已归档 proposal 详情页可手动打开 apply run 历史

系统 SHALL 在 `proposal.status === "archived"` 的详情 Slideover header 提供“查看运行历史”入口。用户点击后，详情 Slideover 打开 SidePanel，并尝试加载该 proposal 最近一次 apply run 的元数据与历史日志。

#### Scenario: 已归档 proposal 存在持久化 run 历史

- **WHEN** 用户打开 archived proposal 详情 Slideover 并点击“查看运行历史”
- **THEN** 详情 Slideover 打开 SidePanel
- **AND** 页面尝试加载该 proposal 最近一次 apply run 的元数据
- **AND** renderer 直接传递当前详情 Slideover 的 `changeId`
- **AND** 主线程在需要时将 archived proposal id 归一化到对应原始 `changeId` 后读取历史 run
- **AND** SidePanel 展示已持久化的历史日志

### Requirement: 已归档 proposal 历史面板在无历史时展示空态

系统 SHALL 在用户主动打开 archived proposal 的运行历史但未找到可展示的 run 元数据或历史日志时，保留 SidePanel 打开状态并展示 EmptyState。

#### Scenario: 无持久化 run 元数据

- **WHEN** 用户打开 archived proposal 的运行历史，但没有对应的 `run.json`
- **THEN** SidePanel 保持打开
- **AND** SidePanel 展示 EmptyState，提示当前 proposal 暂无运行记录

#### Scenario: 持久化 run 无消息

- **WHEN** 用户打开 archived proposal 的运行历史，`run.json` 存在但当前应展示的历史消息为空
- **THEN** SidePanel 保持打开
- **AND** SidePanel 展示 EmptyState，而不是渲染空白日志区域

### Requirement: SidePanel 展示 apply run 的实时日志

详情 Slideover SidePanel SHALL 展示来自 `useProposalRunStore` 的 `UIMessage[]`，复用 chat 页面的 markdown 渲染组件（`ChatContainer` 或其子组件）渲染消息内容。

#### Scenario: 实时展示 chunk

- **WHEN** stage stream 正在运行，main 进程推送 chunk
- **THEN** SidePanel 实时更新，展示最新的 assistant 消息内容（text 和 tool call）

#### Scenario: 展示历史日志

- **WHEN** `resumeRun` 完成，从磁盘加载了历史 `UIMessage[]`
- **THEN** SidePanel 展示完整的历史消息列表

### Requirement: 页面 onMounted 自动恢复 applying 状态的 run

`ProposalDetailSlideover` SHALL 在组件挂载且 proposal 加载完成后，检测 `status === "applying"`，自动调用 `useProposalRunStore.resumeRun(projectId, changeId)`。

#### Scenario: onMounted 检测到 applying 状态

- **WHEN** 用户打开 proposal 详情 Slideover，proposal.status 为 `applying`
- **THEN** 自动调用 `resumeRun`
- **AND** SidePanel 自动打开，展示历史日志

### Requirement: Proposal 详情通过 Slideover 打开

系统 SHALL 提供独立的 Nuxt UI `USlideover` 业务组件承载 proposal 详情，并通过 programmatic overlay 从入口组件打开。Slideover SHALL 由右侧进入，内容宽度 SHALL 覆盖 Nuxt UI 默认 `max-w-md`，使用 `w-[min(100vw,1120px)] max-w-none` 或等价宽度，使主 markdown 阅读区与运行日志 SidePanel 可并排展示；窄窗口下 SHALL 自然退化为全宽。

Slideover SHALL 允许 ESC 键和遮罩关闭。基于 Nuxt UI 4.9 的 `useOverlay` 行为，dismiss 关闭会在 `after:leave` 时 resolve overlay result 为 `undefined`；调用方 SHALL await overlay result，但不得依赖结果值区分正常关闭与 dismiss。显式关闭按钮 SHALL emit `close`，让 overlay 进入同一关闭链路。

#### Scenario: 从列表打开详情 Slideover

- **WHEN** 用户点击 proposal 列表中的 proposal 卡片
- **THEN** 应用打开 proposal 详情 Slideover
- **AND** 当前路由保持 `/proposal`
- **AND** 应用 SHALL NOT 导航到 `/proposal/:id`

#### Scenario: 从 Chat EventRail 打开详情 Slideover

- **WHEN** 用户点击 Chat EventRail proposal 卡片中的“查看详情”
- **THEN** 应用打开 proposal 详情 Slideover
- **AND** 当前 chat route 与会话上下文保持不变

#### Scenario: ESC 或遮罩关闭

- **WHEN** 用户按 ESC 或点击遮罩关闭详情 Slideover
- **THEN** Slideover 关闭
- **AND** overlay result resolve 为 `undefined`
- **AND** 调用方不需要额外同步局部 open 状态

### Requirement: Specs tab 展示 proposal capability delta

详情 Slideover 的 Specs tab SHALL 展示当前 proposal `specs/<capability>/spec.md` 中的 capability delta。Specs tab SHALL 复用 `/specs` 页面“左侧 capability 列表 + 右侧 requirement/scenario 内容”的信息架构，但 SHALL 以 delta 为中心进行简化：

- 左侧 capability 列表显示 capability id、Purpose（存在时）、requirement/scenario 计数、以及该 capability 中出现过的 delta 类型 badge。
- 右侧 header 显示 capability id、delta 类型 badge、requirement/scenario 计数。
- 右侧 requirement 列表显示每个 requirement 的 delta 类型 badge；scenario 内容沿用现有 timeline 视觉。
- delta 类型 SHALL 至少支持 `ADDED`、`MODIFIED`、`REMOVED`、`RENAMED`，并使用不同 badge 文案和语义色。
- Specs tab SHALL 不展示完整 capability 的“最近更新”信息，因为 proposal specs 只是 delta，不是主规格源。

#### Scenario: 展示多个 capability delta

- **WHEN** proposal 中存在 `specs/proposal-detail/spec.md` 与 `specs/proposal-ipc/spec.md`
- **THEN** Specs tab 左侧展示两个 capability 条目
- **AND** 默认选中第一个 capability
- **AND** 右侧展示该 capability 的 delta requirement 与 scenario 内容

#### Scenario: capability 同时包含多种 delta 类型

- **WHEN** 某 capability spec 同时包含 `## MODIFIED Requirements` 与 `## ADDED Requirements`
- **THEN** 左侧 capability 条目显示“修改”和“新增”两个 badge
- **AND** 右侧每个 requirement 显示自身所属 delta 类型 badge

#### Scenario: REMOVED requirement 展示原因和迁移

- **WHEN** delta requirement 属于 `REMOVED`
- **THEN** 右侧内容保留该 requirement 中的 Reason 和 Migration 文本
- **AND** 不要求该 requirement 必须包含 scenario

#### Scenario: specs delta 读取失败

- **WHEN** `proposal:getSpecDeltas` 返回错误
- **THEN** Specs tab 区域展示错误状态
- **AND** Proposal、Design、Tasks tab 不受影响

### Requirement: 详情 Slideover 打开时刷新 proposal 元数据

Proposal 详情 Slideover SHALL 在每次打开时立即展示 store 中已有的 `ProposalMeta`，并在后台通过现有 `proposal:list` 路径刷新 `useProposalStore.proposals`。刷新完成后，header SHALL 自动使用刷新后的 store 数据更新标题、状态、创建日期与任务完成进度。系统 SHALL NOT 为该行为新增 `proposal:detail` IPC。

#### Scenario: 打开时先展示已有元数据并后台刷新

- **WHEN** 用户打开 proposal 详情 Slideover
- **AND** `useProposalStore.proposals` 中已有该 proposal 的旧 `ProposalMeta`
- **THEN** header 立即展示该旧元数据
- **AND** Slideover 发起一次 `useProposalStore.loadProposals()` 刷新
- **AND** 刷新完成后 header 展示刷新后的 `ProposalMeta`

#### Scenario: 刷新期间显示 loading icon

- **WHEN** Proposal 详情 Slideover 正在刷新 proposal 元数据
- **THEN** header 显示一个 loading icon
- **AND** loading icon 以旋转状态表达刷新进行中
- **WHEN** proposal 元数据刷新结束
- **THEN** header 不再显示该 loading icon

#### Scenario: 刷新后任务数量自动更新

- **WHEN** 打开详情时 store 中该 proposal 的 `doneTasks` 为 1 且 `totalTasks` 为 2
- **AND** 本次 `proposal:list` 刷新返回该 proposal 的 `doneTasks` 为 2 且 `totalTasks` 为 3
- **THEN** header 中的任务完成进度自动更新为 `2/3 tasks`

#### Scenario: 元数据刷新失败时保留已有 header

- **WHEN** 用户打开 proposal 详情 Slideover
- **AND** header 已经从 store 中展示了该 proposal 的 `ProposalMeta`
- **AND** 后台 `proposal:list` 刷新失败
- **THEN** header 继续展示刷新前已有的 proposal 元数据
- **AND** loading icon 停止显示
- **AND** markdown 文件读取与 Specs delta 读取不因元数据刷新失败而被阻断

#### Scenario: 不新增 detail IPC

- **WHEN** 用户打开 proposal 详情 Slideover
- **THEN** renderer 使用现有 `proposal:list` 刷新 proposal 元数据
- **AND** renderer 继续使用现有 `proposal:readFile` 读取 markdown 文件
- **AND** renderer 继续使用现有 `proposal:getSpecDeltas` 读取 Specs delta
- **AND** 系统不调用名为 `proposal:detail` 的 IPC channel
