# ipc-request-response 规范

## Purpose

IPC 请求响应规范定义 preload API 暴露方式、main handler 注册方式、invoke/handle 通信模式和类型安全要求。

## Requirements

### Requirement: Preload 按业务域暴露领域 API

Preload 层 SHALL 为每个业务域创建独立的 API 模块（`preload/api/<domain>.ts`），通过 `contextBridge.exposeInMainWorld('api', { ... })` 暴露给 renderer。Renderer 通过 `window.api.<domain>.<action>()` 调用，不接触 IPC channel 字符串，也 SHALL NOT 依赖 `window.electron` 或其他底层 Electron bridge。

#### Scenario: Renderer 调用领域 API

- **WHEN** renderer 需要获取项目列表
- **THEN** 调用 `window.api.project.list()` 而非 `ipcRenderer.invoke('project:list')`

#### Scenario: Renderer 不依赖底层 bridge

- **WHEN** 审查 renderer 业务代码、store、composable 与测试基线
- **THEN** 不存在对 `window.electron` 的运行时依赖
- **AND** 非流式事件订阅也通过 preload 封装后的 `window.api` 方法完成

#### Scenario: Preload API 模块独立

- **WHEN** 查看 preload/api/ 目录
- **THEN** 当前产品实际使用的业务域各有独立文件，例如 `chat.ts`、`project.ts`、`proposal.ts`、`workflow.ts`、`integration.ts`、`settings.ts`、`task.ts`、`acp-agents.ts`
- **AND** 不保留仅服务于已移除 channel 的空壳 API 模块

### Requirement: Main 按业务域注册 handler

Main 进程 SHALL 为每个业务域创建独立的 handler 模块（`main/ipc/<domain>.ts`），每个模块导出 `register<Domain>Handlers()` 函数，在 `main/ipc/index.ts` 中统一注册。每个 handler 函数体 SHALL 仅包含参数校验、调用 service、返回归一化响应三类操作，业务逻辑必须下沉到 `services/<domain>/`。

#### Scenario: Handler 模块化注册

- **WHEN** 应用启动
- **THEN** `main/ipc/index.ts` 调用所有域的 `registerXxxHandlers()` 完成 handler 注册

#### Scenario: Handler 统一包装响应

- **WHEN** 任意 handler 处理请求
- **THEN** handler 通过 `ipc/_kit/wrap-handler.ts` 导出的 `wrapHandler` 包装异步逻辑
- **AND** 返回值符合 `IpcResponse<T>` 结构，异常被 `wrapHandler` 捕获并转为 `{ ok: false, error }` 响应
- **AND** handler 函数体不自行实现 try/catch + 错误归一化样板

#### Scenario: Handler 不直接访问基础设施

- **WHEN** 审查任意 `main/ipc/<domain>.ts` 文件（`_kit/` 除外）的 import 列表
- **THEN** 不存在 `from "fs"`、`from "child_process"`、`from "path"` 的 import
- **AND** 不直接实例化 `AcpSession`、`MessageChannelMain`、`spawn` 等运行时对象

### Requirement: 请求-响应使用 invoke/handle 模式

所有请求-响应式通信 SHALL 使用 `ipcRenderer.invoke` + `ipcMain.handle` 组合，返回 Promise。

#### Scenario: 标准 CRUD 操作

- **WHEN** renderer 调用 `window.api.project.getById(id)`
- **THEN** preload 内部执行 `ipcRenderer.invoke('project:getById', { id })`
- **AND** main 通过 `ipcMain.handle('project:getById', handler)` 处理并返回 `IpcResponse<Project>`

#### Scenario: 带查询参数的列表操作

- **WHEN** renderer 调用 `window.api.chat.listSessions({ page: 1, limit: 20 })`
- **THEN** preload 将参数透传给 `ipcRenderer.invoke('chat:listSessions', { page: 1, limit: 20 })`

### Requirement: Preload API 返回值类型安全

每个 preload API 方法 SHALL 有明确的 TypeScript 返回类型 `Promise<IpcResponse<T>>`，其中 T 为具体的业务类型。

#### Scenario: 类型推导正确

- **WHEN** renderer 调用 `const res = await window.api.settings.get()`
- **THEN** `res.data` 的类型为 `UserSettings | undefined`

### Requirement: 每个域提供标准 CRUD 操作集

对于资源型业务域（project、chat session、workflow template），preload API SHALL 仅暴露当前产品真实消费的操作集合。资源型域优先遵循 `get`、`list`、`create`、`update`、`remove` 语义；非资源型能力使用语义化命名。系统 SHALL NOT 为尚未接入 UI 或仅为未来可能需求预留的能力保留占位 preload API。

#### Scenario: 资源型域的标准操作

- **WHEN** 查看 project 域的 preload API
- **THEN** 包含当前实际使用的资源操作，例如 `getById`、`list`、`update`、`remove`

#### Scenario: 未接入能力不保留占位 API

- **WHEN** 某组 channel 在 renderer 中无真实消费，且不再承担过渡职责
- **THEN** 对应 preload API 方法与 main handler 一并删除
- **AND** renderer 不会继续看到仅返回空值或无产品语义的占位入口

### Requirement: Handler 入参通过共享 schema 校验

每个 `ipcMain.handle` 注册的 handler SHALL 在执行业务逻辑之前调用 `ipc/_kit/schema.ts` 的 `validate(schema, input)` 校验 renderer 传入参数，schema 从 `shared/schemas/ipc/<domain>.ts` 按具名导入。校验失败由 `wrapHandler` 统一返回 `VALIDATION_ERROR`。

#### Scenario: 校验不通过返回标准错误

- **WHEN** renderer 调用 `window.api.workflow.save({ projectId, name: "" , yaml: "..." })`，其中 name 为空
- **THEN** handler 在进入 service 之前返回 `{ ok: false, error: { code: "VALIDATION_ERROR", message: "<字段描述>" } }`

#### Scenario: schema 与 handler 同域

- **WHEN** 查看 `main/ipc/chat.ts` 的 handler 注册代码
- **THEN** 每个 handler 在调用 service 前调用了 `validate(ChatXxxSchema, input)`
- **AND** `ChatXxxSchema` 从 `@shared/schemas/ipc/chat` 导入
