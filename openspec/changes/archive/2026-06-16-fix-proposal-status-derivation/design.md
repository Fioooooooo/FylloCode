## Context

当前有两处 `proposalStatus` 状态推导逻辑存在错误：

1. **`overview-service.ts` 的 `computeRecentLineages`**：
   - 从 `activeChanges`（已过滤掉 `archived`）构建 `activeChangeIds` 集合。
   - 检查 lineage 中的 proposal 是否在该集合中 → `hasApplyingChange`。
   - 问题：`creating`/`draft` 的 proposal 也在 `activeChanges` 中，被错误标记为 `applying`。
   - 这是一个**二次聚合错误**——应该直接读取 proposal 本身的状态，而不是从 `activeChanges` 推断。

2. **`lineage-reader.ts` 的 `projectProposalDto`**：
   - 用 `commitHash` 存在性推断 `completed`（错误：`creating`/`draft` 也可能有 commitHash）。
   - 检查 `.openspec.yaml` 中是否包含 `status: applying`。
   - 问题：`archived` 的 proposal 文件已移出主目录，`checkApplyingStatus` 读取失败返回 `false`，被错误标记为 `pending`。

## Goals / Non-Goals

**Goals:**

- 统一两处状态推导逻辑，直接读取 proposal 的原始状态。
- 建立清晰的状态映射规则：`creating`/`draft` → `pending`，`applying` → `applying`，`archived` → `completed`。
- 修复 `overview-service` 的二次聚合错误。
- 修复 `lineage-reader` 对 `archived` proposal 的错误判定。

**Non-Goals:**

- 不修改 `RecentLineage.proposalStatus` 或 `LineageProposalDto.status` 的类型定义（合法值仍为 `"completed" | "applying" | "pending"`）。
- 不修改前端 UI 组件的显示逻辑。
- 不修改 `archiveCommitHash` 的获取逻辑（仍从 lineage 存储或 Git 查询）。

## Decisions

### 1. overview-service 中直接读取 proposal 文件

**决策**：在 `computeRecentLineages` 中直接调用 `readProposalFiles` 读取所有 proposal，构建 `Map<changeId, ProposalStatus>`，不再依赖 `activeChanges` 参数。

**理由**：

- `readProposalFiles` 已经封装了读取主目录、archive 目录和 worktree 的逻辑，可以复用。
- `activeChanges` 已过滤掉 `archived` 的 proposal，无法用于判断 `archived` 状态。
- 单次读取所有 proposal 构建映射，效率合理（最多 10 个 lineage，每个几个 proposal）。

### 2. lineage-reader 中扩展文件读取范围

**决策**：替换 `checkApplyingStatus` 为 `readProposalStatus`，同时检查 `openspec/changes/{changeId}/.openspec.yaml` 和 `openspec/changes/archive/{changeId}/.openspec.yaml`。

**理由**：

- `archived` 的 proposal 文件在 `archive/` 子目录下，主目录中不存在。
- 读取 archive 目录中的 `.openspec.yaml` 后，直接返回 `archived`（因为 `readMetaFromDir` 对 archive 目录会强制覆盖状态为 `archived`）。

### 3. 多 proposal lineage 的状态优先级

**决策**：一个 lineage 可能包含多个 proposal，取所有 proposal 映射后状态中最"活跃"的一个。优先级：`applying` > `pending` > `completed`。

**理由**：

- 用户需要快速判断 lineage 是否还有正在进行的 proposal。
- 如果 lineage 中有 `applying` 的 proposal，即使其他都是 `archived`，整体状态应显示 `applying`。

### 4. 状态映射规则

| Proposal 原始状态    | Lineage 状态      |
| -------------------- | ----------------- |
| `creating` / `draft` | `pending`         |
| `applying`           | `applying`        |
| `archived`           | `completed`       |
| 未知 / 读取失败      | `pending`（默认） |

## Risks / Trade-offs

- **读取失败风险**：如果 `.openspec.yaml` 文件损坏或不存在，状态会回退为 `pending`。这是合理的保守默认。
- **性能影响**：`overview-service` 中 `computeRecentLineages` 现在会额外调用一次 `readProposalFiles`。但 `getProjectOverview` 已经并行执行多个 Promise，且 `readProposalFiles` 是文件系统操作，对整体延迟影响极小。

## Migration Plan

无需迁移。本次修改只纠正状态推导逻辑，不改变数据存储格式或 API 契约。

## Open Questions

（无）
