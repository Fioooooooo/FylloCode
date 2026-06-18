## 1. 统一 ChatPlanPanel Header

- [x] 1.1 修改 `src/renderer/src/components/chat/event/ChatPlanPanel.vue`：
  - 保持可折叠 Header 结构；
  - 标题文案保持为 "执行计划"；
  - 图标保持为 `i-lucide-list-checks`；
  - 计数保持为 `<completed>/<total>`；
  - 确认标题类名为 `text-sm font-medium uppercase tracking-wide`，颜色与 `ChatProposalPanel` 统一；
  - 验收标准：Header 视觉与 Proposal Header 一致，折叠/展开行为正常。

## 2. 改造 ChatProposalPanel Header

- [x] 2.1 修改 `src/renderer/src/components/chat/event/ChatProposalPanel.vue`：
  - 将静态 `h3` 标题替换为可折叠按钮 Header；
  - 引入 `collapsed` 响应式状态，默认值为 `false`；
  - 标题文案改为 "会话提案"；
  - 图标使用 `i-lucide-file-text`；
  - 计数显示 proposal 总数（如 `{{ proposals.length }} 个`）；
  - 折叠时内容区隐藏，chevron 方向与 PlanPanel 一致；
  - 验收标准：点击 Header 可折叠/展开，文案为中文，视觉与 PlanPanel Header 一致。

## 3. 修复 ChatProposalPanel 卡片布局与交互

- [x] 3.1 修复 `src/renderer/src/components/chat/event/ChatProposalPanel.vue` 卡片顶部布局：
  - 左侧信息区使用 `min-w-0 flex-1`，标题与 change id 均使用 `truncate`；
  - 右侧 `UBadge` 添加 `shrink-0`；
  - 左右之间保持 `gap-2` 或 `gap-3`；
  - 验收标准：长 change id 不挤压右侧状态 badge。
- [x] 3.2 移除 `creating` 状态的“查看详情”按钮：
  - 将兜底按钮渲染条件改为 `proposal.status !== 'creating'`；
  - `creating` 状态下该卡片不展示任何操作按钮；
  - 验收标准：creating 状态无操作按钮，draft/applying done/archived 等状态按钮行为正确。

## 4. 在 statusChanged 到达时刷新缺失的 proposalStore 数据

- [x] 4.1 修改 `src/renderer/src/stores/session.ts` 的 `subscribeProposalStatus`：
  - 在 `proposalApi.onStatusChanged` 回调中，收到非 `removed` 事件后，检查 `useProposalStore().proposals` 是否包含 `payload.changeId`；
  - 若不存在，调用 `useProposalStore().loadProposals()` 刷新完整列表；
  - 刷新完成后，使用 `buildProposalMetaFromPayload(payload)` 更新 `sessionProposals`；
  - 保持 `ensureProposalWatched` 调用，确保后续状态变化继续被监听；
  - 验收标准：新创建的 proposal 在 `ChatProposalPanel` 中加粗标题显示为友好化 `proposal.title`，而非 raw change id。
- [x] 4.2 验证 `useProposalStore().loadProposals()` 的并发与重复调用：
  - 确保在 `loadProposals()` 执行期间收到多个 statusChanged 事件时，不会触发多次并发的全量刷新；
  - 可通过 `proposalStore.loading` 状态进行去重；
  - 验收标准：连续多个 proposal 创建事件不会导致多次重复请求。
- [x] 4.3 移除之前任务中关于 `src/shared/utils/proposal.ts` 与 `src/main/infra/proposal/openspec-reader.ts` 的提取计划：
  - 不再将 `toTitleCase`/`stripArchivePrefix` 提取到 shared utils；
  - 不新增 friendly fallback 逻辑；
  - 验收标准：当前变更不修改主进程 openspec-reader，不新增 shared utils 文件。

## 5. 调整 ChatSessionEventRail 内 Panel 间距

- [x] 5.1 修改 `src/renderer/src/components/chat/event/ChatSessionEventRail.vue`：
  - 检查并调整内容区 `space-y-*`，确保多个 Panel 堆叠时间距协调；
  - 确保 Panel 本身不带额外外边框或背景；
  - 验收标准：PlanPanel 与 ProposalPanel 同时存在时，垂直间距一致，无重复留白或挤压。

## 6. 验证与回归测试

- [x] 6.1 运行 `pnpm lint` 与 `pnpm typecheck:web`，确认无新增类型或 lint 错误。
- [x] 6.2 运行 `pnpm vitest run test/renderer/src/**/*.{test,spec}.{ts,vue}`，确认现有测试通过。
- [ ] 6.3 在 dev 环境验证：
  - 同时存在 plan 与 proposal 时，Rail 内两个 Panel Header 视觉一致；
  - Proposal Header 可折叠；
  - Plan 列表与 Proposal 卡片内容形态保持原样；
  - 长 change id 不挤压状态 badge；
  - creating 状态 proposal 不显示“查看详情”按钮；
  - 首次通过状态推送到达的 proposal 显示友好化标题；
  - 无 proposal 或 plan 时，Rail 按原有逻辑隐藏对应 Panel。
