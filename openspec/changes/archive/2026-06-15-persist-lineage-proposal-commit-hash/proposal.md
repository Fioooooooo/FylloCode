## Why

当前概览页只能在查询时从 Git 历史临时推导 proposal 对应的归档提交 hash，lineage 持久化结构本身没有记录该关联。结果是每次打开概览都要重复依赖 Git 回显，且 lineage 数据无法作为 proposal 已落地提交的长期线索。

## What Changes

- 在 lineage subject 的 proposal link 中增加可选 `commitHash` 字段；未知时保持缺省，已获取时写入 `subjects/<subjectId>.json`。
- 在 `lineage/index.json` 增加 `commitHashes: Record<commitHash, subjectId>` 派生反查表；该索引从 subject 的 proposal `commitHash` 重建。
- 概览页查询 recent lineages 时，若 proposal 已有 `commitHash`，直接用持久化值计算 `mergeCommitSha` 与 `mergeStatus`。
- 概览页查询 recent lineages 时，若 proposal 缺少 `commitHash` 且不属于进行中变更，则批量从当前 Git 历史查找归档锚点提交；查到后写回 subject 和 index，查不到则不写入。
- 本次不实现 rebase、amend、squash 后的 hash 变更感知或自动修正；已有持久化 `commitHash` 不会被 overview 查询路径主动覆盖。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `project-lineage-model`: lineage proposal link 与 index 持久化结构新增 commit hash 关联，并新增幂等写入语义。
- `project-overview`: recent lineage 的归档提交 hash 从“每次纯 Git 派生”改为“优先使用 lineage 持久化值，缺失时查询 Git 并回写”。

## Impact

- 共享类型：`src/shared/types/lineage.ts`、`src/shared/types/overview.ts`。
- lineage 存储与领域逻辑：`src/main/infra/storage/lineage-store.ts`、`src/main/domain/lineage/index-derive.ts`、`src/main/domain/lineage/subject.ts`、`src/main/services/lineage/lineage-service.ts`。
- overview 聚合：`src/main/services/overview/overview-service.ts` 复用现有 `buildArchiveCommitIndex` Git 批量查询能力。
- 测试：更新 lineage storage/service/domain 与 overview service 测试。
- 文档：同步更新 `guidelines/DataModel.md` 与 `guidelines/IPC.md` 中关于 lineage index 和 overview hash 持久化的描述。
