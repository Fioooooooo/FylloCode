# chat-interface 规范

## Purpose

Chat 界面定义了消息流的渲染方式以及侧边栏的展示行为。

## Requirements

### Requirement: Chat 区域显示可滚动的消息流

系统 SHALL 在中央主区域渲染垂直滚动的消息序列，消息数据类型为 `UIMessage<MessageMeta>`，每条消息通过 `parts` 数组描述内容。

#### Scenario: 消息流渲染

- **WHEN** session 处于活跃状态
- **THEN** Chat 区域按时间顺序显示所有消息，可从上到下滚动
- **AND** 消息类型为 `UIMessage<MessageMeta>`，包含 `metadata.sessionId` 和 `metadata.createdAt`

### Requirement: Chat 侧边栏仅显示 Sessions 标签

系统 SHALL 在 Chat 侧边栏直接渲染 SessionList，不提供标签切换器。

#### Scenario: 侧边栏默认显示 SessionList

- **WHEN** 用户打开 Chat 页面
- **THEN** 侧边栏直接显示 SessionList，无标签切换器
