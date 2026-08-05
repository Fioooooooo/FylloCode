## Why

当前 Chat prompt timeline 为每条 user prompt 渲染一条等距横线，几十轮对话会让索引持续增高并在自身区域滚动，降低整体进度的可读性，也让 hover 预览难以快速浏览完整 prompt 历史。已有交互原型验证了“有界视觉刻度 + 连续命中 + 可固定完整列表”的方向，可在不占用消息阅读宽度的前提下保持长对话的精确导航能力。

## What Changes

- 将 timeline 的视觉刻度数量限制在 2–10 个：2–10 条 prompt 一一对应刻度，超过 10 条后固定显示 10 个均匀分布的导览刻度，timeline 高度不再随 prompt 总数无限增长。
- 保留全部 prompt 作为导航数据；rail 的完整纵向命中区按指针位置映射到真实 prompt index，使刻度之间移动、点击和拖动仍可精确预览或定位几十条 prompt。
- 以独立 teal thumb 表达当前阅读位置，不再通过 active 或 preview 改变任一导览刻度的长度、颜色或数量；现有阅读参考线、平滑导航锁定和 anchor offset 缓存继续负责 active 同步。
- 保持 timeline 绝对定位在 Chat 消息区左侧并覆盖于内容之上，不参与布局宽度计算。常态背景和边界透明；hover、键盘聚焦或拖动时仅显示轻量半透明语义背景与边界，不使用 hover 阴影或位移动效。
- 将临时 hover popover 调整为最多 5 条附近 user prompt 单行摘要；允许显示紧凑 prompt ordinal 和总数，超长文本使用省略号。
- 点击 rail 或按 Enter 后将同一个 popover 固定为完整 user prompt 列表；列表使用最大高度和独立纵向滚动，选中摘要仅使用浅 teal 背景，不显示左侧深色 border，并可点击定位对应 prompt。
- 保留单一键盘入口和 reduced-motion 行为；补充 slider 语义、固定列表内的选中项可见性以及关闭/失焦边界。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `chat-prompt-timeline`: 将逐 prompt 无限增长的紧凑横线索引改为有界自适应悬浮 scrubber，并扩展摘要 popover 的附近预览、固定完整列表、单行滚动与可访问导航行为。

## Impact

- 主要实现：`src/renderer/src/components/chat/timeline/ChatPromptTimelineNav.vue`。
- 继续复用：`src/renderer/src/components/chat/timeline/ChatPromptTimeline.vue`、`src/renderer/src/composables/usePromptTimeline.ts`、`src/renderer/src/utils/chat-prompt-timeline.ts` 的 prompt 投影、active 同步与定位语义；不修改 Session 数据结构、IPC 或持久化格式。
- 宿主布局：`src/renderer/src/components/chat/ChatContainer.vue` 继续以现有 absolute host 挂载 timeline，不新增固定侧栏或消息列占位。
- 测试：更新 `test/renderer/src/components/chat-prompt-timeline-nav.spec.ts` 和相关 `test/renderer/src/components/chat-container.spec.ts` 断言，覆盖短/长对话刻度、连续映射、悬浮表面、popover 两种状态、滚动列表与键盘行为。
- 设计依据：`references/designs/chat-prompt-timeline/prototype/adaptive-timeline-scrubber.html`；正式实现使用 Nuxt UI/Tailwind 语义 token，并遵守 `guidelines/UiDesign.md` 的 hover 反馈限制。
- 不新增外部依赖，不改变公开 IPC/API、消息数据模型或跨模块所有权。
