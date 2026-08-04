## MODIFIED Requirements

### Requirement: Settlement 产生可操作的阻塞诊断

Settlement pending 或 latest attempt failed 时，bootstrap SHALL 在启动 bundled MCP、业务 IPC、workflow、Launcher/Workspace runtime 与 Agent warmup 前停止，并 SHALL 记录 settlement migration ID、最新错误与日志目录。Bootstrap MAY 在 settlement 执行和验证期间显示不访问业务数据的 application startup shell；失败后 SHALL 关闭该 shell，再显示原生失败 UI。原生失败 UI SHALL 说明未获授权数据不会被删除、下次启动会重试 settlement，并只提供打开日志目录或退出应用。

#### Scenario: Settlement latest attempt failed

- **WHEN** bootstrap gate 读取到 settlement 的最新 record 为 failed
- **THEN** 系统 SHALL 先关闭已显示的 startup shell
- **AND** 原生对话框 SHALL 显示 settlement ID、最新错误和日志路径
- **AND** 系统 SHALL NOT 进入 normal runtime

#### Scenario: 用户打开日志目录

- **WHEN** 用户选择打开日志目录
- **THEN** 系统 SHALL 调用系统 shell 打开该目录后退出
- **AND** 下次启动 SHALL 按 retry policy 再次尝试 settlement
