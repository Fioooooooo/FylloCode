# app-header-layout 规范

## Purpose

应用 Header 布局定义了 AppHeader 组件的尺寸、三栏布局、交互元素、Electron 窗口拖拽以及 macOS 原生标题栏的处理规范。

## Requirements

### Requirement: Header 固定高度为 35px

系统 SHALL 以 35 像素固定高度渲染 AppHeader。

#### Scenario: Header 以正确高度渲染

- **WHEN** AppHeader 组件渲染
- **THEN** 其高度恰好为 35px

### Requirement: Header 采用三栏布局

系统 SHALL 将 AppHeader 水平分为三个区域：左侧（20% 宽度）、中央（60% 宽度）和右侧（20% 宽度）。

#### Scenario: 布局比例正确

- **WHEN** AppHeader 渲染
- **THEN** 左侧区域占 20% 宽度
- **AND** 中央区域占 60% 宽度
- **AND** 右侧区域占 20% 宽度

### Requirement: 左侧区域为空占位

系统 SHALL 将左侧区域渲染为无可见内容的空占位。

#### Scenario: 左侧区域无内容

- **WHEN** AppHeader 渲染
- **THEN** 左侧区域不包含任何交互元素或文字

### Requirement: 中央区域显示项目切换器和项目状态

系统 SHALL 在中央区域渲染当前项目名称、向下箭头图标和项目状态入口，所有元素水平居中。

#### Scenario: 中央区域显示项目切换器（有活跃项目）

- **WHEN** AppHeader 在有活跃项目时渲染
- **THEN** 中央区域显示项目名称
- **AND** 显示向下箭头图标
- **AND** 显示项目状态入口
- **AND** 所有元素在区域内水平居中

#### Scenario: 中央区域无项目时显示回退内容

- **WHEN** AppHeader 在无活跃项目时渲染
- **THEN** 中央区域显示"未选择项目"作为项目名称

### Requirement: 右侧区域包含辅助控制图标按钮

系统 SHALL 在右侧区域渲染开发者工具、通知和主题切换图标按钮。

#### Scenario: 右侧区域有辅助控制

- **WHEN** AppHeader 渲染
- **THEN** 右侧区域包含开发者工具图标按钮
- **AND** 包含通知图标按钮
- **AND** 包含主题切换图标按钮

### Requirement: 右侧区域图标按钮容器有适当间距

系统 SHALL 以 16px 右内边距渲染右侧区域的内部容器，内部图标按钮右对齐，按钮间距为 8px。

#### Scenario: 图标按钮容器布局

- **WHEN** AppHeader 渲染
- **THEN** 右侧区域内部容器有 16px 右内边距
- **AND** 图标按钮右对齐
- **AND** 图标按钮间距为 8px

### Requirement: 图标按钮有固定尺寸

系统 SHALL 将每个图标按钮渲染为 24px × 24px，实际图标为 16px × 16px。

#### Scenario: 图标按钮尺寸

- **WHEN** AppHeader 渲染
- **THEN** 每个图标按钮宽 24px、高 24px
- **AND** 每个图标宽 16px、高 16px

### Requirement: 图标按钮有悬停背景效果

系统 SHALL 在每个图标按钮悬停时应用背景色变化。

#### Scenario: 图标按钮悬停效果

- **WHEN** 用户悬停在图标按钮上
- **THEN** 图标按钮背景色改变

### Requirement: Header 支持 Electron 窗口拖拽

系统 SHALL 在 Header 根元素上应用 `-webkit-app-region: drag` 以启用 Electron 窗口拖拽。

#### Scenario: Header 可拖拽

- **WHEN** AppHeader 在 Electron 环境中渲染
- **THEN** 用户可通过点击并拖拽 Header 区域移动窗口

### Requirement: Header 交互元素不触发拖拽

系统 SHALL 在 Header 内所有交互元素（按钮、图标、可点击区域）上应用 `-webkit-app-region: no-drag`，防止其触发窗口拖拽。

#### Scenario: 交互元素可点击

- **WHEN** 用户点击 Header 内的按钮或交互元素
- **THEN** 点击触发元素的预期操作
- **AND** 窗口不开始拖拽

### Requirement: macOS 隐藏原生标题栏但保留交通灯按钮

在 macOS 上，系统 SHALL 以 `titleBarStyle: 'hidden'` 创建主窗口，隐藏原生标题栏同时保留交通灯按钮。

#### Scenario: macOS 窗口无原生标题栏

- **WHEN** 应用在 macOS 上启动
- **THEN** 窗口无原生标题栏
- **AND** 交通灯按钮（关闭、最小化、最大化）可见

### Requirement: 中央区域使用 pill 形态容器并有垂直间距

系统 SHALL 将中央区域的项目切换器渲染为圆角 pill 形态的容器，使用 `bg-elevated` 且不使用阴影，与 Header 上下边缘有垂直间距，而非使用带边框的矩形 div 或 UButton。

#### Scenario: 中央区域有 pill 容器

- **WHEN** AppHeader 渲染
- **THEN** 中央区域包含一个 `rounded-full` 的 pill 容器
- **AND** 该容器使用 `bg-elevated`
- **AND** 该容器不使用阴影
- **AND** 该容器与 Header 上下边缘有垂直间距
- **AND** 该容器水平居中

#### Scenario: 项目切换器 hover 反馈

- **WHEN** 用户将鼠标悬停在中央项目切换器上
- **THEN** 容器背景色 SHALL 发生变化
- **AND** 容器 SHALL 不发生缩放、位移或阴影变化

### Requirement: 点击中央 div 打开项目切换器下拉框

系统 SHALL 在用户点击中央区域 div 时打开下拉菜单，显示最近项目和以分隔线分隔的"打开项目"选项。

#### Scenario: 下拉框显示最近项目

- **WHEN** 用户点击中央区域 div
- **THEN** 下拉菜单打开
- **AND** 菜单以可滚动列表显示最近项目
- **AND** 分隔线将项目列表与"打开项目"选项分开

#### Scenario: 点击"打开项目"打开系统项目选择

- **WHEN** 用户点击下拉框中的"打开项目"
- **THEN** 系统项目选择流程启动
- **AND** 成功选择项目后跳转到当前项目的默认页面

### Requirement: macOS 交通灯按钮定位在 Header 左侧区域

在 macOS 上，系统 SHALL 使用 `trafficLightPosition` 将交通灯按钮定位在 Header 左侧区域内。

#### Scenario: 交通灯与 Header 左侧区域对齐

- **WHEN** 应用在 macOS 上启动
- **THEN** 交通灯按钮定位在窗口左上角
- **AND** 与 Header 左侧 20% 区域视觉对齐
- **AND** 不与中央区域内容重叠
