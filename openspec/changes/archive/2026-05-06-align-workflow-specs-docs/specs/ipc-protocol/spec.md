## MODIFIED Requirements

### Requirement: 业务域覆盖应用全部核心功能

IPC 通信层 SHALL 定义以下业务域：`chat`、`project`、`workflow`、`integration`、`settings`、`window`。每个域对应独立的预加载 API 文件和主进程处理器文件。

#### Scenario: 域列表完整性

- **WHEN** 检查 IPC 通信层覆盖的业务域
- **THEN** 包含 `chat`、`project`、`workflow`、`integration`、`settings`、`window` 六个域

### Requirement: 流式通信和事件推送的 channel 使用独立语义标识

流式通信通道 SHALL 使用 `domain:stream:action` 格式，事件推送通道 SHALL 使用 `domain:event:name` 格式，与请求-响应通道明确区分。

#### Scenario: 流式通道命名

- **WHEN** 为 `chat` 域定义流式消息输出
- **THEN** 通道名称为 `chat:stream:message`

#### Scenario: 事件推送通道命名

- **WHEN** 为 `acp` 域定义智能体注册表更新事件
- **THEN** 通道名称为 `acp:event:registryUpdated`
