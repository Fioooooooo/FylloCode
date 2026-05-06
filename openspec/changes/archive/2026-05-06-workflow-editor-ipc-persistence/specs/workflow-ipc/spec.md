## ADDED Requirements

### Requirement: 主进程提供 workflow IPC channel

系统 SHALL 在主进程注册 `workflow:list`、`workflow:save`、`workflow:delete` IPC handler，供前端读写 workflow 数据。

#### Scenario: 列出所有 workflow

- **WHEN** 前端调用 `workflow:list`，传入当前 `projectId`
- **THEN** 主进程通过 `loadProject(projectId)` 解析出 `projectPath`，再用 `encodeProjectPath` 构造项目级目录
- **AND** 返回内置 workflow 列表与该项目的自定义 workflow 列表合并结果
- **AND** 每条记录包含 `id`、`name`、`source`、`yaml` 字段

#### Scenario: 保存自定义 workflow

- **WHEN** 前端调用 `workflow:save`，传入 `name`、`yaml`、`projectId`
- **THEN** 主进程通过 `loadProject(projectId)` + `encodeProjectPath` 构造写入路径
- **AND** 将 YAML 内容写入 `getDataSubPath("projects")/{encodedPath}/workflows/{name}.yaml`
- **AND** 返回保存成功的响应

#### Scenario: 删除自定义 workflow

- **WHEN** 前端调用 `workflow:delete`，传入 `name` 和 `projectId`
- **THEN** 主进程按同样路径规则定位文件并删除
- **AND** 内置 workflow 不可删除，尝试删除时返回错误

### Requirement: 主进程启动时静默初始化内置 workflow

系统 SHALL 在主进程启动时检查 `userData/workflows/` 中内置 workflow 文件是否存在，不存在则从 `electron/main/workflows/built-in/` 静默复制。

#### Scenario: 首次启动时初始化内置 workflow

- **WHEN** 应用首次启动，`userData/workflows/` 中不存在内置 workflow 文件
- **THEN** 主进程将 `electron/main/workflows/built-in/` 中的所有文件复制到 `userData/workflows/`
- **AND** 初始化过程静默执行，不阻塞应用启动
- **AND** 初始化失败时仅记录 warn 日志

#### Scenario: 非首次启动时跳过已存在的内置 workflow

- **WHEN** 应用启动，`userData/workflows/` 中已存在某内置 workflow 文件
- **THEN** 主进程跳过该文件，不覆盖用户可能已修改的内容

### Requirement: 内置 workflow 文件随应用分发

系统 SHALL 在 `electron/main/workflows/built-in/` 目录中包含 `quick-apply.yaml` 内置 workflow 文件。

#### Scenario: quick-apply.yaml 内容正确

- **WHEN** 应用构建完成
- **THEN** `electron/main/workflows/built-in/quick-apply.yaml` 存在
- **AND** 文件内容包含 `name: 最小流程`、`version: 1`、单个 `apply` 阶段
