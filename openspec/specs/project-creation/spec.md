# project-creation 规范

## Purpose

项目创建规范定义创建项目模态框、项目信息收集、路径选择、表单校验和创建后项目上下文更新行为。

## Requirements

### Requirement: 项目创建模态框收集项目信息

系统 SHALL 显示模态框，允许用户输入项目名称并选择存储路径。

#### Scenario: 模态框打开并显示表单字段

- **WHEN** 用户点击"创建项目"按钮
- **THEN** 模态对话框打开，包含项目名称和存储路径的输入字段
- **AND** 提供项目模板类型选择（空项目或 Git 克隆）

### Requirement: 项目名称为必填项

系统 SHALL 在允许创建项目前要求填写非空的项目名称。

#### Scenario: 用户未填写项目名称即尝试创建

- **WHEN** 用户未输入项目名称即点击创建按钮
- **THEN** 表单显示验证错误，提示项目名称为必填项
- **AND** 项目不被创建

### Requirement: 存储路径默认为合理位置

系统 SHALL 将存储路径默认设置为用户的主目录。

#### Scenario: 默认路径已填充

- **WHEN** 项目创建模态框打开
- **THEN** 存储路径字段预填充用户主目录路径（通过 IPC 从主进程获取）

### Requirement: 模板选择支持空项目和 Git 克隆

系统 SHALL 允许用户选择创建空项目或从 Git 仓库克隆。

#### Scenario: 选择空项目

- **WHEN** 用户选择"空项目"模板
- **THEN** 不显示额外的 Git URL 输入字段

#### Scenario: 选择 Git 克隆

- **WHEN** 用户选择"从 Git 克隆"模板
- **THEN** 显示 Git 仓库 URL 的额外输入字段
- **AND** 创建时 Git URL 为必填项

### Requirement: 项目创建后进入工作区

系统 SHALL 在成功创建后通过 IPC 在文件系统创建项目目录，将新项目写入持久化存储，更新统一的当前项目上下文并进入 `/workspace`。

#### Scenario: 项目成功创建（空项目模板）

- **WHEN** 用户填写有效的项目信息并选择空项目模板后点击创建
- **THEN** 系统通过 IPC 调用 `project:create` 在指定路径创建目录
- **AND** project 元数据写入持久化存储
- **AND** 模态框关闭
- **AND** 当前项目上下文更新为新项目
- **AND** 系统进入 `/workspace`
- **AND** 项目被添加到最近项目列表

#### Scenario: 项目成功创建（Git 克隆模板）

- **WHEN** 用户填写有效的项目信息并选择 Git 克隆模板后点击创建
- **THEN** 系统通过 IPC 调用 `project:create` 在指定路径创建目录
- **AND** project 元数据写入持久化存储（git clone 操作留后续实现）
- **AND** 后续流程与空项目模板相同
