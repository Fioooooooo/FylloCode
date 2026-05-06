# integration-custom-mcp 规范

## Purpose

自定义集成（Custom MCP）允许用户在标准集成工具之外，配置自定义 MCP 服务器地址和 Skill 参数，作为高级扩展入口。

## Requirements

### Requirement: 自定义集成入口位于页面底部

系统 SHALL 在集成列表底部、所有分类区块下方提供"自定义集成"入口。该入口 SHALL 在视觉上保持低调（如可折叠区块或"高级"链接），避免干扰主要工作流。

#### Scenario: 自定义集成区块可访问

- **WHEN** 用户滚动到集成页面底部
- **THEN** "自定义集成"或"高级"链接可见
- **AND** 点击后展开显示自定义集成控件

### Requirement: 自定义集成支持 MCP 服务器配置

展开的自定义集成区块 SHALL 提供用于配置自定义 MCP 服务器地址和自定义 Skill 参数的输入字段。

#### Scenario: 用户配置自定义 MCP 服务器

- **WHEN** 用户展开自定义集成区块
- **THEN** 显示 MCP 服务器 URL 和自定义 Skill 配置的输入字段
- **AND** 提供保存按钮以存储配置
