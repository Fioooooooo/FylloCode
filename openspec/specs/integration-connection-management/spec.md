# integration-connection-management 规范

## Purpose

集成连接管理定义了用户通过 API Token 或 OAuth 连接第三方工具、以及断开连接的交互规范。连接状态持久化到主进程，凭证存储在各平台独立的 credentials 文件中。

## Requirements

### Requirement: /integration 页面对连接状态只读，提供跳转引导

/integration 页面 SHALL 仅以只读方式从 `integration-providers` 层读取 provider 的连接状态、过期状态与已识别账户标识。当用户尝试在 /integration 上操作一个未连接或凭证过期的 provider 时，系统 SHALL 提供"去设置中连接"或"去设置中重新连接"跳转链接，将用户导航至 settings 的集成提供方 tab 视图，而 SHALL NOT 在 /integration 页面就地展开凭证表单或 OAuth 流程。

#### Scenario: 用户尝试挂载未连接的 Provider

- **WHEN** 用户在"添加新平台"面板中选择一个未连接的 provider
- **THEN** 系统不允许该 provider 直接挂载
- **AND** 显示"该平台尚未连接，前往设置完成连接"提示与跳转按钮
- **AND** 点击跳转按钮后导航到 settings 的集成提供方 tab 视图并定位到该 provider 卡片

#### Scenario: 用户在 /integration 上操作凭证过期的 Provider

- **WHEN** 用户在 /integration 上展开一个凭证已过期的 provider 卡片
- **THEN** 资源选择面板被禁用
- **AND** 卡片底部展示"凭证已过期，前往设置重新连接"提示与跳转按钮
