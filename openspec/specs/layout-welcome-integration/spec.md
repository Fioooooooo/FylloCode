# layout-welcome-integration 规范

## Purpose

欢迎页集成布局定义了无项目打开时 WelcomeView 在共享应用外壳内的渲染方式，以及欢迎页功能的完整保留。

## Requirements

### Requirement: WelcomeView 在共享应用外壳内渲染

系统 SHALL 在无项目打开时，将 WelcomeView 组件渲染在共享应用外壳的主内容区域内。

#### Scenario: 无项目时在布局中显示 WelcomeView

- **WHEN** 应用启动时无活跃项目
- **THEN** 共享应用外壳的 header 和侧边导航可见
- **AND** WelcomeView 居中渲染在主内容区域

#### Scenario: WelcomeView 主题一致

- **WHEN** WelcomeView 在共享外壳内显示
- **THEN** header 中的主题切换生效并影响 WelcomeView 外观
- **AND** WelcomeView 使用与其他页面相同的背景色

### Requirement: WelcomeView 保留所有当前欢迎页功能

系统 SHALL 在 WelcomeView 组件内保留当前欢迎页功能，包括打开文件夹和最近项目入口；系统 SHALL NOT 恢复已移除的创建项目入口。

#### Scenario: 从 WelcomeView 打开文件夹

- **WHEN** 用户在 WelcomeView 中点击"打开文件夹"
- **THEN** 调起目录选择对话框
- **AND** 选择后当前项目上下文更新
- **AND** 主内容区域从 WelcomeView 切换到项目工作区

#### Scenario: WelcomeView 中的最近项目

- **WHEN** 用户在 WelcomeView 中点击最近项目
- **THEN** 当前项目上下文更新
- **AND** 主内容区域切换到项目工作区

## Historical Notes

### 已合并：无项目打开时显示欢迎页

系统 SHALL 在无项目打开时显示欢迎内容，欢迎内容 SHALL 在共享应用外壳内渲染。

#### Scenario: 用户打开应用时无项目

- **WHEN** 应用启动时无活跃项目
- **THEN** 欢迎内容显示在主内容区域
- **AND** 共享应用外壳的 header 和侧边导航可见
