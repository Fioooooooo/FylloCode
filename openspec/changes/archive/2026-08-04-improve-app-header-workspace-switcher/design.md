## Context

`AppHeader.vue` 当前把 `recentWorkspaces` 映射为单行 `label`，底部只有“打开 Project”，触发器还是不可聚焦的 `div`。多 Project Workspace 引入后，单靠“名称 · 类型”无法在紧凑菜单里表达当前对象、Project 数量、主 Project 和 missing 状态，也没有从 Workspace Window 进入统一管理界面的入口。

现有窗口能力已经完整：`useWorkspaceStore().openLauncherWindow()` 通过 `workspace:window:openLauncher` 调用 `WorkspaceWindowManager.openLauncherWindow()`；后者会聚焦现有 Launcher 或创建 `role: "launcher"`、`workspaceId: null` 的新窗口。`openWorkspaceWindow()` 也已经区分聚焦已有窗口、从 Launcher 原地绑定以及从 Workspace Window 创建新窗口。本变更只把这些能力接到 AppHeader，不新增 Main 契约。

## Goals / Non-Goals

**Goals:**

- 让用户在 AppHeader 中快速区分 Project 与 Workspace，并看见当前项、Workspace Project 数量、主 Project 和项目目录缺失状态。
- 让 AppHeader 保持薄布局组件，把 Workspace 切换与 Launcher 入口收敛到独立组件。
- 让 Workspace Window 可以通过“管理 Project 与 Workspace…”创建或聚焦显示 WelcomeView 的 Launcher Window。
- 保留“打开 Project…”的一步快捷入口和现有窗口复用行为。
- 在上线前统一类型图标：Project 使用 folder，Workspace 使用 `layout-grid`。
- 让触发器和菜单满足键盘操作、可见焦点及非颜色状态表达要求。

**Non-Goals:**

- 不创建 Launcher overlay、管理路由或新的 BrowserWindow role。
- 不修改 `WorkspaceWindowManager`、IPC/schema、preload API、Workspace store action 返回值或持久化格式。
- 不改变最近打开上限、Workspace 创建编辑流程、回收站或 ActivityBar。
- 不把原型 HTML 作为生产运行时资源。

## Decisions

### 1. 复用现有 Launcher Window，而不是引入页面覆盖层

“管理 Project 与 Workspace…”直接调用 `useWorkspaceStore().openLauncherWindow()`，不调用 router，也不清空当前 Workspace。Main 继续负责 Launcher 的单实例与焦点：存在时恢复并聚焦，不存在时创建独立 Launcher Window。

选择该方案是因为现有 Main 已拥有窗口身份、唯一性和状态持久化；overlay 会在 `role: "workspace"` 的窗口内显示 Launcher 内容，混淆上下文所有权，还需要额外处理背景 inert、焦点恢复和打开结果状态。独立管理路由同样会让 Workspace Window 暂时承担 Launcher 身份，因此不采用。

Launcher 中选择目标时保留现有语义：目标已打开则聚焦目标，Launcher 保持 `role: "launcher"`；目标未打开则 Launcher 原地绑定为目标 Workspace Window。来自普通 Workspace Window 的切换仍聚焦已有目标或创建新窗口。

### 2. 让 Renderer presentation boundary 统一类型图标

在 `src/renderer/src/utils/workspace-presentation.ts` 增加 `workspaceKindIcon(kind)`，返回 Project 的 `i-lucide-folder` 或 Workspace 的 `i-lucide-layout-grid`。AppHeader 的触发器和 recent item 复用该函数；已知 Workspace 操作（如创建 Workspace、管理入口）继续直接使用 `i-lucide-layout-grid`。

`layout-grid` 表达多个平行 Project 的集合；`layers-3` 容易被理解为层叠、依赖或版本顺序，因此不再用于 Workspace。类型图标只辅助识别，菜单仍显示 Project/Workspace 文字，missing 状态仍包含警告图标和文字。

### 3. 将切换器收敛到独立 WorkspaceSwitcher 组件

新增 `src/renderer/src/components/layout/WorkspaceSwitcher.vue`，由它导入 `useWorkspaceStore()`、`useDefaultAppRoute()` 和 Workspace presentation helpers，并拥有 dropdown item projection、触发器、recent item slot、“打开 Project…”与“管理 Project 与 Workspace…”动作。菜单的局部 open state 或纯展示 helper 也留在该组件中。

`AppHeader.vue` 只导入并渲染 `<WorkspaceSwitcher />` 与现有 `ProjectHealthPopover`，继续拥有三栏窗口布局、drag/no-drag 分区、开发者工具、通知和主题切换。切换器不进入 `features/**`：它只有一个 header 宿主、复用现有 Workspace store，且没有独立状态机、持久化或跨入口编排，不满足 Renderer Feature Architecture 的准入条件。

测试与组件责任保持一致：新增 `test/renderer/src/components/workspace-switcher.spec.ts` 覆盖切换器的内容、动作和可访问性；`app-header.spec.ts` 只保留 header controls、布局组合以及切换器挂载边界的回归断言。

### 4. 使用 Nuxt UI DropdownMenu 语义和自定义 item 内容

`AppHeader.vue` 保留 `UDropdownMenu`，为 recent item 附加可判别的 Workspace 元数据，并通过 item slot 渲染两层信息：第一层为名称、类型 badge 和当前 check；第二层为 Project 项目目录，或 Workspace 的 Project 数量与主 Project。missing 状态在第二层显示 `triangle-alert` 和“X 个项目目录缺失”。菜单宽度保持紧凑但足以容纳摘要，长名称和路径截断，列表继续限制最大高度并纵向滚动。

触发器改用真实 `button` 或语义等价的 `UButton`，保留 pill、`bg-elevated hover:bg-accented` 和 `-webkit-app-region: no-drag`。触发器显示当前类型图标、名称；Collection Workspace 额外显示 Project 数量。`UDropdownMenu` 继续负责 Enter、Space、方向键、Escape、外部点击和焦点返回。

### 5. 管理入口只在 Workspace Window 中承担导航作用

Footer 顺序固定为“打开 Project…”和“管理 Project 与 Workspace…”。管理入口在 `windowContext.role === "workspace"` 时显示并调用 `openLauncherWindow()`；当前窗口已经是 Launcher 时，WelcomeView 本身就是管理界面，不再显示一个点击后只会聚焦自身的冗余管理项。

“打开 Project…”继续调用 `openFolderWindow()`，仅当返回 `bound-current` 对应的 WorkspaceInfo 时调用 `goToDefault()`；从 Workspace Window 打开新 Project 时由 Main 创建新窗口，来源窗口路由保持不变。

### 6. 生产实现以仓库内单页原型为视觉参考

`app-header-dropdown-prototype.html` 用于确认信息层级、选中态、图标和 footer 顺序。实现时遵守 `UiDesign.md` 的 AppHeader 高度、三栏布局、语义 token、短颜色过渡和无 hover transform 规则，不照搬原型中的静态应用内容或内嵌图标数据。

## Risks / Trade-offs

- [两层菜单项增加宽度，长 Workspace 名称或路径可能挤压] → 为名称、摘要设置可用宽度和 truncate，菜单设置明确的最小/最大宽度及最大高度，并检查窄窗口。
- [自定义 DropdownMenu slot 可能破坏默认键盘语义] → 不替换 menuitem 根节点，只定制 item 内容；测试触发器语义、item selection 和 Escape 后焦点恢复。
- [切换器抽取后 AppHeader 与子组件可能重复管理 no-drag 或布局宽度] → AppHeader 只负责 header 三栏与居中容器，`WorkspaceSwitcher.vue` 只负责自身可交互区域并在根节点声明 `no-drag`，不复制 header 高度或左右栏规则。
- [Launcher 与 Workspace Window 同时存在时用户可能看到两个窗口] → 这是现有多窗口模型的预期结果；管理入口使用明确的 Launcher 文案和既有单实例聚焦逻辑，避免重复创建。
- [图标被误认为唯一类型提示] → 始终同时显示 Project/Workspace badge 或可访问名称，missing 状态同时显示文字。
- [Renderer 测试的 DropdownMenu stub 无法呈现复杂 slot] → 扩展 `app-header.spec.ts` 的局部 stub 或对 computed item metadata 做可见 DOM 断言，不修改全局测试基础设施。

## Migration Plan

无数据迁移或依赖升级。实现仅替换 AppHeader 的 renderer 呈现并复用现有 store action；若回滚，可恢复原单行 dropdown，Main/IPC/持久化均不受影响。

## Open Questions

无。
