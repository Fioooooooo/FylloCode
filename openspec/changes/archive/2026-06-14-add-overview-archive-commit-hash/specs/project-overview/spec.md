## MODIFIED Requirements

### Requirement: 最近脉络投影

系统 SHALL 通过 lineage `listRecentSubjects(projectPath, 10)` 取按 `updatedAt` 倒序的前 10 个 subject，投影为 `recentLineages`。`ProjectOverview` SHALL 使用 `recentLineages` 字段和 `RecentLineage` 共享类型表达这些数据，当前 DTO 字段、类型、主进程投影函数、渲染组件与测试命名均 SHALL 使用 lineage 术语。每条 `RecentLineage` 的 `sessionCount` 为 `links` 数，`proposalCount` 为所有 link 的 proposals 总数。

系统 SHALL 基于当前 `activeChanges[].id` 与 Git 当前历史计算每条 `RecentLineage` 的归档状态。`mergeStatus` 的判定优先级 SHALL 为：

1. 若任一 proposal 的 `changeId` 命中 `activeChanges[].id`，则 `mergeStatus` 为 `"applying"`，`mergeCommitSha` 为 `null`。
2. 否则，若任一 proposal 的 `changeId` 对应的 archived change 锚点文件能在 Git 当前历史中定位到新增提交，则 `mergeStatus` 为 `"merged"`，`mergeCommitSha` 为该当前可达 commit hash。
3. 其余情况 `mergeStatus` 为 `"pending"`，`mergeCommitSha` 为 `null`。

`mergeCommitSha` SHALL 表示当前 Git 历史中引入 `openspec/changes/archive/<archivedChangeId>/.openspec.yaml` 的 commit hash，而不是 archive tool 最初创建的临时 hash。人为 rebase、amend 或 squash 改写历史后，下一次 overview 查询 SHALL 反映当前历史中可达的新 hash。`mergeCommitUrl` 在本期 SHALL 仍为 `null`。

overview 聚合 SHALL 批量构建 archive commit index 后再映射 recentLineages，SHALL NOT 在每个 subject 或每个 proposal 的 map 循环中逐条执行 Git 查询。Git 不可用、项目不是 Git 仓库、archive 目录不存在或锚点文件尚未进入 Git 历史时，系统 SHALL 降级返回 `mergeCommitSha: null`，且不得阻断 `overview:getProjectOverview` 的整体返回。

#### Scenario: 脉络命中活跃变更

- **WHEN** 某 subject 的任一 proposal changeId 出现在 `activeChanges[].id` 中
- **THEN** 该 `RecentLineage` 的 `mergeStatus` 为 `"applying"`
- **AND** `mergeCommitSha` 为 `null`
- **AND** `mergeCommitUrl` 为 `null`

#### Scenario: 脉络命中已归档提交

- **WHEN** 某 subject 的所有 proposal changeId 都不在 `activeChanges[].id` 中
- **AND** 其中一个 proposal changeId 为 `add-foo`
- **AND** 项目存在 `openspec/changes/archive/2026-06-14-add-foo/.openspec.yaml`
- **AND** Git 当前历史中能定位到新增该锚点文件的 commit hash `abc123`
- **THEN** 该 `RecentLineage` 的 `mergeStatus` 为 `"merged"`
- **AND** `mergeCommitSha` 为 `abc123`
- **AND** `mergeCommitUrl` 为 `null`

#### Scenario: rebase 后返回当前可达 hash

- **WHEN** proposal `add-foo` 初次归档提交 hash 为 `oldhash`
- **AND** 后续人为 rebase、amend 或 squash 使当前 main 历史中引入 `openspec/changes/archive/2026-06-14-add-foo/.openspec.yaml` 的 commit hash 变为 `newhash`
- **THEN** 下一次 `overview:getProjectOverview` 返回的对应 `RecentLineage.mergeCommitSha` 为 `newhash`
- **AND** 不返回已经不再代表当前历史的 `oldhash`

#### Scenario: 归档尚未提交时保持 pending

- **WHEN** 某 subject 的所有 proposal changeId 都不在 `activeChanges[].id` 中
- **AND** 其 proposal 对应的 archive 目录尚不存在，或 `.openspec.yaml` 尚未进入 Git 当前历史
- **THEN** 该 `RecentLineage` 的 `mergeStatus` 为 `"pending"`
- **AND** `mergeCommitSha` 为 `null`
- **AND** `mergeCommitUrl` 为 `null`

#### Scenario: Git 查询不可用时降级

- **WHEN** 项目不是 Git 仓库、Git 不可用或 archive commit index 构建失败
- **THEN** `overview:getProjectOverview` 仍返回成功
- **AND** 受影响的 `RecentLineage.mergeCommitSha` 为 `null`
- **AND** 不因 Git 查询失败抛出 IPC 错误

#### Scenario: lineage 数据为空

- **WHEN** lineage subjects 目录不存在或为空
- **THEN** `recentLineages` 返回空数组，`stats.totalSubjects` 为 `0`，`stats.taskLinkedRatio` 为 `0`
