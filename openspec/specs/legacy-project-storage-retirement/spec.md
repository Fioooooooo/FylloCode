# legacy-project-storage-retirement Specification

## Purpose

定义 Workspace cutover 完成后的 legacy Project storage 退役契约，包括 opt-in 可重试 settlement、删除前全局预检、仅由持久化 provenance 授权的幂等清理，以及 collision/orphan 保留与阻塞诊断。

## Requirements

### Requirement: Legacy Project storage 由更晚 settlement migration 退役

系统 SHALL 注册一个晚于 Project-to-Workspace cutover 和 Cortex Workspace-scope migration 的不可变 settlement migration ID。该 migration SHALL 在 normal runtime 启动前完成 repair、target preflight 与 legacy cleanup，并 SHALL NOT 修改、重命名或重新登记任何已发布 migration ID。

#### Scenario: 旧 cutover 已成功

- **WHEN** ledger 已记录旧 Workspace cutover success 但没有 settlement success
- **THEN** runner SHALL 执行 settlement migration
- **AND** settlement SHALL 在 cleanup 前验证现有 Workspace/Folder target

#### Scenario: 旧 cutover 曾失败但现在可修复

- **WHEN** 旧 cutover ledger record 为 failed
- **AND** legacy source 与现有 target 现在满足幂等 cutover 的明确映射
- **THEN** settlement SHALL 通过新的 migration ID 重放幂等转换并验证 target
- **AND** 系统 SHALL NOT 修改旧 failed record

### Requirement: Settlement migration 显式选择失败重试策略

Migration registry SHALL 支持默认 `never` 与显式 `until-success` retry policy。只有声明 `until-success` 且没有 success record 的 migration 才 SHALL 在后续启动重试；每次尝试 SHALL 继续写入现有 `migrations.json` ledger，required status SHALL 使用同 ID 的最后一条 record。

#### Scenario: Settlement 首次删除失败

- **WHEN** settlement 声明 `until-success` 且最新 attempt 为 failed
- **THEN** 下一次启动 SHALL 再次执行同一 settlement ID
- **AND** ledger SHALL 保留先前 failure 并追加新 attempt

#### Scenario: 历史 migration 失败

- **WHEN** 一个未声明 `until-success` 的历史 migration 已有 failed record
- **THEN** runner SHALL 继续跳过该 ID
- **AND** settlement retry policy SHALL NOT 使该历史 migration 自动重试

#### Scenario: Settlement 已成功

- **WHEN** settlement 的任一 record 为 success
- **THEN** 后续启动 SHALL 跳过该 migration
- **AND** required status SHALL 报告最新 success

### Requirement: Cleanup 只接受持久化 provenance 授权

Settlement SHALL 只为持有 `WorkspaceMeta.legacyAppDataKey` 的 migrated Workspace 删除 legacy 数据。系统 SHALL 使用该 key 定位唯一 legacy source，并使用相同 Workspace ID 删除 legacy meta；SHALL NOT 使用 Workspace ID 代替 data key、重新编码当前 Folder path、扫描目录或推断 candidate 来扩大删除范围。

#### Scenario: 唯一 provenance 清理成功

- **WHEN** migrated Workspace 持有安全的 `legacyAppDataKey`
- **AND** Workspace/Folder target 完整且 legacy source/meta 与该 Workspace 一致
- **THEN** settlement SHALL 删除该 key 对应的 legacy source和同 ID legacy meta
- **AND** settlement SHALL 最后从 Workspace meta 清除 `legacyAppDataKey`

#### Scenario: Candidate collision 没有 provenance

- **WHEN** 多个 migrated Workspace 因 candidate-key 碰撞而均不持有 `legacyAppDataKey`
- **THEN** settlement SHALL 保留共享 legacy source和所有无法唯一授权的 legacy 数据
- **AND** 系统 SHALL NOT 因当前只剩一个 Workspace 或 Folder 可用而重新认领该 source

#### Scenario: 历史 orphan 不属于 active legacy meta

- **WHEN** `<appData>/projects/**` 中存在无法由持久化 provenance 关联的历史目录
- **THEN** settlement SHALL 保留该目录
- **AND** settlement SHALL NOT 删除整个 projects root

### Requirement: Settlement 在删除前完成全局 preflight

Settlement SHALL 在第一次删除前验证全部 legacy Project 的可识别 schema、Workspace/Folder identity、target completeness、provenance key 安全性与 cleanup plan 唯一性。任何冲突或不确定 SHALL 使本次 attempt 失败且不执行删除。

#### Scenario: 一个 target 不完整

- **WHEN** 任一 legacy Project 无法通过幂等 repair 形成完整 Workspace/Folder target
- **THEN** settlement SHALL 在删除任何 legacy source 前失败
- **AND** 最新 ledger error SHALL 标识失败 Workspace 或冲突

#### Scenario: 两个 Workspace 声明同一 provenance key

- **WHEN** cleanup plan 中两个 Workspace 持有相同 `legacyAppDataKey`
- **THEN** settlement SHALL 将其视为授权冲突并在删除前失败
- **AND** 系统 SHALL NOT 选择任一 Workspace 作为 owner

### Requirement: Cleanup 顺序支持幂等恢复

对每个已授权 Workspace，settlement SHALL 先删除 legacy source，再删除 legacy meta，最后清除 Workspace 的 `legacyAppDataKey`。Missing source/meta SHALL 视为已完成；只要 provenance 尚未清除，后续 retry SHALL 使用完全相同的目标继续，且 SHALL NOT 触及 Workspace-owned current data、Folder registry、repository worktree 或其他 Workspace。

#### Scenario: Source 删除后进程中断

- **WHEN** legacy source 已删除但 meta 或 provenance 尚未完成
- **THEN** 下一次 retry SHALL 将 source missing 视为成功并继续同一 Workspace cleanup
- **AND** success 前 SHALL 保留 `legacyAppDataKey`

#### Scenario: Cleanup 全部完成

- **WHEN** 所有获授权 legacy source/meta 已删除且 provenance 已清除
- **THEN** settlement SHALL 记录 success
- **AND** normal runtime SHALL 只使用 Workspace/Folder storage

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
