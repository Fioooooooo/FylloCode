---
name: UiDesign
description: Governs renderer UI and UX design tokens, layout hierarchy, component patterns, copy, accessibility, and motion.
keywords: [frontend, ui, design, tailwind, nuxt-ui, accessibility]
---

# UiDesign

## 范围

- 覆盖：`src/renderer/src/**` 下的页面、组件、全局样式和 UI 文案；`src/renderer/index.html`；`src/renderer/src/assets/main.css`；以及 renderer 侧 `@nuxt/ui` / Tailwind CSS 视觉约定。
- 不覆盖：renderer 路由、store、bootstrap 和 API wrapper 所有权；见 `guidelines/RendererProcess.md`。
- 不覆盖：测试位置、Vitest project 或质量命令；见 `guidelines/Testing.md` 和 `guidelines/QualityGates.md`。

## 规则

### 设计原则

- MUST 让颜色表达状态，而不是装饰。颜色深浅用于表达 default、hover、active、selected、disabled、danger 等状态意图；新增颜色必须能说明它表达的状态或层级。证据：`electron.vite.config.ts`、`src/renderer/src/components/layout/ActivityBar.vue`、`src/renderer/src/pages/settings.vue`。
- MUST 优先使用 Nuxt UI / Tailwind CSS 的语义 class 和组件 props。只有语义 class 不能表达状态强度时，才使用 `bg-primary/15`、`border-primary/40`、`bg-elevated/50` 等透明度微调。证据：`electron.vite.config.ts`、`src/renderer/src/components/shared/UiSurface.vue`。
- MUST 通过背景层级、间距、字体权重和有限边界建立结构，不依赖大面积渐变、重阴影或 hover transform。证据：`src/renderer/src/layouts/AppLayout.vue`、`src/renderer/src/pages/overview.vue`。
- MUST 保持相同语义使用相同视觉模式，不为局部页面创造一次性样式。共享模式优先落到 `src/renderer/src/components/shared/**` 或现有布局组件。证据：`src/renderer/src/components/shared/UiSurface.vue`、`src/renderer/src/components/shared/AppEmptyState.vue`。

### Design Tokens

- MUST 保持 Nuxt UI 主题色为 `primary: "teal"`、`secondary: "cyan"`、`neutral: "slate"`，除非先更新本规范和相关主题配置。证据：`electron.vite.config.ts`。
- MUST 优先使用语义颜色 class：页面/卡片表面使用 `bg-default`，框架区域使用 `bg-muted/30`，输入框和列表卡片使用 `bg-elevated`，默认边界使用 `border-default/50`，正文使用 `text-default`，弱信息使用 `text-muted`，标题使用 `text-highlighted`。证据：`src/renderer/src/layouts/AppLayout.vue`、`src/renderer/src/components/layout/AppHeader.vue`、`src/renderer/src/pages/overview.vue`。
- MUST 将 teal 作为状态强调色，用于主操作、当前流程、选中态和关键状态提示；不要把 teal 当作大面积品牌背景。证据：`src/renderer/src/components/layout/ActivityBar.vue`、`src/renderer/src/pages/settings.vue`。
- SHOULD 使用 Tailwind 默认圆角：按钮、输入框、badge 使用 `rounded-md`；卡片和列表项使用 `rounded-lg`；modal/panel/大图标容器使用 `rounded-xl`；欢迎页或低密度展示区域可使用 `rounded-2xl`。证据：`src/renderer/src/components/shared/UiSurface.vue`、`src/renderer/src/components/shared/AppEmptyState.vue`。
- MUST 使用 Tailwind 默认 spacing scale，不新增自定义 spacing token。默认节奏是同组元素 8px、组间 16px、页面区块 24px，低密度首屏可放大到 32px。证据：`src/renderer/src/pages/overview.vue`、`src/renderer/src/pages/integration.vue`、`src/renderer/src/pages/settings.vue`。
- MUST 使用 Nuxt UI / Tailwind 默认字体族；不要在 `src/renderer/src/assets/main.css` 中重设全局字体。代码、路径、命令片段可以使用现有 code / mono 样式。证据：`src/renderer/src/assets/main.css`。

### 阴影与动效

- MUST 让阴影只表达空间层级，不用于 hover 反馈。基础层和默认卡片使用 `shadow-none`，输入框或小浮层可使用 `shadow-sm`，modal、toast、command palette 可使用 `shadow-lg` 或 `shadow-xl`。证据：`src/renderer/src/components/shared/UiSurface.vue`、`src/renderer/src/pages/overview.vue`。
- MUST 禁止 hover 时的 `scale`、`translate`、`rotate`、`shadow` 变化、bounce/spring、渐变、彩虹或发光动画；hover 反馈只改变颜色、背景或边界强度。证据：`src/renderer/src/components/shared/UiSurface.vue`、`src/renderer/src/components/layout/ActivityBar.vue`。
- MUST 避免 `transition-all`，优先声明 `transition-colors duration-150`、`transition-opacity duration-200` 等具体属性。证据：`src/renderer/src/components/shared/UiSurface.vue`、`src/renderer/src/components/layout/AppHeader.vue`。
- SHOULD 使用短而稳定的过渡：颜色/背景/边框使用 `duration-150`，透明度或进入动画使用 `duration-200`；避免 `duration-75` 以下的闪烁和 `duration-500` 以上的拖沓感。

### 布局层级

- MUST 保持唯一全局 `<main>` 在 `src/renderer/src/layouts/AppLayout.vue` 中。页面 slot 内不要再嵌套全局 `<main>` 或全局 `<aside>` landmark；分区使用 `div`、`nav`、`section`。证据：`src/renderer/src/layouts/AppLayout.vue`、`src/renderer/src/pages/settings.vue`。
- MUST 保持应用框架层级：`AppHeader` 使用 `h-8.75 bg-muted/30 border-b border-default/50`；`ActivityBar` 使用 `w-16 bg-muted/30 border-r border-default/50`；`AppLayout main` 使用 `flex-1 flex p-2 min-w-0 bg-elevated`；内容 shell 使用 `rounded-lg bg-default overflow-auto`。证据：`src/renderer/src/components/layout/AppHeader.vue`、`src/renderer/src/components/layout/ActivityBar.vue`、`src/renderer/src/layouts/AppLayout.vue`。
- MUST 让卡片化页面根容器使用 `flex flex-1 overflow-hidden bg-elevated space-x-2`，内部主内容卡片、侧栏卡片和事件栏卡片使用 `rounded-lg bg-default overflow-auto`。证据：`src/renderer/src/pages/settings.vue`。
- SHOULD 按信息密度选择内容宽度：多列概览和集成页用 `max-w-6xl`，中等密度任务页用 `max-w-5xl`，文本列表或 proposal 列表用 `max-w-3xl`，设置/表单用 `max-w-2xl`。证据：`src/renderer/src/pages/overview.vue`、`src/renderer/src/pages/integration.vue`、`src/renderer/src/pages/settings.vue`。
- MUST 使用 Tailwind 默认 breakpoint，不新增自定义 breakpoint；窄窗口和桌面窗口都不能出现无意义横向滚动。证据：`src/renderer/src/pages/overview.vue`、`src/renderer/src/pages/integration.vue`。

### 组件模式

- MUST 通过 `electron.vite.config.ts` 中的 `renderer.plugins.ui` 做 Nuxt UI 全局样式覆盖；局部覆盖使用组件 `ui` prop 或 `class`；不要用外部 CSS 选择器覆盖 Nuxt UI 内部结构。证据：`electron.vite.config.ts`、`src/renderer/src/components/layout/AppHeader.vue`。
- MUST 让全局 overlay 通过 Nuxt UI theme 配置统一声明。`UModal`、`USlideover` overlay 使用 `bg-black/45 dark:bg-black/60 fyllo-overlay-blur`；`fyllo-overlay-blur` 固定维护在 `src/renderer/src/assets/main.css`，不要在 theme 配置里使用 Tailwind arbitrary backdrop utility。证据：`electron.vite.config.ts`、`src/renderer/src/assets/main.css`。
- MUST 优先使用 `UiSurface.vue` 构建默认卡片。`UiSurface` 支持 `as`、`variant`、`interactive`、`padding` props；默认使用 `rounded-lg bg-elevated dark:shadow-none`，interactive 状态使用 `hover:bg-accented`。证据：`src/renderer/src/components/shared/UiSurface.vue`。
- MUST 保持可点击卡片 hover 只改变背景或边界强度，例如 `hover:bg-accented`、`hover:bg-elevated`、`hover:border-primary/40`；禁止 hover scale、translate 和 shadow 变化。证据：`src/renderer/src/components/shared/UiSurface.vue`。
- MUST 优先用 Nuxt UI props 表达按钮语义：主操作使用 `UButton color="primary"`；次要操作使用 `color="neutral" variant="outline"`；工具栏和 icon button 使用 `color="neutral" variant="ghost"`；危险操作使用 `color="error"`。同一区域内避免多个并列 primary 按钮。证据：`src/renderer/src/components/shared/AppEmptyState.vue`、`src/renderer/src/components/layout/AppHeader.vue`。
- MUST 让 icon-only 按钮具备 tooltip 或 `aria-label`，视觉图标不能是唯一可理解的状态说明。证据：`src/renderer/src/components/layout/AppHeader.vue`、`src/renderer/src/components/layout/ActivityBar.vue`。
- MUST 使用 `AppEmptyState.vue` 表达空状态，不使用纯文字空态。空状态必须包含图标、标题、描述和可选主操作；卡片内空态使用 `compact`。证据：`src/renderer/src/components/shared/AppEmptyState.vue`、`src/renderer/src/pages/integration.vue`。
- SHOULD 让状态 badge 优先使用 `variant="soft"`；进行中/活跃态使用 `color="primary"`，归档/禁用使用 `color="neutral"`，错误使用 `color="error"`。证据：`src/renderer/src/components/acp/AgentKindBadge.vue`、`src/renderer/src/components/task/TaskCard.vue`。

### 页面模式

- MUST 让列表、看板、概览和侧栏导览类页面说明区优先使用 `src/renderer/src/components/shared/PageHeader.vue`。`PageHeader` 只接受 `eyebrow`、`title`、`description` 文案 props，不提供 slot 或局部 class、style、layout props；右侧状态或操作由页面级 header 布局组合。其视觉基准为 eyebrow `text-[11px] font-medium uppercase tracking-wider text-primary-600 dark:text-primary-400`、h1 `text-xl font-semibold tracking-tight text-highlighted`、description `text-sm text-muted`，头部和内容保持 `gap-6` 或 `space-y-6`。证据：`src/renderer/src/components/shared/PageHeader.vue`、`src/renderer/src/pages/overview.vue`、`src/renderer/src/pages/task.vue`、`src/renderer/src/pages/specs.vue`、`src/renderer/src/pages/guidelines.vue`。
- SHOULD 不给沉浸式工作区、reader/detail 主内容面板或纯空状态页面硬补 `PageHeader`；这类页面可保留属于当前 pane 的局部 header 或直接使用 `AppEmptyState.vue`。证据：`src/renderer/src/pages/chat.vue`、`src/renderer/src/pages/workflow.vue`、`src/renderer/src/pages/specs.vue`、`src/renderer/src/pages/cron.vue`。
- MUST 让设置类左侧垂直导航使用 `w-65 bg-default rounded-lg`；未选中项使用 `hover:bg-elevated`，当前项使用左侧 3px teal indicator 加 `bg-primary/15 text-primary`。证据：`src/renderer/src/pages/settings.vue`。
- MUST 保持 ActivityBar 只显示图标和 tooltip。按钮容器使用 `size-10 rounded-lg`，图标使用 `size-5`，激活态使用左侧 3px teal indicator 加 `bg-primary/15 text-primary`。证据：`src/renderer/src/components/layout/ActivityBar.vue`。
- MUST 保持 AppHeader 的 35px 高度和三栏布局。项目切换器使用 pill 形态和 `bg-elevated hover:bg-accented transition-colors`，右侧 icon button 使用 `size-6` 容器和 `size-4` 图标，并保留 `-webkit-app-region: drag` / `no-drag` 分区。证据：`src/renderer/src/components/layout/AppHeader.vue`。

### 文案与可访问性

- MUST 让 UI 文案精确、直接、无填充词。操作按钮使用“动词 + 对象”，错误信息说明“发生了什么 + 下一步怎么做”，危险操作确认按钮复述动作对象而不是只写“确认”。
- MUST 让 toast 只说明具体发生的变化，避免泛化“成功”文案；进行中状态中文使用“正在 + 动作 + …”，英文使用 present participle + `…`；省略号使用 `…`，不要使用 `...`。
- MUST 保留技术名词、命令、路径、agent 名称和 proposal ID，不翻译或美化；必要时使用代码样式。
- MUST 保持状态不只靠颜色表达。badge、错误、警告、成功、进行中状态必须有文字，必要时再配合 icon。
- MUST 保留可见焦点。Nuxt UI 交互组件优先使用默认 `focus-visible`；自定义 focusable 元素必须提供可见焦点，例如 `focus-visible:outline-2 focus-visible:outline-primary` 或 `focus-visible:ring-2 focus-visible:ring-primary/30`。
- SHOULD 依赖 Nuxt UI 语义 token 的默认对比度；手写 palette 或透明度组合时，普通正文对比度应满足 WCAG AA `4.5:1`，大号文字、图标和关键边界至少满足 `3:1`。

## 示例

- ✅ `src/renderer/src/components/shared/PageHeader.vue`：共享页面说明区的 eyebrow、标题和描述文案结构。
- ✅ `src/renderer/src/components/shared/UiSurface.vue`：共享卡片 surface 的默认视觉和 interactive 状态。
- ✅ `src/renderer/src/components/shared/AppEmptyState.vue`：共享空状态结构、图标层级和可选主操作。
- ✅ `src/renderer/src/components/layout/ActivityBar.vue`：全局导航的图标、tooltip、active indicator 和状态颜色。
- ✅ `src/renderer/src/components/layout/AppHeader.vue`：窗口 header、项目切换器、icon-only button 与 drag/no-drag 区域。
- ❌ 在业务组件里重复定义 `UModal` / `USlideover` overlay 样式，或通过外部 CSS 选择器覆盖 Nuxt UI 内部结构。
- ❌ 用 `hover:scale-*`、`hover:shadow-*`、`transition-all` 或大面积渐变表达普通 hover 状态。

## 验证

```bash
pnpm exec vitest run --project renderer
pnpm typecheck:web
```

视觉类改动还应人工检查浅色/深色主题、窄窗口和桌面窗口，重点看 overlay、focus-visible、空状态、ActivityBar、AppHeader、设置页侧栏和列表页 header。

## 失效信号

- 当 `electron.vite.config.ts` 的 Nuxt UI theme、`src/renderer/src/assets/main.css`、`src/renderer/src/layouts/AppLayout.vue`、`src/renderer/src/components/layout/**`、`src/renderer/src/components/shared/**`、`src/renderer/src/pages/**` 或 Tailwind / @nuxt/ui 版本发生变化时，重新检查本文档。
