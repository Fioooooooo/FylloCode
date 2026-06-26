## Context

当前 proposal 详情由 `src/renderer/src/pages/proposal/[id].vue` 承载，依赖 route param 取得 `changeId`，并在页面内组合 `ProposalDetailHeader`、`ProposalMarkdownContent`、`ProposalApplySidePanel`、`useProposalStore`、`useProposalRunStore` 与 `proposalApi.readFile`。入口分散在 proposal 列表、Overview 进行中变更和 Chat EventRail，它们都通过 `router.push('/proposal/<id>')` 跳转到独立详情页。

这次变化有两个约束：

- 用户明确不需要保留旧版 `/proposal/:id` 兼容路径，因此可以删除详情路由和 `pages/proposal` 空壳。
- Proposal 内 `specs/<capability>/spec.md` 是 capability delta，不是主仓库完整 capability spec；UI 应复用 `/specs` 页的信息架构，但不能误导用户把 delta 当作完整规格。

本地 Nuxt UI 4.9 的 `useOverlay` 实现已确认：`open()` 返回带 `result` 的 Promise，`OverlayProvider` 会把组件绑定到 `v-model:open` 并在 `after:leave` 调用 `close(id)`；ESC/遮罩 dismiss 会让 `result` resolve 为 `undefined`。因此调用方只需要 await result，不需要为 dismiss 额外同步 open 状态。

## Goals / Non-Goals

**Goals:**

- 用 `ProposalDetailSlideover` 取代独立详情页，保留现有 proposal 详情浏览、apply/archive、运行历史和 applying 自动恢复能力。
- 删除 `/proposal/:id` 详情路由，将 proposal 列表迁移为顶层 `pages/proposal.vue`。
- 从 proposal 列表、Overview、Chat EventRail 以 programmatic overlay 打开详情。
- 新增 proposal specs delta 只读 IPC 和共享 DTO，展示 `ADDED`、`MODIFIED`、`REMOVED`、`RENAMED` capability delta。
- 让 Specs tab 复用 `/specs` 页左列表/右详情的信息架构，同时减少完整 spec 浏览页不适合 delta 的信息。

**Non-Goals:**

- 不重构 `useProposalRunStore` 为按 proposal 分片的多实例状态。本次继续复用现有全局 run store。
- 不保留 `/proposal/:id` deep link 或兼容桥接页。
- 不改 proposal apply/archive 主流程、apply run 持久化结构或 archive finalization 行为。
- 不把 proposal specs delta 合并或展示为主仓库 `openspec/specs` 的完整 capability。

## Decisions

### 1. 详情作为业务 Slideover 组件，而不是页面组件复用

创建 `src/renderer/src/components/proposal/ProposalDetailSlideover.vue`，接收 `changeId` prop，并在组件内部承接原 `[id].vue` 的数据加载、markdown 文件读取、workflow 菜单、apply/archive、run history 与 SidePanel 状态。

备选方案是保留 `[id].vue` 并在 Slideover 内渲染它，但该页面强依赖 `useRoute()` 与 `router.replace()`，会把路由语义继续带进 overlay。独立组件能把输入边界收敛为 `changeId`，并让 archive 后的 id 变化通过组件状态或 overlay patch 完成。

### 2. 使用 composable 统一 programmatic overlay 打开方式

新增 `src/renderer/src/composables/useProposalDetailSlideover.ts`，显式 import `ProposalDetailSlideover` 后调用 `useOverlay().create(ProposalDetailSlideover, { destroyOnClose: true })`。入口组件只调用 `openProposalDetail(changeId)`，不直接接触 overlay 实例。

项目当前没有使用 `#components` 或 `Lazy*` 组件别名，已有 `useConfirmDialog` 采用显式 import + `overlay.create(Component)` 模式；本次沿用该模式，避免引入新的组件解析习惯。

### 3. Slideover 允许 dismiss，关闭结果不承载业务语义

`ProposalDetailSlideover` 使用 `USlideover` 默认 dismissible 行为，允许 ESC 与遮罩关闭。显式关闭按钮 emit `close`，dismiss 由 `v-model:open` → `after:leave` → `close(id)` 链路 resolve overlay result 为 `undefined`。

调用方 await result 只用于等待关闭完成，不根据 result 分支执行业务逻辑。这样与 Nuxt UI 4.9 的真实实现一致，也避免为 ESC/遮罩关闭重复维护外部 open 状态。

### 4. Slideover 宽度固定为详情级工作面板

右侧 Slideover content 覆盖 Nuxt UI 默认 `max-w-md`，使用 `w-[min(100vw,1120px)] max-w-none` 或等价 class。1120px 来自当前详情主阅读区 `max-w-3xl`（约 768px）加运行日志 SidePanel `w-96`（约 384px）的组合宽度。窄窗口由 `min(100vw,1120px)` 自然退化为全宽。

### 5. Proposal specs delta 通过新 IPC 聚合返回

不复用 `proposal:readFile` 读取 `specs/<capability>/spec.md`。现有 `readChangeFile` 对 filename 使用 `basename()`，是一个刻意收窄的顶层文件读取边界。为了展示 specs delta，应新增 `proposal:getSpecDeltas`，在主进程受控扫描 `specs/*/spec.md` 并返回解析后的 `ProposalSpecDeltaOverview`。

解析逻辑可以复用 `src/main/services/specs/specs-markdown-parser.ts` 的 heading 解析思路，但需要新增 delta section 识别：`ADDED`、`MODIFIED`、`REMOVED`、`RENAMED`。返回 DTO 放在 `src/shared/types/proposal.ts`，schema 放在 `src/shared/schemas/ipc/proposal.ts`。

### 6. Specs tab 复用信息架构，不复用完整页面语义

Specs tab 的左侧列表和右侧 requirement/scenario 展示复用 `src/renderer/src/pages/specs.vue` 的布局语言和组件组合思路，但不要直接把 `/specs` 页面搬进详情：

- 不显示主 specs 页的 `updatedAt`、完整 `sourcePath` 重点信息，因为 proposal specs 是 delta。
- capability 和 requirement 都显示 delta badge。
- `REMOVED` / `RENAMED` 可能没有 scenario，UI 必须能展示纯正文。
- 空态文案应说明“当前 proposal 没有 specs delta”，避免误解为项目没有 capability specs。

### 7. 路由删除后让文件系统路由自然更新

删除 `src/renderer/src/pages/proposal/[id].vue`，将 `src/renderer/src/pages/proposal/index.vue` 内容迁到 `src/renderer/src/pages/proposal.vue`，删除原空壳。`src/renderer/src/typed-router.d.ts` 是 vue-router 自动生成文件，不在任务里手动编辑；通过 dev/typecheck 生成链路自然更新。

## Risks / Trade-offs

- `useProposalRunStore` 是全局单例 → 在 Chat 页面上打开 Slideover 并恢复某个 proposal run history，可能改变 Chat EventRail 用于判断“可归档”的 `runMeta`。本次接受该现状，因为独立详情页已经使用同一个 store；若后续需要并发查看多个 proposal，再单独设计按 changeId 分片的 run store。
- 删除 `/proposal/:id` → 外部 deep link 或历史地址不再可用。用户已明确不需要旧版本兼容；常规入口全部改为 Slideover。
- Specs delta parser 与主 specs parser 相似但语义不同 → 不要把 delta parser 合并到完整 specs browser，避免主 specs 页误读 change spec 的 delta section。
- Slideover 宽度较大 → 小窗口会全宽覆盖当前页面；这是桌面应用中详情工作面板的合理退化，优先保证 markdown 和日志可读性。
