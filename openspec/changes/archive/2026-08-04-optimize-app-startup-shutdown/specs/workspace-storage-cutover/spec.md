## MODIFIED Requirements

### Requirement: Bootstrap 明确验证 required cutover

`runAllMigrations()` 返回后，bootstrap SHALL 以更晚的 Workspace cutover settlement migration 作为 required gate：settlement 的 latest record 只有 `success` 通过；未执行时只有 `baselineId >= settlementId` 通过；settlement failed SHALL NOT 被 baseline 或旧 cutover success 覆盖。Settlement success 后 gate SHALL NOT 重新依赖已退役的 legacy Project meta 复验 target。Gate 前 MAY 显示不访问业务数据的 application startup shell，但 SHALL NOT 建立 Launcher/Workspace context、注册业务 IPC 或启动 normal runtime。

#### Scenario: Required settlement 失败

- **WHEN** ledger 中 settlement ID 的最新 record 为 `failed`
- **THEN** bootstrap gate SHALL 失败
- **AND** 系统 SHALL NOT 启动 bundled MCP、业务 IPC、workflow、Launcher、Workspace runtime 或 Agent warmup
- **AND** 已显示的 startup shell SHALL NOT 被视为 Launcher 或绕过 gate

#### Scenario: Fresh install baseline 覆盖 settlement

- **WHEN** fresh install 的 baseline 覆盖 settlement ID
- **THEN** bootstrap gate SHALL 通过
- **AND** 系统 SHALL NOT 要求存在 legacy Project、Workspace 或 Folder meta
- **AND** 系统 MAY 将既有 startup shell 接管为 Launcher并进入 normal runtime

#### Scenario: Settlement success 后 legacy meta 已删除

- **WHEN** ledger 中 settlement ID 的最新 record 为 `success`
- **AND** 获授权的 legacy Project meta 已由 settlement 删除
- **THEN** bootstrap gate SHALL 通过
- **AND** gate SHALL NOT 因 legacy meta 不存在而报告 target incomplete

### Requirement: Cutover 失败显示原生阻塞错误并退出

Gate 失败时系统 SHALL 先销毁或关闭 application startup shell，再使用原生对话框显示“FylloCode 数据升级失败”，并说明 FylloCode 无法完成 Project / Workspace 数据升级、未获授权数据不会被删除、required settlement migration ID、最新 attempt 原因、下次启动会自动重试和日志位置；对话框 SHALL NOT 使用内部 Workspace 上位概念作为两种用户对象的唯一名称。对话框仅提供“打开日志目录”和“退出 FylloCode”，两条路径最终都 SHALL 退出应用。

#### Scenario: Startup shell 已经可见

- **WHEN** required gate 在 startup shell 可见期间失败
- **THEN** 系统 SHALL 关闭 startup shell 后显示原生失败对话框
- **AND** 系统 SHALL NOT 导航到正式 renderer或显示可交互 Launcher

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
