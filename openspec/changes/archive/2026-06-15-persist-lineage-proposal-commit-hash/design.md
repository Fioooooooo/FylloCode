## Context

lineage 的权威数据写在 `<userData>/projects/<encoded(projectPath)>/lineage/subjects/<subjectId>.json`，`index.json` 是从 subjects 派生的反查索引。当前 `LineageProposalLink` 只包含 `changeId` 与 `createdAt`，overview 通过 `buildArchiveCommitIndex(projectPath, changeIds)` 在查询时从 Git 当前历史推导 `RecentLineage.archiveCommitHash`，并且现有文档明确该 hash 不写入 lineage。

本次需求改变了该契约：overview 在发现 proposal 缺少 commit hash 时仍从 Git 获取，但只要获取成功就应持久化到 lineage subject，并在 `index.json` 中增加 `commitHashes: Record<commitHash, subjectId>` 反查关联。若 Git 查不到，则不修改持久化数据。

## Goals / Non-Goals

**Goals:**

- 将已知 proposal 归档提交 hash 写入 `Subject.links[].proposals[].commitHash`，缺失时保持字段缺省。
- 将 `LineageIndex` 扩展为包含 `commitHashes: Record<string, string>`，由 subject proposal `commitHash` 派生。
- 在 overview 查询 recent lineages 时优先使用持久化 `commitHash`；仅对缺失 hash 的非进行中 proposal 批量查询 Git，并在查到后回写。
- 保持旧 subject 与旧 index 可读：旧 proposal 缺少 `commitHash`、旧 index 缺少 `commitHashes` 时均正常归一化。

**Non-Goals:**

- 不实现 rebase、amend、squash 后对既有 `commitHash` 的自动感知或覆盖更新。
- 不新增按 commit hash 查询的 IPC 或 UI。
- 不修改 `buildArchiveCommitIndex` 的 Git 锚点查找口径，仍以 `openspec/changes/archive/<archivedChangeId>/.openspec.yaml` 新增提交为准。

## Decisions

### 1. `commitHash` 存在 subject，`commitHashes` 存在 index

`Subject.links[].proposals[]` 新增 `commitHash?: string`，仅当已知且为非空字符串时序列化。`LineageIndex` 新增 `commitHashes: Record<string, string>`，键为 commit hash，值为 subject id。

选择该结构是因为 subject 是权威账本，能保存每个 proposal 的精确信息；index 是派生反查表，适合保留用户指定的 `commitHash -> subjectId` 关联。没有选择只写 index，因为 index 可重建，不能成为唯一来源。

### 2. 旧数据不迁移，读取时兼容

`lineage-store.normalizeProposalLink` 读取旧 proposal 时将缺失 `commitHash` 归一为 `undefined`。`normalizeIndex` 读取旧 index 时将缺失 `commitHashes` 归一为空对象 `{}`。`LineageIndex.version` 保持 `1`，因为这是向后兼容的字段新增，并且 index 可从 subjects 重建。

`subjects/*.json` 是账本类数据，但本次只新增可选字段，不重命名、不删除、不改变现有字段类型，因此不需要迁移脚本。后续实现仍要补 storage 测试证明旧数据可读。

### 3. 增加 lineage service 的幂等写入 API

在 `src/main/services/lineage/lineage-service.ts` 增加 `recordProposalCommitHash(projectPath, changeId, commitHash): Promise<Subject | null>`：

- 通过 `index.proposals[changeId]` 找到 subject。
- 找不到 subject 或 subject 内找不到对应 proposal 时返回 `null`，不创建 subject。
- 找到且 proposal 没有 `commitHash` 时写入该 hash，并通过既有 `writeSubjectWithIndex` 同步 subject 与 index。
- 找到且 proposal 已有相同 `commitHash` 时保持幂等，并确保 index 可被当前 subject 重新 merge。
- 找到但 proposal 已有不同 `commitHash` 时不覆盖；overview 查询路径不负责修正历史改写。

领域层可在 `src/main/domain/lineage/subject.ts` 增加纯函数 `attachProposalCommitHash(subject, changeId, commitHash, now)`，避免把数组更新逻辑写在 service 里。

### 4. overview 只对缺失 hash 的 proposal 查 Git

`computeRecentLineages` 应先读取 recent subjects，并把每个 subject 的状态分为：

1. 若任一 proposal 是 active change，状态仍为 `applying`，`archiveCommitHash` 为 `null`，不查询、不写入该 active proposal。
2. 否则，若任一 proposal 已有 `commitHash`，状态为 `merged`，`archiveCommitHash` 为该持久化值。
3. 否则，收集缺失 `commitHash` 的 proposal changeId，调用一次 `buildArchiveCommitIndex(projectPath, missingChangeIds)` 批量查询 Git。
4. 对 Git 查到的 hash 调用 `recordProposalCommitHash` 写回 lineage；写回失败只记录日志，不阻断 overview 返回。
5. Git 查不到或 Git 不可用时保持 `pending` 与 `archiveCommitHash: null`，不写入持久化数据。

这保留现有“Git 查询失败不阻断 overview”的用户体验，同时让成功查询到的 hash 逐步沉淀到 lineage。

## Risks / Trade-offs

- 同一个 commit 可能归档多个不同 subject 的 proposal，而 `commitHashes: Record<commitHash, subjectId>` 只能保存一个 subject id。按用户指定结构实现；当前没有按 commit hash 查询能力，因此该限制只影响未来能力设计。
- 既有 `commitHash` 不自动重算，rebase/squash 后可能展示旧 hash。该限制是本次明确的 non-goal；未来可通过仓库监控或显式刷新机制处理。
- overview 查询路径新增持久化写入副作用。缓解方式是只在 Git 成功查到缺失 hash 时写入，写入失败不阻断读取，并复用 lineage service 的原子写和 per-file 写锁。

## Migration Plan

- 不新增迁移脚本。
- 读取旧 `subjects/*.json` 时缺失 `commitHash` 被视为未知。
- 读取旧 `index.json` 时缺失 `commitHashes` 被视为空对象；下次 subject 写入或 `rebuildIndex(projectPath)` 会生成包含 `commitHashes` 的新 index。
- 回滚时，旧代码会忽略 subject 中未知的 `commitHash` 字段；若旧代码无法识别 `index.commitHashes`，index 可删除后由旧代码按旧结构重建。
