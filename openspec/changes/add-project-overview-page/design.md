## Context

前端已在 main worktree 完成 `/overview` 概览页的静态 mock 实现：

- `src/renderer/src/pages/overview.vue`：页面编排，watch `currentProject.id` 触发 `overviewStore.loadMockData()`。
- `src/renderer/src/components/overview/`：`OverviewStatsBar.vue`、`OverviewActiveChanges.vue`、`OverviewRecentThreads.vue`、`OverviewGovernance.vue`。
- `src/renderer/src/stores/overview.ts`：定义了完整 DTO 类型与 `createMockOverview()`。
- `src/renderer/src/config/activity-bar.ts`：overview 已置于首位且 `isDefault: true`，chat 不再是默认项。

本变更只补齐主进程真实数据供给，把 mock 换成 IPC，**不改动组件 props 契约**。设计草案（`~/Downloads/project-overview-page-design.md`）提供了初版思路，但经代码核对存在多处与真实仓库不符之处，本文档记录修正后的最终决策。

### 前端契约（取数必须对齐，不得改动组件）

DTO 字段以 `stores/overview.ts` 现有定义为准（比草案更准确）：

```ts
interface OverviewStats {
  specsCount: number;
  specsThisMonth: number; // 草案漏掉此字段
  archiveCount: number;
  archiveThisMonth: number;
  guidelinesCount: number;
  guidelinesLastUpdated: string | null;
  taskDrivenRatio: number;
  totalSubjects: number;
}
interface ActiveChange {
  changeName: string;
  createdAt: string | null;
  taskTitle: string | null;
  taskRef: string | null; // 保留 source: 前缀，前端直接展示
  stage: "drafting" | "proposal" | "applying";
}
interface RecentThread {
  subjectId: string;
  origin: "task" | "chat";
  taskRef: string | null; // 保留 source: 前缀
  taskTitle: string | null;
  sessionCount: number;
  proposalCount: number;
  mergeCommitSha: string | null;
  mergeCommitUrl: string | null; // 草案漏掉此字段
  mergeStatus: "merged" | "applying" | "pending";
  createdAt: string;
  updatedAt: string;
}
interface SpecsGrowthBucket {
  weekStart: string;
  cumulativeCount: number;
}
interface GuidelineChange {
  fileName: string;
  lastCommitDate: string;
  lastCommitMessage: string;
}
interface GovernanceEvolution {
  specsGrowth: SpecsGrowthBucket[];
  recentGuidelines: GuidelineChange[];
}
interface ProjectOverview {
  stats;
  activeChanges;
  recentThreads;
  governance;
}
```

## Goals / Non-Goals

**Goals:**

- 提供单一 IPC 通道 `overview:getProjectOverview`，一次返回完整 `ProjectOverview`。
- 主进程取数严格对齐前端 DTO，替换 mock 后组件零改动即可渲染真实数据。
- 复用既有模块（openspec-reader、lineage-service、project-paths、cross-spawn），不重复造轮子。
- 任何单一数据源失败（非 git 仓库、无 openspec/、git 超时）都能降级返回空值，不整体阻断概览。

**Non-Goals:**

- 不实现 `recordMerge`：`mergeStatus` 仅在 "applying"（changeId 命中活跃变更）与 "pending" 间判定，`merged` 分支留待 `recordMerge` 上线后补；`mergeCommitSha`/`mergeCommitUrl` 本期恒为 `null`。
- 不做 archive 趋势图：archive 是离散事件，只进 Stats Bar 计数。
- 不做 `fs.watch` 增量刷新：每次进入页面调一次 `load()`，git 部分加 60 秒内存缓存。
- 不修改 activity-bar 默认项逻辑（已在 main worktree 落地）。

## Decisions

### 决策 1：specs 趋势用 `git ls-tree` 基数快照法，弃用草案的目录考古法

**选择**：对近 8 个周末时刻，各取一次历史快照的 specs 目录基数：

```bash
git rev-list -1 --before="<weekEnd ISO>" HEAD      # 该时刻最后一个 commit
git ls-tree -d --name-only <sha> openspec/specs/    # 数当时的目录数
```

**理由**（已在本仓库实测：`before 2026-05-01` → 37，`HEAD` → 74）：

- specs 是"持续存在的规范集合"（存量），趋势的正确语义是"各时间点该集合有多大"，而非"新增事件累加"。
- 与重命名/移动无关：直接数当时存在的目录，spec 改名不会漏判或重复计。
- 解析极简：输出就是一个数字，不依赖 commit 顺序，无 glob 匹配。

**否决**：草案的 `git log --diff-filter=A --name-only -- "openspec/specs/*/spec.md"` 逐目录考古首次出现时间再累加。它把集合硬当事件流，依赖 commit 输出顺序与路径 glob，重命名会出错，脆弱且语义不符。

**成本**：8 次 `rev-list` + 8 次 `ls-tree`（16 条 git 调用），配 60 秒缓存 + 10 秒超时，开销可忽略。周末时刻按"最近 8 个自然周的周一 00:00 作为 weekStart，对应周日 23:59 作为快照截止点"计算。

### 决策 2："进行中"复用 `openspec-reader.readProposalFiles`，不重写扫描与 stage 推导

**选择**：`computeActiveChanges` 调用既有 `readProposalFiles(projectPath)`（`src/main/domain/proposal/openspec-reader.ts:202`），它已扫描 active changes、`.worktrees/`、archive，返回 `ProposalMeta[]`（含 `id`、`status`、`worktreePath`、`date`）。过滤掉 `status === "archived"`，再用 lineage 补任务信息。

**理由**：草案的 `listActiveChanges` + `inferStage`（手动 readdir + 手动判 `.worktrees/<name>` + 自定义状态机）完全是在重造既有 reader，且会引入第二套与 `ProposalStatus` 漂移的状态枚举。

**stage 映射**（`ProposalStatus` → 前端 `stage`）：

| ProposalStatus | 前端 stage | 说明          |
| -------------- | ---------- | ------------- |
| `creating`     | `drafting` | 草拟中        |
| `draft`        | `proposal` | 已有 proposal |
| `applying`     | `applying` | 正在 apply    |
| `archived`     | （过滤掉） | 不进"进行中"  |

`createdAt` 取 `ProposalMeta.date`，`changeName` 取 `ProposalMeta.id`。

### 决策 3：lineage 任务信息复用 `getByProposal`，taskRef 保留前缀

**选择**：每个活跃变更用 `getByProposal(projectPath, changeName)`（`lineage-service.ts:304`，返回 `ProposalOriginProjection | null`）反查 subject，取 `result.task?.snapshot.title` 与 `result.task?.ref`。查不到则 `taskTitle`/`taskRef` 为 `null`。

**taskRef 不剥离前缀**：`LineageTaskRef = ${TaskSource}:${string}`（`shared/types/lineage.ts:5`）带 source 前缀。经用户确认，**直接把含前缀的 ref 传给前端**，前端不做额外处理直接展示。service 层不剥离。

### 决策 4：最近线索新增 `listRecentSubjects` service 导出

**选择**：在 `lineage-service.ts` 新增 `listRecentSubjects(projectPath, limit)`，内部调既有 `listSubjects`（`lineage-store.ts:357`，已自带损坏文件跳过 + 目录不存在返回 `[]` 的容错），按 `updatedAt` 倒序取前 N。`computeRecentThreads` 投影为 `RecentThread[]`：

- `sessionCount = subject.links.length`
- `proposalCount = subject.links.flatMap(l => l.proposals).length`
- `mergeStatus`：若任一 proposal 的 changeId 命中 activeChanges → `"applying"`，否则 `"pending"`（`merged` 本期不产生）。
- `mergeCommitSha`/`mergeCommitUrl` 恒 `null`。

`computeRecentThreads` 依赖 activeChanges 结果，故在聚合时于 `Promise.all` 之后串行执行。

### 决策 5：IPC handler 遵循既有单参 `wrapHandler` + `validate` 模式

**选择**：handler 形如 `ipc/lineage.ts:20`：

```ts
ipcMain.handle(OverviewChannels.getProjectOverview, (_event, input: unknown) =>
  wrapHandler(async () => {
    const form = validate(getProjectOverviewInputSchema, input);
    const projectPath = await resolveProjectPath(form.projectId);
    return getProjectOverview(projectPath);
  })
);
```

**修正草案的三处错误**：

- `wrapHandler` 只接受单个无参函数（`_kit/wrap-handler.ts:13`），草案的 `wrapHandler(schema, fn)` 双参签名是错的；校验走独立的 `validate` from `./_kit/schema`。
- `IpcResponse` 是 `{ ok: true; data } | { ok: false; error }`（`shared/types/ipc.ts`），字段是 `res.ok` 不是 `res.success`；store 消费处必须用 `res.ok`。
- `resolveProjectPath` 来自 `@main/services/chat/chat-service`（`ipc/lineage.ts:11`）且是 `async`，不是草案猜的 `@main/ipc/_kit/resolve-project`。

### 决策 6：DTO 类型放 `@shared/types/overview.ts`

**选择**：把 overview DTO 从 `stores/overview.ts` 提升到 `src/shared/types/overview.ts`（跨进程共享），主进程 service 与 renderer store 都 import 它。renderer store 改为 `import type { ProjectOverview } from "@shared/types/overview"`，并 re-export 现有组件依赖的命名类型（`OverviewChangeStage`、`RecentThread` 等），保持组件 import 路径不变。

## Risks / Trade-offs

- [git 查询在大仓库慢] → 16 条 git 调用串/并行 + 10 秒 `cross-spawn` 超时 + 60 秒内存缓存（key=projectPath）；超时则该部分降级空值。
- [`git ls-tree` 在 shallow clone 下历史不全] → 趋势桶 `cumulativeCount` 可能偏小但不报错；前端已处理 `specsGrowth: []` 的空态（`OverviewGovernance.vue:84`），可接受。
- [DTO 类型迁移破坏 store re-export] → 迁移时保留 store 对所有命名类型的 re-export，typecheck:web 验证组件 import 不断。
- [stage 映射遗漏未来新增 ProposalStatus] → 映射用显式 switch/Record，遇未知 status 归 `drafting` 兜底并记 `logger.warn`。
- [缓存导致数据陈旧] → 60 秒 TTL，页面非高频刷新，可接受；缓存仅覆盖 git 部分（governance），文件系统与 lineage 部分每次实时读。

## Migration Plan

纯增量，无数据迁移。落地顺序见 tasks.md。回滚：移除新增文件 + 还原 store 即可，组件与 activity-bar 不受影响（mock store 可临时保留分支）。

## Open Questions

无。趋势图口径、taskRef 前缀、stage 映射、merged 暂缓均已与用户确认。
