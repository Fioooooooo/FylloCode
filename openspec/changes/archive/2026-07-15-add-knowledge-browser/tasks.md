## 1. Knowledge browser 跨进程契约

- [x] 1.1 在 `src/shared/types/knowledge.ts` 新增 `KnowledgeBrowserEntry`、`KnowledgeBrowserError`、`KnowledgeBrowserOverview` DTO；在 `src/shared/ipc/insight/knowledge.channels.ts` 增加 `getBrowser` / `deleteEntry` channel，在 `knowledge.schemas.ts` 增加只接收 `projectId` 的 browser schema 和复用 `knowledgeEntryNameSchema` 的 delete schema。验收：类型不携带完整 body，delete 输入不能接受任意 path。
- [x] 1.2 在 `src/main/services/insight/knowledge/knowledge-document-service.ts` 实现 `getKnowledgeBrowser()` 与 `deleteKnowledgeEntry()`：browser 复用 `readKnowledgeIndex()` 并裁剪 entry，error 仅在 filename stem 合法时补 `name`；delete 与 read/save 复用安全路径解析并把 ENOENT 映射为 `KNOWLEDGE_ENTRY_NOT_FOUND`。在 `test/main/services/insight/knowledge/knowledge-document-service.spec.ts` 覆盖空目录、正常/损坏混合扫描、status 投影、合法删除、not-found 和路径逃逸。
- [x] 1.3 在 `src/main/ipc/insight/knowledge.ts` 注册 `getBrowser` / `deleteEntry` handler，继续使用 `validate()`、`resolveProjectPath()` 和 `wrapHandler()`；扩展 `test/main/ipc/insight/knowledge.spec.ts`，断言项目解析、schema 拒绝和 service 调用参数，且不破坏现有 read/save handler。
- [x] 1.4 扩展 `src/preload/api/insight/knowledge.ts`、`src/preload/index.ts`、`src/preload/index.d.ts` 暴露 `window.api.insight.knowledge.getBrowser()` / `deleteEntry()`；扩展 `test/preload/api/insight/knowledge.spec.ts`，断言 domain-first channel、projectId 和 name 参数形状。

## 2. Renderer API、store 与展示模型

- [x] 2.1 扩展 `src/renderer/src/api/insight/knowledge.ts` 的 browser/delete wrappers，并更新 `test/renderer/src/api/insight/knowledge.spec.ts` 验证委托到 `window.api.insight.knowledge` 的新方法和返回类型。
- [x] 2.2 扩展 `src/renderer/src/stores/insight/knowledge.ts`，增加 `data`、`loading`、`error`、`load(projectId?)`、`deleteEntry(projectId, name)`、`clear()`，保留既有 `readEntry` / `saveEntry`。`load()` 复用 `useGuidelinesStore()` 的 current-project race guard；在 `test/renderer/src/stores/insight/knowledge.spec.ts` 覆盖成功、错误、项目切换迟到响应、clear 和删除结果，验收旧项目数据不会提交到新项目。
- [x] 2.3 创建传统 renderer utility `src/renderer/src/utils/knowledge-markdown.ts`，实现并导出 `prepareKnowledgeMarkdownForDisplay()`：只识别 BOM/CRLF 兼容的开头 `---` 边界，使用不会被内容中 backtick 提前关闭的 YAML fence 包装完整 frontmatter，其余原文透传。按 `guidelines/CodeComments.md` 为 regex 说明边界策略，并在 `test/renderer/src/utils/knowledge-markdown.spec.ts` 覆盖大数组、BOM、CRLF、内嵌 backtick、无 frontmatter和缺失结束 delimiter；不得为该 utility 创建 feature 或 feature public entry。

## 3. 独立 Knowledge reader 页面

- [x] 3.1 创建 `src/renderer/src/pages/knowledge.vue`、`src/renderer/src/components/knowledge/KnowledgeBrowserList.vue` 和 `src/renderer/src/components/knowledge/KnowledgeDocumentReader.vue`，采用传统 pages/components 组织，不创建 `src/renderer/src/features/knowledge-browser/**`。复用 `/guidelines` 的双栏布局、`PageHeader`、`UiSurface`、`AppEmptyState` 和 `MarkStream`；列表组件按 `project` / `reference` / `feedback` 分组，组内按 `suspect`、`unknown`、`active` 后按更新时间倒序，每项用文字 badge 显示状态。验收：`/knowledge` 由 auto route 提供且 `src/renderer/src/config/activity-bar.ts` 不新增 item。
- [x] 3.2 在 `KnowledgeBrowserList.vue` 增加“无法索引”分组：显示 path、错误类型和原因，只有 DTO 带合法 `name` 时 emit 选择意图；由 `pages/knowledge.vue` 调用既有 `knowledgeStore.readEntry()` 并以局部 request token 隔离快速切换的迟到响应，再把状态和 `prepareKnowledgeMarkdownForDisplay()` 结果传给 `KnowledgeDocumentReader.vue` 使用 `MarkStream(enableActions=false)` 渲染。验收：子组件不访问 API，detail loading/error/空态明确，展示不会调用 save API。
- [x] 3.3 在 `KnowledgeDocumentReader.vue` emit 删除意图，由 `pages/knowledge.vue` 复用 `useConfirmDialog()` 完成流程；弹窗标题/描述包含 `<name>.md`、不可撤销说明、`confirmColor: "error"` 和“删除知识”按钮。确认后调用 store delete 并刷新 index；成功时选下一项、否则上一项，失败时保留选择与正文并允许重试；非法 error path 不展示删除按钮，请求期间禁用重复操作。
- [x] 3.4 新增 `test/renderer/src/components/knowledge/knowledge-browser-list.spec.ts`、`test/renderer/src/components/knowledge/knowledge-document-reader.spec.ts` 与 `test/renderer/src/pages/knowledge.spec.ts`，用 Nuxt UI stub 聚焦验证分组和排序、三种 status 文案、扫描错误、raw Markdown 请求、迟到响应、空/错/加载状态、confirm 取消、删除成功选择迁移和删除失败保留状态，不断言 UI 库内部实现。

## 4. Overview 治理入口

- [x] 4.1 调整 `src/renderer/src/pages/overview.vue`，在项目变化时分别触发 `useOverviewStore().load()` 与 `useKnowledgeStore().load()`，清理时分别调用 owner store 的 `clear()`；knowledge load 失败不得写入 `overviewStore.error`，并把 count、attention count、loading、error 投影传给治理健康组件。count 统计 `entries + errors`，attention count 统计 `suspect + unknown + errors`。
- [x] 4.2 扩展 `src/renderer/src/components/overview/OverviewStatsBar.vue`，在首个分隔线下使用每排三个入口的 grid，让“知识沉淀”与能力规约、归档提案、项目准则复用同一 stat button 模板并作为第四项自然换行：成功时与其他入口一样显示不带单位的数量，关注提示不使用“条”，loading 显示“正在加载…”，error 显示“暂不可用”，所有状态点击都导航 `/knowledge`。保持现有 `/specs`、`/proposal`、`/guidelines` 交互和 focus-visible 反馈，并允许未来入口继续加入同一网格。
- [x] 4.3 扩展 `test/renderer/src/pages/overview.spec.ts`，覆盖知识入口成功/关注/loading/error 文案、正常条目与 scanner errors 的统计、全部为 scanner errors 的统计、到 `/knowledge` 的导航、knowledge 失败不替换 overview 成功内容，以及项目切换时两个 store 各自清理；保留现有治理健康和页面级 overview 错误断言。

## 5. 指南与验证

- [x] 5.1 更新 `guidelines/MainProcess.md` 的 durable knowledge 边界，明确 `insight:knowledge` 除 raw review read/save 外还拥有 scanner-backed browser index 和按合法 name 删除单个 app-data entry 的能力，并重申不得暴露任意 path 删除。
- [x] 5.2 首次运行项目命令前执行 `sh scripts/prepare-worktree-env.sh`，然后运行 `pnpm exec vitest run --project main`、`pnpm exec vitest run --project renderer`、`pnpm typecheck`、`pnpm lint` 和 `pnpm test`。修复由本变更引入的失败，验收所有命令通过且无未处理 Promise rejection。
- [x] 5.3 人工检查 `/overview` 与 `/knowledge` 的浅色/深色、窄窗口和桌面窗口：确认双栏无无意义横向滚动，frontmatter 大数组可滚动阅读，badge 不只靠颜色，键盘焦点可见，空/错/加载状态明确，删除取消/成功/失败均符合规格。
