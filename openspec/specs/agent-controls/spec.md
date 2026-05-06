# agent-controls 规范

## Purpose

Agent 控件定义了 Chat 底部输入栏的固定布局、多行输入、发送、附件以及功能栏中 Agent 选择和模式切换的交互规范。

## Requirements

### Requirement: 输入栏固定在 Chat 区域底部

系统 SHALL 在中央 Chat 区域底部渲染固定输入栏，不随消息流滚动。

#### Scenario: 滚动消息时

- **WHEN** 用户滚动消息历史
- **THEN** 输入栏保持固定在 Chat 区域底部

### Requirement: 输入栏支持多行文本输入

系统 SHALL 提供多行文本输入，支持 Shift+Enter 换行和 Enter 发送消息。

#### Scenario: Shift+Enter 插入换行

- **WHEN** 用户在输入框中按 Shift+Enter
- **THEN** 文本中插入换行符

#### Scenario: Enter 发送消息

- **WHEN** 用户不按 Shift 直接按 Enter
- **THEN** 消息发送，输入框清空

### Requirement: 输入栏有发送按钮

系统 SHALL 在输入框右侧提供发送按钮以提交当前消息。

#### Scenario: 点击发送按钮

- **WHEN** 用户点击发送按钮
- **THEN** 当前消息被发送

### Requirement: 输入栏支持附件

系统 SHALL 在输入框附近提供附件入口，允许用户附加图片或文件作为上下文。

#### Scenario: 附加文件

- **WHEN** 用户通过附件入口选择文件
- **THEN** 文件在输入区域显示为附件预览
- **AND** 发送消息时文件作为上下文一并发送

### Requirement: 功能栏显示 Agent 选择器和自动/手动切换

系统 SHALL 在输入栏上方渲染功能栏，左侧显示当前 `ChatAgent` 名称（可点击切换），右侧显示自动/手动模式切换。当前 agent 信息来源 SHALL 为 `chat` store 中的 `currentAgent`（类型为 `ChatAgent`）。

#### Scenario: Agent 名称显示

- **WHEN** 功能栏可见
- **THEN** 左侧显示 `currentAgent.name`（如"Claude Code"）

#### Scenario: 切换 Agent

- **WHEN** 用户点击 Agent 名称
- **THEN** 出现 Agent 选择下拉框或模态框

#### Scenario: 自动/手动切换

- **WHEN** 用户在自动和手动模式之间切换
- **THEN** 模式立即变更，影响后续 Agent 操作中是否出现确认请求卡片
