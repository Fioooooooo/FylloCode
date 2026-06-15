## 1. 共享类型与持久化读写

- [x] 1.1 修改 `src/shared/types/lineage.ts`：为 `LineageProposalLink` 增加 `commitHash?: string`，为 `LineageIndex` 增加 `commitHashes: Record<string, string>`；保持字段名使用 camelCase。
- [x] 1.2 修改 `src/main/infra/storage/lineage-store.ts`：`normalizeProposalLink` 仅接受非空字符串 `commitHash`，缺失或非法时归一为 `undefined`；`normalizeIndex` 将旧 index 缺失的 `commitHashes` 归一为 `{}`；`writeIndex` 序列化新字段且 `version` 保持 `1`。
- [x] 1.3 修改 `src/main/domain/lineage/index-derive.ts`：`deriveIndexEntries` 和 `buildIndexFromSubjects` 从 subject proposal 的 `commitHash` 派生 `commitHashes: Record<commitHash, subjectId>`，只登记非空 hash。
- [x] 1.4 更新 `test/main/infra/storage/lineage-store.spec.ts`：覆盖 subject proposal `commitHash` round-trip、旧 subject 缺字段可读、旧 index 缺 `commitHashes` 归一为 `{}`、新 index 写出 `commitHashes`。

## 2. Lineage 写入 API

- [x] 2.1 修改 `src/main/domain/lineage/subject.ts`：新增纯函数 `attachProposalCommitHash(subject, changeId, commitHash, now)`；当目标 proposal 无 hash 时写入并更新 `updatedAt`，已有相同 hash 时幂等，已有不同 hash 时不覆盖。
- [x] 2.2 修改 `src/main/services/lineage/lineage-service.ts`：新增导出函数 `recordProposalCommitHash(projectPath, changeId, commitHash): Promise<Subject | null>`，通过 `index.proposals[changeId]` 找 subject，复用 `attachProposalCommitHash` 和 `writeSubjectWithIndex` 同步 subject 与 `index.commitHashes`，未知 proposal 返回 `null`。
- [x] 2.3 更新 `test/main/services/lineage/lineage-service.spec.ts`：覆盖 `recordProposalCommitHash` 成功写入 subject/index、重复写入同 hash 幂等、已有不同 hash 不覆盖、未知 proposal 返回 `null`、`rebuildIndex` 可从 subject commitHash 重建 `index.commitHashes`。
- [x] 2.4 更新 `test/main/domain/lineage/projection.spec.ts` 或新增 domain 测试：证明 proposal link 的 `commitHash` 在投影/clone 中保留，不被丢弃。

## 3. Overview 查询与回写

- [x] 3.1 修改 `src/main/services/overview/overview-service.ts` 的 `computeRecentLineages`：active proposal 仍优先返回 `proposalStatus: "applying"` 与 `archiveCommitHash: null`；非 active proposal 先使用已持久化 `commitHash`；仅收集缺失 hash 的 changeId 调用一次 `buildArchiveCommitIndex(projectPath, missingChangeIds)`。
- [x] 3.2 在 `computeRecentLineages` 中对 Git 查到的缺失 hash 调用 `recordProposalCommitHash(projectPath, changeId, hash)`；写回失败只用 `logger.warn` 记录，不阻断 `getProjectOverview`，本次结果可返回已查到的 hash。
- [x] 3.3 更新 `test/main/services/overview/overview-service.spec.ts`：覆盖已持久化 hash 不查 Git、缺失 hash 查 Git 并调用 `recordProposalCommitHash`、active proposal 不写回、Git 未命中时保持 pending、写回失败仍返回成功。
- [x] 3.4 保持 `src/main/services/overview/archive-commit-index.ts` 的批量 Git 查询口径不变；若测试断言参数，确保只传缺失 hash 的 changeId。

## 4. 文档与共享注释

- [x] 4.1 更新 `src/shared/types/overview.ts` 中 `RecentLineage.archiveCommitHash` 的注释，移除“not persisted in lineage”的旧描述，改为说明优先来自 lineage 持久化值，缺失时由 overview 查询补齐。
- [x] 4.2 更新 `guidelines/DataModel.md` 的 Project Lineage 段落：说明 `LineageProposalLink.commitHash?: string`、`index.commitHashes`、旧数据兼容和 index 变更无需迁移脚本。
- [x] 4.3 更新 `guidelines/IPC.md` 的 Overview Channels 段落：将 `recentLineages[].archiveCommitHash` 从“查询时派生且不持久化”改为“优先读取 lineage 持久化 hash，缺失时查询 Git 并尽力写回”。

## 5. 验证

- [x] 5.1 运行 `pnpm vitest run test/main/infra/storage/lineage-store.spec.ts test/main/services/lineage/lineage-service.spec.ts test/main/domain/lineage/projection.spec.ts test/main/services/overview/overview-service.spec.ts`。
- [x] 5.2 运行 `pnpm typecheck`。
- [x] 5.3 运行 `pnpm lint`。
