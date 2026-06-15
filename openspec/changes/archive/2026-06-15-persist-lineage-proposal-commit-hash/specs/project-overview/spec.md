## MODIFIED Requirements

### Requirement: 最近脉络投影

系统 SHALL 通过 lineage `listRecentSubjects(projectPath, 10)` 取按 `updatedAt` 倒序的前 10 个 subject，投影为 `recentLineages`。`ProjectOverview` SHALL 使用 `recentLineages` 字段和 `RecentLineage` 共享类型表达这些数据，当前 DTO 字段、类型、主进程投影函数、渲染组件与测试命名均 SHALL 使用 lineage 术语。每条 `RecentLineage` 的 `sessionCount` 为 `links` 数，`proposalCount` 为所有 link 的 proposals 总数。

系统 SHALL 基于当前 `activeChanges[].id`、lineage 中已持久化的 proposal `commitHash`，以及 Git 当前历史中可解析的归档锚点提交，计算每条 `RecentLineage` 的归档状态。`mergeStatus` 的判定优先级 SHALL 为：

1. 若任一 proposal 的 `changeId` 命中 `activeChanges[].id`，则 `mergeStatus` 为 `"applying"`，`mergeCommitSha` 为 `null`，且该 active proposal 不触发 commit hash 查询或写回。
2. 否则，若任一 proposal 已持久化 `commitHash`，则 `mergeStatus` 为 `"merged"`，`mergeCommitSha` 为该持久化值。
3. 否则，若任一 proposal 的 `changeId` 对应的 archived change 锚点文件能在 Git 当前历史中定位到新增提交，则 `mergeStatus` 为 `"merged"`，`mergeCommitSha` 为该当前可达 commit hash，并且系统 SHALL 将该 commit hash 写回对应 lineage subject 的 proposal link 与 `index.commitHashes`。
4. 其余情况 `mergeStatus` 为 `"pending"`，`mergeCommitSha` 为 `null`。

`mergeCommitSha` SHALL 表示 lineage 中持久化的 proposal commit hash，或在该 hash 缺失时由本次 overview 查询从当前 Git 历史解析到并尝试写回的 hash。人为 rebase、amend 或 squash 改写历史后，系统当前没有感知机制；若 proposal 已有持久化 `commitHash`，overview 查询 SHALL NOT 主动重新查询或覆盖该值。未来的监控或显式刷新机制不属于本 requirement 范围。

overview 聚合 SHALL 批量构建 archive commit index 后再映射 recentLineages，SHALL NOT 在每个 subject 或每个 proposal 的 map 循环中逐条执行 Git 查询。Git 查询 SHALL 仅针对缺少持久化 `commitHash` 且不属于 active change 的 proposal changeId。Git 不可用、项目不是 Git 仓库、archive 目录不存在或锚点文件尚未进入 Git 历史时，系统 SHALL 降级返回 `mergeCommitSha: null`，不得写入 lineage commit hash，且不得阻断 `overview:getProjectOverview` 的整体返回。

当 Git 成功解析到缺失的 commit hash 但 lineage 写回失败时，overview SHALL 记录日志并不得阻断整体返回；本次查询 MAY 使用已解析到的 hash 返回 `"merged"`，但由于写回失败，后续查询可再次尝试。

#### Scenario: 脉络命中活跃变更

- **WHEN** 某 subject 的任一 proposal changeId 出现在 `activeChanges[].id` 中
- **THEN** 该 `RecentLineage` 的 `mergeStatus` 为 `"applying"`
- **AND** `mergeCommitSha` 为 `null`
- **AND** 该 active proposal 不触发 commit hash 查询或写回

#### Scenario: 脉络使用已持久化提交 hash

- **WHEN** 某 subject 的所有 proposal changeId 都不在 `activeChanges[].id` 中
- **AND** 其中一个 proposal 已包含 `commitHash: "abc123"`
- **THEN** 该 `RecentLineage` 的 `mergeStatus` 为 `"merged"`
- **AND** `mergeCommitSha` 为 `"abc123"`

#### Scenario: 缺失 hash 时从 Git 获取并持久化

- **WHEN** 某 subject 的所有 proposal changeId 都不在 `activeChanges[].id` 中
- **AND** 其中一个 proposal changeId 为 `add-foo` 且尚无 `commitHash`
- **AND** 项目存在 `openspec/changes/archive/2026-06-14-add-foo/.openspec.yaml`
- **AND** Git 当前历史中能定位到新增该锚点文件的 commit hash `abc123`
- **THEN** 该 `RecentLineage` 的 `mergeStatus` 为 `"merged"`
- **AND** `mergeCommitSha` 为 `abc123`
- **AND** 系统将 `commitHash: "abc123"` 写入对应 subject proposal link
- **AND** 系统将 `index.commitHashes["abc123"]` 写为该 subject id

#### Scenario: 再次查询复用持久化 hash

- **WHEN** 某 proposal 已在 lineage 中持久化 `commitHash: "abc123"`
- **AND** 用户再次调用 `overview:getProjectOverview`
- **THEN** overview 使用该持久化值计算 `mergeCommitSha`
- **AND** 不为了该 proposal 再次查询 Git

#### Scenario: 已有持久化 hash 时不自动覆盖

- **WHEN** proposal `add-foo` 已持久化 `commitHash: "oldhash"`
- **AND** 后续人为 rebase、amend 或 squash 使当前 Git 历史中引入 `openspec/changes/archive/2026-06-14-add-foo/.openspec.yaml` 的 commit hash 变为 `newhash`
- **THEN** 下一次 `overview:getProjectOverview` 返回的对应 `RecentLineage.mergeCommitSha` 仍为 `"oldhash"`
- **AND** overview 查询路径不将其自动覆盖为 `"newhash"`

#### Scenario: 归档尚未提交时保持 pending

- **WHEN** 某 subject 的所有 proposal changeId 都不在 `activeChanges[].id` 中
- **AND** 其 proposal 没有持久化 `commitHash`
- **AND** 其 proposal 对应的 archive 目录尚不存在，或 `.openspec.yaml` 尚未进入 Git 当前历史
- **THEN** 该 `RecentLineage` 的 `mergeStatus` 为 `"pending"`
- **AND** `mergeCommitSha` 为 `null`
- **AND** 系统不写入 proposal `commitHash` 或 `index.commitHashes`

#### Scenario: Git 查询不可用时降级

- **WHEN** 项目不是 Git 仓库、Git 不可用或 archive commit index 构建失败
- **THEN** `overview:getProjectOverview` 仍返回成功
- **AND** 受影响的 `RecentLineage.mergeCommitSha` 为 `null`
- **AND** 不因 Git 查询失败抛出 IPC 错误
- **AND** 不写入 proposal `commitHash` 或 `index.commitHashes`

#### Scenario: lineage 写回失败不阻断概览

- **WHEN** Git 成功解析 proposal `add-foo` 的 commit hash 为 `abc123`
- **AND** lineage 写回 subject 或 index 时失败
- **THEN** `overview:getProjectOverview` 仍返回成功
- **AND** 本次 `RecentLineage.mergeCommitSha` 可返回 `abc123`
- **AND** 系统记录写回失败日志

#### Scenario: lineage 数据为空

- **WHEN** lineage subjects 目录不存在或为空
- **THEN** `recentLineages` 返回空数组，`stats.totalSubjects` 为 `0`，`stats.taskLinkedRatio` 为 `0`
