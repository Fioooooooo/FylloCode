## Context

`frontend/src/components/chat/empty/ChatEmptyAgentPicker.vue` 当前两套布局均由 grid 列宽强制撑开：

- 有已安装：`grid grid-cols-2 sm:grid-cols-5`，外层 `max-w-2xl`（≈ 672px），所以即使只装了 1~3 个 Agent，每张 tile 也会被拉到约 `(672 - 4*12) / 5 ≈ 124.8px` 的宽度，整组紧靠左侧、右侧留白显得稀疏。
- 无已安装：`grid grid-cols-1 sm:grid-cols-2` + `MoreAgentsTile.sm:col-span-2`，promo tile 横跨整个 `max-w-2xl`，单卡宽度过大（约 672px），与卡片内部图标/文案的视觉重量不匹配。

`InstalledAgentTile`（`aspect-square`，`p-4`）与 `MoreAgentsTile`（more 变体 `aspect-square`，promo 变体 `min-h-36 w-full`）自身均无固定宽度，宽度完全由父容器 grid 列宽决定。这意味着在父容器换布局策略时，子组件无需改动。

## Goals / Non-Goals

**Goals:**

- N=1~4 时，N+1 张卡片整体横向居中；单卡视觉宽度跨档位保持一致。
- N=0 时，promo 卡横向居中，宽度受限。
- 不引入新组件，不改子组件 props/样式契约。
- 与现有 `gap-3`、`max-w-2xl` 外壳协调。

**Non-Goals:**

- 不重设计 InstalledAgentTile / MoreAgentsTile 自身的 aspect-square 与 padding。
- 不改 AgentPickerModal、AgentPickerCard 流程。
- 不改 `MAX_VISIBLE_INSTALLED = 4` 这一上限。
- 不动响应式断点逻辑（窄屏行为不变；保持当前居中即可）。

## Decisions

### 决策 1：有已安装时改用 `flex justify-center items-center gap-3`

原 grid 方案（`gridTemplateColumns: repeat(N+1, 7.75rem)`）在实现过程中发现：grid 列宽与 `MoreAgentsTile variant="more"` 的内容自然高度存在耦合——列宽若小于内容高度，`aspect-square` 子卡会被 `align-self: stretch` 联动拉高，导致高度错位。

改用 `flex justify-center items-center gap-3` 后，卡片宽高完全由子组件自身的 `aspect-square` 决定，父容器只负责居中和间距，彻底解耦。N=1~4 时卡片群自然紧凑居中，无需计算列宽基线。

**Alternative（已否决）**：`grid` + 动态 `gridTemplateColumns: repeat(N+1, 7.75rem)`。
否决原因：列宽需与子组件内容高度保持同步，引入隐式耦合；flex 方案更简洁，子组件契约不变。

### 决策 2：promo 卡用 `flex justify-center` + 外层 wrapper `w-full max-w-sm` 限宽

**为什么 `max-w-sm`（24rem ≈ 384px）**：
单 promo 卡是引导用户安装的入口，视觉重量约等于 1.5~2 个 InstalledAgentTile 的宽度。`max-w-sm` 介于单卡自然宽度与原 `max-w-2xl`（42rem）之间，避免横跨过宽。

`MoreAgentsTile` 自身 promo 变体是 `w-full`，外层 wrapper 决定可视宽度即可，组件 props 不变。

### 决策 3：保留外层 `max-w-2xl` 容器与 header 居中

外层 `<div class="w-full max-w-2xl space-y-6">` 与 header `text-center` 不变。新布局只替换卡片容器自身的写法。

## Risks / Trade-offs

- [Risk] 在极窄视口下，N=4 时 5 张卡片可能换行。
  → Mitigation：chat 主区域宽度由 sidebar/main 布局决定，实际可用宽度通常远大于 5 张卡片的自然宽度；如需更严格，可在容器加 `flex-nowrap overflow-x-auto`，但现阶段不引入。
