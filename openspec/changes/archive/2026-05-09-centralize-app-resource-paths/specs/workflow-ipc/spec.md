## MODIFIED Requirements

### Requirement: 主进程启动时静默初始化内置 workflow

系统 SHALL 在主进程启动时检查 `userData/workflows/` 中内置 workflow 文件是否存在，不存在则从随应用分发的 `resources/workflows/built-in/` 静默复制。

#### Scenario: 首次启动时初始化内置 workflow

- **WHEN** 应用首次启动，`userData/workflows/` 中不存在内置 workflow 文件
- **THEN** 主进程将随应用分发的 `resources/workflows/built-in/` 中的所有 YAML workflow 文件复制到 `userData/workflows/`
- **AND** 初始化过程静默执行，不阻塞应用启动
- **AND** 初始化失败时仅记录 warn 日志

#### Scenario: 非首次启动时跳过已存在的内置 workflow

- **WHEN** 应用启动，`userData/workflows/` 中已存在某内置 workflow 文件
- **THEN** 主进程跳过该文件，不覆盖用户可能已修改的内容

### Requirement: 内置 workflow 文件随应用分发

系统 SHALL 在根目录 `resources/workflows/built-in/` 中包含 `quick-apply.yaml` 内置 workflow 文件，并在打包后作为应用随附资源可被主进程读取。

#### Scenario: quick-apply.yaml 内容正确

- **WHEN** 检查 `resources/workflows/built-in/quick-apply.yaml`
- **THEN** 文件存在
- **AND** 文件内容包含 `name: 最小流程`、`version: 1`、单个 `apply` 阶段

#### Scenario: quick-apply.yaml 随 mac 应用打包

- **WHEN** 执行 `build:mac` 生成打包产物
- **THEN** `quick-apply.yaml` 可通过主进程的应用资源目录解析逻辑从 packaged resources 中读取
