## MODIFIED Requirements

### Requirement: 工具卡片展开后显示配置面板

点击 /integration 页面上某阶段已挂载的 provider 卡片 SHALL 展开卡片，在卡片正面下方显示配置面板。展开 SHALL 使用手风琴动画，不导航到新页面。配置面板内容 SHALL 为"该 provider 在当前项目该阶段下的资源选择面板"，而不再是"账户连接表单"。

#### Scenario: 点击已挂载 Provider 卡片后展开

- **WHEN** 用户点击某阶段已挂载的 provider 卡片
- **THEN** 卡片向下展开
- **AND** 卡片正面下方显示资源选择面板
- **AND** 再次点击同一卡片则折叠

### Requirement: 配置面板包含账户连接区块

配置面板 SHALL 包含"该 provider 在当前项目该阶段下的资源挂载区块"，用于替代原有的账户连接区块。该区块 SHALL 显示：(1) provider 名称与该 provider 在当前阶段提供的 resourceType 标签；(2) 已挂载资源的标签列表（每个标签带移除按钮）；(3) "添加资源"按钮（点击弹出资源选择面板）；(4) 若 provider 未连接或凭证过期，配置面板 SHALL 将上述 UI 替换为"去设置中连接/重新连接"跳转引导。配置面板 SHALL NOT 在 /integration 页面内承担任何凭证写入或 OAuth 授权操作。

#### Scenario: 已连接 Provider 展开后显示资源挂载区块

- **WHEN** 用户展开某已连接 provider 的卡片
- **THEN** 显示 provider 能力标签（如"任务管理 · Projex 项目"）
- **AND** 展示当前项目已挂载资源的标签列表
- **AND** 显示"添加资源"按钮供挂载新资源

#### Scenario: 过期或未连接 Provider 展开后展示跳转引导

- **WHEN** 用户展开某凭证过期或未连接 provider 的卡片
- **THEN** 资源挂载区块被替换为"凭证已过期，前往设置重新连接"或"该平台尚未连接，前往设置完成连接"提示
- **AND** 展示"去设置"跳转按钮
- **AND** 不展示资源标签或"添加资源"按钮
