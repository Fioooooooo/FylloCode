## MODIFIED Requirements

### Requirement: Bootstrap 明确验证 required cutover

`runAllMigrations()` 返回后，bootstrap SHALL 以更晚的 Workspace cutover settlement migration 作为 required gate：settlement 的 latest record 只有 `success` 通过；未执行时只有 `baselineId >= settlementId` 通过；settlement failed SHALL NOT 被 baseline 或旧 cutover success 覆盖。Settlement success 后 gate SHALL NOT 重新依赖已退役的 legacy Project meta 复验 target。

#### Scenario: Required settlement 失败

- **WHEN** ledger 中 settlement ID 的最新 record 为 `failed`
- **THEN** bootstrap gate SHALL 失败
- **AND** 系统 SHALL NOT 启动 bundled MCP、IPC、workflow、Launcher 或 Agent warmup

#### Scenario: Fresh install baseline 覆盖 settlement

- **WHEN** fresh install 的 baseline 覆盖 settlement ID
- **THEN** bootstrap gate SHALL 通过
- **AND** 系统 SHALL NOT 要求存在 legacy Project、Workspace 或 Folder meta

#### Scenario: Settlement success 后 legacy meta 已删除

- **WHEN** ledger 中 settlement ID 的最新 record 为 `success`
- **AND** 获授权的 legacy Project meta 已由 settlement 删除
- **THEN** bootstrap gate SHALL 通过
- **AND** gate SHALL NOT 因 legacy meta 不存在而报告 target incomplete

### Requirement: Cutover 失败显示原生阻塞错误并退出

Gate 失败时系统 SHALL 使用原生对话框显示“Workspace 数据升级失败”、未获授权数据不会被删除说明、required settlement migration ID、最新 attempt 原因、下次启动会自动重试和日志位置；仅提供“打开日志目录”和“退出 FylloCode”，两条路径最终都 SHALL 退出应用。

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

### Requirement: 首次 cutover 保留全部 legacy source

初始 Project-to-Workspace cutover SHALL 保留 legacy Project meta、`<appData>/projects/**` 和无法安全归属的 orphan；不得移动、删除或把 candidate key 当作删除授权。上述保留 SHALL 持续到更晚 settlement migration 完成 target preflight，并且 settlement SHALL 只清理由持久化 `legacyAppDataKey` 唯一授权的 source/meta；无法归属的数据 SHALL 继续保留。

#### Scenario: 初始 cutover 成功后 settlement 尚未运行

- **WHEN** required cutover 成功完成但 settlement 没有 success record
- **THEN** migrated Workspace SHALL 从新 namespace 正常读取
- **AND** 对应 legacy source 与 meta SHALL 仍保持原样

#### Scenario: Settlement 退役唯一 legacy copy

- **WHEN** settlement 已验证目标完整且 Workspace 持有唯一 `legacyAppDataKey`
- **THEN** settlement SHALL 删除获授权的 legacy source/meta 并清除 provenance
- **AND** collision source 与无法归属 orphan SHALL 保留
