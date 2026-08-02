## Why

Project → Workspace cutover 已稳定运行，但成功迁移后仍长期保留 `<appData>/projects/**`、legacy meta 与 `legacyAppDataKey`，启动门禁也依赖这些旧输入复验目标。现在 multi-root 的运行期、proposal、Cortex 与 automation 均已完成 Workspace/Folder 所有权切换，可以用一个更晚、可重试的 settlement migration 修复可证明的残缺目标并安全退役唯一归属的 legacy Project storage。

## What Changes

- 新增一个显式注册、晚于现有 Workspace/Cortex migrations 的 required settlement migration；它复用已发布 cutover 的幂等转换来补齐可明确恢复的目标，不修改或重新登记旧 migration ID。
- 为该 migration 增加 opt-in `retry-until-success` 执行策略：失败尝试保留在现有 `migrations.json` 账本中，后续启动只重试这个明确声明为可重试的新 migration；其他历史 failed migration 继续不自动重试。
- settlement 在任何删除前验证 Workspace/Folder 目标和可唯一归属的 provenance；仅以持久化 `legacyAppDataKey` 删除对应 legacy source 和同 ID legacy meta，成功后清除该字段。
- 保留所有无 provenance 数据，包括 candidate-key 碰撞组、历史目录与无法归属 orphan；不得按 Workspace ID、当前 Folder path、目录扫描或重新编码结果扩大删除范围。
- 将 bootstrap gate 切换到新的 settlement migration：fresh install baseline 可通过；升级安装只有 settlement success 才进入正常 runtime，failed/pending 显示包含最新尝试原因和“下次启动会重试”的原生阻塞诊断后退出。
- 更新 multi-root 设计 §23、迁移 guideline 与聚焦测试；不运行完整 `pnpm build`，不启动 `pnpm dev`。

## Capabilities

### New Capabilities

- `legacy-project-storage-retirement`: 定义可重试 settlement、唯一 provenance 清理、碰撞/orphan 保留、账本诊断与幂等恢复契约。

### Modified Capabilities

- `workspace-storage-cutover`: 将启动 required gate 从保留 legacy source 的初始 cutover 推进到更晚 settlement，并明确旧 source 的保留终点与失败重试提示。

## Impact

- Main migration framework：`src/main/migrations/{types,runner,index}.ts`、`src/main/migrations/scripts/index.ts` 与一个新的 settlement migration 文件。
- Legacy/Workspace storage：`src/main/migrations/{legacy-project-store,legacy-project-path}.ts`、Workspace/Folder store，以及已有 Project-to-Workspace cutover 的可复用入口。
- Bootstrap：`src/main/bootstrap/index.ts`、`src/main/bootstrap/workspace-upgrade-failure.ts`，不改变 migration 前的单实例门与正常启动顺序。
- Tests/docs：`test/main/migrations/**`、`test/main/bootstrap/**`、`guidelines/DataMigrations.md`、`references/designs/multi-root-workspace/README.md`。
- 不影响 renderer IPC、Workspace/Folder runtime identity、repository-owned data、共享 Folder registry、用户显式永久删除契约或无法证明归属的 legacy orphan。
