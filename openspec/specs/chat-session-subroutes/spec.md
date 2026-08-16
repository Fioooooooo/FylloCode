# chat-session-subroutes Specification

## Purpose

定义 Chat 草稿入口与真实会话子路由的职责边界，约束会话选中、消息加载、失效链接回退以及首次提交后的 URL 升级行为。

## Requirements

### Requirement: Chat 草稿入口保持在 /chat

系统 SHALL 将 `/chat` 作为草稿和 Probe 的进入点。进入 `/chat` 时，Renderer SHALL 初始化草稿态，并 SHALL NOT 根据任何 sessionId 直接选中真实会话。

#### Scenario: 打开草稿入口

- **WHEN** 用户进入 `/chat`
- **THEN** Renderer SHALL 初始化草稿态
- **AND** Renderer SHALL 保持当前 active Session 为空
- **AND** 页面 SHALL 继续展示草稿相关的 Probe、Agent 选择和新会话输入状态

#### Scenario: 草稿入口不解析会话参数

- **WHEN** 用户进入 `/chat`
- **THEN** Renderer SHALL NOT 因为当前页面处于 `/chat` 而自动选中某个历史会话

### Requirement: Chat 真实会话使用 /chat/:sessionId

系统 SHALL 将 `/chat/:sessionId` 作为真实会话页面。进入该子路由时，Renderer SHALL 以 `sessionId` 选中并加载对应会话；若消息尚未加载，页面 SHALL 显示加载态直到该会话消息可用。

#### Scenario: 打开已有会话子路由

- **WHEN** 用户进入 `/chat/session-123`
- **THEN** Renderer SHALL 选中 `session-123`
- **AND** Renderer SHALL 显示该会话的消息列表或消息加载状态

#### Scenario: 会话消息尚未载入

- **WHEN** 用户进入某个有效的 `/chat/:sessionId`
- **AND** 该会话消息尚未加载完成
- **THEN** 页面 SHALL 先显示消息加载态
- **AND** 加载完成后 SHALL 保持该会话为当前 active Session

### Requirement: 失效会话路由回退到草稿入口

系统 SHALL 在目标 session 不存在、已删除或不属于当前 Workspace 时，将用户回退到 `/chat`，并 SHALL 给出 toast 提示说明会话不可用。

#### Scenario: 打开不存在的会话

- **WHEN** 用户进入一个不存在的 `/chat/:sessionId`
- **THEN** Renderer SHALL 导航回 `/chat`
- **AND** Renderer SHALL 显示 toast 提示会话不存在或已失效

#### Scenario: 打开不属于当前 Workspace 的会话

- **WHEN** 用户进入一个存在但不属于当前 Workspace 的 `/chat/:sessionId`
- **THEN** Renderer SHALL 导航回 `/chat`
- **AND** Renderer SHALL 显示 toast 提示当前 Workspace 无法访问该会话

#### Scenario: 删除当前会话后的路由同步

- **WHEN** 用户在 `/chat/:sessionId` 删除当前正在查看的会话
- **THEN** Renderer SHALL 清空当前 active Session
- **AND** Renderer SHALL 导航回 `/chat`
- **AND** Renderer SHALL NOT 自动打开下一个可用会话
