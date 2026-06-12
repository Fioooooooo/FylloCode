## 1. 共享契约

- [x] 1.1 创建 `src/shared/types/overview.ts`：从 `src/renderer/src/stores/overview.ts` 迁移 `OverviewStats`、`OverviewChangeStage`、`ActiveChange`、`RecentThread`、`SpecsGrowthBucket`、`GuidelineChange`、`GovernanceEvolution`、`ProjectOverview` 类型定义（字段与现有 store 完全一致，含 `specsThisMonth`、`mergeCommitUrl`）。验收：`pnpm typecheck` 通过，类型导出齐全。
- [x] 1.2 在 `src/shared/types/channels.ts` 新增 `OverviewChannels = { getProjectOverview: "overview:getProjectOverview" } as const`。验收：命名遵循 `domain:action`。
- [x] 1.3 创建 `src/shared/schemas/ipc/overview.ts`：导出 `getProjectOverviewInputSchema = z.object({ projectId: z.string().min(1) })`。

## 2. 主进程数据源 — 仓库扫描

- [x] 2.1 创建 `src/main/services/overview/openspec-stats.ts`：用 `fs.promises.readdir` 实现 `countSpecs`（`openspec/specs/` 目录数）、`countArchives`（`openspec/changes/archive/` 总数 + 本月 `yyyy-MM` 前缀数）、`countGuidelines`（`guidelines/` 下 `.md` 数）。路径通过 `join(projectPath, ...)` 在 service 内拼接仓库相对路径（这些是项目仓库内路径，非 `infra/storage` 管理的数据目录，可直接拼接）。所有函数对目录不存在 catch 返回 0。验收：目录缺失不抛错。

## 3. 主进程数据源 — lineage 投影

- [x] 3.1 在 `src/main/services/lineage/lineage-service.ts` 新增导出 `listRecentSubjects(projectPath: string, limit: number): Promise<Subject[]>`，内部调既有 `listSubjects`（已 import 自 `lineage-store`），按 `updatedAt` 倒序 `slice(0, limit)`。验收：复用既有 listSubjects 容错。
- [x] 3.2 在 overview-service 中实现 `computeTaskDrivenRatio`：基于 `listSubjects` 计算 `{ ratio, total }`，`total === 0` 时 ratio 为 0。

## 4. 主进程数据源 — git 查询

- [x] 4.1 创建 `src/main/services/overview/git-stats.ts`：用 `cross-spawn`（遵循 `guidelines/MainProcess.md` 约束，禁止从 `child_process` 直接 import spawn），封装 `runGit(projectPath, args, timeoutMs=10000)` 辅助函数，统一 `cwd: projectPath`、超时 kill、失败抛错。
- [x] 4.2 实现 `computeSpecsGrowth(projectPath)`：计算近 8 个自然周的 `weekStart`（周一）与快照截止点（周日 23:59），对每个截止点先 `git rev-list -1 --before=<ISO> HEAD` 取 sha，再 `git ls-tree -d --name-only <sha> openspec/specs/` 数目录基数，组装 `SpecsGrowthBucket[]`。验收：返回 8 个桶，cumulativeCount 随时间非递减（正常情况）。
- [x] 4.3 实现 `computeRecentGuidelines(projectPath)`：用 `git log --format=%aI%x09%s --name-only -- guidelines/` 解析，以 fileName 去重保留最近一次，按日期倒序取前 5，message 截断 80 字符；同时返回 `guidelinesLastUpdated`（首条日期或 null）。
- [x] 4.4 git-stats 整体容错：非 git 仓库 / git 不可用 / 超时，catch 后返回 `{ specsGrowth: [], recentGuidelines: [], guidelinesLastUpdated: null }`。
- [x] 4.5 加 60 秒 TTL 内存缓存（`Map<projectPath, { data, expireAt }>`），仅缓存 git 治理结果。验收：60 秒内重复调用不重跑 git。

## 5. 主进程聚合 + IPC

- [x] 5.1 创建 `src/main/services/overview/overview-service.ts`：唯一导出 `getProjectOverview(projectPath): Promise<ProjectOverview>`。`Promise.all` 并行跑 stats（含 specsThisMonth 来自 git growth）、activeChanges、governance；之后串行跑 `computeRecentThreads(projectPath, activeChanges)`。
- [x] 5.2 实现 `computeActiveChanges`：调既有 `readProposalFiles`（`@main/domain/proposal/openspec-reader`），过滤 `status === "archived"`，按 stage 映射表（`creating→drafting`/`draft→proposal`/`applying→applying`，未知值兜底 `drafting` 并 `logger.warn`）转 `ActiveChange`；`changeName=meta.id`、`createdAt=meta.date`；用 `getByProposal` 反查填 `taskTitle`/`taskRef`（taskRef 保留前缀）。
- [x] 5.3 实现 `computeRecentThreads`：`listRecentSubjects(projectPath, 10)` 投影为 `RecentThread[]`；`sessionCount=links.length`、`proposalCount=links.flatMap(proposals).length`；`mergeStatus` 命中 activeChanges 的 changeId → `applying`，否则 `pending`；`mergeCommitSha`/`mergeCommitUrl` 恒 null。
- [x] 5.4 创建 `src/main/ipc/overview.ts`：导出 `registerOverviewHandlers()`，按 `ipc/lineage.ts` 模式用单参 `wrapHandler(async () => { const form = validate(getProjectOverviewInputSchema, input); const projectPath = await resolveProjectPath(form.projectId); return getProjectOverview(projectPath); })`，`resolveProjectPath` 来自 `@main/services/chat/chat-service`，`validate` 来自 `./_kit/schema`。
- [x] 5.5 在 `src/main/ipc/index.ts` 注册 `registerOverviewHandlers()`。

## 6. 桥接层

- [x] 6.1 创建 `src/preload/api/overview.ts`：`overviewApi.getProjectOverview(projectId)` 返回 `ipcRenderer.invoke(OverviewChannels.getProjectOverview, { projectId })`，类型 `Promise<IpcResponse<ProjectOverview>>`。
- [x] 6.2 在 `src/preload/index.ts` 的 `api` 对象追加 `overview: overviewApi` 并 import。
- [x] 6.3 在 `src/preload/index.d.ts` 追加 `overview: typeof overviewApi` 到 Api 接口。
- [x] 6.4 创建 `src/renderer/src/api/overview.ts`：薄封装 `window.api.overview.getProjectOverview(projectId)`。

## 7. 渲染层接真实数据

- [x] 7.1 改造 `src/renderer/src/stores/overview.ts`：删除 `createMockOverview`/`isoDaysAgo`/`isoHoursAgo`/`loadMockData`；`import type { ProjectOverview, ... } from "@shared/types/overview"` 并 re-export 组件依赖的命名类型（`OverviewChangeStage`、`RecentThread`、`GovernanceEvolution`、`SpecsGrowthBucket` 等）保持组件 import 路径不变；`data` 改为 `ref<ProjectOverview | null>(null)`；新增 `async load()` 调 `overviewApi.getProjectOverview(project.id)`，按 `res.ok` 分支写 `data`/`error`（注意是 `res.ok` 不是 `res.success`）。
- [x] 7.2 更新 `src/renderer/src/pages/overview.vue`：将 `overviewStore.loadMockData()` 替换为 `overviewStore.load()`；`data` 可能为 null，模板已有 loading/error/template 分支，确认 `v-else` 下对 `overviewStore.data` 的访问加 null 守卫（如改为 `v-else-if="overviewStore.data"`）。

## 8. 测试与验证

- [x] 8.1 `test/main/services/overview/openspec-stats.spec.ts`：mock fs，覆盖正常计数、目录缺失返回 0。
- [x] 8.2 `test/main/services/overview/git-stats.spec.ts`：mock cross-spawn，覆盖 specsGrowth 解析、recentGuidelines 去重排序、非 git 仓库降级空值、缓存命中。
- [x] 8.3 `test/main/services/overview/overview-service.spec.ts`：mock 各数据源，覆盖 stage 映射、mergeStatus 判定、taskRef 保留前缀、recentThreads 依赖 activeChanges。
- [x] 8.4 更新 `test/renderer/src/pages/overview.spec.ts`：从 mock store 断言改为 mock `overviewApi`/store `load`，覆盖 loading/error/data 三态。
- [x] 8.5 运行 `pnpm typecheck`、`pnpm lint`、`pnpm vitest run test/main/services/overview/**` 与 `test/renderer/src/pages/overview.spec.ts`，全部通过。

## 9. 文档维护

- [x] 9.1 更新 `guidelines/IPC.md`：在 channel 清单补充 `overview:getProjectOverview` 的入参/返回契约（参照既有 Lineage Channels 段落风格）。
- [x] 9.2 评估 `guidelines/RendererProcess.md` / `guidelines/MainProcess.md` 是否需补充 overview service/store 的职责说明；若 overview 引入了新的"单通道聚合多数据源"模式值得沉淀，则补充对应 Examples，否则跳过并在本任务说明原因。
