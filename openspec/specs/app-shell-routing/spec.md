# app-shell-routing 规范

## Purpose

定义应用壳路由结构、根入口重定向规则，以及项目作用域页面的访问约束。

## Requirements

### 要求：非欢迎页共享路由级应用外壳

系统 SHALL 为所有应用页面提供路由级父页面，该父页面 SHALL 渲染带有专用 header、侧边导航和主内容区域的共享应用外壳布局。

#### 场景：共享外壳包裹应用页面

- **WHEN** 用户导航到 `/chat`、`/workflow`、`/integration`、`/proposal`、`/proposal/:id` 或 `/settings`
- **THEN** 路由在共享应用外壳内渲染
- **AND** 页面专属内容在外壳主区域渲染

### 要求：根路径入口根据当前项目上下文重定向

系统 SHALL 通过检查当前项目上下文来解析对 `/` 的访问：无项目时保持在 `/`（渲染 WelcomeView），已有项目时重定向到 ActivityBar 注册表声明的默认应用页。

#### 场景：无项目时停留在根路径

- **WHEN** 用户导航到 `/` 且无当前项目
- **THEN** 应用停留在 `/` 并在共享外壳内渲染 WelcomeView

#### 场景：有当前项目时重定向到默认应用页

- **WHEN** 用户导航到 `/` 且存在当前项目
- **THEN** 应用重定向到 ActivityBar 注册表声明的默认应用页（即 `isDefault: true` 的条目所对应的 `path`）

### 要求：应用页面需要当前项目

系统 SHALL 在无当前项目时阻止访问项目作用域的应用路由，改为渲染 WelcomeView。

#### 场景：无项目时访问项目作用域路由

- **WHEN** 用户在无当前项目的情况下直接导航到 `/chat`、`/workflow`、`/integration`、`/proposal` 或 `/proposal/:id`
- **THEN** 应用在主内容区域渲染 WelcomeView

### 要求：集成页面为项目作用域应用路由

系统 SHALL 将 `/integration` 作为项目作用域应用路由，与其他应用页面受相同的访问约束保护。

#### 场景：集成路由需要项目

- **WHEN** 用户在无当前项目的情况下直接导航到 `/integration`
- **THEN** 应用在主内容区域渲染 WelcomeView

### 要求：设置路由与 Activity Bar 高亮

Activity Bar SHALL 包含齿轮图标入口，点击后路由跳转至 `/settings`。当当前路由为 `/settings` 时，Activity Bar 中齿轮图标 SHALL 显示高亮激活状态。

#### 场景：点击 Activity Bar 齿轮图标

- **WHEN** 用户点击 Activity Bar 中的齿轮图标
- **THEN** 路由跳转至 `/settings`，齿轮图标高亮

#### 场景：离开 Settings 页面

- **WHEN** 用户导航至其他页面
- **THEN** 齿轮图标高亮状态取消

### 要求：Activity Bar 采用品牌头部与常驻标签导航

Activity Bar SHALL 在共享应用外壳中采用三段式结构：顶部显示 FylloCode 品牌 icon，中部显示主导航菜单，底部显示设置入口。所有导航按钮 SHALL 直接显示图标及其文本标签，而 SHALL NOT 依赖悬浮 tooltip 才暴露导航名称。

#### 场景：Activity Bar 显示品牌头部与菜单标签

- **WHEN** 应用在共享外壳中渲染 Activity Bar
- **THEN** 顶部显示 FylloCode 品牌 icon
- **AND** 中部主导航菜单中的每个入口都同时显示图标和常驻文本标签
- **AND** 底部设置入口显示图标和“设置”文本标签

#### 场景：打包后品牌 icon 仍可加载

- **WHEN** 应用以前端 `file://` 协议加载打包产物
- **THEN** Activity Bar 顶部品牌 icon 使用 `${import.meta.env.BASE_URL}icon.svg` 作为资源路径
- **AND** 品牌 icon 可在打包环境中正常显示

### Requirement: ActivityBar 主导航不再包含提案入口

ActivityBar 中部主导航菜单 SHALL NOT 包含「提案」入口。提案区域（`/proposal` 列表页）SHALL 改由概览页进入，而非通过 ActivityBar 导航。`/proposal` 与 `/proposal/:id` 路由本身 SHALL 保留，仍受共享外壳与项目作用域约束保护。

#### Scenario: 主导航不显示提案入口

- **WHEN** 应用在共享外壳中渲染 ActivityBar 主导航菜单
- **THEN** 菜单中不出现指向 `/proposal` 的「提案」入口
- **AND** 其余主导航入口（概览、对话、任务、工作流、定时、集成）正常显示

#### Scenario: 提案路由仍可直接访问

- **WHEN** 用户通过概览页入口或直接导航到 `/proposal` 或 `/proposal/:id`
- **THEN** 对应页面在共享应用外壳内正常渲染
