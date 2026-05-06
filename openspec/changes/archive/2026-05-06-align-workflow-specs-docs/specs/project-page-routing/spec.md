## MODIFIED Requirements

### Requirement: 项目作用域页面为顶级路由

系统 SHALL 将工作区、工作流和集成页面作为顶级路由直接挂载在 `/` 下。

#### Scenario: 工作区路由

- **WHEN** 用户导航到 `/workspace`
- **THEN** 工作区页面在共享应用外壳内渲染

#### Scenario: 工作流路由

- **WHEN** 用户导航到 `/workflow`
- **THEN** 工作流页面在共享应用外壳内渲染

#### Scenario: 集成路由

- **WHEN** 用户导航到 `/integration`
- **THEN** 集成页面在共享应用外壳内渲染

### Requirement: 非欢迎页共享路由级应用外壳

系统 SHALL 为所有应用页面提供路由级父页面，该父页面 SHALL 渲染带有专用头部、侧边导航和主内容区域的共享应用外壳布局。

#### Scenario: 共享外壳包裹应用页面

- **WHEN** 用户导航到 `/workspace`、`/workflow`、`/integration` 或 `/settings`
- **THEN** 路由在共享应用外壳内渲染
- **AND** 页面专属内容在外壳主区域渲染

### Requirement: 应用页面需要当前项目

系统 SHALL 在无当前项目时阻止访问项目作用域的应用路由，改为渲染 WelcomeView。

#### Scenario: 无项目时访问项目作用域路由

- **WHEN** 用户在无当前项目的情况下直接导航到 `/workspace`、`/workflow` 或 `/integration`
- **THEN** 应用在主内容区域渲染 WelcomeView

#### Scenario: 无项目时设置路由可访问

- **WHEN** 用户在无当前项目的情况下导航到 `/settings`
- **THEN** 设置页面可正常访问
