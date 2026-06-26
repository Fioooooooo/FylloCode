## 1. Proposal Specs Delta IPC

- [x] 1.1 在 `src/shared/types/proposal.ts` 增加 `ProposalSpecDeltaType`、`ProposalSpecDeltaScenarioGroup`、`ProposalSpecDeltaRequirementGroup`、`ProposalSpecDeltaItem`、`ProposalSpecDeltaOverview` 类型，字段与 `openspec/changes/proposal-detail-slideover-spec-deltas/specs/proposal-ipc/spec.md` 保持一致。
- [x] 1.2 在 `src/shared/types/channels.ts` 的 `ProposalChannels` 增加 `getSpecDeltas: "proposal:getSpecDeltas"`，并在 `src/shared/schemas/ipc/proposal.ts` 增加 `{ projectId, changeId }` 输入 schema，两个字段均为非空字符串。
- [x] 1.3 在 `src/main/services/proposal/` 新增 proposal specs delta 解析服务，使用 `resolveChangeDirAnywhere(projectPath, changeId)` 定位 main/worktree/archive change 目录，扫描 `specs/*/spec.md`，识别 `ADDED`、`MODIFIED`、`REMOVED`、`RENAMED` section，并返回 `ProposalSpecDeltaOverview`。
- [x] 1.4 在 delta 解析服务中复用 `src/main/services/specs/specs-markdown-parser.ts` 的 heading 解析思路，但不要改变完整 specs browser 的 `SpecBrowserItem` 契约；`REMOVED` 与 `RENAMED` requirement 缺少 scenario 时仍保留 requirement。
- [x] 1.5 在 `src/main/services/proposal/proposal-service.ts` 增加 `getProposalSpecDeltas(projectId, changeId)`，负责 `loadProject`、`PROJECT_NOT_FOUND` 错误和调用 delta 解析服务。
- [x] 1.6 在 `src/main/ipc/proposal.ts` 注册 `ProposalChannels.getSpecDeltas` handler，按 `validate -> service -> IpcResponse` 模式实现。
- [x] 1.7 在 `src/preload/api/proposal.ts`、`src/preload/index.d.ts`、`src/renderer/src/api/proposal.ts` 暴露 `getSpecDeltas(projectId, changeId): Promise<IpcResponse<ProposalSpecDeltaOverview>>`。

## 2. Proposal Detail Slideover

- [x] 2.1 新增 `src/renderer/src/components/proposal/ProposalDetailSlideover.vue`，接收 `changeId: string` prop，内部迁移 `src/renderer/src/pages/proposal/[id].vue` 的数据加载、markdown tabs、workflow 菜单、apply/archive、run history 和 SidePanel 状态逻辑。
- [x] 2.2 将 `ProposalDetailSlideover.vue` 根组件实现为 `USlideover`，允许默认 dismissible 行为，关闭按钮 emit `close`；`ui.content` 覆盖为 `w-[min(100vw,1120px)] max-w-none` 或等价 class，`ui.body` 避免双重整层 padding。
- [x] 2.3 调整 `ProposalDetailHeader.vue`，将返回按钮语义改为关闭详情 Slideover；保留标题、状态、日期、任务进度、开始实现、归档、查看运行历史入口。
- [x] 2.4 调整 `ProposalMarkdownContent.vue` 或新增相邻组件，使 tabs 支持 Proposal、Design、Tasks、Specs 四类内容；Proposal/Design/Tasks 继续通过 `proposalApi.readFile` 读取，Specs 通过 `proposalApi.getSpecDeltas` 读取。
- [x] 2.5 新增 `src/renderer/src/components/proposal/ProposalSpecsDeltaContent.vue`，复用 `/specs` 页的左侧 capability 列表 + 右侧 requirement/scenario 信息架构，展示 capability/requirement delta badge，并处理空态、loading 与 error。
- [x] 2.6 在 archive 成功后刷新 `useProposalStore().loadProposals()`，若 archived proposal id 变为 `YYYY-MM-DD-<changeId>`，在 Slideover 内更新当前 `changeId` 并重新读取 markdown 与 specs delta，不调用 `router.replace`。
- [x] 2.7 保留 `useProposalRunStore` 全局单例用法，不在本次拆分为按 changeId 分片的 store；在代码注释或 design 对应位置说明 Chat EventRail 与 Slideover 共享 run state 的现状。

## 3. Programmatic Open Entrypoints

- [x] 3.1 新增 `src/renderer/src/composables/useProposalDetailSlideover.ts`，显式 import `ProposalDetailSlideover` 并使用 `useOverlay().create(ProposalDetailSlideover, { destroyOnClose: true })` 打开详情；返回函数形如 `openProposalDetail(changeId: string): Promise<void>`。
- [x] 3.2 将 `src/renderer/src/pages/proposal/index.vue` 内容迁移到 `src/renderer/src/pages/proposal.vue`，删除原 `RouterView` 空壳和 `src/renderer/src/pages/proposal/[id].vue`；不要手动编辑 `src/renderer/src/typed-router.d.ts`。
- [x] 3.3 在新的 `src/renderer/src/pages/proposal.vue` 中将卡片点击从 `router.push('/proposal/<id>')` 改为调用 `useProposalDetailSlideover().openProposalDetail(proposal.id)`。
- [x] 3.4 在 `src/renderer/src/components/overview/OverviewActiveChanges.vue` 中将 `openChange(changeId)` 改为打开详情 Slideover，并移除该组件对 `useRouter` 的依赖。
- [x] 3.5 在 `src/renderer/src/components/chat/event/ChatProposalPanel.vue` 中将 `viewDetail(proposal)` 改为打开详情 Slideover，并移除该组件对详情路由跳转的依赖；保留 draft apply 和 archive 快捷操作不变。
- [x] 3.6 检查 `src/renderer/src/pages/index.vue` 的 `projectScopedRoutes` 和路由保护逻辑，确保 `/proposal` 与 `/specs` 仍受项目约束，且不再假设 `/proposal/:id` 存在。

## 4. Specs, Guidelines, and Tests

- [x] 4.1 更新 `guidelines/IPC.md` 的 Proposal Channels 段落，加入 `proposal:getSpecDeltas` 的职责、schema、handler、bridge 和 renderer api 路径。
- [x] 4.2 如实现中显著改变 renderer 路由组织或 overlay 使用约定，更新 `guidelines/RendererProcess.md` 中相关路由/overlay 说明；若无需更新，在实现总结中说明原因。
- [x] 4.3 新增或更新 `test/main/services/proposal/*spec-delta*.spec.ts`，覆盖 ADDED/MODIFIED/REMOVED/RENAMED 解析、缺 specs 目录、缺 spec.md、archived id 定位和无 scenario 的 removed/renamed requirement。
- [x] 4.4 更新 `test/main/ipc/proposal.spec.ts`，覆盖 `proposal:getSpecDeltas` 成功、`PROJECT_NOT_FOUND` 和入参校验失败。
- [x] 4.5 更新 renderer 测试：删除或替换 `test/renderer/src/pages/proposal-detail.spec.ts` 的 route back 断言，新增 `ProposalDetailSlideover` 关闭、dismiss、apply/archive、Specs tab 空态/错误/展示测试。
- [x] 4.6 更新 `test/renderer/src/components/chat/event/ChatProposalPanel.test.ts` 与 `test/renderer/src/pages/overview.spec.ts`，断言“查看详情”和进行中变更点击打开 Slideover，而不是调用 `router.push('/proposal/<id>')`。
- [x] 4.7 为 `src/renderer/src/pages/proposal.vue` 增加或调整列表页测试，断言卡片点击打开 Slideover、筛选/统计/metadata/worktree 标记保持不变。
- [x] 4.8 运行 `pnpm typecheck:web`、`pnpm vitest run test/renderer/src/**/*.{test,spec}.{ts,vue}`、`pnpm vitest run test/main/ipc/proposal.spec.ts test/main/services/proposal/**/*.{test,spec}.ts`；若路由类型生成链路需要，运行 `pnpm dev` 或等价生成步骤验证 `typed-router.d.ts` 自动更新。
