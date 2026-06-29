## Context

`ProposalDetailSlideover.vue` 目前在 `onMounted` 内先调用 `ensureProposalLoaded()`，该函数只有在 `proposalStore.proposals.length === 0` 时才调用 `proposalStore.loadProposals()`。因此从 Chat EventRail、Overview 或 Proposal 列表再次打开同一个详情时，header 会直接消费旧的 `ProposalMeta`，尤其是由主进程解析 `tasks.md` 得到的 `doneTasks/totalTasks` 可能过期。

现有主进程能力已经满足刷新需求：`proposal:list` 每次从文件系统读取 `.openspec.yaml`、`proposal.md`、`tasks.md` 和 `design.md` 生成 `ProposalMeta[]`；`proposal:readFile` 每次读取当前 change 的 markdown 文件；`proposal:getSpecDeltas` 每次读取 proposal specs delta。问题不在 IPC 缺口，而在 Slideover 打开时没有把 `proposal:list` 当作 freshness boundary。

## Goals / Non-Goals

**Goals:**

- 每次打开 Proposal 详情 Slideover 都触发一次 proposal 元数据刷新。
- 刷新开始前继续展示 store 中已有的 `ProposalMeta`，避免 header 空白或阻塞 Slideover 打开。
- Header 在刷新期间显示一个 loading icon，刷新完成后隐藏。
- 刷新完成后依靠 `proposalStore.proposals` 的响应式更新自动刷新 header 中的任务数量和其他元数据。
- Markdown 和 Specs delta 保持现有按文件读取逻辑，不被元数据刷新失败阻断。

**Non-Goals:**

- 不新增 `proposal:detail` IPC。
- 不改变 `ProposalMeta` 类型、`proposal:list` 返回结构或主进程解析规则。
- 不引入新的缓存层、TTL 或轮询机制。
- 不改变 Proposal 列表页、Overview 活跃变更列表或 Chat EventRail 的入口职责。

## Decisions

### 1. 使用 `proposal:list` 作为详情元数据刷新源

实现应在 `ProposalDetailSlideover.vue` 挂载时无条件调用 `proposalStore.loadProposals()`，即使 store 中已经有 proposal 数据。这样 header 先从现有 store 渲染，刷新完成后通过 `currentProposal` computed 自动拿到最新 `doneTasks/totalTasks`。

备选方案是新增 `proposal:detail` 聚合 IPC，一次返回 meta、markdown 和 specs delta。该方案能减少 IPC 调用并提供单次读取快照，但需要新增 channel、schema、preload、renderer API、共享 DTO、main service 和测试。当前需求是解决 stale 元数据，现有 `proposal:list` 已经能实时解析任务数量，所以新增 IPC 不是更轻量的方案。

### 2. Header 只表达元数据刷新状态

`ProposalDetailHeader.vue` 应新增 `refreshingMeta: boolean` prop，并在元数据行或任务数量旁展示一个 `i-lucide-loader-2` 图标。图标在 `refreshingMeta === true` 时使用旋转样式，刷新结束后不再渲染。

该 icon 不替代现有 markdown loading 状态。Markdown 读取仍由 `ProposalMarkdownContent.vue` 的 `loading` 和 `error` 展示负责。

### 3. 刷新失败保留旧数据

`proposalStore.loadProposals()` 失败时现有 store 会设置 `error` 并清空 `proposals`。为了避免一次后台刷新失败把 Slideover header 从已有数据切到“未找到元数据”，实现应在 Slideover 层保存刷新前的当前 proposal 快照或调整调用方式，确保后台刷新失败时 header 仍可展示刷新前已有的 `ProposalMeta`。

可接受的实现方式：

- 在 `ProposalDetailSlideover.vue` 维护 `fallbackProposal`，刷新开始前捕获当前 proposal，`currentProposal` 在 store 未命中时回退该快照；刷新成功后如果 store 命中则更新/清理 fallback。
- 或扩展 `useProposalStore.loadProposals()` 支持可选参数控制失败时是否保留旧列表；如果采用此方式，必须保持现有默认行为不变，避免影响列表页错误态。

### 4. 避免旧请求覆盖新状态

Slideover 可能在打开后快速切换 `changeId`，或 archive 后把 `currentChangeId` 改为 `YYYY-MM-DD-<changeId>`。元数据刷新和 markdown/specs 读取应使用本地 request token 或序列号，只允许最新一轮请求结束时更新 `refreshingMeta`、`markdownTabs`、`specsOverview`、`fileError` 和 `specsError`。

## Risks / Trade-offs

- 后台刷新多一次 `proposal:list` 会比复用旧 store 增加 IO → 该调用只在打开详情时发生，且 `proposal:list` 是现有列表页已使用的读取路径，优先满足数据新鲜度。
- 如果复用现有 `proposalStore.loadProposals()`，失败时清空列表会影响 header → Slideover 必须显式保留 fallback proposal，或为 store 增加保持旧数据的可选行为并保持默认兼容。
- Header loading icon 可能与 markdown loading 混淆 → 文案和位置应表达“元数据刷新”，不要影响 markdown body 的加载状态。
