## 1. 修复 overview-service 中的 proposalStatus 推导

- [x] 1.1 修改 `src/main/services/overview/overview-service.ts` 的 `computeRecentLineages`
  - 导入 `readProposalFiles` 和 `ProposalStatus`（来自 `@shared/types/proposal`）。
  - 在函数开头调用 `readProposalFiles(projectPath)` 读取所有 proposal，构建 `Map<string, ProposalStatus>` 映射。
  - 移除 `activeChanges` 参数（或保留但不再用于状态计算）。
  - 对每个 lineage 的所有 proposal，按规则映射状态后取最"活跃"的一个（`applying` > `pending` > `completed`）。
  - 状态映射辅助函数：`creating`/`draft` → `pending`，`applying` → `applying`，`archived` → `completed`，未知 → `pending`。
  - `archiveCommitHash` 的获取逻辑保持不变（仍从 `persistedCommitHash` 或 `archiveCommitIndex` 获取）。

- [x] 1.2 更新 `test/main/services/overview/overview-service.spec.ts`
  - 在 `readProposalFiles` 的 mock 返回中补充 `old-change`、`persisted-change`、`no-commit` 三个 proposal，状态分别为 `archived`、`archived`、`draft`。
  - 验证 `recentLineages` 的期望保持不变（因为修正后的映射结果与当前测试期望一致）。
  - 验证 `activeChanges` 的期望保持不变（`activeChanges` 逻辑不受本次修改影响）。

## 2. 修复 fyllo-cortex lineage-reader 中的 proposalStatus 推导

- [x] 2.1 修改 `src/mcp-servers/fyllo-cortex/src/utils/lineage-reader.ts`
  - 删除 `checkApplyingStatus` 函数。
  - 新增 `readProposalStatus(changeId: string)`：
    - 先检查 `openspec/changes/{changeId}/.openspec.yaml`，读取并正则匹配 `status:` 行。
    - 如果主目录不存在，检查 `openspec/changes/archive/{changeId}/.openspec.yaml`，存在则返回 `archived`。
    - 两处都不存在则返回 `null`。
  - 新增 `deriveLineageStatus(rawStatus: ProposalStatus | null)` 辅助函数，执行状态映射规则。
  - 修改 `projectProposalDto`：调用 `readProposalStatus` 获取原始状态，再调用 `deriveLineageStatus` 映射为 lineage 状态。
  - 导入 `ProposalStatus`（来自 `@shared/types/proposal`）。

- [x] 2.2 更新 `test/mcp-servers/fyllo-cortex/tools.test.ts`
  - 在 `trace-commit returns completed status when commitHash present` 测试中：
    - 当前测试依赖 `commitHash` 存在推断 `completed`；修改后需要读取 `.openspec.yaml`。
    - 在 `tmpProjectPath/openspec/changes/archive/add-foo/` 目录创建 `.openspec.yaml`，内容为 `status: archived\n`。
    - 验证 `status` 仍为 `completed`。
  - 在 `trace-proposal returns subject DTO with task summary and pending status` 测试中：
    - 在 `tmpProjectPath/openspec/changes/add-foo/` 目录创建 `.openspec.yaml`，内容为 `status: creating\n`（或 `draft`）。
    - 验证 `status` 仍为 `pending`。
  - 在 `returns applying status when active change has status: applying` 测试中：
    - 已有 `status: applying` 的 `.openspec.yaml`，验证 `status` 仍为 `applying`。

## 3. 验证

- [x] 3.1 运行 `pnpm test` 确保所有测试通过。
- [x] 3.2 运行 `pnpm typecheck` 确保类型检查通过。
