## Context

`ChatContainer.vue` 当前使用三栏 Header：左侧是聊天列表/新建会话操作，中间是 `OriginTaskBanner`，右侧保留 placeholder。Header 下方另行渲染 `SessionScopeHeader.vue`；该组件以原生 `<details>` 展示 active Session 的 `workspaceSnapshot` 与 `activeSessionScopeDiff`，展开后最多以两列呈现 16 个 Project，但没有最大高度，因此会直接占用 Chat 消息区的垂直空间。

本变更已经通过 `references/designs/multi-root-workspace/prototype/session-scope-popover.html` 收敛 UI/UX：授权范围入口进入 Header 右侧，内容改为按需打开的单列 Popover，Project 列表在固定最大高度内纵向滚动。现有 `SessionWorkspaceSnapshot`、`activeSessionScopeDiff`、`workspaceKindLabel` 和用户呈现术语继续作为唯一数据与文案来源。

相关约束：

- active Session snapshot 表示 Agent 的历史固定授权，不能用当前 Workspace Folder 列表替换。
- `activeSessionScopeDiff.isStale` 的优先级高于普通 `hasChanges`；失效与差异必须在打开 Popover 前仍可发现。
- icon-only button 必须有 tooltip、`aria-label`、可见 focus 和非纯颜色的状态表达。
- 最多 16 个 Project 时不得让 Chat 产生横向滚动，也不得再次压缩消息列表高度。
- 用户可见术语使用 Project、Workspace、主 Project 与项目目录；内部 Folder、schema、IPC 和 Agent/MCP contract 不改名。

## Goals / Non-Goals

**Goals:**

- 使用 Header 右侧 icon button 与 Popover 替换常驻的 Session scope 展开区块。
- 在 Popover 中完整展示 snapshot Project 的名称、项目目录、数量、顺序和主 Project。
- 让正常、范围变化和授权失效状态在紧凑入口上可发现，并在 Popover 内保留现有差异说明。
- 让 1–16 个 Project 都在稳定尺寸内可读，长路径截断但可查看完整值，超量内容只在 Popover 内纵向滚动。
- 保持键盘、焦点、浅色/深色 token 和窄窗口行为符合现有 Nuxt UI 组件模式。

**Non-Goals:**

- 不改变 Session snapshot 创建、持久化、恢复或 stale 校验。
- 不改变 Workspace 成员、primary、ACP `cwd/additionalDirectories`、MCP descriptor 或文件授权。
- 不给当前 Session 增加热更新授权、编辑成员或新建 Session 的快捷操作。
- 不新增横向滚动、分页、搜索、虚拟列表或外部依赖。
- 不改名内部 `Folder`、`SessionWorkspaceSnapshot`、`activeSessionScopeDiff` 或其他 contract。

## Decisions

### 1. 将展示组件改为 `SessionScopePopover.vue`，由 ChatContainer Header 装配

用 `src/renderer/src/components/chat/SessionScopePopover.vue` 替换 `SessionScopeHeader.vue`，并在 `ChatContainer.vue` 的右侧 `w-1/5` action container 内、仅非 draft Session 时渲染。组件自身继续以 active Session 是否存在 `workspaceSnapshot` 作为最终可见性边界。

选择独立组件而不是把所有模板写进 `ChatContainer.vue`，是为了让 snapshot/diff 文案、Popover open state 和项目列表测试保持聚合；重命名而不是保留 `Header` 名称，避免组件名继续暗示它占据整行 Header 下方空间。

### 2. 使用 `UPopover` 而不是 `UDropdownMenu` 或 `<details>`

入口复用项目中 `ProjectHealthPopover.vue` 的 `UPopover` + `UTooltip` + `UButton` 组合模式：

- `UButton` 使用 `color="neutral"`、`variant="ghost"`、`size="sm"` 与 `i-lucide-folder-key`；tooltip 和 `aria-label` 为“Agent 授权范围”。
- Popover content 相对 trigger 向下、右对齐，宽度以原型约 380px 为桌面基准，并设置不超过窄窗口可用宽度的约束。
- 受控 `open` state 支持显式关闭按钮；同时依赖 `UPopover` 提供点击外部和 `Escape` 关闭，并让关闭后焦点回到 trigger。

Popover 适合承载可阅读的结构化信息；DropdownMenu 会错误暗示列表项可执行，继续使用 `<details>` 则无法解决纵向空间侵占。

### 3. 只投影现有 snapshot 与 diff，不新增第二套比较逻辑

组件继续直接读取：

- `activeSession.workspaceSnapshot`：有序 Project 列表、`primaryFolderId`、历史名称和历史路径；
- `activeSessionScopeDiff`：`currentOnly`、`snapshotOnly`、`primaryChanged`、`nameChanges`、`pathChanges`、`unavailableFolderIds`、`hasChanges` 与 `isStale`；
- `workspaceKindLabel(currentWorkspace.kind)`：当前顶层对象的 Project/Workspace 呈现。

trigger 状态按 `isStale` → `hasChanges` → normal 的优先级投影。普通状态不显示额外 indicator；差异与失效状态使用具有不同图形语义的 warning/error indicator，并把对应状态写入 tooltip/`aria-label`。Popover 内继续使用可见文字完整解释状态，不依赖颜色推断。

### 4. Popover 使用单列有序列表和内部纵向滚动

Popover 标题为“Agent 可访问的 Project”，副标题为“共 X 个 Project · 会话创建时固定”。列表保持 `snapshot.folders` 顺序，不按 primary 重新排序；每行展示 `folderName` 和代码样式的 `folderPath`，长文本使用 `truncate`，并通过 `title` 暴露完整值。

列表采用约 `max-h-72` 的最大高度、`overflow-y-auto`、`overscroll-contain` 和 `min-w-0`，不设置 `overflow-x-auto`。因此 16 个 Project 只在 Popover 内纵向滚动，Chat message section 的高度保持不变。

### 5. 主 Project 使用颜色点与可见文字双重标识

primary 行在名称前显示 teal primary dot，并在行末显示“主 Project”文字；非 primary 行保留对齐槽位但不显示 dot 或标签。颜色点提供快速扫视，文字满足颜色不能独立承担状态语义的可访问性约束。

不使用较重的 primary badge，避免 16 项列表中标签竞争过强；不省略“主 Project”文字，因为仅使用颜色点会让色觉差异用户无法确认语义。

### 6. 差异说明位于列表之前，固定授权说明位于底部

当 `hasChanges` 时，在项目列表之前展示状态 surface：失效使用 error，普通差异使用 warning，并复用现有逐项差异文案和“新建 Session 才能获得当前 Project 授权”提示。Popover 底部始终显示“此授权范围在 Session 创建时固定；Workspace 成员变更不会自动更新当前 Session。”

这样用户先理解风险，再读取历史授权列表；trigger 上的 indicator 只承担发现性，不试图在 30px icon button 内承载全部差异。

### 7. 原型是视觉基准，Nuxt UI token 是实现基准

实现应复用原型的信息结构、尺寸节奏和四种场景，但不复制原型的静态 App shell、示例数据或原生 JavaScript。最终组件使用 Nuxt UI、Tailwind 语义 token 和现有 stores；不添加专用 CSS 文件或新依赖。

## Risks / Trade-offs

- [授权范围从常驻区域变为按需内容，正常状态的信息可见性降低] → Header 始终保留语义明确的 `folder-key` 入口、tooltip 和数量清晰的 Popover 标题；差异/失效额外显示状态 indicator。
- [Popover 在窄窗口超出 Chat 卡片] → 使用右对齐锚点与 viewport-aware 宽度限制，并人工检查窄窗口；列表只纵向滚动。
- [状态 indicator 变成只靠颜色表达] → warning/error 使用不同 icon shape，并在 tooltip、`aria-label` 和 Popover status surface 中提供文字。
- [组件重命名导致测试或自动 import 残留] → 同步更新 `ChatContainer.vue`、组件测试 import/stub 和生成的 component declaration（若项目工具链要求），并用全仓搜索确认无 `SessionScopeHeader` 残留。
- [Popover 内 16 项加差异说明仍可能过高] → 仅列表区域设置固定最大高度；header、状态和 footer 保持可见，整体由浮层承载而不影响消息布局。

## Migration Plan

1. 将 `SessionScopeHeader.vue` 与对应测试重命名并改造成 Popover，同时保留原 selector 和文案逻辑。
2. 把组件从 ChatContainer Header 下方迁入右侧 action container，删除旧常驻布局装配。
3. 扩展组件和 ChatContainer 测试，按原型人工检查正常、16 项、差异、失效和键盘状态。
4. 该变更不涉及数据迁移；回滚时恢复旧组件和装配即可，Session 数据与授权 contract 不受影响。

## Open Questions

无。Popover、icon、主 Project 标识、列表滚动和状态呈现均已通过原型确认。
