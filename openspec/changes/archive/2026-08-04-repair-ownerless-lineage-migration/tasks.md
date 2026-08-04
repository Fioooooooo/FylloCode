## 1. 修正 owner 证明与 subject 迁移

- [x] 1.1 在 `src/main/migrations/scripts/20260803_001_cortex-workspace-scope.ts` 将 `availableFolderIds()` 扩展为返回已验证的 `{ folderId, folderPath }` evidence，并新增 owner 解析 helper：Folder Workspace 唯一成员直接命中；Collection Workspace 对安全 `changeId` 复用 `src/main/infra/proposal/openspec-reader.ts#resolveChangeDirAnywhere()`，仅接受唯一 Folder 命中，零/多命中返回带原因的未解析结果。
- [x] 1.2 修改 `migrateLineage()`，只为缺少有效 `folderId` 且 owner 已唯一证明的 proposal raw record补写 `folderId`，使用注入的 `writeFileAtomically()` 写回发生变化的 subject，并保留 subject/link/proposal 的无关字段、顺序与时间戳；未解析记录保持原样并产生 `LINEAGE_OWNER_MISSING`。
- [x] 1.3 让 Workspace composite index 与 Folder reverse indexes 从同一份补全后 subject 数据派生；保持现有 `relationEquals()` 幂等、首个 origin 保留、`LINEAGE_ORIGIN_CONFLICT` warning、稳定文件顺序与写失败抛出语义，不修改 migration ID、registry、runner、ledger 或 runtime lineage 类型。

## 2. 补齐迁移回归测试

- [x] 2.1 更新 `test/main/migrations/scripts/cortex-workspace-scope.spec.ts` 的单 Folder ownerless fixture，断言迁移写回 `folderId`、保留自定义字段、生成 `folderId\0changeId`/commit composite keys、写入 Folder reverse origin，且不产生 `LINEAGE_OWNER_MISSING`。
- [x] 2.2 在同一测试文件增加 Collection Workspace 唯一 evidence 覆盖，分别验证 active proposal、日期前缀 archive proposal 与 `.worktrees` linked proposal 能唯一选择正确 Folder，不选择 primary 或扫描顺序中的其他 Folder。
- [x] 2.3 增加零命中、多 Folder 同名命中、unsafe `changeId`、不可用 Folder、既有 owner、repository origin 冲突与无关字段保留测试；未证明 owner 时 subject保持原样、owner-qualified indexes 不含该 link、warning原因可区分且既有 origin 不被覆盖。
- [x] 2.4 增加完整重放与部分写入后重放测试，断言 subject 不重复变化、reverse relations 不重复、缺失 indexes 可从补全 subject 重建；保留现有原子写失败传播测试。

## 3. 质量验证

- [x] 3.1 在 linked worktree 首次运行项目命令前执行 `sh scripts/prepare-worktree-env.sh`，然后运行 `pnpm exec vitest run --project main test/main/migrations/scripts/cortex-workspace-scope.spec.ts`，全部迁移聚焦测试必须通过。
- [x] 3.2 运行 `pnpm typecheck:node` 与 `pnpm lint`，修复所有由本变更引入的类型、边界或格式问题；除非用户另行明确批准，不运行 `pnpm build`。
- [x] 3.3 检查 `git diff --check` 与 Proposal delta spec，确认没有新增正式 migration、public API、依赖或 renderer ownerless fallback，且 `guidelines/DataMigrations.md` 的唯一 owner 规则无需更新。

## 4. 修复开发者本地数据

- [x] 4.1 使用 `apply_patch` 在 `/private/tmp/fyllocode-repair-ownerless-lineage.mjs` 创建不入 Git 的临时 Node 脚本；脚本必须要求 `--data-root`、`--workspace-id`、`--folder-id`，默认 dry-run，并把所有目标文件、ownerless `{subjectId, changeId}`、index merge 与 warning cleanup 预览为 JSON。
- [x] 4.2 对 `/Users/tao/Library/Application Support/FylloCode`、Workspace/Folder `Users-tao-Work-projects-FylloCode` 运行 dry-run，确认包含 `subject-I9zgvgwv5B` / `optimize-app-startup-shutdown`，不写 app-data，并向用户报告预计修改数量。
- [x] 4.3 按用户选择把已 dry-run 的脚本保留在 `/private/tmp/fyllocode-repair-ownerless-lineage.mjs` 并提供精确手动命令；脚本在 `--apply` 时必须确认 FylloCode 已退出，先备份 Workspace lineage、Folder lineage 与 migration warning 到 `/private/tmp/fyllocode-ownerless-lineage-backup-<timestamp>/`，再补全全部 ownerless links、合并而非覆盖现有 reverse relations、重建 Workspace index、精确移除已修复 warning，且不得修改 migration ledger。
- [x] 4.4 用户退出 FylloCode 后在 Terminal 手动执行脚本；脚本重新读取 app-data 验证所有已修复 links、Workspace composite keys、Folder reverse relations、warning cleanup 与 migration ledger 不变性，报告可恢复备份路径，并在验证成功后自删除，保留备份供用户决定何时清理。
