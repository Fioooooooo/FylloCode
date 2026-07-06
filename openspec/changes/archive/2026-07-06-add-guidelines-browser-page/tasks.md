## 1. 主进程与跨进程契约

- [x] 1.1 在 `src/shared/types/channels.ts` 新增 `GuidelinesChannels.getBrowser = "guidelines:getBrowser"`，并在 `src/shared/schemas/ipc/guidelines.ts` 新增 `{ projectId: z.string().min(1) }` 输入 schema。
- [x] 1.2 新增 `src/shared/types/guidelines.ts`，定义 `GuidelineBrowserItem` 和 `GuidelinesBrowserOverview`，字段包括 `path`、`name`、`description`、`keywords`、`updatedAt`、`content`、可选 `parseError`。
- [x] 1.3 新增 `src/main/services/guidelines/guidelines-browser-service.ts`，实现 `getGuidelinesBrowser(projectPath: string)`：复用 `scanGuidelines(projectPath)` 获取递归 metadata，读取每个 guideline 文件的 `stat.mtime` 和 markdown 正文，去除 YAML frontmatter 后返回按 `path` 排序的 items。
- [x] 1.4 新增 `src/main/ipc/guidelines.ts` 并在 `src/main/ipc/index.ts` 注册 handler：校验输入、通过 `loadProject(projectId)` 获取项目路径、项目不存在时返回 `PROJECT_NOT_FOUND`，成功时返回 `getGuidelinesBrowser(project.path)`。
- [x] 1.5 新增 `src/preload/api/guidelines.ts`，并更新 `src/preload/index.ts`、`src/preload/index.d.ts` 暴露 `window.api.guidelines.getBrowser(projectId)`。
- [x] 1.6 新增 `src/renderer/src/api/guidelines.ts` renderer wrapper，保持组件和 store 不直接调用 `window.api`。

## 2. Overview 入口与统计口径

- [x] 2.1 更新 `src/main/services/overview/openspec-stats.ts` 的 `countGuidelines(projectPath)`，将统计口径从顶层 `guidelines/*.md` 改为递归 `guidelines/**/*.md`，并保持目录缺失时返回 `0`。
- [x] 2.2 更新 `src/renderer/src/components/overview/OverviewStatsBar.vue`，让 `guidelines` 卡片和 `specs`、`archives` 一样成为可点击入口，点击导航 `/guidelines`；保留 `/specs` 和 `/proposal` 现有导航。

## 3. Renderer 页面与状态管理

- [x] 3.1 新增 `src/renderer/src/stores/guidelines.ts` Pinia setup store，复用 `useProjectStore()` 获取当前项目，维护 `data`、`loading`、`error`、`load(projectId?)` 和 `clear()`，并防止项目切换后旧响应覆盖新项目数据。
- [x] 3.2 新增 `src/renderer/src/pages/guidelines.vue`，使用文件路由生成 `/guidelines` 页面；页面监听当前项目变化并加载 guidelines store。
- [x] 3.3 `/guidelines` 页面左侧展示 guideline 列表，只显示 guideline 文件名；默认选中第一条，点击列表项切换选中 guideline。
- [x] 3.4 `/guidelines` 页面右侧展示选中 guideline 的详情：`name`、`description`、`keywords`、`path`、格式化 `updatedAt`、`parseError` 提示和通过 `MarkStream` 渲染的 markdown 正文。
- [x] 3.5 `/guidelines` 页面实现加载 skeleton、页面级错误状态和 `guidelines/**/*.md` 为空时的 `AppEmptyState`；页面不展示创建、编辑、删除、重命名或维护 guideline 的操作入口。

## 4. 测试

- [x] 4.1 新增 `test/main/services/guidelines/guidelines-browser-service.spec.ts`，覆盖递归读取、按 path 排序、frontmatter metadata 复用、正文去 frontmatter、parse error 保留、目录缺失返回空列表。
- [x] 4.2 更新 `test/main/services/overview/openspec-stats.spec.ts`，覆盖 `guidelines/**/*.md` 子目录文件计入 `guidelinesCount`，非 markdown 文件和目录不计入。
- [x] 4.3 新增或更新 main IPC/preload 相关测试，覆盖 `guidelines:getBrowser` 输入校验、项目不存在错误和成功响应路径。
- [x] 4.4 新增 `test/renderer/src/pages/guidelines.spec.ts`，覆盖加载状态、列表和详情渲染、默认选中、切换选中项、空状态、错误状态和 parse error 提示。
- [x] 4.5 更新 `test/renderer/src/pages/overview.spec.ts`，断言项目准则卡片是可点击 button，点击后 `router.push("/guidelines")`；保留能力规约 `/specs` 和归档提案 `/proposal` 断言。

## 5. 验证

- [x] 5.1 运行 `pnpm exec vitest run --project main -- test/main/services/guidelines/guidelines-browser-service.spec.ts test/main/services/overview/openspec-stats.spec.ts`。
- [x] 5.2 运行 `pnpm exec vitest run --project renderer -- test/renderer/src/pages/guidelines.spec.ts test/renderer/src/pages/overview.spec.ts`。
- [x] 5.3 运行 `pnpm typecheck` 确认 shared/preload/renderer 类型链路完整。
