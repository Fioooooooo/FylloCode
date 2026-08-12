## Context

`ChatToolItem.vue` 当前无条件把 `statusPresentation.text` 传给 `UChatTool.suffix`。非失败状态通过 `ui.suffix = "sr-only"` 隐藏，失败状态则可见。Nuxt UI 将 suffix 嵌套在带 `truncate` 的 label 内；Activity Group 展开并挂载多个工具项后，绝对定位的 `sr-only` suffix 仍会参与 scrollable overflow area 计算，已观测到 748px 消息列产生 1160px `scrollWidth`。

产品约定是所有状态都不需要 suffix 或屏幕阅读器状态文字。pending/in_progress 的运行反馈由 shimmer 提供，failed 仅通过错误色具体工具 icon 表达，并保留详情中的 `Error` 分区。

## Goals / Non-Goals

**Goals:**

- 让四种工具状态都不创建 suffix DOM。
- 保留 pending/in_progress shimmer、failed error icon 与 Error 详情。
- 直接工具和 Activity Group 子工具保持一致。
- 从溢出源头消除展开 Activity Group 后的横向滚动条。

**Non-Goals:**

- 不修改 ACP 状态映射、工具状态数据或持久化格式。
- 不改变 Activity Group 分组、摘要、展开状态或工具详情内容。
- 不在消息滚动容器增加 `overflow-x-hidden`，也不修改 Nuxt UI 或 Reka UI。

## Decisions

1. `ChatToolItem.vue` 不再向 `UChatTool` 传递 `suffix`。这比传空字符串或使用 `sr-only` 更符合“不渲染”的约定，也会使 Nuxt UI 的 suffix 节点完全不存在。
2. `toolUi` 只在 failed 状态返回 `{ leadingIcon: "text-error" }`；其他状态不提供 suffix 或 leading icon 覆盖。继续复用 `getToolStatusPresentation` 判断失败状态，避免重复状态推导。
3. `getToolStatusPresentation` 的文字字段暂不删除。该纯函数仍可作为状态文案映射来源，当前修复只改变 `ChatToolItem` 是否消费该文案，避免扩大本次行为变更范围。
4. 测试同时覆盖四种状态的直接工具与 Activity Group 子工具，断言 `data-has-suffix=false`，并确认只有 failed 的 leading icon 使用 `text-error`。
5. 同步修改 `guidelines/UiDesign.md` 中与本 requirement 同一次提交引入的普通工具状态例外：四种状态均不要求可见或屏幕阅读器专用 suffix；failed 允许仅以错误色具体工具 icon 强化折叠标题，同时保留详情中的 `Error` 文本。其他 UI 状态仍遵守“不只靠颜色表达”的通用规则。

## Risks / Trade-offs

- [工具状态不再提供文本型无障碍提示] → 这是用户明确确认的产品取舍；测试和规范同步固化该行为。
- [仅靠颜色表达失败状态] → Error 详情仍提供文本错误内容，但折叠标题本身不再显示“失败”；这是本次明确范围。
- [未来 Nuxt UI DOM 变化导致测试 stub 与真实结构偏离] → 核心断言放在传入组件的 suffix prop 是否缺失，而不是依赖 `sr-only` 的具体 CSS 实现。
