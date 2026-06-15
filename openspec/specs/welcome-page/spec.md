# welcome-page 规范

## Purpose

定义应用启动时无项目状态下的欢迎内容展示，包括共享应用外壳中的品牌标识、打开文件夹入口、最近项目列表、空态文案，以及已移除创建项目入口后的迁移约束。

## Requirements

### Requirement: 无项目打开时显示欢迎页

系统 SHALL 在当前没有打开项目时显示 Welcome 内容，且 Welcome 内容 SHALL 渲染在共享应用外壳内。

#### Scenario: 用户无项目启动应用

- **WHEN** 应用启动时没有 active project
- **THEN** Welcome 内容显示在主内容区域
- **AND** 共享应用外壳 header 与侧边导航可见

### Requirement: 欢迎页展示品牌标识

系统 SHALL 在 Welcome 内容顶部居中显示 FylloCode logo、产品名称和 tagline。

#### Scenario: 品牌标识可见

- **WHEN** Welcome 内容显示
- **THEN** logo、`FylloCode` 文本和 tagline `Autonomous Coding Workflow` 可见
- **AND** 三者水平居中

### Requirement: 欢迎页提供操作按钮

系统 SHALL 在品牌标识下方显示单个 `Open Folder` 操作按钮。

#### Scenario: 操作按钮可见

- **WHEN** Welcome 内容显示
- **THEN** 显示 `Open Folder` 按钮
- **AND** `Open Folder` 按钮使用 primary solid 样式
- **AND** 按钮左侧有 icon
- **AND** 不显示 `Create Project` 按钮

#### Scenario: 点击 Open Folder 按钮

- **WHEN** 用户点击 `Open Folder` 按钮
- **THEN** 系统打开目录选择对话框
- **AND** 用户选择目录后，当前项目上下文被更新
- **AND** 系统进入 `/workspace`

### Requirement: 欢迎页处理最近项目空态

系统 SHALL 在不存在最近项目时显示空态消息。

#### Scenario: 无最近项目

- **WHEN** Welcome 内容显示且不存在最近项目
- **THEN** 显示消息 `No recent projects. Open a folder or create a new project to get started.`
- **AND** 不显示最近项目列表

## Historical Notes

### 已移除：欢迎页显示两个并排操作按钮

**Reason**: `Create Project` 功能已从应用中移除。

**Migration**: 用户应改用 `Open Folder` 按钮打开已有目录。

### 已移除：Create Project 按钮打开模态框

**Reason**: `Create Project` 功能已从应用中移除。

**Migration**: N/A。Create Project 模态框已整体删除。

### 已移除：欢迎页是独立路由

**Reason**: Welcome 内容现在嵌入共享应用外壳，不再是独立的 `/welcome` 路由。

**Migration**: `/welcome` 路由已移除。无项目用户会在 `/` 看到 Welcome 内容。
