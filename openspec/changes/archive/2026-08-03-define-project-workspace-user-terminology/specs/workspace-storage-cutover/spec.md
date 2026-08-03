## MODIFIED Requirements

### Requirement: Cutover 失败显示原生阻塞错误并退出

Gate 失败时系统 SHALL 使用原生对话框显示“FylloCode 数据升级失败”，并说明 FylloCode 无法完成 Project / Workspace 数据升级、未获授权数据不会被删除、required settlement migration ID、最新 attempt 原因、下次启动会自动重试和日志位置；对话框 SHALL NOT 使用内部 Workspace 上位概念作为两种用户对象的唯一名称。对话框仅提供“打开日志目录”和“退出 FylloCode”，两条路径最终都 SHALL 退出应用。

#### Scenario: 用户打开日志目录

- **WHEN** 用户在升级失败对话框选择“打开日志目录”
- **THEN** 系统 SHALL 通过系统 shell 打开日志目录
- **AND** 系统 SHALL 随后退出 FylloCode

#### Scenario: 用户直接退出

- **WHEN** 用户选择“退出 FylloCode”或关闭对话框
- **THEN** 系统 SHALL 退出应用
- **AND** 系统 SHALL NOT 提供绕过 gate 继续启动的操作

#### Scenario: 下次启动重试 settlement

- **WHEN** required settlement 的前一次 attempt 为 failed
- **AND** 用户修复底层权限或数据冲突后重新启动
- **THEN** runner SHALL 自动重试 settlement
- **AND** UI SHALL NOT 声称该新 migration 永不重试
