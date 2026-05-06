## MODIFIED Requirements

### Requirement: Non-welcome pages share a route-level app shell

系统 SHALL 为所有应用页面提供路由级父页面，该父页面 SHALL 渲染带有专用头部、侧边导航和主内容区域的共享应用外壳布局。

#### Scenario: 共享外壳包裹应用页面

- **WHEN** 用户导航到 `/chat`、`/workflow`、`/integration`、`/proposal`、`/proposal/:id` 或 `/settings`
- **THEN** 路由在共享应用外壳内渲染
- **AND** 页面专属内容在外壳主区域渲染

### Requirement: Application pages require a current project

系统 SHALL 在无当前项目时阻止访问项目作用域的应用路由，改为渲染 WelcomeView。

#### Scenario: 无项目时访问项目作用域路由

- **WHEN** 用户在无当前项目的情况下直接导航到 `/chat`、`/workflow`、`/integration`、`/proposal` 或 `/proposal/:id`
- **THEN** 应用在主内容区域渲染 WelcomeView
