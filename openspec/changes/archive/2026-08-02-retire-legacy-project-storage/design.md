## Context

现有 `20260802_001_project-to-workspace` required migration 已把运行期切到 Workspace/Folder，并为 candidate key 全局唯一的 migrated Workspace 保存 `legacyAppDataKey`。为了支持启动门禁复验和用户显式永久删除，首次 cutover 有意保留了 legacy Project meta 与 `<appData>/projects/**`。现在完整 multi-root 路径已经落地，长期双份存储只会增加歧义与误读风险。

当前 runner 对任何出现过的 migration ID 都永久跳过，包括 failed record；这对不可变历史迁移是安全默认，但不适合会执行多文件删除的最终 settlement。现有 `validateWorkspaceCutoverState()` 还通过重新读取 legacy meta 检查目标，因此一旦安全删除 legacy 输入，bootstrap gate 也必须转为信任新的 settlement record。

## Goals / Non-Goals

**Goals:**

- 用一个更晚且不可变的 migration ID 完成 cutover repair、目标验证与 legacy storage retirement。
- 只删除 `WorkspaceMeta.legacyAppDataKey` 已证明唯一归属的数据；无 provenance 的碰撞组和 orphan 永远不被批量 cleanup 认领。
- 让该 migration 的失败可以在下次启动自动重试，同时保持所有既有 migration 的失败不重试语义。
- 让 bootstrap gate、日志和原生失败 UI 报告 settlement 的最新尝试，并在成功清理后不再依赖 legacy meta。

**Non-Goals:**

- 不修改 `20260802_001_project-to-workspace.ts` 或 `20260803_001_cortex-workspace-scope.ts` 的 ID、已发布行为或账本记录。
- 不删除 `<appData>/projects/**` 整个目录，不扫描或猜测历史目录 owner，不清理 candidate-key 碰撞组。
- 不改变 Workspace 显式永久删除、Folder registry、repository lineage、window state 或 renderer IPC contract。
- 不引入新的 migration journal、rollback state machine 或后台 cleanup service。
- 不运行完整 `pnpm build`，不启动 `pnpm dev`。

## Decisions

### 1. 单一 settlement migration 串联 repair、preflight 与 cleanup

新增 `src/main/migrations/scripts/20260804_001_retire-legacy-project-storage.ts`（最终 ID 以文件名为准），显式注册在现有 migrations 之后。其 `migrate()` 顺序为：

1. 读取旧 cutover 的 latest status；只有旧 cutover 未成功时才调用其幂等迁移入口，补齐 source/target 一致且可明确恢复的 Workspace/Folder 与 Workspace-owned 数据。旧 cutover 已成功时不得重放，以免把之后合法变化的名称、时间戳或 tombstone 状态当成冲突；旧脚本内容和旧 ledger record 均不修改。
2. 重新读取 legacy projects、Workspace 与 Folder。初始 gate 的 exact validator 继续保留；settlement preflight 只验证稳定 identity、Folder Workspace 成员结构、target 存在性和 provenance，不要求 mutable 字段仍与历史 meta 相同。
3. 只为持有 `legacyAppDataKey` 的 Workspace 建立 cleanup plan，并验证 key 是安全 segment、legacy meta ID 与 Workspace ID 相同、目标 Workspace/Folder 完整。
4. 按稳定 Workspace ID 顺序逐项执行：幂等删除该 key 的 legacy source、删除同 ID legacy meta，最后保存移除 `legacyAppDataKey` 的 Workspace meta。

如果第 1–3 步有任何不确定或冲突，migration 在删除前失败。第 4 步中途失败时，已完成删除可由 `force`/missing-as-success 语义重放；尚未清除的 provenance 继续提供同一目标授权。provenance 必须最后清除，避免失败后丢失唯一删除授权。

替代方案是分成 repair 与 cleanup 两个 migration ID。这样第一个成功、第二个失败会让 gate 和诊断存在两个 required 状态，并增加部分完成组合；单一有序 migration 更容易以一个最新结果作为启动门禁。

### 2. Retry policy 是 migration opt-in，不改变历史失败行为

扩展 `Migration` 为可选 `retryPolicy?: "never" | "until-success"`，默认 `never`。`runMigrations()` 对默认 migration 继续在出现任意 record 后跳过；对 `until-success` migration，仅在该 ID 已存在 success record 时跳过，failed record 会在下一次启动追加新的 attempt。

`getRequiredMigrationStatus(id)` 必须读取同 ID 的最后一条 record，以便 failure UI 显示最新尝试；账本 schema 仍是原有 `executed: MigrationRecord[]`，不增加独立 journal。settlement 是当前唯一使用 `until-success` 的 migration。

替代方案是让所有 failed migration 自动重试。历史迁移可能不具备安全重放能力，会改变既有升级契约，因此拒绝。

### 3. 新 settlement record 成为 bootstrap required gate

`WORKSPACE_CUTOVER_SETTLEMENT_MIGRATION_ID` 从新脚本导出，并由 `src/main/migrations/index.ts` 暴露。`validateWorkspaceCutoverState()` 改为：

- 新安装由覆盖 settlement ID 的 baseline 通过，不要求任何 Workspace/Folder target；
- 升级安装要求 settlement 的最新 record 为 success；
- settlement failed/pending 返回结构化 issue，failed 使用最新错误；
- settlement success 后不再枚举 legacy meta 复验，因为受授权的 meta 已被删除，success 表示 migration 内部 preflight 与 cleanup 已完成。

旧 cutover 的 failed record 不被改写；只有新 settlement 实际成功才能取代它成为 runtime gate。若旧冲突仍存在，settlement 复用 cutover 时会再次失败并在下次启动重试。

### 4. 无 provenance 数据明确保留

Cleanup plan 的唯一授权输入是 persisted `legacyAppDataKey`。不持有该字段的 Workspace、candidate collision、历史路径目录、无法解析的 orphan 以及不对应 active legacy meta 的目录均不进入删除列表。migration 不使用 `encodeProjectPath(currentFolder.path)`、Workspace ID 或目录扫描补出 key，也不删除共享 `projects` 根目录。

这会有意留下无法安全归属的历史数据。相比误删其他 Workspace 共用或未知来源的数据，磁盘残留是可接受的保守取舍。

### 5. 失败 UI 保持阻塞，只更新 retry 事实

`showWorkspaceUpgradeFailure()` 仍只提供“打开日志目录”和“退出 FylloCode”，两条路径都退出；detail 增加 settlement 最新 attempt 与“修复底层问题后，下次启动会自动重试”的说明。bootstrap 仍在 MCP、IPC、workflow、窗口和 Agent warmup 前停止，不提供绕过 gate 的继续按钮。

## Risks / Trade-offs

- [Risk] cleanup 在删除 source 后、清除 provenance 前崩溃 → 删除 API 对 missing 使用 success，下一次重试会重复同一授权目标并最终清除 provenance。
- [Risk] 同一 legacy directory 同时承载 meta 与 encoded source，删除顺序互相影响 → cleanup helper 按显式 path 处理并让 meta/source missing 幂等；测试覆盖 `legacyAppDataKey === workspaceId` 与不同 key 两种布局。
- [Risk] retryable migration 无限阻塞损坏安装 → 原生 UI 暴露最新错误与日志路径，保留所有未获授权数据；修复文件权限或冲突后下次启动自动重试。
- [Risk] settlement success 后无法再从 legacy meta 复验 target → target 完整性检查是 migration success 的前置条件，ledger success 成为不可变证明；运行期继续由 Workspace/Folder schema 与 resolver 校验自身数据。
- [Risk] cleanup collision orphan 造成磁盘残留 → 这是不猜 owner 的明确安全边界，文档和日志报告 skipped 数量但不删除。

## Migration Plan

1. 扩展 runner 的 opt-in retry policy 与 latest-record 查询，保持默认 migration 测试不变。
2. 抽取 cutover target validator，新增 settlement migration 与可注入依赖的 focused tests。
3. 注册 settlement 为最后 migration，并把 bootstrap required gate/失败 UI 指向它。
4. 更新 §23 追踪与 `guidelines/DataMigrations.md`，执行 migration/bootstrap 聚焦测试、typecheck、lint、Prettier 和 `git diff --check`。

回滚应用版本不会恢复已安全删除的 legacy copy；旧版本不得再作为受支持运行期。Workspace/Folder 当前数据保持不变。settlement 未成功时 ledger 与剩余 provenance 支持新版本幂等重试。

## Open Questions

无。retry 仅 opt-in、新 settlement 单 ID、provenance-only 删除与 orphan 保留边界均已固定。
