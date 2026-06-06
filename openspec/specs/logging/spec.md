# logging 规范

## Purpose

日志规范定义主进程统一 logger 使用方式、开发和生产环境日志路径、日志级别以及渲染进程日志转发要求。

## Requirements

### Requirement: 统一 logger 模块

主进程 SHALL 通过 `src/main/utils/logger.ts` 导出唯一的 `logger` 实例，所有主进程模块通过 `import logger from '../utils/logger'` 使用，不得直接使用 `console.log` 记录业务日志。

#### Scenario: 主进程模块使用 logger

- **WHEN** 主进程任意模块需要记录日志
- **THEN** 通过 `import logger from '../utils/logger'` 获取实例并调用对应级别方法（`logger.info`、`logger.warn`、`logger.error` 等）

### Requirement: 开发环境日志写入 data/logs/main.log

开发环境下，`electron-log` 的文件 transport SHALL 将日志写入项目根目录 `data/logs/main.log`，路径通过 `getLogsPath()` 获取。

#### Scenario: 开发环境启动后写入日志文件

- **WHEN** 应用在开发环境（`is.dev === true`）启动并调用任意 logger 方法
- **THEN** 日志内容写入 `<project-root>/data/logs/main.log`，目录不存在时自动创建

### Requirement: 生产环境日志走平台默认路径

生产环境下，日志文件 SHALL 写入 `electron-log` 的平台默认路径（macOS: `~/Library/Logs/{appName}/main.log`，Windows: `%USERPROFILE%\AppData\Roaming\{appName}\logs\main.log`）。

#### Scenario: 生产环境日志路径正确

- **WHEN** 应用在生产环境（`is.dev === false`）运行并写入日志
- **THEN** 日志文件位于平台对应的默认日志目录，不写入项目源码目录

### Requirement: 生产环境 console transport 仅输出 warn 及以上

生产环境下，console transport 的日志级别 SHALL 设置为 `warn`，`info`/`verbose`/`debug`/`silly` 级别不输出到控制台。

#### Scenario: 生产环境 info 日志不输出到控制台

- **WHEN** 生产环境下调用 `logger.info(...)`
- **THEN** 该日志写入文件但不输出到 stdout/stderr

#### Scenario: 生产环境 warn 日志输出到控制台

- **WHEN** 生产环境下调用 `logger.warn(...)`
- **THEN** 该日志同时写入文件并输出到 stderr

### Requirement: 捕获未处理异常和 Promise rejection

logger 模块初始化时 SHALL 启用 `log.errorHandler.startCatching()`，自动捕获主进程中未处理的异常（`uncaughtException`）和未处理的 Promise rejection（`unhandledRejection`）并写入日志文件。

#### Scenario: 未处理异常被记录

- **WHEN** 主进程抛出未被 try/catch 捕获的异常
- **THEN** 异常信息（含堆栈）以 `error` 级别写入日志文件，应用不静默退出

### Requirement: 渲染进程可使用同一日志管道

主进程 SHALL 在 `app.whenReady()` 前调用 `log.initialize()`，使渲染进程可通过 `import log from 'electron-log/renderer'` 将日志转发到主进程统一写入文件。

#### Scenario: 渲染进程日志写入主进程日志文件

- **WHEN** 渲染进程调用 `log.info('...')` （使用 `electron-log/renderer`）
- **THEN** 该日志通过 IPC 转发到主进程，最终写入与主进程相同的日志文件
