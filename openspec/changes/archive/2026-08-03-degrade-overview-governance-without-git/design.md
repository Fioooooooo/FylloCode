## Context

`getProjectOverview(workspaceId)` 通过 `aggregateWorkspaceRepositories()` 对每个 Project 执行 `readFolderGovernance()`。该 leaf reader 使用一个 `Promise.all` 同时读取 proposal、spec/archive/guideline 数量和 `getGitGovernance()`；后者通过 `git rev-list`、`git ls-tree` 与 `git log` 生成规约增长和准则演化。任何 Git 命令失败都会让整个 leaf reader 抛错，Project 随即变成 `RepositoryFolderResult.status = "error"`，即使目录和其他文件系统治理数据都可正常读取。

Project 模型允许普通非 Git 工程目录，Chat 等 Workspace-owned 能力不要求 Git。Proposal/worktree owner 仍是明确的 repository-specific 能力，继续要求有效 Git repository。本变更只调整 Overview 对“没有 Git history”与“Git history 读取异常”的分类，不放宽 proposal runtime 或 repository target 校验。

## Goals / Non-Goals

**Goals:**

- 普通非 Git Project 与尚无首个 commit 的 Git Project 不再让 Overview Folder governance reader 失败。
- 只为 Git history 派生字段提供默认值，同时保留 specs、archives、guidelines 和 proposal 的文件系统读取结果。
- 将预期的“没有 history”与 Git 仓库损坏、权限、进程启动和超时等真实故障分开。
- 保持现有 `ProjectOverview`、`RepositoryGovernanceSnapshot` 和 `GovernanceEvolution` 类型，不新增 IPC/schema 字段。

**Non-Goals:**

- 不让非 Git Project 成为 proposal/worktree owner，也不改变 `resolveRepositoryTarget()` 的 `REPOSITORY_NOT_GIT` 行为。
- 不为非 Git Project 伪造规约增长曲线、准则提交时间或 archive commit hash。
- 不吞掉具有 Git metadata 和有效 HEAD 的 repository 在 history 命令中发生的异常。
- 不调整 Overview 布局、文案或其他 repository browser 的 missing/error 语义。

## Decisions

### 1. 先分类 Git history availability，再运行历史统计

在 `src/main/services/insight/overview/git-stats.ts` 增加可测试的 history availability probe，区分：

- Project 根没有 `.git` 文件或目录：`unavailable`，表示普通非 Git Project；
- `.git` 存在，但 `git rev-parse --verify --quiet HEAD` 以“引用不存在”的预期状态结束：`unavailable`，表示尚无首个 commit；
- `.git` 存在且 HEAD 可解析：`available`；
- `.git` 访问出现非 ENOENT I/O 错误，或 Git probe 出现损坏、权限、启动/超时等非预期错误：抛出原错误。

probe 不通过解析本地化 stderr 文本识别状态；应保留 Git 进程 exit code，使 `--verify --quiet HEAD` 的“无引用”状态可与其他错误区分。`.git` 既允许 directory，也允许 linked worktree 使用的 file。

选择显式 probe，而不是捕获 `getGitGovernance()` 的任意异常并返回空值，因为后者会把仓库损坏、权限和 Git executable 问题静默伪装成合法无历史。

### 2. 默认值使用现有空态，不伪造历史数据

history unavailable 时，`getGitGovernance()` 返回：

- `specsGrowth: []`；
- `recentGuidelines: []`；
- `guidelinesLastUpdated: null`。

`computeSpecsThisMonth([])` 自然得到 `0`。因此 Overview 现有组件继续显示规约增长和准则演化的无数据状态；当前 specs、archives、guidelines 数量与 proposal 仍从文件系统读取，Project leaf reader 成功并保持 `ready`。

默认结果不进入现有 60 秒 Git governance cache，使用户执行 `git init` 并产生首个 commit 后，下次 Overview load 可以立即发现 history；已有 history 的成功统计继续沿用当前 cache。

不采用“用当前 specs 数量填充八周相同柱形”的替代方案，因为这会伪造不存在的历史趋势。

### 3. Archive commit 追溯沿用 null 降级，并避免预期噪声

`buildArchiveCommitIndex()` 已在 Git log 失败时返回空 Map，最终投影为 `archiveCommitHash: null`。实现应复用同一 availability probe：history unavailable 时直接返回空 Map，不记录 failure warning；history available 后的 Git log 异常继续记录 warning 并返回空 Map，保持 recent lineage 不因 enrichment 失败而不可用。

不改变 `RecentLineage.archiveCommitHash` 类型或 persisted commit 优先级。

### 4. Repository completeness 继续只表达真正未读取的治理数据

非 Git 或无 commit Project 的文件系统治理 snapshot 仍完整，因此 aggregate `status` 为 `ready`，不会进入 `excludedFolderIds`，Workspace 不显示“Repository 治理数据不完整”。如果有效 Git repository 的 history 查询发生真实异常，leaf reader 仍抛出，现有 aggregate helper 将其标记为 `error / partial`。

## Risks / Trade-offs

- [Risk] `.git` 在 probe 后被删除或 HEAD 同时变化，产生 TOCTOU → 后续 Git 命令仍按真实结果成功或抛错；不通过宽泛 catch 改写为默认值。
- [Risk] 用户首次 commit 后仍看到旧空态 → unavailable 结果不进入 60 秒 governance cache，下一次 load 重新 probe。
- [Risk] archive commit enrichment 对 non-Git Project 产生重复 warning → `buildArchiveCommitIndex()` 在 history unavailable 时直接返回空 Map，真实 Git 异常才记录 warning。
- [Trade-off] 非 Git Project 的 Overview completeness 为 complete，但演进区为空 → complete 表示可适用数据均已读取，不表示 Project 拥有 Git history；不伪造趋势数据。

## Migration Plan

无需数据迁移或 schema migration。Apply 时先增加 probe 与单元测试，再接入 governance 和 archive commit reader，最后运行 Overview Main 聚焦测试、全量测试、typecheck、lint 与格式检查。回滚只需恢复旧 reader 行为，不涉及持久化数据。

## Open Questions

无。默认字段、错误边界和 non-Git Project 的 `ready` 语义已在 Chat 阶段确认。
