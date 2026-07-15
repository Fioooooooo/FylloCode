## Context

Lineage 的持久化 owner 已经位于 `src/main/services/insight/lineage/` 与 `src/main/infra/storage/lineage-store.ts`。每个 `Subject` 保存来源任务快照、Session links、Plan links、Proposal links 和可选 Commit hash，`LineageIndex` 支持按任务、Session、Proposal 与 Commit 反查；但公开 IPC 只提供点查询，Overview 也只暴露最近五条扁平摘要。

`src/renderer/src/pages/lineage.vue` 当前是经用户确认的静态视觉基线：左栏列表与状态筛选，右栏按 Session 分组展示演进路径。它使用页面内 mock 数据，OverviewStatsBar 已在三列入口网格末尾提供 `/lineage` 入口。正式实现需要在不改变 lineage 存储格式的前提下，为这套布局提供稳定的只读 browser 投影，并复用现有 Session/Proposal 导航能力。

## Goals / Non-Goals

**Goals:**

- 提供一次项目级只读查询，返回按 `updatedAt` 倒序排列的全部 lineage subject 及页面所需详情。
- 用 Session meta 补充会话标题、Agent 和更新时间，用 Proposal metadata 补充 Proposal 标题与实时状态，用 Plan 文档补充目标与批准状态。
- 将现有静态页面替换为真实 store 状态，同时保持已确认的双栏布局、四个状态筛选和 Overview 末位入口。
- 让 Session 与 Proposal 节点复用已有打开能力，让任务起点导航到任务页，让 Commit 节点复制 SHA。
- 对缺失的 Session、Plan、Proposal 元信息使用稳定回退，不让单个引用缺失导致整个 browser 请求失败。

**Non-Goals:**

- 不修改 `Subject`、`LineageIndex` 或 session/proposal/plan 的持久化 schema，不新增迁移。
- 不支持搜索、分页、跨项目聚合、文件级反查或 ActivityBar 独立入口。
- 不支持手工创建、删除、合并、拆分或重新绑定 lineage。
- 不新增任务详情深链；任务起点仅导航到现有 `/task` 页面。
- 不新增 Git Commit/Diff 浏览器；Commit 只展示和复制现有 hash。

## Decisions

### 1. 新增单一 `getBrowser` 聚合查询

在 `src/main/services/insight/lineage/browser.ts` 新增 `getLineageBrowser(projectPath)`，通过 `listSubjects(projectPath)` 读取 source of truth，并在同一次调用中聚合：

- `listSessionMetas(projectPath)`：以 `sessionId` 建立会话标题、`agentId`、`updatedAt` lookup；
- `readProposalFiles(projectPath)` 与 `stripArchivePrefix(...)`：以未带 archive prefix 的 change ID 建立 Proposal 标题与实时 `ProposalStatus` lookup；
- `readPlan(projectPath, sessionId, slug)`：并行读取每个已链接 Plan 的 `goal` 与 `PlanDocumentStatus`，单个文档缺失时返回空元信息而不是失败整个请求。

公开链路统一命名为 `InsightLineageChannels.getBrowser` → preload `lineageApi.getBrowser(projectId)` → renderer wrapper `lineageApi.getBrowser(projectId)`。`getBrowserInputSchema` 只接收非空 `projectId`，main IPC 使用现有 `resolveProjectPath`、`validate` 与 `wrapHandler`。

选择单一聚合查询而不是“列表 + 按 subject 详情”两次请求，是因为当前页面默认立即选中第一项，所有 subject 已经由本地 JSON 文件一次性扫描，且第一版没有分页。单次快照可避免列表计数和详情状态在两次文件扫描之间不一致。若未来 lineage 数量达到需要分页的规模，再拆分 cursor 列表与按 ID 详情端点。

### 2. 使用 browser DTO，不直接暴露持久化 `Subject`

在 `src/shared/types/lineage.ts` 增加以下只读展示 contract：

- `LineageBrowserStatus = "applying" | "planned" | "completed" | "discussion"`；
- `LineageBrowserPlan`：保留 `slug`、`createdAt`，并增加可空 `goal`、`status`；
- `LineageBrowserProposal`：保留 `changeId`、`createdAt`、`commitHash`，并增加可空 `title`、`status`；
- `LineageBrowserSession`：包含 `sessionId`、回退后的 `title`、可空 `agentId`、`createdAt`、`updatedAt`、`plans` 与 `proposals`；
- `LineageBrowserEntry`：包含 `subjectId`、`origin`、任务快照、聚合 `status`、`createdAt`、`updatedAt` 与 Session 列表；
- `LineageBrowserData`：包含 `entries`。

DTO 不暴露 `LineageIndex`，也不允许 renderer 依赖 subject 文件结构。会话元信息缺失时 `title` 回退为 `sessionId`，`agentId` 为空，时间回退为 link 的 `createdAt`；Plan 或 Proposal 元信息缺失时仍保留 slug/change ID 和 link 时间，并把补充字段置空。

### 3. 聚合状态由 Proposal 优先级和已有事件共同决定

`browser.ts` 中以纯函数 `deriveLineageBrowserStatus(...)` 计算状态：

1. 任一 Proposal 为 `applying` → `applying`；
2. 任一 Proposal 为 `creating`/`draft`，或存在无法解析状态的 Proposal → `planned`；
3. 所有可见 Proposal 均为 `archived` 且至少有一个 Proposal → `completed`；
4. 没有 Proposal 但存在 Plan → `planned`；
5. 没有 Plan 与 Proposal → `discussion`。

“推进中”筛选包含除 `completed` 外的三种状态；“待关联”只判断 `entry.task === null`；筛选在 renderer 本地计算，不重复发 IPC 请求。状态始终同时显示文字与图标，不仅依赖颜色。

### 4. Renderer store 持有 browser 请求生命周期

`src/renderer/src/stores/insight/lineage.ts` 保留现有薄封装方法，并新增 `browserData`、`browserLoading`、`browserError`、`loadBrowser(projectId)` 与 `clearBrowser()`。`loadBrowser` 使用递增 request ID 或等价机制忽略项目切换后的迟到响应，并在新项目加载前清除旧项目数据。

`src/renderer/src/pages/lineage.vue` 只组合 `useProjectStore` 与 `useLineageStore`，通过 watch 当前 project ID 触发加载/清理。页面保留本地的 `activeFilter` 与 `selectedId`；筛选或数据刷新后若当前选择不可见，自动选择筛选结果第一项。业务 DTO、请求和错误不保留在 route component 内。

### 5. 复用现有下钻入口，Plan 保持只读

- Session：复用 `useOpenChatSession().openChatSession(sessionId)`，继续遵守当前 `/chat` 无子路由的选择时序。
- Proposal：复用 `useProposalDetailSlideover().openProposalDetail(changeId)`。
- Task：使用 router 导航到 `/task`，不承诺自动选中或打开任务详情。
- Commit：调用 `navigator.clipboard.writeText(commitHash)`，成功或失败均使用 Nuxt UI toast 给出非颜色反馈。
- Plan：展示 slug、goal 与批准状态，但第一版不从 lineage browser 打开 Plan 编辑器，避免把 Chat 专属 PlanSlideover 生命周期耦合到新页面。

只有具有动作的行使用 button 语义；只读 Plan 行使用普通容器。所有 icon-only 操作保留 tooltip 或 `aria-label`。

### 6. 视觉结构以现有静态稿为基线

页面继续使用卡片化根布局、左侧固定宽度列表与右侧可滚动详情，复用 `PageHeader`、Nuxt UI Badge/Button/Tooltip 和项目语义色。左栏不提供搜索，只保留“全部 / 推进中 / 已归档 / 待关联”筛选。窄窗口按列表在上、详情在下堆叠，两个区域各自保持可滚动且不产生横向滚动。

OverviewStatsBar 保持 `grid-cols-3`，入口顺序固定为：能力规约、归档提案、项目准则、知识沉淀、工作脉络。工作脉络显示 `OverviewStats.totalSubjects`，因此 Overview 不额外发起 browser 请求。

## Risks / Trade-offs

- [一次扫描全部 subjects、session metas、proposals 与 plan 文档可能随项目增长变慢] → 第一版只在进入页面或切换项目时加载一次，并并行解析补充元信息；测试覆盖排序与局部缺失。达到明显规模瓶颈后再引入分页/缓存，不提前改变存储格式。
- [聚合状态会把一个 subject 下多个 Proposal 压缩为单一状态] → 采用明确优先级，列表只表达最高关注状态；详情继续逐项展示每个 Proposal 的真实状态。
- [Session、Plan 或 Proposal 文件可能被外部删除，造成悬空 link] → browser DTO 保留稳定 ID 并将补充字段置空，renderer 显示回退文案；仅顶层 subjects 查询失败才进入页面错误态。
- [Commit clipboard API 在部分运行环境不可用] → 捕获失败并通过 toast 告知，页面仍展示完整 hash，不影响其他浏览能力。
- [当前静态稿与正式 DTO 字段存在命名差异] → Apply 阶段直接移除页面内 `MockLineage`/`mockLineages`，以 shared browser types 为唯一数据结构，不长期保留双实现。

## Migration Plan

1. 先增加 shared DTO、schema、service 与 IPC/preload/renderer API，保持现有 lineage 持久化和点查询不变。
2. 增加 renderer store browser state，并用真实 DTO 替换 `/lineage` 页面 mock 数据。
3. 保留并验证 Overview 末位入口；执行聚焦测试、renderer/main 测试、typecheck 与 lint。
4. 本变更没有数据迁移；回滚时移除 browser 查询和页面/入口即可，现有 subject/index 文件无需处理。

## Open Questions

无。搜索、分页、任务深链、Plan 编辑、文件级反查和 Git diff 均已明确留待后续独立变更。
