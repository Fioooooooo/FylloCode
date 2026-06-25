## MODIFIED Requirements

### 要求：非欢迎页共享路由级应用外壳

系统 SHALL 为所有应用页面提供路由级父页面，该父页面 SHALL 渲染带有专用 header、侧边导航和主内容区域的共享应用外壳布局。

#### 场景：共享外壳包裹应用页面

- **WHEN** 用户导航到 `/chat`、`/workflow`、`/integration`、`/proposal`、`/proposal/:id`、`/specs` 或 `/settings`
- **THEN** 路由在共享应用外壳内渲染
- **AND** 页面专属内容在外壳主区域渲染

### 要求：应用页面需要当前项目

系统 SHALL 在无当前项目时阻止访问项目作用域的应用路由，改为渲染 WelcomeView。

#### 场景：无项目时访问项目作用域路由

- **WHEN** 用户在无当前项目的情况下直接导航到 `/chat`、`/workflow`、`/integration`、`/proposal`、`/proposal/:id` 或 `/specs`
- **THEN** 应用在主内容区域渲染 WelcomeView

### Requirement: ActivityBar 主导航不再包含提案入口

ActivityBar 中部主导航菜单 SHALL NOT 包含「提案」入口。提案区域（`/proposal` 列表页）SHALL 改由概览页进入，而非通过 ActivityBar 导航。ActivityBar 中部主导航菜单 SHALL NOT 包含「能力规约」或指向 `/specs` 的入口。能力规约浏览页 SHALL 改由概览页进入，而非通过 ActivityBar 导航。`/proposal`、`/proposal/:id` 与 `/specs` 路由本身 SHALL 保留，仍受共享外壳与项目作用域约束保护。

#### Scenario: 主导航不显示提案或能力规约入口

- **WHEN** 应用在共享外壳中渲染 ActivityBar 主导航菜单
- **THEN** 菜单中不出现指向 `/proposal` 的「提案」入口
- **AND** 菜单中不出现指向 `/specs` 的「能力规约」入口
- **AND** 其余主导航入口（概览、对话、任务、工作流、定时、集成）正常显示

#### Scenario: 提案和 specs 路由仍可直接访问

- **WHEN** 用户通过概览页入口或直接导航到 `/proposal`、`/proposal/:id` 或 `/specs`
- **THEN** 对应页面在共享应用外壳内正常渲染
