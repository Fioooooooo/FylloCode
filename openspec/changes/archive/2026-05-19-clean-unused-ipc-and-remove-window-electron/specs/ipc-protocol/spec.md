## MODIFIED Requirements

### Requirement: IPC channel 采用 domain:action 命名格式

所有 IPC channel 名称 SHALL 遵循 `domain:action` 格式，其中 domain 为业务域标识（小写），action 为操作名称（camelCase）。

#### Scenario: 标准 CRUD channel 命名

- **WHEN** 为 project 域定义列表查询操作
- **THEN** channel 名称为 `project:list`

#### Scenario: 复合操作 channel 命名

- **WHEN** 为 chat 域定义移除会话操作
- **THEN** channel 名称为 `chat:removeSession`

### Requirement: 业务域覆盖应用全部核心功能

IPC 通信层 SHALL 定义以下业务域：`chat`、`project`、`proposal`、`workflow`、`task`、`integration`、`settings`、`acp`。每个域对应独立的 preload API 文件和 main handler 文件。系统 SHALL NOT 继续保留仅用于历史过渡或通用底层代理的业务域，例如通用 `net` 域，或未被当前产品能力消费的占位 `window` 域。

#### Scenario: 域列表完整性

- **WHEN** 检查 IPC 通信层覆盖的业务域
- **THEN** 包含 `chat`、`project`、`proposal`、`workflow`、`task`、`integration`、`settings`、`acp` 八个域
- **AND** 不包含通用 `net` 业务域或仅用于占位的 `window` 业务域

#### Scenario: 历史过渡通道被清理

- **WHEN** 审查 `shared/types/channels.ts` 与对应 main/preload API
- **THEN** 不再存在已确认无产品价值的历史过渡 channel
- **AND** 通道清单与当前 renderer 可消费能力保持一致
