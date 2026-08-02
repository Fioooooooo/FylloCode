## ADDED Requirements

### Requirement: 主入口在启动应用能力前取得单实例锁

系统 SHALL 在加载主 bootstrap 模块、注册 `app.whenReady()` 启动链或调用任何 migration 与 app-data writer 之前同步申请 Electron 单实例锁。

#### Scenario: 首个实例取得锁并继续启动

- **WHEN** FylloCode 进程启动且 `app.requestSingleInstanceLock()` 返回成功
- **THEN** 系统 SHALL 注册第二实例通知监听
- **AND** 系统 SHALL 加载主 bootstrap 模块并进入既有 `app.whenReady()` 启动链

#### Scenario: 第二实例未取得锁并退出

- **WHEN** FylloCode 进程启动且 `app.requestSingleInstanceLock()` 返回失败
- **THEN** 系统 SHALL 请求退出该进程
- **AND** 系统 SHALL NOT 加载主 bootstrap 模块
- **AND** 系统 SHALL NOT 执行 shell PATH 同步、migration runner、bundled MCP host、IPC 注册、workflow 初始化、窗口创建或 Agent 预热

### Requirement: 第二实例请求复用主实例窗口

持锁主实例 SHALL 将 `second-instance` 视为窗口注意力请求，不创建第二套应用 runtime，也不把第二实例参数解释为业务操作。

#### Scenario: 主实例已有可用窗口

- **WHEN** 主实例已完成 bootstrap 并收到 `second-instance`
- **AND** `ProjectWindowManager` 存在最近活跃的可用窗口
- **THEN** 系统 SHALL 恢复该窗口的最小化状态并聚焦该窗口
- **AND** 系统 SHALL NOT 创建额外 launcher 或 project window

#### Scenario: 主实例没有可用窗口

- **WHEN** 主实例已完成 bootstrap 并收到 `second-instance`
- **AND** `ProjectWindowManager` 没有可聚焦的可用窗口
- **THEN** 系统 SHALL 通过现有 launcher window lifecycle 创建或复用 launcher

#### Scenario: 第二实例在主实例启动期间到达

- **WHEN** 持锁主实例已经收到 `second-instance`
- **AND** migration、IPC/event 注册或首窗创建尚未全部完成
- **THEN** 系统 SHALL 延迟窗口注意力请求直到既有 bootstrap 顺序完成并创建首窗
- **AND** 系统 SHALL NOT 为处理该事件提前执行窗口创建、migration、MCP、IPC 或 Agent warmup
- **AND** 启动期间的多个窗口注意力请求 SHALL 合并为启动完成后的一次处理

#### Scenario: 第二实例参数不触发业务路由

- **WHEN** 主实例收到包含 argv、cwd 或 additionalData 的 `second-instance`
- **THEN** 系统 SHALL 只执行窗口注意力请求
- **AND** 系统 SHALL NOT 根据这些参数打开或切换 Project、Folder、Workspace、Session 或 Proposal
