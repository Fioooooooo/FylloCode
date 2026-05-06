# integration-connection-management 规范

## Purpose

集成连接管理定义了用户通过 API Token 或 OAuth 连接第三方工具、以及断开连接的交互规范。连接状态持久化到主进程，凭证存储在各平台独立的 credentials 文件中。

## Requirements

### Requirement: 用户可通过 API Token 连接工具

对于使用 API Token 认证的工具，系统 SHALL 显示带有标签输入字段的表单，用于填写所需凭据。每个字段 SHALL 包含帮助文本和说明如何获取凭据的帮助链接。SHALL 提供"测试连接"按钮以验证所填凭据。

#### Scenario: API Token 连接流程

- **WHEN** 用户展开使用 API Token 认证的工具卡片
- **THEN** 连接区块显示所需凭据的输入字段
- **AND** 每个字段有标签、帮助文本和帮助链接
- **AND** 提供"测试连接"和"连接"按钮

#### Scenario: 连接成功

- **WHEN** 用户填写有效凭据并点击"连接"
- **THEN** 系统向主进程发送凭据，主进程验证后写入 credentials 文件和 connections 文件
- **AND** 前端刷新连接状态，卡片显示"已连接"及账户名称

#### Scenario: 连接失败

- **WHEN** 用户填写无效凭据并点击"连接"
- **THEN** 主进程验证失败，不写入任何持久化数据
- **AND** 表单下方显示具体错误信息（如"令牌无效"、"令牌已过期"）
- **AND** 连接状态不变

#### Scenario: 重启后连接状态回显

- **WHEN** 用户重启应用后打开 integration 页面
- **THEN** 已连接的工具从主进程读取连接状态，显示"已连接"
- **AND** 凭证输入框显示脱敏后的回显值（如 `pt-0fh3****0484`）

### Requirement: 用户可断开工具连接

对于已连接的工具，系统 SHALL 显示已连接账户信息和"断开连接"按钮。点击"断开连接" SHALL 清除主进程中的凭证和连接状态，并将工具重置为未连接状态。

#### Scenario: 断开工具连接

- **WHEN** 用户点击已连接工具的"断开连接"
- **THEN** 主进程清除对应的 credentials 文件内容和 connections 记录
- **AND** 卡片更新显示"未连接"

### Requirement: OAuth 工具显示连接按钮

对于使用 OAuth 认证的工具，系统 SHALL 显示"通过 {Provider} 连接"按钮。

#### Scenario: OAuth 连接入口

- **WHEN** 用户展开 OAuth 类型的工具卡片
- **THEN** 显示"通过 {工具名} 连接"按钮
