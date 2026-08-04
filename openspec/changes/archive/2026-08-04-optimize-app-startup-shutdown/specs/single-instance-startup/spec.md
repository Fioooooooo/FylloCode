## MODIFIED Requirements

### Requirement: 主入口在启动应用能力前取得单实例锁

系统 SHALL 在加载主 bootstrap 模块、注册 `app.whenReady()` 启动链或调用任何 migration 与业务 app-data writer 之前同步申请 Electron 单实例锁。生产模式 SHALL 使用 Electron 默认 `userData` 形成全局单实例域；开发模式 SHALL 在申请锁前将 Electron `userData` 设置为当前 worktree 的 `data/` 开发数据根目录，使实例域按 worktree 隔离。

#### Scenario: 打包应用保持全局单实例域

- **WHEN** 打包后的 FylloCode 进程启动
- **THEN** 系统 SHALL NOT 覆盖 Electron 默认 `userData`
- **AND** 系统 SHALL 使用该默认目录申请单实例锁

#### Scenario: 开发实例使用当前 worktree 的实例域

- **WHEN** 未打包的 FylloCode dev 进程从一个 worktree 启动
- **THEN** 系统 SHALL 在申请锁前幂等确保 `<worktree>/data` 根目录存在
- **AND** 系统 SHALL 将 Electron `userData` 设置为该目录
- **AND** 系统 SHALL NOT 在锁前读取或写入该目录下的业务数据子目录

#### Scenario: dev 与打包应用并行运行

- **WHEN** 已安装的打包应用持有其默认 `userData` 对应的单实例锁
- **AND** dev 进程从一个 worktree 启动
- **THEN** dev 进程 SHALL 使用该 worktree 的 `data/` 对应的独立实例域
- **AND** dev 进程 SHALL NOT 因打包应用持锁而退出

#### Scenario: 不同 worktree 的 dev 实例并行运行

- **WHEN** 两个 dev 进程分别从不同 worktree 启动
- **THEN** 两个进程 SHALL 使用各自 worktree 的 `data/` 作为 Electron `userData`
- **AND** 两个进程 SHALL 能够分别取得各自的单实例锁

#### Scenario: 同一 worktree 仍保持单实例

- **WHEN** 两个 dev 进程从同一 worktree 启动
- **THEN** 两个进程 SHALL 使用同一个 `data/` 实例域
- **AND** 后启动进程未取得锁时 SHALL 请求退出且不加载 bootstrap

### Requirement: 第二实例请求复用主实例窗口

持锁主实例 SHALL 将 `second-instance` 视为窗口注意力请求，不创建第二套应用 runtime，也不把第二实例参数解释为业务操作。窗口注意力请求 SHALL 在 startup shell、Launcher 与 Workspace window 三种阶段复用主实例当前可用窗口，并 SHALL 服从 required gate 与 shutdown fence。

#### Scenario: 主实例已有可用正式窗口

- **WHEN** 主实例已完成 runtime bootstrap 并收到 `second-instance`
- **AND** `WorkspaceWindowManager` 存在最近活跃的可用窗口
- **THEN** 系统 SHALL 恢复该窗口的最小化状态并聚焦该窗口
- **AND** 系统 SHALL NOT 创建额外 Launcher 或 Workspace window

#### Scenario: 主实例没有可用正式窗口

- **WHEN** 主实例已完成 runtime bootstrap 并收到 `second-instance`
- **AND** `WorkspaceWindowManager` 没有可聚焦的可用窗口
- **THEN** 系统 SHALL 通过现有 Launcher window lifecycle 创建或复用 Launcher

#### Scenario: 第二实例在 startup shell 可见期间到达

- **WHEN** 持锁主实例已经显示 startup shell但 required gate、IPC/event 注册或正式 renderer handoff 尚未完成
- **THEN** 系统 SHALL 立即恢复并聚焦既有 startup shell
- **AND** 系统 SHALL NOT 创建第二个窗口、提前接管 Launcher 或绕过 migration gate
- **AND** 启动期间的多个窗口注意力请求 SHALL 合并为对同一 startup shell 的幂等聚焦

#### Scenario: 第二实例在 startup shell 创建前到达

- **WHEN** 持锁主实例在 Electron app ready 后收到 `second-instance` 但 bootstrap controller 尚未创建 startup shell
- **THEN** 系统 SHALL 合并窗口注意力请求直到 startup shell 创建
- **AND** startup shell 创建后 SHALL 处理一次恢复和聚焦

#### Scenario: 第二实例在 shutdown 期间到达

- **WHEN** 主实例已经设置 shutdown fence 后收到 `second-instance`
- **THEN** 系统 SHALL NOT 创建、显示或导航任何窗口
- **AND** 系统 SHALL NOT 重新启动 runtime、MCP 或 Agent warmup

#### Scenario: 第二实例参数不触发业务路由

- **WHEN** 主实例收到包含 argv、cwd 或 additionalData 的 `second-instance`
- **THEN** 系统 SHALL 只执行窗口注意力请求
- **AND** 系统 SHALL NOT 根据这些参数打开或切换 Project、Folder、Workspace、Session 或 Proposal
