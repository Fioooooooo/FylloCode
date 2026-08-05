## ADDED Requirements

### Requirement: ACP Client 声明 boolean session config option 支持

系统 SHALL 在 ACP process pool 为 Agent 建立连接并调用 `initialize` 时，在 `clientCapabilities.session.configOptions.boolean` 发送空 marker object。系统 SHALL 在不升级当前 ACP SDK 的前提下发送该 marker，并继续复用既有 boolean config option 归一化、设置、持久化和恢复链路。

#### Scenario: 冷启动或预热建立 Agent 连接

- **WHEN** ACP process pool 为任意 registry 或 custom Agent 调用 `initialize`
- **THEN** initialize 请求 SHALL 包含 `clientCapabilities.session.configOptions.boolean: {}`
- **AND** protocol version、client info 与连接生命周期顺序 SHALL 保持不变

#### Scenario: Agent 在协商后返回 boolean option

- **WHEN** Agent 因客户端声明支持而在完整 config options snapshot 中返回 `type=boolean`
- **THEN** 系统 SHALL 将 boolean current value 提供给 renderer 配置菜单
- **AND** 用户修改该配置时 SHALL 发送 `{ type: "boolean", value: boolean }`

#### Scenario: Agent 不提供 boolean option

- **WHEN** Agent 接受 initialize 但不返回任何 boolean config option
- **THEN** draft probe、session 创建与普通 select 配置行为 SHALL 与当前行为一致
