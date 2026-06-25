## 1. 共享契约与 IPC

- [x] 1.1 在 `src/shared/types/specs.ts` 新增 specs browser DTO：`SpecBrowserItem`、`SpecRequirementGroup`、`SpecScenarioGroup`、`SpecsBrowserOverview`，字段只包含 `id`、`purpose`、`sourcePath`、`updatedAt`、`requirementsCount`、`scenariosCount`、`requirementGroups`，不得包含 `title`、`family`、`familyLabel`、`anchors`。
- [x] 1.2 在 `src/shared/types/channels.ts` 新增 `SpecsChannels.getSpecsBrowser`，channel 字符串使用 `specs:getSpecsBrowser`。
- [x] 1.3 在 `src/shared/schemas/ipc/` 新增 specs browser 输入 schema，入参为 `{ projectId: string }`，校验规则与 `overview:getProjectOverview` 一致。
- [x] 1.4 在 `src/preload/api/specs.ts` 暴露 `getSpecsBrowser(projectId: string): Promise<IpcResponse<SpecsBrowserOverview>>`，并在 preload 聚合入口中挂载到 `window.api.specs`。

## 2. 主进程读取与解析

- [x] 2.1 新增 `src/main/services/specs/specs-markdown-parser.ts`，实现 `parseSpecMarkdown(id: string, sourcePath: string, content: string, updatedAt: string): SpecBrowserItem`，解析 `## Purpose`、`### Requirement:` / `### 要求：`、`#### Scenario:` / `#### 场景：`。
- [x] 2.2 解析器 SHALL 忽略 `#` 一级标题；将 `## Purpose` 内容写入 `purpose`；将 Requirement 标题之后、首个 Scenario 之前的 markdown 写入 `SpecRequirementGroup.body`；将 Scenario 标题之后、下一个 Scenario 或 Requirement 之前的 markdown 写入 `SpecScenarioGroup.body`。
- [x] 2.3 新增 `src/main/services/specs/specs-browser-service.ts`，读取 `openspec/specs` 下一级子目录的 `spec.md`，按 capability id 排序返回 `SpecsBrowserOverview.items`；目录缺失时返回空列表。
- [x] 2.4 新增 specs IPC handler，按 `projectId` 解析 projectPath 后调用 `getSpecsBrowser(projectPath)`，错误归一化与 overview IPC 保持一致。
- [x] 2.5 添加主进程测试：`test/main/services/specs/specs-markdown-parser.spec.ts` 覆盖中英文 Requirement/Scenario heading、Purpose 提取、跳过一级标题、不返回 title/family/anchors；`test/main/services/specs/specs-browser-service.spec.ts` 覆盖标准目录、目录缺失、排序与 updatedAt。

## 3. Renderer 状态与页面

- [x] 3.1 新增 `src/renderer/src/api/specs.ts`，作为 `window.api.specs.getSpecsBrowser` 的唯一 renderer 薄封装入口。
- [x] 3.2 新增 `src/renderer/src/stores/specs.ts`，提供 `load(projectId?: string)`、`clear()`、`data`、`loading`、`error`，页面通过 store 消费数据，不直接调用 `window.api`。
- [x] 3.3 在 `src/renderer/src/pages/specs.vue` 基于 linked worktree 中复制过来的静态原型替换 mock 数据为 store 数据：左侧列表显示 capability id + Purpose 单行摘要；右侧 header 显示 id、purpose、sourcePath、updatedAt、requirementsCount、scenariosCount。
- [x] 3.4 `src/renderer/src/pages/specs.vue` SHALL 从 `selectedSpec.requirementGroups` 派生 Requirement 快速定位栏；不得引入 `anchors` DTO 字段；点击索引项滚动到对应 Requirement 并高亮当前点击项。
- [x] 3.5 `src/renderer/src/pages/specs.vue` SHALL 使用 Vue 文本渲染 Requirement/Scenario 标题，使用 `MarkStream` 渲染 Requirement body 和 Scenario body；Scenario 列表保留当前 timeline 视觉。
- [x] 3.6 为 `/specs` 页面实现 loading、error、空态：loading 使用项目现有 skeleton 或 loader 模式；error 使用 error alert；空列表使用 `AppEmptyState`，文案说明当前项目暂无能力规约。

## 4. 路由与概览入口

- [x] 4.1 修改 `src/renderer/src/components/overview/OverviewStatsBar.vue`，让 `key === "specs"` 与 `key === "archives"` 两张卡片使用 `UiSurface as="button" interactive`；点击 specs 卡跳转 `/specs`，点击 archives 卡跳转 `/proposal`。
- [x] 4.2 更新 `src/renderer/src/pages/index.vue` 或对应项目作用域路由守卫，使 `/specs` 在无当前项目时被阻止并回到 WelcomeView；不要为了这个原型把 `/specs` 加入 ActivityBar。
- [x] 4.3 运行路由生成链路，确认 `src/renderer/src/typed-router.d.ts` 自动包含 `/specs`；不得手动编辑生成文件。

## 5. 测试与文档同步

- [x] 5.1 更新 `test/renderer/src/pages/overview.spec.ts`，断言 specs 卡为 button 且点击跳转 `/specs`，archives 卡仍跳转 `/proposal`，guidelines/lineages 仍不跳转。
- [x] 5.2 新增 `test/renderer/src/pages/specs.spec.ts` 或等价组件测试，mock `specsApi.getSpecsBrowser`，覆盖列表渲染、选择 spec、Requirement 快速定位项渲染、Scenario timeline 文案、空态与错误态。
- [x] 5.3 核对 `guidelines/RendererProcess.md` 与 `guidelines/IPC.md` 是否需要补充 specs browser API/channel；如果新增 IPC channel 和 renderer store 约束未被现有文档覆盖，更新对应 guideline。
- [x] 5.4 验证命令：`pnpm typecheck:web`、`pnpm lint`、`pnpm vitest run test/main/services/specs/**/*.{test,spec}.ts`、`pnpm vitest run test/renderer/src/pages/overview.spec.ts test/renderer/src/pages/specs.spec.ts`。
