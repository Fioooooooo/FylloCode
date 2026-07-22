## 1. 固化 Timeline 契约测试

- [x] 1.1 更新 `test/renderer/src/utils/chat-prompt-timeline.test.ts`，保持 `collectChatPromptTimelineItems()` 的原始顺序、system reminder 过滤、可见文本与附件摘要用例不变；验收标准是新交互实现不需要修改 `src/renderer/src/utils/chat-prompt-timeline.ts` 的投影结果。
- [x] 1.2 扩展 `test/renderer/src/components/chat-prompt-timeline-nav.spec.ts` 的测试数据与 Nuxt UI stubs，先覆盖等距横线、active/preview 分离、单一摘要浮层、摘要不含轮次/时间/统计、首尾附近摘要补齐等失败用例。

## 2. 重构滚动同步与定位状态

- [x] 2.1 在 `src/renderer/src/composables/usePromptTimeline.ts` 增加有序 anchor offset 缓存、`measurePromptAnchors()`、animation-frame 调度与二分 active 查询；阅读线使用容器顶部以下 35%，active 选择最后一个已经越过阅读线的 prompt，且普通 scroll frame 不逐项查询 anchor DOM。
- [x] 2.2 在 `usePromptTimeline()` 内为消息内容 wrapper 绑定 `ResizeObserver`，并在容器、prompt IDs、session/loading 状态变化时重新测量；容器替换或卸载时清理 scroll listener、observer、animation frame 和所有 timer。
- [x] 2.3 改造 `locateUserPrompt()`，让普通点击把目标 prompt 平滑定位到 35% 阅读线、reduced-motion 与 drag intent 立即定位，并用非持久化 `navigationTargetId`、位置容差和 fallback timer 防止平滑滚动期间 active 被中间 prompt 覆盖。
- [x] 2.4 更新 `test/renderer/src/composables/use-prompt-timeline.spec.ts`，覆盖“最后一个越过阅读线”、下一个 prompt 不提前 active、anchor 布局变化重测、每帧合并 scroll、smooth 导航锁、reduced-motion/immediate 定位、容器替换与卸载清理；验收标准是测试能证明 scroll path 不再为每个 item 调用 `getBoundingClientRect()`。

## 3. 实现紧凑横线 Rail 与单一摘要浮层

- [x] 3.1 重写 `src/renderer/src/components/chat/timeline/ChatPromptTimelineNav.vue` 的 visual rail：使用统一左边缘、固定 `6px` 步长、默认 `14px` 横线和 active/preview `22px` 横线；active 独占 primary/teal，非 active hover/keyboard preview 只延长并保持 neutral，颜色和尺寸过渡遵守 `duration-150`。
- [x] 3.2 让 Nav 根元素统一处理 pointer hit testing：按 rail 本地 Y 坐标与内部 scroll offset 计算最近 item，横线本身不建立重叠 pointer target；实现 pointer hover preview、pointer capture drag、immediate drag 定位以及 pointerup/pointercancel 清理。
- [x] 3.3 将当前每 item 一个 `UPopover` 改为单一受控 `UPopover`，最多渲染当前 preview 及相邻三条 `ChatPromptTimelineItem.preview`；浮层不渲染 `index`、`label`、时间或统计，允许点击摘要复用 `locate-prompt` intent，并用短关闭延迟避免 rail 与 portal 内容之间闪烁。
- [x] 3.4 为 Nav 建立单一 Tab 停靠点和可见 focus ring，支持 ArrowUp/ArrowDown、Home/End、Enter、Escape，并用中文 aria-label 与 active/preview 状态描述避免只靠颜色表达状态；横线 items 不逐个进入 Tab 序列。
- [x] 3.5 完成 `test/renderer/src/components/chat-prompt-timeline-nav.spec.ts`：模拟 rail pointer Y 命中相邻 item、两线之间无 dead zone、drag intent、active 与 preview class/state、单一浮层、无轮次摘要、摘要点击和完整键盘矩阵。

## 4. 宿主装配与长列表约束

- [x] 4.1 更新 `src/renderer/src/components/chat/timeline/ChatPromptTimeline.vue` 的 props/emits，把 click 与 drag 的 smooth/immediate intent 传给 `usePromptTimeline()`；保持 session store 与消息 scroll container 的现有装配边界。
- [x] 4.2 调整 `src/renderer/src/components/chat/ChatContainer.vue` 中 timeline 的定位与可用高度约束，让紧凑 rail 按内容高度展示、超长时内部滚动，且不改变 `max-w-3xl` 消息列、不遮挡 Composer、不挤压 Event Rail。
- [x] 4.3 更新 `test/renderer/src/components/chat-container.spec.ts` 的集成用例，覆盖 timeline 显示门槛、点击 smooth 定位、drag immediate 定位和消息 scroll container 透传，继续断言 Event Rail 与 Prompt Panel 布局不回归。

## 5. 验证与视觉检查

- [x] 5.1 运行 `pnpm exec vitest run --project renderer` 的 timeline/composable/ChatContainer 定向测试，再运行完整 renderer project；所有新增规范场景与既有回归测试必须通过。
- [x] 5.2 运行 `pnpm typecheck:web` 与 `pnpm lint`，确认没有新增 Vue/TypeScript、a11y 或 renderer feature boundary 错误。
- [x] 5.3 以项目根目录 `timeline-scrubber-prototype.html` 为交互基准，人工检查浅色/深色、窄窗口、超长 prompt 列表、hover、drag、键盘、reduced-motion、Activity 展开折叠和 streaming 高度变化；验收标准是 active 稳定、横线等距左对齐、hover 只延长不变色、浮层无轮次元信息且消息阅读列无布局位移。
