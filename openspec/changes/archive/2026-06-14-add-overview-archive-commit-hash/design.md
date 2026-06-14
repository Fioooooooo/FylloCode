## Context

`ProjectOverview.recentLineages` 由 `src/main/services/overview/overview-service.ts#computeRecentLineages` 聚合 `lineage-service.listRecentSubjects(projectPath, 10)` 得到。每个 subject 只包含 lineage 中已记录的 `changeId`，而 archive 阶段可能通过两条路径发生：

- 用户在 proposal 详情页触发 `proposal:archive`，由 archive ACP session 调用 `archive-change`。
- 用户在普通 chat 中直接要求 agent 调用 `mcp__fyllo_specs__archive_change`。

归档提交 hash 不能稳定地通过 archive 流回写，因为 rebase 可能改写 hash，commit 失败后的人工解决耗时不可预测，且并非所有归档都会经过 `proposal:archive`。更稳定的事实来源是当前 Git 历史：如果 archived change 目录已经进入 main 历史，就可以从该目录的锚点文件反查当前可达的引入提交。

## Goals / Non-Goals

**Goals:**

- 将 overview 最近脉络 DTO 字段和类型统一命名为 `recentLineages` / `RecentLineage`，避免继续引入非领域术语。
- 在 overview 最近脉络列表中填充 `mergeCommitSha`，语义为“当前 Git 历史中引入该 archived change 的 commit hash”。
- 在存在可定位归档提交且不处于 applying 时返回 `mergeStatus: "merged"`。
- 批量构建 archive commit index，避免 recentLineages 列表展示时按 subject/proposal 执行 N 次 Git 查询。
- Git 查询失败、非 Git 项目、归档目录未提交时稳定返回 `null` / `"pending"`，不阻断 overview IPC。

**Non-Goals:**

- 不把 commit hash 写入 lineage `subjects/*.json`，不新增迁移脚本。
- 不修改 `archive-change` MCP tool 或 `proposal:archive` 流程。
- 不新增 MCP event、spool、pending reconciliation 队列。
- 不生成 `mergeCommitUrl`，远端 URL 推导仍保持 `null`。

## Decisions

### 1. commit hash 为读时派生字段

`RecentLineage.mergeCommitSha` 的权威来源不是 lineage 持久化字段，而是 `changeId + openspec/changes/archive/<date>-<changeId>/.openspec.yaml + Git 当前历史`。当人为 rebase 将 `c-hash-a` 改写为 `c-hash-b` 后，下一次 overview 查询应返回 `c-hash-b`，因为它才是当前 main 历史中可达的归档提交。

替代方案是 archive 阶段写入 hash 到 lineage。该方案会在 rebase、amend、squash 或人工恢复后产生过期 hash，并需要额外补偿机制，因此不采用。

### 2. 使用 archived change 的 `.openspec.yaml` 作为锚点

对每个 `changeId`，实现应扫描 `openspec/changes/archive/` 下形如 `YYYY-MM-DD-<changeId>` 的目录，并以该目录内 `.openspec.yaml` 作为锚点文件。Git 查询定位“当前历史中新增该锚点文件的 commit”，而不是定位 archive 目录的最近修改 commit，避免后续文档修订覆盖原始归档提交。

如果同一个 `changeId` 意外匹配多个 archived 目录，按目录名倒序选择最新目录，并记录 warn 日志。正常 OpenSpec archive 只应产生一个目录。

### 3. 批量构建 archive commit index

实现建议新增 `src/main/services/overview/archive-commit-index.ts`，暴露类似：

```ts
export type ArchiveCommitInfo = {
  changeId: string;
  archivedChangeId: string;
  hash: string;
  committedAt: string | null;
};

export async function buildArchiveCommitIndex(
  projectPath: string,
  changeIds: Iterable<string>
): Promise<Map<string, ArchiveCommitInfo>>;
```

该 helper 负责：

- 扫描 `openspec/changes/archive/`，建立 `changeId -> archivedChangeId`。
- 只对传入 `changeIds` 的交集做 Git 查询。
- 使用 `cross-spawn` 执行 Git，继承 overview 现有 git helper 的失败降级风格。
- Git 不可用、非 Git 项目、锚点文件尚未提交时返回空 map，不抛出到 overview IPC。

具体 Git 命令可以按锚点文件批量查询，也可以先用一次 `git log --diff-filter=A --format=... --name-status -- openspec/changes/archive` 构建项目级索引。无论实现选哪一种，对 `computeRecentLineages` 来说都必须是“一次构建 index，再内存 join”，不得在 subject map 循环里逐条 spawn Git。

### 4. mergeStatus 优先级

`computeRecentLineages` 的状态优先级为：

1. 任一 proposal 的 `changeId` 命中 `activeChanges[].id` 时，`mergeStatus = "applying"`，`mergeCommitSha = null`。
2. 否则，任一 proposal 能从 archive commit index 命中 hash 时，`mergeStatus = "merged"`，`mergeCommitSha = <hash>`。
3. 其余返回 `mergeStatus = "pending"`，`mergeCommitSha = null`。

如果一个 subject 下有多个已归档 proposal，选择 `subject.links[*].proposals` 中按出现顺序第一个能命中 commit index 的 proposal。后续如需要展示多个 commit，应另行扩展 DTO。

## Risks / Trade-offs

- [Risk] 非 Git 项目或尚未提交的 archive 目录无法定位 hash。 -> 降级返回 `null` 与 `"pending"`，不阻断 overview。
- [Risk] 历史被 squash 后 archived change 仍存在但新增锚点文件的 commit 与原 archive tool commit 不同。 -> 这是预期行为；字段语义是当前历史中的可达 commit。
- [Risk] `git log --diff-filter=A` 在极端重命名/手工搬目录历史下找不到锚点新增提交。 -> 返回 `null`，不引入补偿队列。
- [Risk] overview 每次刷新执行 Git 历史扫描可能有成本。 -> 只针对 recentLineages 里的 changeId 构建索引；如实现采用项目级扫描，可用 `HEAD` 作为内存缓存 key，但缓存不是权威源。
