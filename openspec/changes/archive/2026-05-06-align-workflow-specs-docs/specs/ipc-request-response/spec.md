## MODIFIED Requirements

### Requirement: Preload 按业务域暴露领域 API

预加载层 SHALL 为每个业务域创建独立的 API 模块（`preload/api/<domain>.ts`），通过 `contextBridge.exposeInMainWorld('api', { ... })` 暴露给渲染进程。渲染进程通过 `window.api.<domain>.<action>()` 调用，不接触 IPC 通道字符串。

#### Scenario: 渲染进程调用领域 API

- **WHEN** 渲染进程需要获取项目列表
- **THEN** 调用 `window.api.project.list()` 而非 `ipcRenderer.invoke('project:list')`

#### Scenario: 预加载 API 模块独立

- **WHEN** 查看 `preload/api/` 目录
- **THEN** 每个业务域有独立文件（`chat.ts`、`project.ts`、`workflow.ts`、`integration.ts`、`settings.ts`、`window.ts`）

### Requirement: 每个域提供标准 CRUD 操作集

对于资源型业务域（`project`、聊天会话、工作流模板），预加载 API SHALL 提供 `get`、`list`、`create`、`update`、`remove` 标准操作。非资源型操作（如 `workflow.save()`、`window.minimize()`）使用语义化命名。

#### Scenario: 资源型域的标准操作

- **WHEN** 查看 `project` 域的预加载 API
- **THEN** 包含 `getById`、`list`、`create`、`update`、`remove` 方法

#### Scenario: 非资源型域的语义化操作

- **WHEN** 查看 `workflow` 域的预加载 API
- **THEN** 包含 `list`、`save`、`delete` 等语义化方法
