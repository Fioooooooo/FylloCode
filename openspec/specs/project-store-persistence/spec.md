# project-store-persistence 规范

## Purpose

项目持久化规范定义项目元数据文件存储、项目列表加载、启动预热、按 ID 查询以及目录缺失处理行为。

## Requirements

### Requirement: Project 元数据持久化到文件系统

系统 SHALL 将每个 project 的元数据（id、name、path、createdAt、lastOpenedAt）存储为 `data/projects/{encodedPath}/meta.json`，与 session 数据共用同一子目录结构。

#### Scenario: 创建 project 写入 meta 文件

- **WHEN** 用户创建或打开一个新 project
- **THEN** 系统在 `data/projects/{encodedPath}/meta.json` 写入 project 元数据
- **AND** 文件包含 id、name、path、createdAt、lastOpenedAt 字段

#### Scenario: 列出所有 projects

- **WHEN** 前端调用 `project:list`
- **THEN** 系统扫描 `data/projects/` 下所有子目录
- **AND** 读取每个子目录下的 `meta.json`
- **AND** 返回解析后的 project 列表，按 lastOpenedAt 降序排列

#### Scenario: persisted projects 在 app 启动阶段预热

- **WHEN** 前端应用完成启动并执行 bootstrap
- **THEN** persisted projects 列表在 bootstrap 阶段通过 `project:list` 预热到 `project` store
- **AND** 不依赖页面 mounted 或 store 模块初始化时的隐式自启动

#### Scenario: 按 ID 获取 project

- **WHEN** 前端调用 `project:getById` 并传入有效 encodedPath（即 id）
- **THEN** 系统读取 `data/projects/{encodedPath}/meta.json` 并返回 project 元数据

#### Scenario: 更新 project 元数据

- **WHEN** 前端调用 `project:update` 并传入 id 和 patch
- **THEN** 系统读取现有 meta，合并 patch 字段，写回文件

#### Scenario: 删除 project

- **WHEN** 前端调用 `project:remove` 并传入 id
- **THEN** 系统删除 `data/projects/{encodedPath}/meta.json`
- **AND** session 数据目录不受影响

### Requirement: openFolder 通过系统对话框选择目录

系统 SHALL 通过 Electron dialog 让用户选择本地目录，并将其注册为 project。

#### Scenario: 用户选择已有目录

- **WHEN** 前端调用 `project:openFolder`
- **THEN** 系统弹出系统目录选择对话框
- **AND** 用户选择目录后，系统以目录名为 project name、目录路径为 project path，用 encodeProjectPath 生成 id，查找已有 meta 或创建新 meta，更新 lastOpenedAt
- **AND** 返回 ProjectInfo

#### Scenario: 用户取消选择

- **WHEN** 用户在目录选择对话框中点击取消
- **THEN** 系统返回 null，不创建任何 project

### Requirement: 打开项目时检测目录存在性

系统 SHALL 在打开项目时检测对应目录是否存在，不存在时提示用户，不自动移除记录。

#### Scenario: 目录不存在时提示用户

- **WHEN** 用户尝试打开一个目录已被移动或删除的 project
- **THEN** 系统检测到目录不存在，在返回的 ProjectInfo 中附加 pathMissing: true 标记
- **AND** 前端显示提示告知用户目录不存在
- **AND** 不切换当前项目，不自动移除该 project 记录
