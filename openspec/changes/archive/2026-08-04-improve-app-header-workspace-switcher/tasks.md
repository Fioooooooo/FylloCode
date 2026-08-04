## 1. 统一 Project / Workspace 类型呈现

- [x] 1.1 在 `src/renderer/src/utils/workspace-presentation.ts` 新增并导出 `workspaceKindIcon(kind: WorkspaceKind)`，让 folder kind 返回 `i-lucide-folder`、collection kind 返回 `i-lucide-layout-grid`；保留 `workspaceKindLabel()` 作为可见类型文案来源，不在组件中重复 kind 判断或使用 `layers-3`。
- [x] 1.2 扩展 `test/renderer/src/utils/workspace-presentation.spec.ts`，断言两种 `WorkspaceKind` 的 label 与 icon 映射，并验证单成员 Collection 的映射仍为 Workspace / `layout-grid`。

## 2. 抽取并实现 WorkspaceSwitcher

- [x] 2.1 新建 `src/renderer/src/components/layout/WorkspaceSwitcher.vue`，由该组件导入 `useWorkspaceStore()`、`useDefaultAppRoute()`、`workspaceKindLabel()` 与 `workspaceKindIcon()`，并拥有全部 dropdown projection、触发器和 footer action；不得把该小型单宿主组件包装进 `features/**` 或新增私有 store。
- [x] 2.2 在 `WorkspaceSwitcher.vue` 中构建 `dropdownItems`：recent item 携带原始 `WorkspaceLauncherItem`、类型 label/icon、当前项状态和可见摘要；Project 摘要使用 `primaryFolderPath`，Workspace 摘要包含 `folderCount` 与主 Project 信息，`missingFolderCount > 0` 时生成“X 个项目目录缺失”文字。
- [x] 2.3 使用现有 `UDropdownMenu` item slot 渲染 recent item 的类型图标、名称、Project/Workspace badge、第二行摘要、当前 check，以及 missing 的 `i-lucide-triangle-alert` 与文字；保留 menuitem 根语义、默认键盘导航和纵向滚动，并为长名称/路径使用 truncate，菜单宽度与 `app-header-dropdown-prototype.html` 的紧凑两层结构一致。
- [x] 2.4 在 `WorkspaceSwitcher.vue` 中用真实 `button` 或语义等价的 `UButton` 实现 pill 触发器，使用 `bg-elevated hover:bg-accented transition-colors` 与组件根 `-webkit-app-region: no-drag`；展示当前类型图标、名称，Collection Workspace 额外展示 Project 数量，并提供准确的 `aria-label`、可见焦点和展开状态。
- [x] 2.5 在 `WorkspaceSwitcher.vue` footer 保留“打开 Project…”及其 `openFolderWindow()` / `goToDefault()` 逻辑；随后新增 `i-lucide-layout-grid` 的“管理 Project 与 Workspace…”，仅当 `workspaceStore.windowContext?.role === "workspace"` 时显示并调用现有 `workspaceStore.openLauncherWindow()`，不得调用 router、清空当前 Workspace 或新增 overlay。
- [x] 2.6 简化 `src/renderer/src/components/layout/AppHeader.vue`：删除 Workspace store、default route 和 dropdown item 逻辑，只导入并在中间区域渲染 `<WorkspaceSwitcher />` 与 `ProjectHealthPopover`；继续由 AppHeader 保持 `h-8.75` 三栏布局、drag region、健康状态和右侧窗口控件。

## 3. 覆盖交互与回归测试

- [x] 3.1 新建 `test/renderer/src/components/workspace-switcher.spec.ts`，为 Workspace store mock 提供 `currentWorkspace`、`recentWorkspaces`、`windowContext`、`openRecentWorkspace`、`openFolderWindow` 与 `openLauncherWindow`；验证 Workspace Window 选择管理项只调用 `openLauncherWindow()`，Launcher context 不显示冗余管理项，且“打开 Project…”与 recent item 沿用现有 store action。
- [x] 3.2 在 `workspace-switcher.spec.ts` 验证 Project / Workspace icon、可见类型 badge、Workspace Project 数量和主 Project、Project 项目目录、当前 check、missing 图标与文字，以及单成员 Collection 仍呈现为 Workspace；验证触发器是可聚焦按钮并具有可访问名称。
- [x] 3.3 精简 `test/renderer/src/components/app-header.spec.ts`：使用 `WorkspaceSwitcher` stub 验证 AppHeader 挂载切换器，并保留开发者工具、通知、主题切换及 tooltip 行为测试；移除已经迁入 `workspace-switcher.spec.ts` 的 store action 和 recent item 重复测试。
- [x] 3.4 运行 `pnpm exec vitest run --project renderer test/renderer/src/utils/workspace-presentation.spec.ts test/renderer/src/components/workspace-switcher.spec.ts test/renderer/src/components/app-header.spec.ts`、`pnpm typecheck:web` 和 `pnpm lint`，修复本变更引入的失败；不得以完整 `pnpm build` 代替这些检查。
- [x] 3.5 在 dev renderer 中人工检查浅色/深色主题、Project 与 Workspace 当前态、长名称、missing 状态、菜单滚动、Enter/Space/方向键/Escape 和焦点恢复；需要自动操作时只连接 dev 进程，不操作 build/production FylloCode 进程。
