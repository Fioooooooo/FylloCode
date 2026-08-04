## Context

`20260803_001_cortex-workspace-scope` 负责把 Workspace-owned lineage subject 投影成 Workspace lineage v2 composite index，并为 proposal/commit 建立 Folder-owned reverse origin。legacy subject 中的 proposal link 只有 `changeId`；当前迁移仅接受已经携带 `folderId` 的 link，其他 link 写入 `LINEAGE_OWNER_MISSING` 后跳过。运行期 `lineage-store` 则要求 `LineageProposalLink.folderId` 非空并过滤不完整 link，因此被跳过的数据不会进入 Chat EventRail、Overview 或 Lineage Browser。

该迁移及 multi-root 能力尚未发布，没有外部升级用户。迁移 ID 已在开发者本地账本中执行成功，但可以在产品代码中直接修正原脚本；开发者本地数据通过一次性临时脚本修复，不为尚未发布的缺陷增加正式 repair migration。

约束：

- owner 必须由稳定 Workspace/Folder identity 与 repository evidence 证明，不得采用 primary Folder 猜测。
- 已发布的 `20260802_001_project-to-workspace` 与 `20260804_001_retire-legacy-project-storage`、migration runner/ledger schema 和启动时序保持不变。
- 正常运行期继续只接受完整 `ProposalRef { folderId, changeId }`；修复发生在迁移阶段，不向 renderer 暴露 ownerless 兼容类型。
- 迁移必须保留 subject 无关字段、稳定遍历、幂等重放，并让写失败抛出。

## Goals / Non-Goals

**Goals:**

- 在 Folder Workspace 中用唯一可用成员补全 ownerless proposal link。
- 在 Collection Workspace 中仅用唯一 active/archive proposal repository evidence 补全 owner。
- 将补全后的 subject、Workspace composite index 与 Folder reverse index保持一致，使现有严格 reader 自然恢复关联展示。
- 为已经执行过旧迁移的开发者本地数据提供可预览、可备份、目标受限的一次性修复方法。

**Non-Goals:**

- 不增加新的正式 migration ID，也不改变 runner 的跳过、重试、baseline 或 required gate 语义。
- 不用 primary Folder、Workspace 名称、path encoding、Git commit 猜测无法唯一证明的 owner。
- 不改变 IPC/preload API、shared `ProposalRef`、renderer 匹配逻辑或正常运行期 lineage 写入。
- 不把本地修复脚本提交、打包或作为长期维护命令发布。

## Decisions

### 1. 直接修正未发布的 `20260803_001`，不新增前向 repair migration

multi-root 迁移尚未发布，外部用户不存在“旧脚本已记账”的兼容负担。保留 migration ID 与注册顺序，只修正 `migrateCortexWorkspaceScope()` 的 lineage owner 解析，能让首次升级直接得到正确数据，避免产品永久携带只服务开发阶段错误的迁移。

替代方案是新增 `20260804_002`。该方案会让未来首次升级先执行已知错误逻辑、再修复，并扩大迁移链与测试面，因此不采用。开发者本地已执行记录由一次性脚本处理。

### 2. owner 解析分为唯一成员证据与唯一 repository evidence

为 `migrateLineage()` 传入 Workspace meta 与 `availableFolderIds()` 已验证的 Folder `{ folderId, folderPath }`：

- `meta.kind === "folder"` 且恰有一个可用成员时，直接返回该成员；Folder Workspace 的 repository ownership 已由稳定 Workspace 定义证明。
- 其他情况对每个可用 Folder 调用现有 `resolveChangeDirAnywhere(folderPath, changeId)`，复用 active、带日期前缀 archive 与 linked worktree 的 proposal 定位规则。恰有一个 Folder 命中时返回它。
- 零命中或多个 Folder 命中时不返回 owner，保留原 proposal link，并写入包含 `changeId` 与原因的 `LINEAGE_OWNER_MISSING` warning。

只有通过 `isSafeId()` 的 `changeId` 参与 repository evidence 查询；已有合法 `folderId` 的 link 不重新归属。这个规则避免复制 OpenSpec archive 命名逻辑，也不依赖 primary Folder。

### 3. 先补全 subject，再从补全结果重建 indexes

迁移逐个读取 raw subject，在内存中只为可证明 owner 的 proposal link增加 `folderId`，保留 link、proposal、subject 的所有其他字段和数组顺序。文件发生变化时使用注入的 `writeFileAtomically()` 写回。随后使用同一份补全结果生成 Workspace `lineage/index.json` 与 Folder reverse indexes。

如果任意写入失败，错误继续抛给 runner；重放时已有 `folderId` 的 subject与 `relationEquals()` 保证不重复。跨多个文件无法形成单一文件系统事务，因此按“subject 是事实源、indexes 可重建”的既有优先级写入；部分失败后再次执行可收敛。

替代方案是在 reader 中动态按裸 `changeId` 匹配。该方案会让不完整持久化格式进入共享类型和多个 UI 投影，且每次读取都可能随 Workspace membership 变化而选择不同 owner，因此不采用。

### 4. 本地修复使用临时、目标显式的独立脚本

Apply 阶段在 `/private/tmp/fyllocode-repair-ownerless-lineage.mjs` 生成一次性 Node 脚本，固定要求显式传入 `--data-root`、`--workspace-id` 与 `--folder-id`，默认只输出将修改的 subject/proposal/index，不写文件。`--apply` 模式必须：

1. 验证 Workspace meta 为 `kind: "folder"`、唯一成员等于目标 Folder，且 Folder meta path 可访问。
2. 验证 FylloCode 已完全退出；若无法证明则停止并提示用户关闭应用。
3. 在 `/private/tmp/fyllocode-ownerless-lineage-backup-<timestamp>/` 备份目标 Workspace lineage、目标 Folder lineage 与原 migration warning 文件。
4. 为该 Workspace 全部 ownerless proposal links 补入目标 `folderId`，重建 Workspace/Folder indexes，并从原 migration warning 文件移除与已修复 `{subjectPath, changeId}` 精确对应的 `LINEAGE_OWNER_MISSING`；不修改 migration ledger或其他 warning。
5. 重新读取文件，验证所有原 ownerless link 已补全、composite keys 与 reverse relations 存在、已修复 warning 不再残留，并报告备份路径。

脚本只为当前开发者已记账数据服务，运行并验证后删除；它不进入 Git、构建产物或应用命令。对 app-data 的 `--apply` 执行必须在 Apply 阶段再次取得用户的外部写入授权。

## Risks / Trade-offs

- [Collection 中同名 proposal 出现在多个 Folder] → 视为歧义并保留 ownerless link与 warning，不选择 primary 或首个扫描结果。
- [Proposal 已从所有 repository/worktree 删除] → repository evidence 为零命中，保留原数据；Folder Workspace仍可依靠唯一成员证明 owner。
- [subject 写回成功而 index 写入失败] → 写错误必须抛出；subject 仍是事实源，迁移的幂等重放可重建 indexes。
- [两个 Workspace 为同一 proposal 建立 origin] → reverse index保留首个稳定 origin并记录 `LINEAGE_ORIGIN_CONFLICT`，不得覆盖；Workspace subject/index仍保持自身 owner-qualified link。
- [本地修复时应用仍在运行] → 脚本停止，不与主进程 app-data writer 并发；apply 前保留完整目标备份。
- [临时脚本与产品迁移逻辑漂移] → 脚本只实现当前 Folder Workspace 的唯一成员案例，并以修正后迁移测试所用的 key/relation规则为验收基准；不尝试复刻 Collection 解析。

## Migration Plan

1. 在 linked worktree 完成 delta spec、原迁移修正和聚焦测试。
2. 运行迁移测试、Node typecheck、lint/format 等相关质量门；`pnpm build` 仅在获得项目要求的明确批准后运行。
3. 在产品代码合并前使用临时脚本 dry-run 当前开发者 Workspace，核对预计修复的 ownerless links。
4. 按用户选择，把已验证脚本保留在 `/private/tmp/fyllocode-repair-ownerless-lineage.mjs` 并提供精确命令；用户退出 FylloCode 后在 Terminal 手动执行 `--apply`。
5. 脚本在 apply 时先备份，再验证 `subject-I9zgvgwv5B` 等 subject、Workspace index、Folder reverse index、warning cleanup 与 migration ledger 不变性；成功后自删除脚本并在 JSON 输出中报告备份目录。若验证失败，脚本保留且用户可从备份恢复。

回滚产品变更时恢复迁移实现与 delta spec即可，因为功能尚未发布。开发者本地数据已补入的 `folderId` 符合当前严格 schema，即使代码回滚也仍可读取；如需原样回滚，则从脚本报告的备份目录恢复。

## Open Questions

无。需求范围、未发布状态、owner 证明规则与本地数据处置均已确认。
