# app-bootstrap 规范

## Purpose

应用 bootstrap 规范定义前端应用启动后的非阻塞初始化入口、任务注册机制、并发执行方式和失败隔离要求。

## Requirements

### Requirement: 应用提供统一的非阻塞 bootstrap 入口

系统 SHALL 在前端应用启动后提供统一的 bootstrap 入口，用于执行不阻塞主流程的异步初始化任务。

#### Scenario: app 挂载后触发 bootstrap

- **WHEN** 前端应用完成 `mount("#app")`
- **THEN** 系统启动 bootstrap runner 执行已注册任务
- **AND** 不等待 bootstrap 完成才渲染主界面

### Requirement: bootstrap 任务可注册且可扩展

系统 SHALL 提供任务注册机制，使多个 bootstrap 任务可以在独立模块中声明，并由统一 runner 执行。

#### Scenario: 注册多个 bootstrap 任务

- **WHEN** 系统注册多个 bootstrap task
- **THEN** runner 在一次 bootstrap 中执行这些任务
- **AND** 新任务的增加不要求修改 runner 本身的执行语义

#### Scenario: bootstrap 任务并发执行

- **WHEN** 系统在同一次 bootstrap 中运行多个彼此独立的 task
- **THEN** runner 使用并发方式执行这些任务
- **AND** 不要求一个任务完成后才开始另一个任务

#### Scenario: 首批 bootstrap 覆盖 ACP agents 与 persisted projects

- **WHEN** 应用启动后执行核心 bootstrap tasks
- **THEN** 系统至少触发 ACP agent 数据预热任务
- **AND** 同时触发 persisted projects 预热任务

### Requirement: bootstrap 任务失败不得阻塞主流程

系统 SHALL 将 bootstrap 任务失败隔离在任务边界内，单个任务失败时不得阻止其他任务执行，也不得影响应用主流程。

#### Scenario: 单个 bootstrap 任务失败

- **WHEN** 某个 bootstrap task 执行抛出异常
- **THEN** 系统记录该任务失败
- **AND** 继续执行剩余 bootstrap task
- **AND** 应用界面保持可用
