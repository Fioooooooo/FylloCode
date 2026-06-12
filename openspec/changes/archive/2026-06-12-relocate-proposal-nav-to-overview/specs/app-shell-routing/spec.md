## ADDED Requirements

### Requirement: ActivityBar 主导航不再包含提案入口

ActivityBar 中部主导航菜单 SHALL NOT 包含「提案」入口。提案区域（`/proposal` 列表页）SHALL 改由概览页进入，而非通过 ActivityBar 导航。`/proposal` 与 `/proposal/:id` 路由本身 SHALL 保留，仍受共享外壳与项目作用域约束保护。

#### Scenario: 主导航不显示提案入口

- **WHEN** 应用在共享外壳中渲染 ActivityBar 主导航菜单
- **THEN** 菜单中不出现指向 `/proposal` 的「提案」入口
- **AND** 其余主导航入口（概览、对话、任务、工作流、定时、集成）正常显示

#### Scenario: 提案路由仍可直接访问

- **WHEN** 用户通过概览页入口或直接导航到 `/proposal` 或 `/proposal/:id`
- **THEN** 对应页面在共享应用外壳内正常渲染
