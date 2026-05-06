# ipc-request-response 规范

## Purpose

IPC 请求响应规范定义 preload API 暴露方式、main handler 注册方式、invoke/handle 通信模式和类型安全要求。

## Requirements

### Requirement: Preload 按业务域暴露领域 API

Preload 层 SHALL 为每个业务域创建独立的 API 模块（`preload/api/<domain>.ts`），通过 `contextBridge.exposeInMainWorld('api', { ... })` 暴露给 renderer。Renderer 通过 `window.api.<domain>.<action>()` 调用，不接触 IPC channel 字符串。

#### Scenario: Renderer 调用领域 API

- **WHEN** renderer 需要获取项目列表
- **THEN** 调用 `window.api.project.list()` 而非 `ipcRenderer.invoke('project:list')`

#### Scenario: Preload API 模块独立

- **WHEN** 查看 preload/api/ 目录
- **THEN** 每个业务域有独立文件（chat.ts、project.ts、workflow.ts、integration.ts、settings.ts、window.ts）

### Requirement: Main 按业务域注册 handler

Main 进程 SHALL 为每个业务域创建独立的 handler 模块（`main/ipc/<domain>.ts`），每个模块导出 `register<Domain>Handlers()` 函数，在 `main/ipc/index.ts` 中统一注册。

#### Scenario: Handler 模块化注册

- **WHEN** 应用启动
- **THEN** `main/ipc/index.ts` 调用所有域的 `registerXxxHandlers()` 完成 handler 注册

#### Scenario: Handler 统一包装响应

- **WHEN** 任意 handler 处理请求
- **THEN** 返回值符合 `IpcResponse<T>` 结构，异常被捕获并转为错误响应

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

对于资源型业务域（project、chat session、workflow template），preload API SHALL 提供 `get`、`list`、`create`、`update`、`remove` 标准操作。非资源型操作（如 `workflow.save()`、`window.minimize()`）使用语义化命名。

#### Scenario: 资源型域的标准操作

- **WHEN** 查看 project 域的 preload API
- **THEN** 包含 `getById`、`list`、`create`、`update`、`remove` 方法

#### Scenario: 非资源型域的语义化操作

- **WHEN** 查看 workflow 域的 preload API
- **THEN** 包含 `list`、`save`、`delete` 等语义化方法
