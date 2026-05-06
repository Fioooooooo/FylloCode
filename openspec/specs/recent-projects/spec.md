# recent-projects 规范

## Purpose

最近项目规范定义欢迎页最近项目列表展示、项目打开前目录校验和从历史记录中移除项目的行为。

## Requirements

### Requirement: 显示最近项目列表

系统 SHALL 在欢迎页显示最近打开的项目列表，数据从持久化 project 列表派生。

#### Scenario: 显示最近项目

- **WHEN** 欢迎页显示且存在最近项目
- **THEN** 显示"最近项目"区块标题
- **AND** 标题下方显示垂直排列的最近项目列表
- **AND** 列表最多显示 10 个最近项目，按 lastOpenedAt 降序排列
- **AND** 数据来源为 `project:list` IPC 调用返回的持久化数据

### Requirement: 点击最近项目可打开

系统 SHALL 在用户点击最近项目条目时，先检测项目目录是否存在，再将所选项目写入统一的当前项目上下文并进入 `/workspace`。

#### Scenario: 用户点击最近项目

- **WHEN** 用户点击最近项目列表条目
- **THEN** 系统调用 `project:getById` 获取持久化 project 元数据
- **AND** 若目录存在，当前项目上下文更新为该项目
- **AND** 系统进入 `/workspace`
- **AND** 若目录不存在，显示提示告知用户目录不存在，不切换当前项目，不自动移除该记录

### Requirement: 最近项目条目可从历史记录中移除

系统 SHALL 允许用户从最近项目历史记录中移除项目，调用 `project:remove` IPC 删除持久化数据，而不删除实际文件。

#### Scenario: 从历史记录中移除项目

- **WHEN** 用户点击移除按钮
- **THEN** 系统调用 `project:remove` 删除该 project 的持久化元数据
- **AND** 该项目从最近项目列表中移除
- **AND** 实际项目文件不受影响
