# proposal-detail 规范

## Purpose

定义 Proposal 详情页能力，包括独立详情路由、顶部基础信息展示，以及 proposal/design/tasks markdown 文件的 tab 渲染。

## Requirements

### Requirement: Proposal 详情页拥有独立路由

系统 SHALL 为 proposal 详情提供独立路由 `/proposal/:id`，其中 id 为 change 目录名。

详情页返回按钮 SHALL 回退到导航来路（`router.back()`）；当不存在可回退的历史记录时（如用户深链直达 `/proposal/:id` 或刷新后首屏即详情页），SHALL 兜底跳转到 `/overview`。返回按钮 SHALL NOT 再固定跳转 `/proposal` 列表页。

#### Scenario: 导航到详情页

- **WHEN** 用户点击列表中的 proposal 卡片
- **THEN** 路由跳转至 `/proposal/:id`
- **AND** 页面展示该 proposal 的详情

#### Scenario: 返回导航存在来路

- **WHEN** 用户从某来路页面（如 `/overview` 或 `/proposal` 列表页）进入详情页后点击返回按钮
- **THEN** 路由回退到该来路页面（`router.back()`）

#### Scenario: 返回导航无来路时兜底

- **WHEN** 用户直接通过 URL 打开 `/proposal/:id`（无可回退历史）后点击返回按钮
- **THEN** 路由跳转至 `/overview`

### Requirement: Proposal 详情页 header 展示基础信息

详情页顶部 SHALL 展示：proposal 标题、状态 badge、创建日期、任务完成进度。

状态 badge 的显示规则：

- `draft`：默认状态，显示"草稿"
- `creating`：显示"创建中"
- `applying`：显示"实施中"（高亮色）
- `archived`：显示"已归档"

#### Scenario: Header 渲染元数据

- **WHEN** 用户进入详情页
- **THEN** 顶部显示标题、状态 badge、日期和任务进度

#### Scenario: applying 状态的 badge

- **WHEN** proposal 的 status 为 `applying`
- **THEN** 状态 badge 显示"实施中"，使用高亮色（primary 色）

### Requirement: Proposal 详情页以 tabs 渲染 markdown 文件

详情页 SHALL 以 tab 形式渲染 proposal.md、design.md、tasks.md，顺序固定为 Proposal → Design → Tasks。文件不存在时不渲染对应 tab。

#### Scenario: 三个文件都存在

- **WHEN** change 目录下存在 proposal.md、design.md、tasks.md
- **THEN** 详情页显示三个 tab

#### Scenario: design.md 缺失

- **WHEN** change 目录下不存在 design.md
- **THEN** 详情页只显示 Proposal 和 Tasks 两个 tab

#### Scenario: Tab 内容渲染 markdown

- **WHEN** 用户切换到某个 tab
- **THEN** 对应 markdown 文件内容以渲染格式展示

### Requirement: 详情页提供 apply 触发入口

详情页 SHALL 在 `status === "draft"` 时显示"开始实现"按钮（已有实现），点击后弹出 workflow 选择菜单，选择后触发 `useProposalRunStore.startRun(projectId, changeId, workflowId)`。

#### Scenario: 选择 workflow 后触发 apply

- **WHEN** 用户在"开始实现"下拉菜单中选择一个 workflow
- **THEN** 调用 `useProposalRunStore.startRun(projectId, changeId, workflowId)`
- **AND** SidePanel 自动打开
- **AND** 按钮变为不可点击状态（`isStreaming === true`）

#### Scenario: applying 状态时不显示"开始实现"按钮

- **WHEN** `proposal.status === "applying"`
- **THEN** "开始实现"按钮不显示（已有实现：`v-if="proposal.status === 'draft'"`）

### Requirement: 详情页提供 archive 入口

详情页 SHALL 在 `status === "applying"` 且 apply run 已完成时显示"归档"按钮；点击后触发归档流程。

#### Scenario: apply run 已完成

- **WHEN** proposal.status 为 `applying` 且 apply run 的状态为 `done`
- **THEN** header 显示"归档"按钮
- **AND** 点击按钮触发 archive IPC

#### Scenario: apply run 仍在运行

- **WHEN** proposal.status 为 `applying` 但 apply run 的状态不是 `done`
- **THEN** header 不显示"归档"按钮

### Requirement: 已归档 proposal 详情页可手动打开 apply run 历史

系统 SHALL 在 `proposal.status === "archived"` 的详情页 header 提供“查看运行历史”入口。用户点击后，详情页打开 SidePanel，并尝试加载该 proposal 最近一次 apply run 的元数据与历史日志。

#### Scenario: 已归档 proposal 存在持久化 run 历史

- **WHEN** 用户打开 archived proposal 详情页并点击“查看运行历史”
- **THEN** 详情页打开 SidePanel
- **AND** 页面尝试加载该 proposal 最近一次 apply run 的元数据
- **AND** renderer 直接传递当前详情页的 `changeId`
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

详情页 SidePanel SHALL 展示来自 `useProposalRunStore` 的 `UIMessage[]`，复用 chat 页面的 markdown 渲染组件（`ChatContainer` 或其子组件）渲染消息内容。

#### Scenario: 实时展示 chunk

- **WHEN** stage stream 正在运行，main 进程推送 chunk
- **THEN** SidePanel 实时更新，展示最新的 assistant 消息内容（text 和 tool call）

#### Scenario: 展示历史日志

- **WHEN** `resumeRun` 完成，从磁盘加载了历史 `UIMessage[]`
- **THEN** SidePanel 展示完整的历史消息列表

### Requirement: 页面 onMounted 自动恢复 applying 状态的 run

`[id].vue` 的 `onMounted` SHALL 在 proposal 加载完成后，检测 `status === "applying"`，自动调用 `useProposalRunStore.resumeRun(projectId, changeId)`。

#### Scenario: onMounted 检测到 applying 状态

- **WHEN** 用户打开 proposal 详情页，proposal.status 为 `applying`
- **THEN** 自动调用 `resumeRun`
- **AND** SidePanel 自动打开，展示历史日志
