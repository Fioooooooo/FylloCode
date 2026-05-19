## MODIFIED Requirements

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

### Requirement: 每个域提供标准 CRUD 操作集

对于资源型业务域（project、chat session、workflow template），preload API SHALL 仅暴露当前产品真实消费的操作集合。资源型域优先遵循 `get`、`list`、`create`、`update`、`remove` 语义；非资源型能力使用语义化命名。系统 SHALL NOT 为尚未接入 UI 或仅为未来可能需求预留的能力保留占位 preload API。

#### Scenario: 资源型域的标准操作

- **WHEN** 查看 project 域的 preload API
- **THEN** 包含当前实际使用的资源操作，例如 `getById`、`list`、`update`、`remove`

#### Scenario: 未接入能力不保留占位 API

- **WHEN** 某组 channel 在 renderer 中无真实消费，且不再承担过渡职责
- **THEN** 对应 preload API 方法与 main handler 一并删除
- **AND** renderer 不会继续看到仅返回空值或无产品语义的占位入口
