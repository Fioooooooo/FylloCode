## REMOVED Requirements

### Requirement: 工具可按项目启用

**Reason**: 新模型下不再使用"项目启用开关"作为 provider 在项目中的激活信号。provider 在项目中"是否启用"由其下挂载的资源数量隐式决定：挂载了至少一个资源即视为已启用，未挂载即未启用。这样使"是否启用"与"用哪些资源"统一为单一语义。

**Migration**: 用户应在 /integration 页面通过"添加资源"为阶段内的 provider 挂载具体资源；一旦挂载任意资源该 provider 即在该项目生效。移除某 provider 下的全部资源即等同于在该项目中停用该 provider。

### Requirement: 项目级配置覆盖全局设置

**Reason**: 新模型下凭证层已从项目维度彻底抽离到全局 provider 层（详见 `integration-providers` 规范），项目级不再允许覆盖全局凭证参数。极少数"同一 provider 在不同项目下使用不同 scope"的高级场景将由未来的"同 provider 多账号"能力承担，不在本次范围内。

**Migration**: 已有使用项目级凭证覆盖的场景在本次升级时会被清空（参见 design.md 迁移计划），用户需在 settings 的集成提供方页面以全局方式重新连接；对需要多账号区分的场景，暂时通过使用不同 provider 实现（如 GitHub 公有云与 GitHub Enterprise 若 manifest 分立）或等待后续"多账号"能力发布。

## ADDED Requirements

### Requirement: 项目维度的阶段资源挂载

系统 SHALL 以"项目 × 阶段 × 资源列表"为存储单位，持久化每个项目在各阶段下挂载的 provider 资源。存储结构以 stage 为顶层 key，value 为 `{ providerId, resourceType, resourceId }` 元组数组，允许同一阶段下出现多个 provider，允许同一 provider 下出现多个资源。

#### Scenario: 项目在单一阶段下挂载多个 Provider 的资源

- **WHEN** 用户在当前项目的任务管理阶段为云效 Projex 挂载一个项目资源
- **AND** 又在源代码控制阶段为云效 Codeup 挂载一个仓库资源
- **THEN** 该项目持久化的任务管理资源数组包含两个元素
- **AND** 切换到 /integration 页面时对应阶段的这两个资源均显示为已挂载

#### Scenario: 同一 Provider 下挂载多个资源

- **WHEN** 用户在可观测阶段为 SLS 挂载多个 logstore
- **THEN** 该项目持久化的可观测资源数组中包含多条 providerId 均为 SLS 的记录
- **AND** 每条记录的 resourceId 独立展示，可独立移除

### Requirement: 资源选择器按需拉取 Provider 资源列表

当用户在某阶段的 provider 卡片上触发资源选择时，系统 SHALL 通过 `integrations:providers:listResources` IPC 向主进程请求对应 provider 该 resourceType 的资源列表。主进程 SHALL 在 5 分钟的会话缓存窗口内对相同 `(providerId, resourceType, query)` 参数复用缓存结果。系统 SHALL NOT 在应用启动或页面首次打开时批量预拉资源。本次真实资源选择流程 SHALL 至少覆盖云效在任务管理、源代码控制、CI/CD 三个阶段的能力。

#### Scenario: 用户打开资源选择面板

- **WHEN** 用户点击 provider 卡片上的"添加资源"按钮
- **THEN** 系统显示加载态并发起 `integrations:providers:listResources` 请求
- **AND** 主进程调用该 provider 对应的 API 拉取资源列表
- **AND** 拉取结果渲染到资源选择面板

#### Scenario: 用户再次打开同一资源选择面板

- **WHEN** 用户在 5 分钟内再次打开相同 provider + 相同 resourceType 的资源选择面板
- **THEN** 系统复用缓存结果立即渲染，不再发起网络请求
- **AND** 资源选择面板上提供"刷新"按钮以强制重拉

### Requirement: 已挂载资源以标签形式展示、可独立移除

对于每个阶段下的每个 provider 卡片，系统 SHALL 将已挂载的资源以标签形式列出，每个标签包含资源展示名与删除图标。点击删除图标 SHALL 将对应 `{providerId, resourceType, resourceId}` 元组从项目级持久化结构中移除。

#### Scenario: 用户移除一项已挂载资源

- **WHEN** 用户点击某个已挂载资源标签上的删除图标
- **THEN** 系统将该元组从项目级存储中删除
- **AND** 标签从卡片上消失
- **AND** 若删除后该 provider 在该阶段不再有任何资源，卡片整体从该阶段区块中移除（但不清除 provider 的全局连接状态）
