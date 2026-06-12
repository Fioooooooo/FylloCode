# project-overview Specification

## Purpose

TBD - created by archiving change add-project-overview-page. Update Purpose after archive.

## Requirements

### Requirement: 概览数据聚合通道

系统 SHALL 提供 `overview:getProjectOverview` IPC 通道，入参为 `{ projectId: string }`（经 `src/shared/schemas/ipc/overview.ts` 的 Zod schema 校验，`projectId` 非空），一次性返回 `IpcResponse<ProjectOverview>`。`ProjectOverview` SHALL 包含 `stats`、`activeChanges`、`recentThreads`、`governance` 四个字段，字段语义与 `@shared/types/overview.ts` 定义一致。

#### Scenario: 成功返回完整概览

- **WHEN** renderer 以有效 `projectId` 调用 `overview:getProjectOverview`
- **THEN** 主进程将 `projectId` 解析为 `projectPath`，聚合仓库扫描、git 查询、lineage 投影三类数据源
- **AND** 返回 `{ ok: true, data: ProjectOverview }`，四个字段均存在

#### Scenario: projectId 无法解析

- **WHEN** 传入的 `projectId` 无法解析为有效项目路径
- **THEN** 返回 `{ ok: false, error }`，错误码为 `PROJECT_NOT_FOUND`

#### Scenario: 入参校验失败

- **WHEN** 入参缺少 `projectId` 或为空字符串
- **THEN** 返回 `{ ok: false, error }`，错误码为 `VALIDATION_ERROR`

### Requirement: 仓库统计取数口径

系统 SHALL 通过文件系统扫描计算 `stats` 中的仓库类指标：`specsCount` 为 `openspec/specs/` 下目录数；`archiveCount` 为 `openspec/changes/archive/` 下目录数；`archiveThisMonth` 为其中目录名以当前月份 `yyyy-MM` 为前缀的数量；`specsThisMonth` 为 specs 趋势中本月新增数；`guidelinesCount` 为 `guidelines/` 下 `.md` 文件数。

#### Scenario: 标准项目结构

- **WHEN** 项目存在 `openspec/specs/`、`openspec/changes/archive/`、`guidelines/` 目录
- **THEN** 各计数按目录/文件实际数量返回

#### Scenario: openspec 目录缺失

- **WHEN** 项目不存在 `openspec/` 目录
- **THEN** `specsCount`、`archiveCount`、`archiveThisMonth` 返回 `0`，不抛错

#### Scenario: guidelines 目录缺失

- **WHEN** 项目不存在 `guidelines/` 目录
- **THEN** `guidelinesCount` 返回 `0`，不抛错

### Requirement: 进行中变更投影

系统 SHALL 基于既有 `domain/proposal/openspec-reader.ts` 的 `readProposalFiles` 计算 `activeChanges`，过滤掉 `status === "archived"` 的条目，并将 `ProposalStatus` 映射为前端 `stage`：`creating → drafting`、`draft → proposal`、`applying → applying`。每个 `ActiveChange` SHALL 返回 `id` 与 `title`：`id` 为原始 changeId，用于提案详情路由参数；`title` 为 `readProposalFiles` 产出的展示标题（由 `toTitleCase(stripArchivePrefix(changeId))` 规则生成）。每个变更 SHALL 通过 lineage `getByProposal` 反查任务信息填充 `taskTitle` 与 `taskRef`，`taskRef` 保留 `source:` 前缀原样返回。

#### Scenario: 活跃变更关联到任务

- **WHEN** 某活跃变更的 changeId 在 lineage index 中能反查到 subject 且该 subject 有 task
- **THEN** 该 `ActiveChange` 的 `id` 为原始 changeId，`title` 为格式化展示标题
- **AND** `taskTitle` 为 task snapshot 标题，`taskRef` 为含前缀的 task ref，`stage` 由其 `ProposalStatus` 映射得到

#### Scenario: 活跃变更无关联任务

- **WHEN** 某活跃变更无法反查到 subject 或 subject 无 task
- **THEN** 该 `ActiveChange` 的 `taskTitle` 与 `taskRef` 均为 `null`

#### Scenario: 无活跃变更

- **WHEN** 项目无非归档的活跃变更
- **THEN** `activeChanges` 返回空数组

### Requirement: 最近脉络投影

系统 SHALL 通过 lineage `listRecentSubjects(projectPath, 10)` 取按 `updatedAt` 倒序的前 10 个 subject，投影为 `recentThreads`。每条 `RecentThread` 的 `sessionCount` 为 `links` 数，`proposalCount` 为所有 link 的 proposals 总数。`mergeStatus` 在本期 SHALL 仅判定 `applying`（任一 proposal 的 changeId 命中 `activeChanges[].id`）与 `pending`（其余），`mergeCommitSha` 与 `mergeCommitUrl` 恒为 `null`。

#### Scenario: 脉络命中活跃变更

- **WHEN** 某 subject 的任一 proposal changeId 出现在 `activeChanges[].id` 中
- **THEN** 该 `RecentThread` 的 `mergeStatus` 为 `"applying"`

#### Scenario: 脉络未命中活跃变更

- **WHEN** 某 subject 的所有 proposal changeId 都不在 `activeChanges[].id` 中
- **THEN** 该 `RecentThread` 的 `mergeStatus` 为 `"pending"`

#### Scenario: lineage 数据为空

- **WHEN** lineage subjects 目录不存在或为空
- **THEN** `recentThreads` 返回空数组，`stats.totalSubjects` 为 `0`，`stats.taskLinkedRatio` 为 `0`

### Requirement: 任务关联率

系统 SHALL 计算 `stats.taskLinkedRatio` 为全部 subject 中 `task !== null` 的占比（0-1），`stats.totalSubjects` 为 subject 总数。当 `totalSubjects` 为 `0` 时 `taskLinkedRatio` SHALL 为 `0`。该口径按"是否已关联任务"而非起源统计：chat 起源的 subject 在补建任务后 SHALL 计入分子。

#### Scenario: 存在已关联与未关联任务的脉络

- **WHEN** 共有 N 个 subject，其中 M 个 `task !== null`
- **THEN** `taskLinkedRatio` 为 `M / N`，`totalSubjects` 为 `N`

### Requirement: 治理演化取数口径

系统 SHALL 通过 git CLI（使用 `cross-spawn`，`cwd: projectPath`，10 秒超时）计算 `governance`。`specsGrowth` SHALL 为近 8 周 specs 存量趋势：对每个周末时刻用 `git rev-list -1 --before=<weekEnd> HEAD` 取快照 commit，再用 `git ls-tree -d --name-only <sha> openspec/specs/` 计当时目录基数。`recentGuidelines` SHALL 为 `guidelines/` 最近 5 条提交记录（按提交日期倒序，每文件取最近一次），`guidelinesLastUpdated`（位于 `stats`）SHALL 为 `guidelines/` 最近一次提交的 ISO 日期。

#### Scenario: 正常 git 仓库

- **WHEN** 项目是 git 仓库且有提交历史
- **THEN** `specsGrowth` 返回 8 个 `{ weekStart, cumulativeCount }` 桶，`recentGuidelines` 返回最多 5 条 `{ fileName, lastCommitDate, lastCommitMessage }`

#### Scenario: 非 git 仓库或 git 不可用

- **WHEN** 项目不是 git 仓库，或 git 未安装，或 git 命令超时
- **THEN** `specsGrowth` 返回 `[]`，`recentGuidelines` 返回 `[]`，`stats.guidelinesLastUpdated` 返回 `null`，不阻断整体概览返回

### Requirement: 治理查询缓存

系统 SHALL 对治理演化（git 查询）结果按 `projectPath` 加 60 秒 TTL 内存缓存；缓存命中时不重复执行 git 命令。仓库文件系统扫描与 lineage 投影部分 SHALL 每次实时读取，不进入该缓存。

#### Scenario: 60 秒内重复进入概览页

- **WHEN** 同一 `projectPath` 在 60 秒内多次调用 `overview:getProjectOverview`
- **THEN** 治理部分复用缓存结果，不重复执行 git 命令；stats 与 lineage 部分仍实时计算

### Requirement: 概览页归档提案卡提供提案列表入口

概览页 `OverviewStatsBar` 中的「归档提案」统计卡（`key: "archives"`）SHALL 为可点击交互元素，点击后路由跳转至 `/proposal` 列表页。该卡 SHALL 提供与其他可点击概览卡片一致的 hover 视觉反馈与无障碍语义（可聚焦、键盘可触发）。其余三张统计卡（能力规约、项目准则、溯源覆盖）SHALL 保持纯展示，无点击交互。

#### Scenario: 点击归档提案卡进入列表页

- **WHEN** 用户点击概览页 `OverviewStatsBar` 的「归档提案」统计卡
- **THEN** 路由跳转至 `/proposal` 列表页

#### Scenario: 其他统计卡无跳转

- **WHEN** 用户点击「能力规约」「项目准则」或「溯源覆盖」统计卡
- **THEN** 不触发路由跳转
