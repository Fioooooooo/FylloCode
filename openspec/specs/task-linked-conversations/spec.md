# task-linked-conversations Specification

## Purpose

定义任务看板与会话 lineage 的连接行为，使任务卡可以展示、展开并打开关联会话，同时保持任务列表错误隔离和现有 `/chat` 路由模型兼容。

## Requirements

### Requirement: 任务卡展示关联会话入口

系统 SHALL 在任务看板中为存在 lineage 会话链接的任务展示关联会话入口。

#### Scenario: 任务存在关联会话

- **WHEN** 用户打开任务看板，且某个可见任务的 `lineageApi.getByTask(projectId, ref)` 返回至少一个 `LineageSessionLink`
- **THEN** 该任务卡 SHALL 展示关联会话入口，并显示关联会话数量

#### Scenario: 任务没有关联会话

- **WHEN** 用户打开任务看板，且某个可见任务没有 lineage subject、查询结果为 `null`，或查询结果的 `links` 为空
- **THEN** 该任务卡 SHALL 不展示关联会话入口

#### Scenario: 关联会话加载失败

- **WHEN** 某个任务的关联会话查询失败
- **THEN** 系统 SHALL 保持任务列表可用，并 SHALL NOT 用该失败替换任务列表的主错误状态

### Requirement: 用户可以查看任务关联会话列表

系统 SHALL 允许用户从任务卡查看该任务关联的会话列表。

#### Scenario: 展开关联会话入口

- **WHEN** 用户展开任务卡上的关联会话入口
- **THEN** 系统 SHALL 展示该任务关联的会话条目
- **AND** 每个条目 SHALL 展示会话标题；当标题不可用时 SHALL 展示 `sessionId` 回退文本

#### Scenario: 会话元信息缺失

- **WHEN** lineage link 中的 `sessionId` 无法在 session store 当前会话列表中找到匹配会话
- **THEN** 系统 SHALL 仍展示该关联条目，并 SHALL 使用 `sessionId` 作为标题回退

### Requirement: 用户可以从任务打开关联会话

系统 SHALL 允许用户从任务关联会话列表打开目标会话，并在聊天页选中该会话。

#### Scenario: 从任务页打开关联会话

- **WHEN** 用户在任务页点击某个关联会话
- **THEN** 系统 SHALL 导航到 `/chat`
- **AND** 系统 SHALL 在 `/chat` 页面挂载后通过 session store 选中目标 `sessionId`
- **AND** 聊天主区域 SHALL 展示目标会话的消息列表或消息加载状态

#### Scenario: 已在聊天页打开关联会话

- **WHEN** 用户已经位于 `/chat`，并通过同一个打开会话入口打开目标会话
- **THEN** 系统 SHALL 不执行不必要的路由跳转
- **AND** 系统 SHALL 通过 session store 选中目标 `sessionId`

#### Scenario: 打开会话前清理临时聊天状态

- **WHEN** 用户打开关联会话
- **THEN** 系统 SHALL 清理当前聊天视图中的临时错误或流式状态
- **AND** 系统 SHALL NOT 删除任何已持久化的会话消息

### Requirement: 当前路由模型保持兼容

系统 SHALL 在没有会话子路由的情况下完成任务到会话的应用内导航。

#### Scenario: 聊天页挂载会重置草稿态

- **WHEN** 从任务页打开关联会话导致 `/chat` 页面挂载并执行草稿会话初始化
- **THEN** 系统 SHALL 在该初始化之后再选中目标会话
- **AND** 目标会话 SHALL 保持选中状态

#### Scenario: 未来路由迁移隔离

- **WHEN** 后续实现把聊天会话迁移到 `/chat/:sessionId` 或等价子路由
- **THEN** 本能力的会话打开逻辑 SHALL 集中在可复用的前端打开会话入口中
- **AND** 任务卡 SHALL NOT 直接依赖具体的聊天路由结构
