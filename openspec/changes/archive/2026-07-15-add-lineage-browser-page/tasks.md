## 1. Shared browser contract

- [x] 1.1 在 `src/shared/types/lineage.ts` 新增 `LineageBrowserStatus`、`LineageBrowserPlan`、`LineageBrowserProposal`、`LineageBrowserSession`、`LineageBrowserEntry` 与 `LineageBrowserData`，字段遵循 `design.md` 的可空元信息和只读投影约束，不修改现有 `Subject`/`LineageIndex` 类型。
- [x] 1.2 在 `src/shared/ipc/insight/lineage.channels.ts` 增加 `InsightLineageChannels.getBrowser = "insight:lineage:getBrowser"`，在 `src/shared/ipc/insight/lineage.schemas.ts` 增加只接受非空 `projectId` 的 `getBrowserInputSchema`；更新 `test/shared/ipc/insight/lineage.schemas.spec.ts` 覆盖合法输入、空 project ID 和额外/错误字段行为。

## 2. Main browser projection and transport

- [x] 2.1 新建 `src/main/services/insight/lineage/browser.ts`，实现纯函数 `deriveLineageBrowserStatus(...)` 和 `getLineageBrowser(projectPath)`：读取全部 subjects，按 `updatedAt` 倒序；使用 `listSessionMetas`、`readProposalFiles`/`stripArchivePrefix`、`readPlan` 补充元信息；单个 Session/Plan/Proposal 缺失时保留稳定 ID 并返回空补充字段；查询过程不得写回任何存储文件。
- [x] 2.2 新建 `test/main/services/insight/lineage/browser.spec.ts`，覆盖 applying/planned/completed/discussion 优先级、subject 排序、会话与 Proposal/Plan 元信息映射、缺失引用回退、空 subjects，以及 browser 查询不调用 lineage 写入方法。
- [x] 2.3 在 `src/main/ipc/insight/lineage.ts` 注册 `getBrowser` handler，复用 `resolveProjectPath`、`validate`、`wrapHandler` 并调用 `getLineageBrowser`；在 `src/preload/api/insight/lineage.ts` 暴露类型为 `Promise<IpcResponse<LineageBrowserData>>` 的 `getBrowser(projectId)`。
- [x] 2.4 更新 `test/main/ipc/insight/lineage.spec.ts` 与 `test/preload/api/insight/lineage.spec.ts`，验证 channel、输入校验、project path 解析、service 调用、返回值和错误包装；保持现有 lineage 点查询与 Plan mutation 测试通过。

## 3. Renderer browser state

- [x] 3.1 在 `src/renderer/src/api/insight/lineage.ts` 增加 `getBrowser(projectId)` wrapper；在 `src/renderer/src/stores/insight/lineage.ts` 保留现有方法并新增 `browserData`、`browserLoading`、`browserError`、`loadBrowser(projectId)`、`clearBrowser()`，使用 request ID 或等价机制忽略切换项目后的迟到响应，并在新请求开始前清除旧项目结果。
- [x] 3.2 新建 `test/renderer/src/stores/insight/lineage.spec.ts`，覆盖成功/空/失败响应、同步 throw、清理状态、重复请求和旧项目迟到响应隔离；断言 store 不复制 main 的状态聚合规则。

## 4. Lineage browser UI and navigation

- [x] 4.1 将 `src/renderer/src/pages/lineage.vue` 中 `MockLineage`、`mockLineages` 与静态事件数据全部替换为 `useLineageStore().browserData`；watch `useProjectStore().currentProject.id` 加载/清理数据，保留已确认的双栏布局和“全部 / 推进中 / 已归档 / 待关联”筛选，不增加搜索，并在筛选/刷新后按规格重置 `selectedId`。
- [x] 4.2 在 `src/renderer/src/pages/lineage.vue` 补齐 browser loading、页面错误、项目无 lineage、筛选无结果和缺失元信息回退；详情按 Session 分组展示只读 Plan、可打开 Proposal、可复制 Commit 与仅讨论说明，状态同时使用文字和图标，窄窗口保持上下堆叠且无横向滚动。
- [x] 4.3 在 `src/renderer/src/pages/lineage.vue` 复用 `useOpenChatSession` 打开 Session、复用 `useProposalDetailSlideover` 打开可用 Proposal、通过 router 将任务起点导航到 `/task`，并用 Clipboard API 与 Nuxt UI toast 反馈 Commit hash 复制成功/失败；缺失 metadata 的对象保持可见但禁用不可执行动作。
- [x] 4.4 新建 `test/renderer/src/pages/lineage.spec.ts`，mock project/lineage stores 与导航入口，覆盖首次加载、项目切换、四类筛选、选择回退、加载/页面错误/空状态、Session 分组、缺失元信息、打开 Session/Proposal、任务导航和 Commit 复制反馈。

## 5. Overview entry and route integration

- [x] 5.1 保留并核对 `src/renderer/src/components/overview/OverviewStatsBar.vue` 的末位“工作脉络”入口：数值使用 `stats.totalSubjects`、路由为 `/lineage`、样式与现有治理入口一致；确保 `src/renderer/src/typed-router.d.ts` 包含自动生成的 `/lineage` route，且不把 Lineage 加入 ActivityBar。
- [x] 5.2 更新 `test/renderer/src/pages/overview.spec.ts`，断言工作脉络入口位于五个治理入口的最后、显示 subject 总数并导航 `/lineage`，同时保持 Specs、Proposal、Guidelines、Knowledge 的顺序与导航断言。

## 6. Verification

- [x] 6.1 运行 `pnpm exec vitest run --project main test/main/services/insight/lineage/browser.spec.ts test/main/ipc/insight/lineage.spec.ts test/preload/api/insight/lineage.spec.ts test/shared/ipc/insight/lineage.schemas.spec.ts`，修复所有 browser service/transport 回归。
- [x] 6.2 运行 `pnpm exec vitest run --project renderer test/renderer/src/stores/insight/lineage.spec.ts test/renderer/src/pages/lineage.spec.ts test/renderer/src/pages/overview.spec.ts`，修复所有 store、页面、交互和 Overview 导航回归。
- [x] 6.3 运行 `pnpm typecheck`、`pnpm lint` 与 `git diff --check`；手动检查 `/lineage` 的桌面双栏、窄窗口堆叠、筛选切换、长标题/ID 截断和独立滚动区域，确认未修改 lineage/session/proposal/plan 的持久化格式。
