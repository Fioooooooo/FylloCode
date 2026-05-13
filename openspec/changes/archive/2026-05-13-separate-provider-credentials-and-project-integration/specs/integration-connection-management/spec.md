## REMOVED Requirements

### Requirement: 用户可通过 API Token 连接工具

**Reason**: 凭证连接职责从 /integration 页面整体迁移至 settings 的集成提供方页面（详见 `integration-providers` 规范）。/integration 页面不再承担凭证写入与测试连接的职责，凭证只读地从 provider 层继承。

**Migration**: 用户应在 settings 的“集成提供方”tab 视图中通过 provider 卡片输入 API Token 完成连接；连接成功后该 provider 在所有项目的 /integration 中均显示为已连接，可被挂载使用。

### Requirement: 用户可断开工具连接

**Reason**: 同上，凭证断开操作迁移至 settings 的集成提供方页面，由 provider 卡片承担。

**Migration**: 用户应在 settings 的“集成提供方”tab 视图中点击 provider 卡片上的"断开连接"按钮；断开后所有项目中引用该 provider 的资源选择项被标注为不可用，但项目级配置不会被自动删除，便于用户重新连接后继续使用。

### Requirement: OAuth 工具显示连接按钮

**Reason**: 同上，OAuth 连接入口迁移至 settings 的集成提供方页面。

**Migration**: 用户应在 settings 的“集成提供方”tab 视图中点击 provider 卡片上的"通过 {Provider} 连接"按钮完成 OAuth 授权。

## ADDED Requirements

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
