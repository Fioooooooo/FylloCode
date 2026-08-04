## Why

AppHeader 当前只用单行名称区分最近打开项，并且底部只有“打开 Project”快捷入口；在 Project 与多 Project Workspace 同时存在后，用户难以快速确认对象类型、成员摘要和当前选择，也无法从 Workspace Window 回到统一管理入口。Workspace 功能尚未上线，适合在发布前统一类型图标和切换器交互，避免形成不一致的视觉语义。

## What Changes

- 将 AppHeader 中间的触发器改为可聚焦的语义按钮，展示当前 Project/Workspace 的类型图标、名称，以及 Workspace 的 Project 数量。
- 将切换器提取为独立的 `WorkspaceSwitcher.vue`，由该组件拥有 dropdown 数据、触发器、recent item 和 footer actions；`AppHeader.vue` 只负责窗口 header 布局与组合，避免继续堆积 Workspace 交互逻辑。
- 将最近打开项改为带类型图标、Project/Workspace 可见类型、摘要和当前选中标记的两层信息结构；Workspace 显示 Project 数量与主 Project，缺失项目目录使用图标加文字说明。
- 保留“打开 Project…”快捷操作，并新增“管理 Project 与 Workspace…”；该入口调用现有 Launcher Window 能力，创建或聚焦显示 WelcomeView 的 Launcher Window，不改变当前 Workspace Window 的路由或上下文。
- 保留现有窗口复用规则：Launcher 选择已打开目标时聚焦目标并保留 Launcher；选择未打开目标时将 Launcher Window 原地绑定为目标 Workspace Window。Workspace Window 中切换目标时继续聚焦已有窗口或创建新窗口。
- 统一类型图标：Project 使用 folder，Workspace 使用 `layout-grid`；`layout-grid` 同时用于创建 Workspace、Workspace 类型项和 Project/Workspace 管理入口，不再使用 `layers-3` 表达 Workspace。
- 不新增 IPC、窗口类型、路由、数据结构或外部依赖。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `workspace-window`: 为 Workspace Window 的 AppHeader 增加可识别的上下文切换器和 Launcher 管理入口，并明确从 Launcher 选择已打开或未打开目标时的窗口保留与原地绑定规则。
- `workspace-presentation-terminology`: 统一 Project 与 Workspace 的用户可见类型图标，并要求图标与可见类型文案共同表达对象语义。

## Impact

- Renderer：新增 `src/renderer/src/components/layout/WorkspaceSwitcher.vue`，简化 `src/renderer/src/components/layout/AppHeader.vue`，调整 `src/renderer/src/utils/workspace-presentation.ts` 及对应测试。
- 复用：`useWorkspaceStore().openRecentWorkspace()`、`openFolderWindow()`、`openLauncherWindow()` 和现有 Nuxt UI `UDropdownMenu`。
- Main：继续复用 `WorkspaceWindowManager.openLauncherWindow()` / `openWorkspaceWindow()`，预计不修改主进程窗口生命周期代码。
- 规范：补充 `workspace-window` 与 `workspace-presentation-terminology` 的行为要求；现有 renderer、UI、测试与质量门禁 guideline 已覆盖实现约束，无需新增或更新 guideline。
