## Why

当前 `ProjectOverview` 的最近脉络字段需要使用项目领域词汇 `lineage`，并且其 `mergeCommitSha` 与 `mergeCommitUrl` 已预留但规范要求二者恒为 `null`。归档提交 hash 如果依赖 `proposal:archive` 流、MCP spool 文件或 agent 主动上报，会被用户直接在 chat 中调用 `archive-change`、rebase 冲突后的人工修复、以及后续人为 rebase 改写 hash 等路径破坏稳定性。

本变更将 overview 最近脉络中的归档提交 hash 定义为从当前 Git 历史派生的展示字段：lineage 继续以 `changeId` 为权威关联，overview 在读取时根据 archived change 目录的锚点文件定位当前可达的归档提交。

## What Changes

- 将 overview 最近脉络 DTO 字段和共享类型统一命名为 `ProjectOverview.recentLineages` / `RecentLineage`，主进程、共享类型、渲染 store、页面组件与测试同步使用 lineage 术语。
- `RecentLineage.mergeCommitSha` 不再恒为 `null`；当 subject 下任一 proposal 已归档且 Git 当前历史能定位该 archived change 的引入提交时，返回该 commit hash。
- `RecentLineage.mergeStatus` 增加 `"merged"` 判定：当最近脉络存在可定位的归档提交且没有命中正在 apply 的 active change 时，返回 `"merged"`。
- `mergeCommitUrl` 仍保持 `null`，本次不引入远端仓库 URL 推导。
- overview 聚合层批量解析 `openspec/changes/archive/` 与 Git 历史，避免按 subject 或 proposal 逐条执行 Git 查询。
- 不修改 `archive-change` MCP tool、`proposal:archive` 流程、lineage `subjects/*.json` 持久化结构，不新增 spool/pending 队列。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `project-overview`: 最近脉络投影需要从 Git 当前历史派生 `mergeCommitSha`，并在归档提交可定位时返回 `mergeStatus: "merged"`。

## Impact

- 受影响共享契约：`src/shared/types/overview.ts` 中 `ProjectOverview.recentLineages` 与 `RecentLineage.mergeCommitSha` 的语义，`mergeCommitSha` 从“恒为 null”变为“当前 Git 历史中的归档提交 hash 或 null”。
- 受影响主进程代码：`src/main/services/overview/overview-service.ts`、overview Git helper（建议新增 `src/main/services/overview/archive-commit-index.ts` 或等价模块）。
- 受影响测试：`test/main/services/overview/overview-service.spec.ts`，必要时新增 overview archive commit index 的单元测试。
- 不受影响：lineage subject 持久化 schema、MCP archive tool 返回结构、`proposal:archive` IPC 流式协议、归档执行顺序与 worktree cleanup 行为。
