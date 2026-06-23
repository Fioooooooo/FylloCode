---
name: UiDesign
description: FylloCode 渲染进程的 UI 设计规范，包含 Design Tokens、布局层级、组件与页面模式、动效语言
keywords: [ui, design-system, tailwind, nuxt-ui, teal, design-tokens]
---

# FylloCode 前端 UI 设计规范

## 1. 适用范围

- 适用于 `src/renderer/src/**` 内所有页面、组件、composables 与样式约定。
- 适用于 `src/renderer/index.html`、`src/renderer/src/assets/main.css` 等前端全局样式入口。
- 不覆盖代码风格、格式化、ESLint/Prettier 细则；见 `guidelines/CodeStyle.md`。
- 不覆盖渲染进程架构职责划分；见 `guidelines/RendererProcess.md`。

## 2. 设计原则

- **状态驱动颜色**：颜色深浅用于表达 default、hover、active、selected、disabled、danger 等状态意图，不作为装饰色板随意使用。
- **语义优先，微调允许**：优先使用 Nuxt UI / Tailwind CSS 的语义化 class 与组件 `color` / `variant` props；当语义 class 不能表达状态强度时，允许使用透明度工具类做局部微调。
- **层级优于装饰**：通过背景层级、间距、字体权重和有限阴影建立结构，不依赖大面积边框、渐变或重阴影。
- **一致优于创新**：相同语义使用相同视觉模式，不为局部页面创造一次性样式。
- **Teal 是状态强调色**：用于主操作、当前流程、选中态和关键状态提示，不作为大面积品牌背景。

## 3. Design Tokens

### 3.1 颜色

`@nuxt/ui` 主题配置保持：

```json
{
  "primary": "teal",
  "secondary": "cyan",
  "neutral": "slate"
}
```

颜色思想：色阶表达意图，而不只是明暗。新增 UI 时先判断元素处于什么状态，再选择 class。

| 意图                | 首选写法                                  | 可接受微调                              | 用途                                              |
| ------------------- | ----------------------------------------- | --------------------------------------- | ------------------------------------------------- |
| page surface        | `bg-default`                              | -                                       | App 根背景、主内容 shell、卡片化分区              |
| frame surface       | `bg-muted/30`                             | `bg-muted`                              | Header、ActivityBar 等应用框架区域                |
| elevated surface    | `bg-elevated`                             | `bg-elevated/50`                        | AppLayout `main` 背景、输入框、浮层面板           |
| subtle hover        | `hover:bg-elevated` / `hover:bg-accented` | `hover:bg-elevated/50`                  | `bg-default` 分区内的列表项、工具按钮、卡片 hover |
| selected / active   | `bg-accented`                             | `bg-primary/15`                         | 当前页面、选中项、当前 agent                      |
| default border      | `border-default` / `border-default/50`    | -                                       | 容器分隔、输入框、浮层边界                        |
| emphasized border   | -                                         | `border-primary/40` / `ring-primary/30` | 被选中、聚焦、当前主流程                          |
| dimmed text/icon    | `text-dimmed`                             | -                                       | placeholder、极弱辅助信息                         |
| secondary text/icon | `text-muted` / `text-toned`               | `text-primary/70`                       | meta、弱说明、未激活图标                          |
| primary text/icon   | `text-highlighted`                        | `text-primary`                          | 标题、关键状态、主强调 icon                       |
| body text           | `text-default`                            | -                                       | 正文                                              |
| inverted text       | `text-inverted`                           | -                                       | 反色背景或 solid 色块上的文字                     |
| solid action        | `UButton color="primary"`                 | 避免手写 `bg-primary`                   | 页面主操作                                        |
| soft status         | `UBadge variant="soft"`                   | 避免手写 badge 组合色                   | 状态、阶段、分类                                  |

规则：

- 语义 class 是默认选择，不是绝对限制。
- 允许 `bg-default/50`、`bg-elevated/50`、`bg-primary/15`、`border-primary/40` 等透明度微调，但必须对应明确状态意图。
- 不直接使用 `teal-500`、`slate-700` 等裸 palette class，除非 Nuxt UI 语义 class 无法表达该场景。
- 不为装饰目的新增颜色；新增颜色必须能说明它表达的状态或层级。

### 3.2 Shadow（阴影层级）

> 阴影用于表达空间层级，**不允许在 hover 时动态改变阴影**。

| Tailwind      | 用途                          |
| ------------- | ----------------------------- |
| `shadow-none` | 基础层                        |
| `shadow-sm`   | 输入框、小型浮层              |
| `shadow-md`   | 悬浮面板、dropdown            |
| `shadow-lg`   | Modal、Toast、Command Palette |
| `shadow-xl`   | 全屏 overlay                  |

在深色模式下，阴影应显著减弱或基本不可见，依靠背景色层级区分。

深色模式下使用以下具体写法，不要只写“减弱阴影”：

| 场景                      | 浅色模式 class              | 深色模式 class                        |
| ------------------------- | --------------------------- | ------------------------------------- |
| 输入框、小型浮层          | `shadow-sm`                 | `dark:shadow-none`                    |
| 页面分区 / 默认卡片       | `shadow-none`               | `dark:shadow-none`                    |
| dropdown、popover、modal  | `shadow-lg shadow-black/10` | `dark:shadow-lg dark:shadow-black/30` |
| 全屏 overlay / 高层级浮层 | `shadow-xl shadow-black/10` | `dark:shadow-xl dark:shadow-black/40` |

规则：

- 结构容器和默认卡片优先通过 `bg-*` 与 `border-default/50` 建立层级，不依赖阴影。
- 浮层在深色模式下可以保留阴影，但必须显式使用 `dark:shadow-black/30` 或 `dark:shadow-black/40`，避免默认阴影在深色背景中发灰。

### 3.3 圆角

| 场景                         | 首选 class     | 说明                      |
| ---------------------------- | -------------- | ------------------------- |
| 按钮、input、badge、小标签   | `rounded-md`   | 优先沿用 Nuxt UI 默认形态 |
| 卡片、list item、空状态图标  | `rounded-lg`   | 常规内容容器              |
| Modal、panel、较大的图标容器 | `rounded-xl`   | 需要更明确容器感的区域    |
| 欢迎页 hero、feature panel   | `rounded-2xl`  | 只用于低密度展示型区域    |
| pill 按钮、项目切换器、chip  | `rounded-full` | 胶囊形态                  |

规则：

- 不新增 `radius-*` 抽象名；直接使用 Tailwind 圆角 class。
- 卡片默认 `rounded-lg`，除非复用的 Nuxt UI 组件已有自身圆角。

### 3.4 字体尺度

| 场景            | 首选 class                                                              | 对应尺寸 / 字重 |
| --------------- | ----------------------------------------------------------------------- | --------------- |
| 欢迎页标题      | `text-[28px] font-bold leading-tight text-highlighted`                  | `28px / 700`    |
| 页面主标题      | `text-xl font-semibold tracking-tight text-highlighted`                 | `20px / 600`    |
| 区块标题        | `text-base font-semibold text-highlighted`                              | `16px / 600`    |
| 正文            | `text-sm font-normal leading-relaxed text-default`                      | `14px / 400`    |
| meta / 辅助说明 | `text-xs font-normal text-muted`                                        | `12px / 400`    |
| 页面头部小标题  | `text-[11px] font-medium uppercase tracking-wider text-muted leading-4` | `11px / 500`    |

规则：

- 字号和字重优先使用 Tailwind CSS class；文字颜色优先使用 Nuxt UI 语义色 `text-highlighted`、`text-default`、`text-muted`。
- 欢迎页标题和页面头部小标题使用 Tailwind arbitrary value，是因为默认字号阶梯没有精确的 `28px` 与 `11px`。
- 普通页面不要使用 `text-2xl` 以上的标题，除非是欢迎页、空项目首页等低密度首屏。

### 3.5 字体族

- 使用 Nuxt UI / Tailwind CSS 默认 `font-family`，不要在 `src/renderer/src/assets/main.css` 里重设全局字体。
- 不为局部页面引入品牌字体、衬线字体或等宽字体作为正文；命令、路径、代码片段可使用现有 code / mono 样式。
- 如果未来引入自定义字体，必须先更新本文档和全局样式入口，明确 fallback 字体栈、加载方式和中英文渲染效果。

## 4. 文案语气

文案是界面设计的一部分。FylloCode 的 UI 文案应精确、直接、无填充词，帮助用户理解当前状态和下一步动作。

| 场景     | 写法规则                                                                      | 示例                                               |
| -------- | ----------------------------------------------------------------------------- | -------------------------------------------------- |
| 操作按钮 | 业务动作使用“动词 + 对象”，避免裸动词、`OK`、`Confirm`、泛化的“确定”          | `保存配置`、`删除任务`、`打开项目`                 |
| 错误信息 | 写清“发生了什么 + 下一步怎么做”                                               | `保存失败。API Key 无效，检查后重试。`             |
| Toast    | 只说明具体发生的变化，不写“成功”，结尾不加句号                                | `项目已打开`、`任务已删除`                         |
| 空状态   | 说明当前没有什么，并指向第一个可执行动作                                      | `暂无任务。创建一个新任务来开始追踪工作。`         |
| 进行中   | 中文使用“正在 + 动作 + …”，英文使用 present participle + `…`                  | `正在保存…`、`正在加载 proposals…`、`Saving…`      |
| 数量     | 使用阿拉伯数字，单位和对象写清楚                                              | `3 个任务`、`12 条消息`、`2 个可用 agent`          |
| 英文标签 | 仅英文 UI 的按钮、标签、标题、tab 使用 Title Case；正文和辅助说明用句式大小写 | `Open Project`、`Delete Member`、`No sessions yet` |

规则：

- 中文界面不套用英文 Title Case；保持短句、少修饰、动作明确。
- 避免“请”“成功地”“极致”“智能化”等礼貌填充或营销形容词，除非文案必须表达权限、风险或合规提示。
- 技术名词、命令、路径、agent 名称、proposal ID 等不要翻译或美化，必要时使用代码样式。
- 危险操作的确认按钮优先复述动作对象，例如 `删除任务`，不要只写 `确认`。
- 使用省略号字符 `…`，不要用三个点 `...` 表达进行中状态。

## 5. 可访问性底线

- 对比度默认依赖 Nuxt UI 语义 token；使用 `text-*`、`bg-*`、`border-*` 语义 class 时，按 Nuxt UI 默认可访问性基线处理。
- 手写 palette 或透明度组合时，普通正文对比度必须满足 WCAG AA `4.5:1`；大号文字、图标和关键边界至少满足 `3:1`。
- Nuxt UI 交互组件优先依赖组件默认 `focus-visible` 样式；自定义 focusable 元素必须提供可见焦点，例如 `focus-visible:outline-2 focus-visible:outline-primary` 或 `focus-visible:ring-2 focus-visible:ring-primary/30`。
- 不要移除 `outline` / `ring` 后不提供替代焦点样式。
- 状态不能只靠颜色表达；badge、错误、警告、成功、进行中状态必须有文字，必要时再配合 icon。
- icon-only 按钮必须有 tooltip 或 `aria-label`，并且视觉图标不能是唯一可理解的状态说明。

## 6. 布局层级

| 区域                 | 首选 class                                                                      | 说明                                  |
| -------------------- | ------------------------------------------------------------------------------- | ------------------------------------- |
| AppHeader            | `h-8.75 flex items-center bg-muted/30 border-b border-default/50 shrink-0`      | 顶部窗口框架，保留 Electron drag 区域 |
| ActivityBar          | `w-16 h-full flex flex-col items-center bg-muted/30 border-r border-default/50` | 左侧全局导航，只显示图标和 tooltip    |
| AppLayout `main`     | `flex-1 flex p-2 min-w-0 bg-elevated`                                           | 全局主画布，形成卡片化背景            |
| AppLayout 内容 shell | `flex-1 flex flex-col min-w-0 rounded-lg bg-default overflow-auto`              | RouterView 默认承载区                 |
| 卡片化页面根容器     | `flex flex-1 overflow-hidden bg-elevated space-x-2`                             | Chat、Settings、Workflow 等分区页面   |
| 卡片化页面分区       | `rounded-lg bg-default overflow-auto`                                           | 主内容卡片、侧栏卡片、事件栏卡片      |

### 6.1 内容宽度

内容容器宽度按信息密度选择，使用 Tailwind 标准 `max-w-*`，不要新增自定义宽度 class。

| 场景                     | 首选 class                           | 说明                                           |
| ------------------------ | ------------------------------------ | ---------------------------------------------- |
| 多列概览 / 集成选择      | `mx-auto w-full max-w-6xl px-6 py-8` | 多列卡片网格、复杂面板、资源选择器需要横向空间 |
| 中等密度任务页           | `mx-auto w-full max-w-5xl px-6 py-8` | 双列卡片，避免过宽导致信息稀疏                 |
| 文本列表 / Proposal 列表 | `mx-auto w-full max-w-3xl px-6 py-8` | 文本列表以阅读效率优先                         |
| 设置 / 表单              | `mx-auto w-full max-w-2xl px-6 py-8` | 表单密集场景减少视线移动                       |

### 6.2 间距节奏

FylloCode 使用 Tailwind 默认 4px spacing scale，不新增自定义 spacing token。默认节奏是：同组元素 8px、组间 16px、页面区块 24px，低密度首屏可放大到 32px。

| 场景                         | 首选 class            | 说明                 |
| ---------------------------- | --------------------- | -------------------- |
| 图标 + 文本、badge 内部      | `gap-1.5` / `gap-2`   | 6-8px，紧密关联      |
| 表单 label + input + helper  | `space-y-2`           | 同一字段组           |
| 卡片 header/body/footer 内部 | `space-y-3` / `gap-3` | 中等密度内容         |
| toolbar、filter、按钮组      | `gap-2`               | 横向操作组           |
| 页面 header 与内容           | `gap-6`               | 当前页面模式默认节奏 |
| 页面区块之间                 | `space-y-6`           | 默认页面节奏         |
| 卡片网格                     | `gap-3 xl:gap-4`      | 桌面常规密度         |
| 设置表单区块                 | `space-y-6`           | 稳定但不过度稀疏     |
| 欢迎页 / 空项目首页          | `space-y-8`           | 低密度展示场景       |

| 场景                     | 首选 class    |
| ------------------------ | ------------- |
| 密集列表项               | `p-3` / `p-4` |
| 默认卡片                 | `p-5`         |
| 大面板 / modal 内容块    | `p-6`         |
| 页面内容容器             | `px-6 py-8`   |
| 欢迎页 hero / 低密度首屏 | `p-8`         |

规则：

- `AppLayout` 是唯一拥有全局 `<main>` 的布局层；页面 slot 内不要再嵌套 `<main>` 或全局 `<aside>` landmark，分区使用 `div`、`nav`、`section`。
- 页面主体采用卡片化结构：`AppLayout main` 使用 `bg-elevated`，内部 shell 与页面分区使用 `bg-default rounded-lg`。
- 当 `bg-default` 分区内有列表项、工具按钮或子菜单项时，未选中 hover 默认使用 `hover:bg-elevated`；选中态使用 `bg-primary/15 text-primary`，必要时加左侧 3px teal indicator。
- 有子菜单的主区域侧栏统一使用 `w-65 bg-default rounded-lg`，菜单项保持 `hover:bg-elevated` 与 `bg-primary/15 text-primary` 的状态模型。
- 不使用 `max-w-240` 等自定义中间值；先归入上表场景，确实不匹配时再说明原因。
- 使用 Tailwind 默认 breakpoint，不新增自定义 breakpoint；窄窗口和桌面窗口都不能出现无意义横向滚动。

## 7. 组件模式

当需要修改组件样式时：

- 全局覆盖：通过 `electron.vite.config.ts` 中的 `renderer.plugins.ui` 配置全局覆盖 Nuxt UI 组件默认样式；
- 局部覆盖：使用组件的 `ui` prop 或 `class` 属性；
- 不要用 CSS 选择器从外部覆盖 Nuxt UI 组件内部样式

### 7.1 Card（卡片）

默认卡片样式由共享组件 `UiSurface.vue` 提供：

```vue
<UiSurface interactive>
  <!-- header / body / footer -->
</UiSurface>
```

组件位置：`src/renderer/src/components/shared/UiSurface.vue`

`UiSurface` 支持以下 props：

| Prop          | 类型                             | 默认值      | 说明                                      |
| ------------- | -------------------------------- | ----------- | ----------------------------------------- |
| `as`          | `'div' \| 'button'`              | `'div'`     | 渲染元素                                  |
| `variant`     | `'default' \| 'flat'`            | `'default'` | `default` 使用 elevated 背景；`flat` 透明 |
| `interactive` | `boolean`                        | `false`     | 是否启用 hover 反馈                       |
| `padding`     | `'none' \| 'sm' \| 'md' \| 'lg'` | `'md'`      | 内边距                                    |

> 额外 Tailwind 类可直接通过原生 `class` 属性传入，Vue 会自动与组件根元素类合并，用于覆盖激活态等场景。

规则：

- 默认优先使用 `bg-elevated dark:shadow-none` 建立卡片层级，不额外添加 `shadow-md`。
- 当相邻 surface 对比不足、深色模式边界不清，或卡片处于高密度列表中时，可以使用 `border border-default/50`。
- `UiSurface interactive` 默认使用 `hover:bg-accented` 表达可点击反馈；位于 `bg-default` 分区内的普通列表项优先使用 `hover:bg-elevated`。
- 可点击卡片 hover 只改变背景或边框强度，例如 `hover:bg-accented`、`hover:bg-elevated`、`hover:border-primary/40`，**禁止** scale、translate、shadow 变化。
- 卡片内部结构优先保持三段式：header（icon + title + action）、body、footer；密集列表可简化，但不要创造一次性布局。
- 卡片间距统一为 `p-5`，密集列表可降为 `p-4`。

### 7.2 Button

- 按钮优先使用 Nuxt UI props 表达语义，不手写按钮背景色。
- **Primary**：`color="primary"`，用于页面唯一主行动。
- **Secondary**：`color="neutral" variant="outline"`，用于次要行动。
- **Ghost**：`color="neutral" variant="ghost"`，仅用于工具栏、图标按钮，hover 背景可按上下文使用 `hover:bg-elevated` 或 `hover:bg-accented`。
- **Danger**：`color="error"`，只用于 destructive action。
- 同一区域内避免多个并列 primary 按钮。

### 7.3 Input / ChatPrompt

- 输入框背景使用 `bg-elevated`，容器使用 `shadow-sm`。
- focus ring 使用 `ring-primary/30`。
- `UChatPrompt` footer 动作区使用 ghost 按钮，避免堆积彩色图标。

### 7.4 Badge / Status

- 状态 badge 优先使用 `variant="soft"`，避免 outline 造成的细碎边框。
- 进行中/活跃态使用 `color="primary"`（teal）。
- 归档/禁用使用 `color="neutral"`。
- 错误使用 `color="error"`。

## 8. 页面模式

### 8.1 Page Header（页面头部）

- 所有列表/看板/设置页使用统一头部。
- 左侧：eyebrow（`text-[11px] font-medium uppercase tracking-wider text-muted leading-4`）+ h1（`text-xl font-semibold tracking-tight text-highlighted`）+ description（`text-sm text-muted`）。
- 右侧：主操作使用 `UButton color="primary"`；次级操作使用 `color="neutral" variant="outline"` 或 `variant="ghost"`。
- 头部内部使用 `gap-4` / `space-y-1`；头部与下方内容保持 `gap-6`。
- 文案必须具体，例如 `Tasks` / `任务` / `追踪当前项目的待办工作。` / `新建任务`，不要保留占位词。

### 8.2 List Page（Overview / Proposal / Task）

- 统计卡片使用 icon + 大数字 + 趋势标签，hover 时显示 action hint（颜色变化，无 transform）。
- 筛选器使用 `UTabs variant="pill"` 或 ghost 按钮组。
- 列表项使用 `rounded-lg bg-elevated p-4`，通过背景层级和间距建立卡片感，不默认添加阴影。
- 页面内容位于 `AppLayout` 的 `bg-default` shell 内，列表页自身可使用 `flex-1 overflow-y-auto bg-default` 承载滚动。
- 内容容器按第 6.1 节宽度表选择 `max-w-*`，外层节奏使用 `space-y-6`。
- 列表或卡片组内部使用 `space-y-3` / `gap-3`；多列网格使用 `grid gap-3`，宽屏可提升到 `xl:gap-4`。

### 8.3 Detail Page

- 左侧/主区域展示内容，右侧边栏展示元数据/操作。
- 页面详情位于 `bg-default` shell 内；需要分栏时，外层使用 `bg-elevated space-x-2`，每个分区使用 `rounded-lg bg-default`。

### 8.4 Settings Page

- 左侧垂直导航宽度统一为 `w-65`（260px），背景使用 `bg-default rounded-lg`。
- 未选中项使用 `hover:bg-elevated`；当前项使用左侧 3px teal indicator + `bg-primary/15 text-primary` 填充。
- 右侧内容最大宽度 `max-w-2xl`，保持现有约束。

## 9. ActivityBar 规范

- 根容器：`w-16 h-full bg-muted/30 border-r border-default/50`，不使用 shadow。
- 图标尺寸 `size-5`（20px），按钮容器 `size-10`（40px），圆角 `rounded-lg`（8px）。
- 菜单分组使用 `gap-1`，brand 与菜单之间使用 `mb-1` 或 `gap-3`。
- 激活态：左侧 3px teal indicator + `bg-primary/15 text-primary`。
- 未激活态：`text-muted`，hover 使用 `hover:bg-elevated`。
- 每个条目必须包 `UTooltip`，不显示文字标签。

## 10. AppHeader 规范

在现有 35px 高度和三栏布局（20/60/20）约束内：

- 根容器：`h-8.75 flex items-center bg-muted/30 border-b border-default/50 shrink-0`，不使用 shadow。
- 中央项目切换器使用 pill 形态：`rounded-full bg-elevated text-sm text-highlighted hover:bg-accented transition-colors`。
- 项目名使用 `truncate max-w-48`，右侧 chevron 使用 `size-4 text-muted`。
- 右侧图标按钮统一 `size-6` 容器，`size-4` 图标，使用 `UButton variant="ghost" color="neutral"` 的默认反馈，不额外添加阴影或 transform。
- 保留 `-webkit-app-region: drag` 和交互元素 `no-drag`。

## 11. Empty State 规范

所有空状态使用共享组件 `AppEmptyState.vue`：

```vue
<AppEmptyState
  icon="i-lucide-list-checks"
  title="暂无任务"
  description="创建一个新任务来开始追踪工作。"
  action-label="新建任务"
  action-icon="i-lucide-plus"
  @action="handleCreate"
/>
```

组件位置：`src/renderer/src/components/shared/AppEmptyState.vue`

`AppEmptyState` 支持以下 props：

| Prop          | 类型      | 必填 | 说明                       |
| ------------- | --------- | ---- | -------------------------- |
| `icon`        | `string`  | 是   | Lucide 图标类名            |
| `title`       | `string`  | 是   | 空状态标题                 |
| `description` | `string`  | 是   | 空状态描述                 |
| `actionLabel` | `string`  | 否   | 主操作按钮文字             |
| `actionIcon`  | `string`  | 否   | 主操作按钮图标             |
| `compact`     | `boolean` | 否   | 紧凑模式，用于卡片内部空态 |

规则：

- 必须包含：高亮背景图标、标题、描述、可选主操作。
- 不使用纯文字空态。
- 默认图标大小 `size-8`，容器 `size-16 rounded-2xl`。
- 卡片内部空态使用 `compact` 模式：图标 `size-6`，容器 `size-12 rounded-xl`，内边距更小。

## 12. Motion 规范

### 12.1 允许的过渡

- 颜色/背景/边框变化：`transition-colors duration-150`
- 透明度变化：`transition-opacity duration-200`
- 列表/组件进入：`animate-in fade-in slide-in-from-bottom-1 duration-200`
- Modal / Toast overlay：`transition-opacity duration-200`

### 12.2 明确禁止的 hover 动效

以下效果**一律禁止**用于 hover 反馈：

- `hover:scale-*`
- `hover:shadow-*`（静态 shadow 允许，但不允许 hover 时变化）
- `hover:translate-*` / `hover:rotate-*` / 任何 CSS transform
- bounce / spring 动画
- 渐变/彩虹/发光动画

### 12.3 默认缓动

- 常规：`ease-out`
- 进入动画：`cubic-bezier(0.16, 1, 0.3, 1)`（ease-out-expo）
- 禁用 `duration-75` 以下的快速闪烁和 `duration-500` 以上的拖沓感。
- 动效必须表达状态变化或交互反馈，不用于装饰；避免 `transition-all`，优先声明 `transition-colors`、`transition-opacity` 等具体属性。

## 13. 维护

- 当新增全局 UI 模式、调整 Design Token、改变 ActivityBar/AppHeader 视觉约定或修改动效语言时，必须同步更新本文档。
- 当 `@nuxt/ui` 或 Tailwind 主题配置发生变更时，必须检查本文档中的 token 是否仍然有效，并更新示例代码。
- 当新增页面或共享组件时，必须对照本文档的 Page Header、Card、Empty State 等模式进行审查。
