## ADDED Requirements

### Requirement: Overview distinguishes unavailable Git history from governance read failure

系统 SHALL 将普通非 Git Project 和尚无首个 commit 的 Git Project 识别为 Git history unavailable，而不是 repository governance reader failure。对于 history unavailable 的 Project，Overview SHALL 保留可直接从文件系统读取的 proposal、spec、archive 和 guideline 数据，并 SHALL 使用现有数据契约的空值表达不可生成的 history 派生字段。只有 Project 具有可解析 Git history 后发生的仓库损坏、权限错误、Git 进程失败或超时等真实读取异常，才 SHALL 将该 Folder 标记为 `error` 并产生 partial completeness。

#### Scenario: 普通非 Git Project 使用治理演进默认值

- **WHEN** Project 目录可访问但根目录没有 Git metadata
- **THEN** Overview SHALL 将该 Project 的 repository aggregate 状态设为 `ready`
- **AND** SHALL 正常汇总该 Project 当前的 specs、archives、guidelines 和本地 proposal
- **AND** SHALL 返回空 `specsGrowth`、空 `recentGuidelines`、`guidelinesLastUpdated: null` 与 `specsThisMonth: 0`
- **AND** SHALL NOT 因该 Project 显示“Repository 治理数据不完整”

#### Scenario: 尚无首个 commit 的 Git Project 使用治理演进默认值

- **WHEN** Project 已初始化 Git metadata，但 HEAD 尚不能解析到任何 commit
- **THEN** Overview SHALL 使用与普通非 Git Project 相同的 history 默认值
- **AND** SHALL 保留该 Project 可直接读取的文件系统治理数据
- **AND** repository aggregate SHALL NOT 因缺少首个 commit 变为 partial

#### Scenario: Multi-Project Workspace 混合 Git 与非 Git Project

- **WHEN** Workspace 同时包含具有 Git history 的 Project 和普通非 Git Project，且所有文件系统读取均成功
- **THEN** repository aggregate SHALL 将两个 Project 都标记为 `ready` 并保持 complete
- **AND** Git Project SHALL 提供 owner-qualified 规约增长与准则演化
- **AND** 非 Git Project SHALL 只贡献当前治理计数和 proposal，不得伪造历史趋势

#### Scenario: 有效 Git repository 的 history 读取发生真实故障

- **WHEN** Project 具有可解析 HEAD，但 Git history 命令因仓库损坏、权限、进程启动失败或超时而失败
- **THEN** Overview SHALL 将该 Project 标记为 `error`
- **AND** repository aggregate SHALL 返回 partial completeness 并将该 Project 列为未计入
- **AND** 系统 SHALL NOT 用空 history 默认值掩盖该故障

#### Scenario: 非 Git Project 无法追溯 archive commit

- **WHEN** recent lineage 引用了非 Git Project 中的 archived proposal，且没有持久化 commit hash
- **THEN** Overview SHALL 返回 `archiveCommitHash: null`
- **AND** recent lineage SHALL 保持可用
- **AND** 系统 SHALL NOT 将预期的 history unavailable 记录为 Git failure warning
