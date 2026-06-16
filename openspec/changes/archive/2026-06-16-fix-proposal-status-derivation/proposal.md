## Why

`RecentLineage.proposalStatus` 和 `LineageProposalDto.status` 的状态推导逻辑存在两处错误：

1. `overview-service.ts` 的 `computeRecentLineages` 从 `activeChanges` 做二次聚合，将 `creating`/`draft` 状态的 proposal 错误地标记为 `applying`。
2. `lineage-reader.ts` 的 `projectProposalDto` 用 `commitHash` 存在性推断 `completed`，且 `archived` 的 proposal 因文件已移出主目录而被错误判定为 `pending`。

两处逻辑都应该直接读取 proposal 的原始状态文件，按统一规则映射为 lineage 状态。

## What Changes

- **修改 `src/main/services/overview/overview-service.ts`**：
  - `computeRecentLineages` 不再从 `activeChanges` 二次聚合 `proposalStatus`。
  - 改为直接读取所有 proposal 的 `.openspec.yaml`，构建 `Map<changeId, ProposalStatus>`。
  - 对每个 lineage 的所有 proposal，按映射规则取最"活跃"状态（优先级：`applying` > `pending` > `completed`）。

- **修改 `src/mcp-servers/fyllo-cortex/src/utils/lineage-reader.ts`**：
  - 替换 `checkApplyingStatus` 为 `readProposalStatus`，同时检查 `openspec/changes/{changeId}/` 和 `openspec/changes/archive/{changeId}/` 目录。
  - 重写 `projectProposalDto`，直接读取真实状态后按统一规则映射。

- **更新测试**：
  - `test/main/services/overview/overview-service.spec.ts`：补充 mock 中缺失的 proposal 数据。
  - `test/mcp-servers/fyllo-cortex/tools.test.ts`：为 `archived` 场景在 archive 目录创建 `.openspec.yaml` fixture。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

（无——本次修改仅纠正实现逻辑，不改变 spec-level 的行为契约。`RecentLineage.proposalStatus` 的合法值仍为 `"completed" | "applying" | "pending"`，只是推导方式修正。）

## Impact

- `src/main/services/overview/overview-service.ts`：核心状态推导逻辑重写。
- `src/mcp-servers/fyllo-cortex/src/utils/lineage-reader.ts`：状态推导逻辑重写。
- `test/main/services/overview/overview-service.spec.ts`：mock 数据补充。
- `test/mcp-servers/fyllo-cortex/tools.test.ts`：fixture 数据补充。
- `src/shared/types/overview.ts`、`src/renderer/src/components/overview/OverviewRecentLineages.vue`：类型与 UI 映射保持不变。
