# chat-session-actions-menu Specification

## Purpose

定义 Chat Header 中面向当前打开会话的可扩展操作菜单，以及复制当前 `activeSession.id` 时的可见性、剪贴板写入与用户反馈要求。

## Requirements

### Requirement: Chat Header 提供当前会话操作菜单

当且仅当 Chat 存在当前打开的 `activeSession` 时，Renderer SHALL 在 Chat Header 右侧操作区显示“会话操作”icon button，并 SHALL 在用户激活该按钮时打开 dropdown menu。入口 SHALL 位于现有“Agent 授权范围”入口之后，并 SHALL 提供 tooltip 或 `title`、`aria-label` 与可见键盘焦点；菜单 SHALL 作为后续会话级操作的统一扩展入口。

#### Scenario: 已打开会话显示操作入口

- **WHEN** Chat 的 `activeSession` 存在
- **THEN** Chat Header 右侧 SHALL 显示可聚焦的“会话操作”icon button
- **AND** 该入口 SHALL 位于现有“Agent 授权范围”入口之后
- **AND** 用户激活入口后 SHALL 看到包含“复制会话 ID”的 dropdown menu

#### Scenario: draft 或当前会话不可用

- **WHEN** Chat 处于 draft 状态或 `activeSession` 不存在
- **THEN** Chat Header SHALL NOT 显示“会话操作”入口

### Requirement: 会话操作菜单复制当前打开会话 ID

“复制会话 ID”操作 SHALL 在用户选择时调用系统剪贴板能力写入当前 `activeSession.id`。系统 SHALL NOT 复制底层 ACP session ID，也 SHALL NOT 缓存先前打开会话的 ID。复制成功 SHALL 显示“会话 ID 已复制”反馈；复制失败 SHALL 显示“会话 ID 复制失败”反馈和可用的错误原因。

#### Scenario: 成功复制当前会话 ID

- **WHEN** 当前打开会话的 `activeSession.id` 为 `session-current`
- **AND** 用户选择“复制会话 ID”
- **AND** 系统剪贴板写入成功
- **THEN** 剪贴板 SHALL 写入 `session-current`
- **AND** Renderer SHALL 显示“会话 ID 已复制”成功反馈

#### Scenario: 切换会话后复制新 ID

- **WHEN** 用户从一个会话切换到 `activeSession.id` 为 `session-next` 的会话
- **AND** 用户选择“复制会话 ID”
- **THEN** 剪贴板 SHALL 写入 `session-next`
- **AND** SHALL NOT 写入先前会话的 ID

#### Scenario: 剪贴板写入失败

- **WHEN** 用户选择“复制会话 ID”
- **AND** 系统剪贴板拒绝写入或返回错误
- **THEN** Renderer SHALL 显示“会话 ID 复制失败”错误反馈
- **AND** 反馈 SHALL 在可用时包含错误原因
