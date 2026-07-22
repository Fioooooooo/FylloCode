## Why

当前 Chat Prompt Timeline 在长对话中使用细小且彼此分离的点击目标，并在滚动时逐项读取全部 prompt 锚点位置；用户容易遇到 hover 死区、active 状态跳动和滚动反馈迟滞。现有单页原型已经收敛出更紧凑、连续命中且与 FylloCode 视觉规范一致的交互，需要将其固化为正式行为契约。

## What Changes

- 将 prompt timeline 节点改为紧凑、等距、左对齐的横线索引；默认横线较短，active 横线最长且使用 teal 表达当前阅读位置。
- hover、键盘预览和拖动扫过只把目标横线延长到 active 的长度，不改变非 active 横线颜色，并由整条 timeline 连续映射最近 prompt，消除横线之间的 hover 死区。
- 使用单一浮层展示目标 prompt 及其相邻 prompt 的摘要，不展示轮次、序号、时间或统计元信息。
- 点击横线或浮层摘要时将目标 prompt 定位到阅读区参考线；拖动 timeline 时按经过的等距横线连续定位。
- active prompt 改为阅读参考线已经进入的最近一个 prompt 区段；平滑跳转期间锁定目标，结束后恢复滚动跟随。
- 为 timeline 提供单一 Tab 停靠点，以及方向键、Home、End、Enter 和 Escape 导航。
- 缓存 prompt 锚点位置并在布局变化时重新测量；滚动帧只查询缓存，避免长对话中逐项读取 DOM 布局。
- 保持 prompt 顺序、system reminder 隐藏、附件摘要、仅一个 prompt 时隐藏 timeline 等现有投影与显示规则。

## Capabilities

### New Capabilities

- `chat-prompt-timeline`: 定义 Chat 长对话 prompt 索引的紧凑视觉状态、连续指针交互、摘要浮层、键盘导航、跳转与滚动同步行为。

### Modified Capabilities

无。

## Impact

- Renderer 组件：`src/renderer/src/components/chat/timeline/ChatPromptTimelineNav.vue`、`ChatPromptTimeline.vue` 和 `ChatContainer.vue`。
- Renderer 交互状态：`src/renderer/src/composables/usePromptTimeline.ts`。
- 纯投影：继续复用 `src/renderer/src/utils/chat-prompt-timeline.ts`，不改变其数据来源与过滤规则。
- 测试：更新 `test/renderer/src/components/chat-prompt-timeline-nav.spec.ts`、`test/renderer/src/composables/use-prompt-timeline.spec.ts` 和相关 ChatContainer 集成测试。
- 设计基准：项目根目录 `timeline-scrubber-prototype.html`；不新增外部依赖，不改变 IPC、持久化格式或跨进程契约。
