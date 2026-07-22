## Context

Chat Prompt Timeline 当前由 `ChatPromptTimeline.vue` 装配 `usePromptTimeline()` 与 `ChatPromptTimelineNav.vue`。`collectChatPromptTimelineItems()` 已正确完成 user prompt 投影、system reminder 过滤和附件摘要，因此本变更只调整浏览交互与运行期状态，不改变 session 数据、消息结构或跨进程契约。

现有 `ChatPromptTimelineNav.vue` 为每个 prompt 创建一个 `UPopover` 和一个仅 `4px` 高的按钮，按钮间存在不可命中的 gap。`usePromptTimeline.ts` 在每次 scroll 事件中查询所有 prompt anchor 并调用 `getBoundingClientRect()`，然后按距离视口 35% 参考线最近的 anchor 选择 active；平滑跳转期间 scroll 事件还会覆盖刚设置的目标 active。项目根目录 `timeline-scrubber-prototype.html` 是已确认的交互与视觉基准。

## Goals / Non-Goals

**Goals:**

- 将 timeline 收敛为紧凑、等距、左对齐的横线索引，避免占满聊天视口高度。
- 让整条 rail 的纵向区域连续命中最近横线，消除小目标与 gap 造成的 hover 死区。
- 明确区分 active 与 preview：active 独占 teal；preview 只延长横线，不改变颜色。
- 用单一摘要浮层支持内容识别、点击定位和键盘导航，且不显示轮次、序号、时间或统计。
- 让 active 语义稳定对应当前阅读区，并使长对话滚动更新保持每帧常量级布局读取。

**Non-Goals:**

- 不改变 `collectChatPromptTimelineItems()` 的消息筛选、排序、附件摘要或 system reminder 规则。
- 不增加 prompt 搜索、全文过滤、书签、分组或持久化状态。
- 不迁移 `chat-prompt-timeline` 到 `features/**`；现有 README 中的 feature 重组继续作为独立的非行为变更处理。
- 不修改 Chat Composer、Event Rail、session store、IPC 或消息存储格式。
- 不引入新的 UI、动画或滚动依赖。

## Decisions

### 1. 使用等距横线索引，而不是按 transcript 高度比例分布

`ChatPromptTimelineNav.vue` 使用固定 `6px` 纵向步长排列 prompt 横线。所有横线左对齐；默认横线长度为 `14px`，active 与 preview 长度为 `22px`。active 使用 primary/teal，非 active preview 保持 neutral。timeline 高度由条目数量决定并受聊天内容区可用高度约束；超出时由 rail 内部滚动，并在 active 变化时把 active 横线保持在可见范围。

选择等距排列是因为用户主要通过 prompt 次序和摘要定位，而不是通过回复像素高度判断距离。与比例 minimap 相比，等距横线更紧凑、长度状态更清楚，也与现有 timeline 的视觉语言一致。

### 2. 让 rail 统一负责指针命中

不再把每根 `2px` 视觉横线当作独立 pointer target。Nav 根元素负责 `pointermove`、`pointerdown`、`pointerup` 和 `pointercancel`，按 `localY + rail.scrollTop` 除以固定步长得到最近条目索引；横线本身只渲染状态并设置 `pointer-events: none`。这样 rail 内每一个纵向像素都映射到最近 prompt，没有条目间死区。

普通 hover 只更新 preview；pointerdown 后 rail 捕获 pointer，拖动经过其他索引时立即调用定位 intent，pointerup/cancel 释放捕获。点击摘要仍可精确选择目标。相比扩大每根按钮并让命中区域互相重叠，统一 hit testing 不会产生 z-index 冲突，也能保持视觉密度。

### 3. 只挂载一个受控摘要浮层

`ChatPromptTimelineNav.vue` 只创建一个 `UPopover`，由 `previewItemId` 控制。浮层最多展示选中 prompt 及前后相邻的三条摘要；首尾不足时向另一侧补齐。每条摘要只使用 `ChatPromptTimelineItem.preview`，不得渲染 `index`、`label`、时间或“第 N 轮”等元信息。

浮层条目可点击并复用同一个 `locate-prompt` emit。浮层通过 portal 避免被消息容器裁剪，并允许 pointer 在 rail 与浮层之间移动而不闪烁；关闭使用短延迟，Escape 立即关闭。

### 4. 将 active、preview 和 navigation lock 分开拥有

- `usePromptTimeline()` 继续拥有 `activePromptTimelineItemId`、anchor 测量、scroll 同步和定位 intent。
- `ChatPromptTimelineNav.vue` 本地拥有 `previewItemId`、pointer dragging、keyboard cursor 和浮层 open 状态。
- `usePromptTimeline()` 新增非持久化 `navigationTargetId`。平滑跳转开始后 active 固定为目标；目标到达参考线容差范围或 scroll 结束时清除 lock，再恢复自动跟随。

这种拆分保持单一事实源：阅读位置 active 属于 application/composable，纯展示 preview 属于 UI，任何状态都不进入 Pinia 或 session 持久化。

### 5. active 使用“最近已越过阅读线的 prompt”语义

阅读线固定为滚动容器顶部加 `35% * clientHeight`。active 是 anchor document offset 小于等于阅读线的最后一个 prompt；在首个 prompt 之前回退为首项，到达底部时保持最后一个已经进入阅读区的 prompt。相比“绝对距离最近”，该语义不会在下一个 prompt 尚未进入阅读线时提前切换。

点击横线或摘要时，将目标 prompt 滚动到同一条 35% 阅读线，而不是调用 `scrollIntoView({ block: "center" })`。普通点击使用 smooth；`prefers-reduced-motion` 或 drag scrubbing 使用 immediate。

### 6. 缓存 anchor offset，scroll 帧只做二分查询

`usePromptTimeline.ts` 在以下时机调度 `measurePromptAnchors()`：scroll container 绑定、prompt ID 列表变化、session/loading 状态变化，以及消息内容 wrapper 的 `ResizeObserver` 通知。测量阶段查询 anchor，并把 `anchor.getBoundingClientRect().top - containerRect.top + container.scrollTop` 缓存为有序 offset。

passive scroll listener 只通过一个 `requestAnimationFrame` 合并更新；frame 内用 `scrollTop + clientHeight * 0.35` 对缓存 offset 二分查找 active，不逐项 query DOM 或读取每个 anchor 的 rect。卸载或容器替换时释放 scroll listener、animation frame 和 `ResizeObserver`。

### 7. 使用单一键盘停靠点

Nav 根元素使用一个 `tabindex="0"` 和可见 focus ring；横线不进入 Tab 序列。获得焦点时 keyboard cursor 从 active 开始：ArrowUp/ArrowDown 移动 preview，Home/End 到首尾，Enter 定位，Escape 关闭浮层。`aria-label` 使用中文“用户 prompt 时间线”，active 横线状态通过 `aria-activedescendant` 或等价的当前项描述暴露，状态不能只靠颜色。

## Risks / Trade-offs

- [固定 `6px` 步长仍是高密度视觉，无法让每根横线成为 24px pointer target] → rail 统一连续命中，键盘只使用一个停靠点，浮层提供可读且可点击的摘要目标。
- [极长对话中的横线总高度可能超过聊天视口] → rail 设置可用高度上限并内部滚动；active/preview 变化时只滚动 rail，不影响消息列表。
- [ResizeObserver 可能因消息 streaming 或折叠内容产生高频通知] → 测量与 scroll 更新分别用 animation frame 合并，并在未发生尺寸变化时复用缓存。
- [平滑滚动没有统一的 `scrollend` 支持行为] → 同时使用目标位置容差判定和短时 fallback 清理 navigation lock，卸载时清除 fallback。
- [单一浮层从 rail 移入 portal 后可能触发 pointerleave] → 使用受控 open 状态和短关闭延迟，浮层 pointerenter 会取消关闭。

## Migration Plan

1. 先用组件测试固化横线状态、摘要内容与统一 pointer/keyboard intent。
2. 改造 `usePromptTimeline.ts` 的 anchor 缓存、active 查询和 navigation lock，并更新 composable 测试。
3. 改造 `ChatPromptTimelineNav.vue` 与 `ChatPromptTimeline.vue` props/emits，保持 `ChatContainer.vue` 的装配边界。
4. 运行 renderer 定向测试、typecheck:web 与 lint，并人工检查浅色/深色、窄窗口、长对话和 reduced-motion。

回滚时恢复旧 Nav 和 composable 实现即可；没有数据迁移、依赖回退或持久化清理。

## Open Questions

无。视觉和交互取舍已由 `timeline-scrubber-prototype.html` 收敛。
