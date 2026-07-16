# settings-navigation Specification

## Purpose

TBD - created by archiving change split-settings-into-child-routes. Update Purpose after archive.

## Requirements

### Requirement: 设置页面使用共享父布局和独立子路由

系统 SHALL 使用 `/settings` 作为共享设置布局的稳定入口，并 SHALL 将其重定向到默认 Agents 子页面 `/settings/acp-agents`；系统 SHALL 通过独立子路由提供服务连接、偏好设置和 About 页面。

#### Scenario: 打开默认设置页面

- **WHEN** 用户导航到 `/settings`
- **THEN** 系统 SHALL 重定向到 `/settings/acp-agents`
- **AND** 系统 SHALL 在设置共享布局中展示 Agents 页面
- **AND** 左侧设置导航 SHALL 将 Agents 标记为当前项

#### Scenario: 直接打开 Agents 设置页面

- **WHEN** 用户导航到 `/settings/acp-agents`
- **THEN** 系统 SHALL 在设置共享布局中展示由 `pages/settings/acp-agents.vue` 拥有的 Agents 页面内容
- **AND** 左侧设置导航 SHALL 将 Agents 标记为当前项

#### Scenario: 打开服务连接页面

- **WHEN** 用户导航到 `/settings/connections`
- **THEN** 系统 SHALL 在设置共享布局中展示由 `pages/settings/connections.vue` 拥有的服务连接页面内容
- **AND** 左侧设置导航 SHALL 将“服务连接”标记为当前项

#### Scenario: 打开偏好设置页面

- **WHEN** 用户导航到 `/settings/preferences`
- **THEN** 系统 SHALL 在设置共享布局中展示由 `pages/settings/preferences.vue` 拥有的偏好设置页面内容
- **AND** 左侧设置导航 SHALL 将“偏好设置”标记为当前项

#### Scenario: 打开关于我们页面

- **WHEN** 用户导航到 `/settings/about`
- **THEN** 系统 SHALL 在设置共享布局中展示由 `pages/settings/about.vue` 拥有的关于我们页面内容
- **AND** 左侧设置导航 SHALL 将“关于我们”标记为当前项

### Requirement: 设置子路由保持应用级设置导航归属

系统 SHALL 在所有 `/settings` 与 `/settings/*` 页面继续将 ActivityBar 的“设置”项显示为激活状态，并 SHALL 保持设置左侧导航与内容容器在子页面之间共享。

#### Scenario: 设置子页面保持 ActivityBar 激活

- **WHEN** 用户打开 `/settings/acp-agents`、`/settings/connections`、`/settings/preferences` 或 `/settings/about`
- **THEN** ActivityBar SHALL 将“设置”项显示为激活状态
- **AND** 系统 SHALL NOT 为这些子页面新增 ActivityBar 一级入口

#### Scenario: 用户通过设置左侧导航切换页面

- **WHEN** 用户点击设置左侧导航中的任一项目
- **THEN** 系统 SHALL 导航到该项目对应的设置路径
- **AND** 系统 SHALL 在相同设置共享布局内渲染目标内容

### Requirement: 设置左侧导航使用固定顺序与文案

系统 SHALL 将设置左侧导航按“偏好设置、Agents、服务连接、关于我们”的顺序展示，并 SHALL 使用“关于我们”作为 `/settings/about` 的导航文案。

#### Scenario: 用户查看设置左侧导航

- **WHEN** 设置共享布局渲染
- **THEN** 导航项 SHALL 依次为“偏好设置”、“Agents”、“服务连接”和“关于我们”
- **AND** 每一项 SHALL 继续指向其既有设置子路由

### Requirement: 服务连接支持 provider 定向入口

系统 SHALL 使用 `/settings/connections` 作为全局 provider 凭证与连接状态管理入口，并 SHALL 继续支持通过 `focus` 查询参数定位一个 provider。

#### Scenario: 从项目集成打开未连接 provider

- **WHEN** 用户从项目集成页面请求配置 provider `<providerId>`
- **THEN** 系统 SHALL 导航到 `/settings/connections?focus=<providerId>`
- **AND** 服务连接页面 SHALL 在 provider 数据加载和连接探测完成后滚动并聚焦对应 provider 卡片

#### Scenario: 直接打开服务连接页面

- **WHEN** 用户打开不带 `focus` 查询参数的 `/settings/connections`
- **THEN** 系统 SHALL 展示完整服务连接列表
- **AND** 系统 SHALL NOT 自动聚焦任一 provider

### Requirement: 设置导航使用服务连接术语

系统 SHALL 在设置左侧导航和 provider connection 页面标题中使用“服务连接”，同时 SHALL 保持现有 Provider 与 ProviderConnection 内部领域契约不变。

#### Scenario: 用户查看设置导航和服务连接页面

- **WHEN** 设置共享布局或 `/settings/connections` 页面渲染
- **THEN** 用户可见导航项和页面标题 SHALL 显示“服务连接”
- **AND** 页面 SHALL NOT 将该设置区域显示为“集成提供方”或“Connectors”

### Requirement: 旧 tab 查询参数不再选择设置区域

系统 SHALL NOT 继续将 `/settings?tab=*` 解释为设置区域选择机制，也 SHALL NOT 为旧 tab 查询参数提供兼容重定向。

#### Scenario: 打开带旧 tab 查询参数的设置页面

- **WHEN** 用户导航到 `/settings?tab=about`、`/settings?tab=preferences` 或 `/settings?tab=integration-providers`
- **THEN** 系统 SHALL 按 `/settings` 的默认行为重定向到 `/settings/acp-agents` 并展示 Agents 页面
- **AND** 系统 SHALL NOT 根据 `tab` 查询参数切换或重定向到其他设置子路由

### Requirement: 设置 route 拥有页面实现且不建立 Renderer feature

系统 SHALL 让 `pages/settings/*.vue` 直接拥有对应页面实现，只将真实子组件放在 `components/settings/**`，并 SHALL NOT 为本次设置导航改造创建或迁移 `features/**` 实现。

#### Scenario: 实现设置子路由

- **WHEN** 工程实现本规格定义的设置父布局和子页面
- **THEN** Agents、服务连接、偏好设置和 About 页面实现 SHALL 分别由对应 `pages/settings/*.vue` route SFC 拥有
- **AND** `components/settings/acp-agents/**` SHALL 只承载 Agents 页面组合的真实子组件
- **AND** `components/settings/connections/**` SHALL 只承载服务连接页面组合的真实子组件
- **AND** 系统 SHALL NOT 为没有子组件的 Preferences/About 创建空组件目录
- **AND** 系统 SHALL NOT 保留仅由单个 route 1:1 转发的 `Settings*.vue` 页面组件
- **AND** 本次变更 SHALL NOT 在 `src/renderer/src/features/**` 中新增或迁移设置页面实现
