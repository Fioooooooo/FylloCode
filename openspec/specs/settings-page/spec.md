# settings-page 规范

## Purpose

定义 Settings 页面布局、垂直 tab 导航、About tab 入口、响应式行为，以及 settings store 与 Electron 共享类型边界。

## Requirements

### Requirement: Settings 页面布局

Settings 页面 SHALL 采用左侧垂直 tab 导航（宽度约 180px）+ 右侧内容区的双栏布局。右侧内容区 SHALL 居中显示，最大宽度限制在 720px（`max-w-2xl`）。页面路由为 `/settings`。左侧导航 SHALL 包含 `Agents`、`集成提供方`、`偏好设置` 和 `About` 四个 tab，且默认激活 `Agents`。

#### Scenario: 访问 settings 页面

- **WHEN** 用户点击 Activity Bar 中的齿轮图标
- **THEN** 路由跳转至 `/settings`
- **AND** Activity Bar 中的设置图标保持高亮
- **AND** 默认激活 `Agents` tab

#### Scenario: 垂直 tab 导航切换

- **WHEN** 用户点击左侧导航中的 `偏好设置`
- **THEN** 右侧内容区切换为偏好设置内容
- **AND** 当前选中项显示高亮背景

#### Scenario: 切换到 About tab

- **WHEN** 用户点击左侧导航中的 `About`
- **THEN** 右侧内容区切换为 About 内容
- **AND** 当前 tab 保持高亮状态

#### Scenario: 小屏幕响应式

- **WHEN** 视口宽度小于 `sm` 断点（640px）
- **THEN** 布局自适应，tab 导航不遮挡内容区，内容可正常滚动

### Requirement: Settings store 与类型定义

Settings 相关类型 SHALL 定义在 `src/types/settings.ts`，包含 `AgentInfo`、`AgentStatus`、`PreferencesConfig`、`ThemeMode`、`NotificationMethod` 等。`useSettingsStore` SHALL 包含 `agentStatus` 和 `preferences` 两个 state 分区，所有与数据交互的逻辑 SHALL 封装在 store action 中，组件层不直接操作原始数据。

#### Scenario: Store 初始化

- **WHEN** Settings 页面首次挂载
- **THEN** store 已包含四个 agent 的 mock 状态数据和默认偏好配置

#### Scenario: 类型可被 Electron 端引用

- **WHEN** Electron 主进程 import `src/types/settings.ts`
- **THEN** 类型定义可正常使用，无 Nuxt 运行时依赖
