# integration-custom-mcp 规范

## Purpose

自定义集成（Custom MCP）规范定义 /integration 页面底部高级扩展入口及其 MCP 服务器配置能力。**此 capability 已移除。**

## Requirements

### Requirement: 自定义集成入口保持移除状态

系统 SHALL NOT 在 /integration 页面中展示或启用"自定义集成"入口。当前 integration 主链路 SHALL 收敛为 provider/项目资源挂载模型，Custom MCP 不属于该模型中的任一层。

#### Scenario: 集成页面不展示自定义集成入口

- **WHEN** 用户打开 /integration 页面
- **THEN** 页面不显示"自定义集成"入口
- **AND** 用户无法从该页面进入 Custom MCP 配置流程

### Requirement: 自定义 MCP 服务器配置能力保持不可用

系统 SHALL NOT 暴露 Custom MCP 服务器配置表单，也 SHALL NOT 在主进程接入 Custom MCP server 生命周期管理、健康检查或权限隔离能力。

#### Scenario: 不提供 Custom MCP 配置入口

- **WHEN** 用户查看 integration 相关页面或配置区
- **THEN** 系统不提供 Custom MCP 服务器配置表单
- **AND** 不创建或保存 Custom MCP server 配置
