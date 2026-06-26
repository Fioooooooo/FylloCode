## MODIFIED Requirements

### Requirement: 进行中变更投影

系统 SHALL 基于既有 `domain/proposal/openspec-reader.ts` 的 `readProposalFiles` 计算 `activeChanges`，过滤掉 `status === "archived"` 的条目，并将 `ProposalStatus` 映射为前端 `stage`：`creating → drafting`、`draft → proposal`、`applying → applying`。每个 `ActiveChange` SHALL 返回 `id` 与 `title`：`id` 为原始 changeId，用于打开 proposal 详情 Slideover；`title` 为 `readProposalFiles` 产出的展示标题（由 `toTitleCase(stripArchivePrefix(changeId))` 规则生成）。每个变更 SHALL 通过 lineage `getByProposal` 反查任务信息填充 `taskTitle` 与 `taskRef`，`taskRef` 保留 `source:` 前缀原样返回。

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

## ADDED Requirements

### Requirement: 概览页进行中变更打开 proposal 详情 Slideover

概览页进行中变更卡片 SHALL 使用 `ActiveChange.id` 打开 proposal 详情 Slideover，而不是导航到 proposal 详情路由。

#### Scenario: 点击进行中变更卡片

- **WHEN** 用户点击 Overview 进行中变更卡片
- **THEN** 应用打开 proposal 详情 Slideover，并传入该变更的 `ActiveChange.id`
- **AND** 当前路由保持 Overview 页面
- **AND** `router.push('/proposal/<id>')` SHALL NOT 被调用
