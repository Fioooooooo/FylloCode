# ipc-protocol 规范

## Purpose

IPC 协议规范定义通道命名、统一响应结构、错误码格式、共享类型可见性和业务域覆盖范围。

## Requirements

### Requirement: IPC channel 采用 domain:action 命名格式

所有 IPC channel 名称 SHALL 遵循 `domain:action` 格式，其中 domain 为业务域标识（小写），action 为操作名称（camelCase）。

#### Scenario: 标准 CRUD channel 命名

- **WHEN** 为 project 域定义列表查询操作
- **THEN** channel 名称为 `project:list`

#### Scenario: 复合操作 channel 命名

- **WHEN** 为 chat 域定义发送消息操作
- **THEN** channel 名称为 `chat:sendMessage`

### Requirement: 所有请求-响应通信使用统一响应结构

所有 `ipcMain.handle` 返回值 SHALL 遵循 `IpcResponse<T>` 结构：`{ ok: boolean, data?: T, error?: { code: string, message: string } }`。

#### Scenario: 成功响应

- **WHEN** handler 成功处理请求
- **THEN** 返回 `{ ok: true, data: <result> }`

#### Scenario: 失败响应

- **WHEN** handler 处理请求时发生错误
- **THEN** 返回 `{ ok: false, error: { code: "<ERROR_CODE>", message: "<描述>" } }`
- **AND** 不抛出异常

### Requirement: 错误码采用 UPPER_SNAKE_CASE 格式并按域分组

错误码 SHALL 采用 `DOMAIN_ERROR_NAME` 格式（如 `CHAT_SESSION_NOT_FOUND`、`PROJECT_PATH_INVALID`），通用错误使用 `UNKNOWN_ERROR`、`VALIDATION_ERROR`、`NOT_FOUND` 前缀。

#### Scenario: 业务域错误码

- **WHEN** chat 域找不到指定会话
- **THEN** 错误码为 `CHAT_SESSION_NOT_FOUND`

#### Scenario: 通用错误码

- **WHEN** 请求参数校验失败
- **THEN** 错误码为 `VALIDATION_ERROR`

### Requirement: 共享类型定义在 main/preload/renderer 三层可用

IPC 相关的 TypeScript 类型（`IpcResponse`、channel 名称映射、请求/响应载荷类型）SHALL 定义在共享目录中，三个构建目标均可引用。

#### Scenario: main 层引用共享类型

- **WHEN** main/ipc/chat.ts 需要使用 `IpcResponse` 类型
- **THEN** 可从 `@shared/types/ipc` 导入

#### Scenario: renderer 层引用共享类型

- **WHEN** renderer 中的 store 需要使用响应类型
- **THEN** 可从 `@shared/types/ipc` 导入同一份类型定义

### Requirement: 业务域覆盖应用全部核心功能

IPC 通信层 SHALL 定义以下业务域：`chat`、`project`、`workflow`、`integration`、`settings`、`window`。每个域对应独立的 preload API 文件和 main handler 文件。

#### Scenario: 域列表完整性

- **WHEN** 检查 IPC 通信层覆盖的业务域
- **THEN** 包含 `chat`、`project`、`workflow`、`integration`、`settings`、`window` 六个域

### Requirement: 流式通信和事件推送的 channel 使用独立语义标识

流式通信 channel SHALL 使用 `domain:stream:action` 格式，事件推送 channel SHALL 使用 `domain:event:name` 格式，与请求-响应 channel 明确区分。

#### Scenario: 流式 channel 命名

- **WHEN** 为 chat 域定义流式消息输出
- **THEN** channel 名称为 `chat:stream:message`

#### Scenario: 事件推送 channel 命名

- **WHEN** 为 acp 域定义 agent registry 更新事件
- **THEN** channel 名称为 `acp:event:registryUpdated`
