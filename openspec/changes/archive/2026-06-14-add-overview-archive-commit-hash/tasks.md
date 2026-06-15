## 1. 归档提交索引

- [x] 1.1 新增 `src/main/services/overview/archive-commit-index.ts`，导出 `ArchiveCommitInfo` 与 `buildArchiveCommitIndex(projectPath: string, changeIds: Iterable<string>): Promise<Map<string, ArchiveCommitInfo>>`；扫描 `openspec/changes/archive/` 将 `YYYY-MM-DD-<changeId>` 目录映射回原始 `changeId`，并仅处理调用方传入的 changeId 集合。
- [x] 1.2 在 `archive-commit-index.ts` 中使用 `cross-spawn` 执行 Git 查询，定位 `openspec/changes/archive/<archivedChangeId>/.openspec.yaml` 在当前历史中的新增提交 hash；Git 不可用、非 Git 仓库、锚点文件未提交或命令失败时返回空 map/跳过对应条目，不向 `overview:getProjectOverview` 抛错。
- [x] 1.3 确保 archive commit index 是批量构建：`computeRecentLineages` 调用前最多构建一次 index，并在内存中按 proposal `changeId` join；不得在 subject/proposal 的 map 循环中逐条 spawn Git。

## 2. Overview 投影

- [x] 2.1 修改 `src/main/services/overview/overview-service.ts#computeRecentLineages`，先收集最近 10 个 subject 下所有 proposal `changeId`，调用 `buildArchiveCommitIndex`，并按优先级计算 `proposalStatus`：active change 命中为 `"applying"`，否则 commit index 命中为 `"merged"`，否则为 `"pending"`。
- [x] 2.2 修改 `computeRecentLineages` 返回的 `archiveCommitHash`：`"applying"` 与 `"pending"` 返回 `null`，`"merged"` 返回当前 Git 历史中可达的 archive commit hash；`mergeCommitUrl` 本次仍固定为 `null`。
- [x] 2.3 将 `src/shared/types/overview.ts` 中最近脉络字段和类型命名为 `ProjectOverview.recentLineages` / `RecentLineage`，并通过注释明确 `archiveCommitHash` 是当前 Git 历史派生值而非 lineage 持久字段。

## 3. 测试

- [x] 3.1 更新 `test/main/services/overview/overview-service.spec.ts`，mock `buildArchiveCommitIndex`，覆盖 active change 优先于 archive commit、commit 命中时返回 `"merged"` 与 hash、未命中时保持 `"pending"`。
- [x] 3.2 新增或扩展 `test/main/services/overview/archive-commit-index.spec.ts`，覆盖 archive 目录名解析、只处理传入 changeIds、Git 查询失败降级、锚点文件未提交返回空结果。
- [x] 3.3 运行 `pnpm vitest run test/main/services/overview/overview-service.spec.ts` 与新增的 archive commit index 测试；若修改共享类型注释或类型结构，再运行 `pnpm typecheck`。

## 4. 文档与规范同步

- [x] 4.1 核对 `guidelines/IPC.md` 的 Overview Channels 描述是否仍准确；如果实现改变了 `ProjectOverview` DTO 语义但不改变 channel 入口，补充 `RecentLineage.archiveCommitHash` 为 Git 派生字段的说明。
- [x] 4.2 核对 `guidelines/DataModel.md` 的 Project Lineage 章节无需新增 commit 持久字段；若实现中误引入 lineage 持久化字段，应撤回该方向并保持本 proposal 的读时派生契约。

## 5. 命名统一

- [x] 5.1 将共享 DTO 统一为 `ProjectOverview.recentLineages` / `RecentLineage`，并同步 `src/shared/types/overview.ts`、`src/main/services/overview/overview-service.ts`、`src/renderer/src/stores/overview.ts`。
- [x] 5.2 将渲染组件统一为 `src/renderer/src/components/overview/OverviewRecentLineages.vue`，同步页面 import、prop 名称、data-test 和局部变量命名。
- [x] 5.3 更新 main/renderer 测试、`guidelines/IPC.md` 与本 change 的 proposal/design/spec，确保当前代码与未归档规范中使用 lineage 术语。
