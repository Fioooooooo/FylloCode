## MODIFIED Requirements

### Requirement: 用户可以从任务打开关联会话

系统 SHALL 允许用户从任务关联会话列表打开目标会话，并在聊天页选中该会话。

#### Scenario: 从任务页打开关联会话

- **WHEN** 用户在任务页点击某个关联会话
- **THEN** 系统 SHALL 导航到 `/chat/:sessionId`
- **AND** 系统 SHALL 在聊天页挂载后通过 session store 选中目标 `sessionId`
- **AND** 聊天主区域 SHALL 展示目标会话的消息列表或消息加载状态

#### Scenario: 已在聊天页打开关联会话

- **WHEN** 用户已经位于目标 `/chat/:sessionId`，并通过同一个打开会话入口再次打开该会话
- **THEN** 系统 SHALL NOT 执行不必要的路由跳转
- **AND** 系统 SHALL 通过 session store 保持目标 `sessionId` 为当前选中会话

#### Scenario: 打开会话前清理临时聊天状态

- **WHEN** 用户打开关联会话
- **THEN** 系统 SHALL 清理当前聊天视图中的临时错误或流式状态
- **AND** 系统 SHALL NOT 删除任何已持久化的会话消息

### Requirement: 当前路由模型保持兼容

系统 SHALL 通过统一的前端打开会话入口兼容 `/chat` 草稿入口与 `/chat/:sessionId` 真实会话入口。任务卡、搜索结果和其他会话打开入口 SHALL 依赖该统一入口，而不是直接拼接页面路由。

#### Scenario: 聊天页挂载会先进入草稿态

- **WHEN** 用户显式进入 `/chat`
- **THEN** 系统 SHALL 初始化草稿态
- **AND** 系统 SHALL NOT 自动选中任何历史会话

#### Scenario: 未来路由迁移隔离

- **WHEN** 后续再次调整聊天会话路由结构
- **THEN** 本能力的会话打开逻辑 SHALL 集中在可复用的前端打开会话入口中
- **AND** 任务卡 SHALL NOT 直接依赖具体的聊天路由拼接方式
