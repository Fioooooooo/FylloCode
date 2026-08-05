## 1. 建立有界 Timeline 回归测试

- [x] 1.1 扩展 `test/renderer/src/components/chat-prompt-timeline-nav.spec.ts` 的 fixture/helper，使测试可生成 8、24、61 条 `ChatPromptTimelineItem`；新增断言：8 条渲染 8 个 `data-test="chat-prompt-timeline-guide"`，24/61 条均只渲染 10 个，且 24/61 条 rail 的计算高度相同并且不再使用 `overflow-y-auto`。
- [x] 1.2 在同一测试文件中用 stubbed `getBoundingClientRect()` 覆盖 rail 顶部、中间、刻度间隙和底部的归一化 pointer 映射；验收标准为 61 条数据可映射到首个、中间和最后一个真实 prompt，hover 只更新 preview，drag 才发出 `immediate`，普通点击发出 `smooth`。
- [x] 1.3 新增 active/preview 视觉解耦测试：active item 改变时独立 `data-test="chat-prompt-timeline-thumb"` 的纵向比例更新，所有 guide 的 neutral 长度和颜色不变；hover、键盘 preview 和 pinned selection 也不得改变 guide classes。

## 2. 实现有界 Guide 与连续 Scrubber

- [x] 2.1 修改 `src/renderer/src/components/chat/timeline/ChatPromptTimelineNav.vue`，用组件局部常量 `MAX_GUIDE_COUNT = 10`、`SHORT_GUIDE_STEP_PX = 14`、`MIN_RAIL_HEIGHT_PX = 36`、`LONG_RAIL_HEIGHT_PX = 164` 替换逐 item `LINE_STEP_PX` 高度模型；增加 `guideCount`、`railHeightPx`、`guideOffsets` 和 `activeThumbOffset` 等 computed，使 2–10 条逐项显示、超过 10 条固定显示 10 个 guide。
- [x] 2.2 在 `ChatPromptTimelineNav.vue` 模板中将逐 item、可滚动横线列表替换为 neutral guide track、统一横线和独立 teal thumb；guide 不再绑定 `isActive()`/`isPreview()` 样式，thumb 只由 `activeItemId` 对应的完整 item index 驱动，并为测试暴露稳定的 `data-test`/比例属性。
- [x] 2.3 将 `indexFromPointer()` 改为基于 `railRef.getBoundingClientRect()` 的归一化比例公式 `round(ratio * (items.length - 1))`，移除 `scrollTop`、`LINE_STEP_PX` 和 `ensureIndexVisible()` 依赖；保留 pointer capture，确保 pointerup、pointercancel 和 `onBeforeUnmount` 均清理 dragging/capture 状态。
- [x] 2.4 为 rail 增加非 passive `wheel` handler：按 `deltaY` 将 `previewIndex` 逐条限制在 items 边界内，更新摘要选择并以 `emit("locate-prompt", messageId, "immediate")` 复用现有导航入口；不得在组件内复制 `usePromptTimeline.ts` 的 scrollTop 计算。

## 3. 实现透明悬浮表面

- [x] 3.1 在 `ChatPromptTimelineNav.vue` 的局部 wrapper/rail 上实现约 `w-11` 的悬浮 hit area：默认使用 `bg-transparent border-transparent shadow-none`，hover、focus-within、dragging 使用 `bg-default/80 border-default/50` 等现有语义 class；只允许 `transition-colors duration-150`，不得增加 hover shadow、transform、全局 CSS 或固定 timeline column。
- [x] 3.2 更新 `test/renderer/src/components/chat-container.spec.ts` 的 timeline 布局用例，明确断言 `ChatContainer.vue` 继续以现有 `absolute left-2 top-4` host 挂载 timeline，消息滚动容器仍为完整宽度且消息内容仍使用 `max-w-3xl`；测试不得要求 timeline 侧栏或横向占位。

## 4. 实现 Popover 两阶段状态

- [x] 4.1 在 `ChatPromptTimelineNav.vue` 中引入明确的 `previewIndex`、`pinned`、`dragging` 状态和 `displayedPreviewItems` computed：transient 状态以当前 index 为中心并在边界补齐最多 5 条，pinned 状态返回全部 items；关闭 transient 时清理 preview，关闭 pinned 时同时清理固定状态和延迟 timer。
- [x] 4.2 重构现有受控 `UPopover` content，增加“附近 prompts / 全部 user prompts”标题、当前位置/总数以及固定/关闭操作；完整列表内容区使用 `max-h-72 overflow-y-auto`，所有摘要 button 使用固定单行高度和 `truncate`，显示紧凑 prompt ordinal，并保持 portal 和 `onOpenAutoFocus`/`onCloseAutoFocus` 的现有防抢焦点行为。
- [x] 4.3 实现统一 selected 摘要样式 `bg-primary/10 text-default`，移除所有 `border-l-*`/`border-primary` selected 样式并保持相同水平 padding；点击 transient 摘要时使用 `smooth` 定位并进入 pinned，点击 pinned 摘要时更新 selection、保持 popover 打开并复用相同定位事件。
- [x] 4.4 在 pinned selection 因 pointer、wheel 或 keyboard 改变后，通过 selected row ref 或稳定 `data-item-id` 在 `nextTick()` 后调用 `scrollIntoView({ block: "nearest" })`；保留 rail/content pointer enter/leave 的 `PREVIEW_CLOSE_DELAY_MS` 协调，但 pinned 状态不得被 transient close timer 关闭。
- [x] 4.5 更新 `test/renderer/src/components/chat-prompt-timeline-nav.spec.ts`：transient 最多 5 行且首尾补齐，pinned 渲染完整 61 行并具有独立滚动容器，长摘要单行省略，selected 行无左 border，点击摘要定位语义正确，pointer 从 rail 移入 content 不闪退，pinned selection 会请求滚动到可见范围。

## 5. 完成键盘与无障碍语义

- [x] 5.1 将 `ChatPromptTimelineNav.vue` rail 改为单一 `role="slider"`/`tabindex="0"` 入口，绑定 `aria-valuemin="1"`、完整 items 数量的 `aria-valuemax`、active 或 preview ordinal 的 `aria-valuenow`，并生成“第 N 条 prompt，共 M 条”的 `aria-valuetext`；guide 本身不得进入 Tab 序列。
- [x] 5.2 调整 `handleFocus()`/`handleKeydown()`：focus 以 active index 初始化 preview；ArrowUp/ArrowDown、Home/End 在完整 items 上移动；Enter 以 `smooth` 定位并进入 pinned；Escape 关闭任一 popover 状态且不改变 active；pinned 下的键盘移动必须同步 selected 行可见性。
- [x] 5.3 在 `test/renderer/src/components/chat-prompt-timeline-nav.spec.ts` 覆盖 slider ARIA、单一 Tab 停靠点、完整数据边界的 Arrow/Home/End、Enter pinned、Escape close，以及 active 与 preview 分离；保留 `usePromptTimeline.ts` 现有 reduced-motion 和 active/reference-line 测试不变。

## 6. 聚焦验证

- [x] 6.1 若 main worktree 本次 Apply 尚未准备本地环境，先运行 `sh scripts/prepare-worktree-env.sh`；随后运行 `pnpm exec vitest run --project renderer test/renderer/src/components/chat-prompt-timeline-nav.spec.ts test/renderer/src/components/chat-container.spec.ts`，确认 timeline 组件与 Chat 宿主回归测试通过。
- [x] 6.2 运行 `pnpm typecheck`、`pnpm lint` 和 `git diff --check`，修复本变更引入的类型、lint、格式或空白错误；本变更不涉及构建配置，不运行 `pnpm build`。
