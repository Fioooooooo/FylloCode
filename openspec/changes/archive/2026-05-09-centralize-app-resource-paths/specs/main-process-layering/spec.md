## ADDED Requirements

### Requirement: 应用随附资源路径通过 infra/paths 单点获取

主进程读取随应用分发的根目录 `resources/` 内容时，SHALL 通过 `electron/main/infra/paths` 导出的资源目录函数获取 `resources/` 目录位置。`services/`、`ipc/`、`bootstrap/` 等层不得直接假设 `process.resourcesPath`、`app.getAppPath()` 或 `app.asar.unpacked` 的具体打包布局来定位 `resources/`。

#### Scenario: service 读取随附资源

- **WHEN** service 需要读取 `resources/workflows/built-in/` 中的内置 workflow 文件
- **THEN** service 先通过 `infra/paths` 获取 `resources/` 目录位置
- **AND** service 仅在该目录基础上拼接业务子路径 `workflows/built-in`

#### Scenario: 打包布局差异由 infra 层处理

- **WHEN** 应用在生产环境运行
- **THEN** `infra/paths` 负责处理 `app.asar.unpacked/resources/`、`app.asar/resources/` 或等价 packaged resources 位置
- **AND** 调用方无需直接拼接这些 Electron 打包布局路径
