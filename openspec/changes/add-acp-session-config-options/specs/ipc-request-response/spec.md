## ADDED Requirements

### Requirement: chat:setConfigOption 提供 session 级配置项修改入口

系统 SHALL 在 `electron/main/ipc/chat.ts` 注册 `chat:setConfigOption` handler，channel 名称由 `shared/types/channels.ts` 中 `ChatChannels.setConfigOption: "chat:setConfigOption"` 提供。该 handler SHALL 通过 `wrapHandler` 包装、通过 `validate(setConfigOptionInputSchema, input)` 校验入参，handler 函数体仅做 schema 校验与调用 `services/chat/config-option-service.setConfigOption`。

入参 schema `setConfigOptionInputSchema` SHALL 由 `shared/schemas/ipc/chat.ts` 导出，校验：

- `projectId`: 非空字符串
- `sessionId`: 非空字符串
- `configId`: 非空字符串
- `type`: 字面量联合 `"select" | "boolean"`
- `value`: discriminated union（`type === "boolean"` 时 `z.boolean()`；`type === "select"` 时 `z.string().min(1)`）

成功响应类型 SHALL 为 `IpcResponse<{ configOptions: AcpSessionConfigOption[] }>`。失败响应使用 `IpcErrorInfo`，错误码集合包括但不限于 `VALIDATION_ERROR`、`CHAT_SESSION_NOT_FOUND`、`PROJECT_NOT_FOUND`、`ACP_NOT_READY`、`CONFIG_OPTION_NOT_SUPPORTED`、`CONFIG_OPTION_INVALID_VALUE`、`ACP_ERROR`。

`shared/constants/error-codes.ts` SHALL 新增以下错误码常量：

- `CONFIG_OPTION_NOT_SUPPORTED = "CONFIG_OPTION_NOT_SUPPORTED"`
- `CONFIG_OPTION_INVALID_VALUE = "CONFIG_OPTION_INVALID_VALUE"`

Preload `electron/preload/api/chat.ts` SHALL 暴露 `setConfigOption(input): Promise<IpcResponse<{ configOptions: AcpSessionConfigOption[] }>>`，签名遵循"按业务域暴露领域 API"约束。`electron/preload/index.d.ts` SHALL 同步声明该方法的类型签名。

`frontend/src/api/chat.ts` SHALL 新增对等薄封装 `chatApi.setConfigOption(input)`，仅负责类型化转发 `window.api.chat.setConfigOption(input)`，不在该层做 toast、缓存或错误归一化。

#### Scenario: renderer 通过 window.api.chat.setConfigOption 修改 mode

- **WHEN** renderer 调用 `window.api.chat.setConfigOption({ projectId, sessionId, configId: "mode", type: "select", value: "plan" })`
- **THEN** preload 执行 `ipcRenderer.invoke("chat:setConfigOption", input)`
- **AND** main handler 校验通过、调用 service 后返回 `{ ok: true, data: { configOptions } }`

#### Scenario: schema 校验拦截缺失字段

- **WHEN** renderer 传入缺失 `configId` 的请求
- **THEN** main handler 在调用 service 之前返回 `{ ok: false, error: { code: "VALIDATION_ERROR" } }`

#### Scenario: type 与 value 类型不匹配被拦截

- **WHEN** renderer 传入 `{ type: "boolean", value: "true" }`（value 为字符串而非布尔）
- **THEN** zod discriminated union 校验失败，handler 返回 `{ ok: false, error: { code: "VALIDATION_ERROR" } }`
- **AND** 不调用 service

#### Scenario: 错误码 CONFIG_OPTION_NOT_SUPPORTED 透传到 renderer

- **WHEN** service 因 ACP 协议返回方法未实现错误而抛出 `ipcError(CONFIG_OPTION_NOT_SUPPORTED)`
- **THEN** `wrapHandler` 归一化为 `{ ok: false, error: { code: "CONFIG_OPTION_NOT_SUPPORTED", message } }`
- **AND** preload 与 renderer api 透明透传该结构
