## ADDED Requirements

### Requirement: 只读能力规约浏览页

系统 SHALL 提供 `/specs` 只读页面，用于浏览当前项目 `openspec/specs/<capability>/spec.md` 中的能力规约。该页面 SHALL 从概览页「能力规约」统计卡下钻进入，且 SHALL NOT 提供编辑、新建、删除、保存或归档 spec 的操作入口。

#### Scenario: 从概览进入 specs 页面

- **WHEN** 用户在已打开项目的情况下点击概览页「能力规约」统计卡
- **THEN** 路由跳转到 `/specs`
- **AND** 页面展示当前项目的能力规约浏览界面
- **AND** 页面不展示任何编辑、新建、删除、保存或归档 spec 的按钮

#### Scenario: specs 页面不加入 ActivityBar

- **WHEN** 应用渲染 ActivityBar 主导航
- **THEN** 主导航不出现指向 `/specs` 的入口
- **AND** 用户仍可通过概览页下钻或直接访问 `/specs` 打开页面

### Requirement: specs browser 数据读取与解析

系统 SHALL 读取当前项目 `openspec/specs/` 下每个一级子目录中的 `spec.md`，并为每个文件返回只读 `SpecBrowserItem`。每个 item SHALL 包含 capability `id`、`purpose`、`sourcePath`、`updatedAt`、`requirementsCount`、`scenariosCount` 与 `requirementGroups`。系统 SHALL NOT 返回 spec 中不存在的 `title`、`family`、`familyLabel` 或持久化 `anchors` 字段。

#### Scenario: 标准 spec.md 被解析为 item

- **WHEN** 项目存在 `openspec/specs/project-overview/spec.md`
- **AND** 文件包含 `## Purpose`、`### Requirement:` 与 `#### Scenario:` 段落
- **THEN** specs browser 数据中包含 `id === "project-overview"` 的 item
- **AND** `purpose` 来自 `## Purpose` 段落内容
- **AND** `requirementsCount` 等于解析出的 Requirement 数量
- **AND** `scenariosCount` 等于所有 Requirement 下 Scenario 数量之和
- **AND** `requirementGroups` 包含每个 Requirement 的标题、body 与 scenarios

#### Scenario: 不返回派生 UI 字段

- **WHEN** renderer 获取 specs browser 数据
- **THEN** 每个 item 不包含 `title`
- **AND** 每个 item 不包含 `family` 或 `familyLabel`
- **AND** 每个 item 不包含 `anchors`

#### Scenario: openspec specs 目录缺失

- **WHEN** 当前项目不存在 `openspec/specs/`
- **THEN** specs browser API 返回空列表
- **AND** renderer 展示空状态而不是错误状态

### Requirement: Requirement 与 Scenario 结构化展示

Specs 详情页 SHALL 在 header 中展示 capability id、purpose、source path、更新时间、Requirements 数量与 Scenarios 数量。详情正文 SHALL 跳过 `#` 一级标题和 `## Purpose` 原文，只展示 Requirements 及其 Scenarios。Requirement 标题与 Scenario 标题 SHALL 由 Vue 文本渲染；Requirement body 与 Scenario body SHALL 使用 `MarkStream` 渲染 markdown。

#### Scenario: 详情 header 展示元数据

- **WHEN** 用户选中某个 capability
- **THEN** 详情 header 显示该 capability 的 id
- **AND** 显示 purpose
- **AND** 显示 source path
- **AND** 显示 updatedAt
- **AND** 显示 Requirements 和 Scenarios 两个统计数字

#### Scenario: 正文跳过重复标题和 Purpose

- **WHEN** specs 页面渲染某个 capability 的详情正文
- **THEN** 正文不渲染 `# <capability> 规范`
- **AND** 正文不重复渲染 `## Purpose` 段落
- **AND** 正文只展示解析后的 Requirement 和 Scenario 内容

#### Scenario: Scenario markdown 保留格式

- **WHEN** Scenario body 包含 `- **WHEN**`、`- **THEN**` 或 inline code
- **THEN** 页面使用 `MarkStream` 渲染 Scenario body
- **AND** 加粗、列表和 inline code 语义被保留

### Requirement: Requirement 快速定位与 Scenario timeline

Specs 详情页 SHALL 为当前 capability 提供 Requirement 快速定位栏。该栏 SHALL 从 `selectedSpec.requirementGroups` 派生，不依赖 DTO 中的 anchors 字段。点击某个 Requirement 项 SHALL 滚动到对应 Requirement。每个 Requirement 下的 Scenarios SHALL 采用纵向 timeline 视觉，以一条线串联所有 Scenario 节点。

#### Scenario: 点击 Requirement 索引定位

- **WHEN** 用户点击详情内 Requirement 快速定位栏中的某一项
- **THEN** 阅读区滚动到对应 Requirement
- **AND** 被点击的索引项显示高亮状态

#### Scenario: Scenario 使用 timeline 视觉

- **WHEN** 某个 Requirement 下存在多个 Scenario
- **THEN** 页面以纵向线条串联这些 Scenario
- **AND** 每个 Scenario 显示一个节点圆点
- **AND** Scenario 标题和 markdown body 仍按原顺序展示
