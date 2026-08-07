## Why

ChatPrompt footer 的 Context 环当前在 50% 起显示黄色、80% 起显示红色，既早于 ACP 推荐的风险区间，也缺少达到风险阈值后的行动建议。Tooltip 同时展示 Remaining 与 Cost，使最关键的 Context 状态和下一步建议不够聚焦。

## What Changes

- 将 Context 环的状态阈值调整为：低于 75% 正常、75% 至 90% 黄色、90% 至 95% 橙色、95% 及以上红色。
- Tooltip 始终只展示 `Context` 行；达到 75% 后增加 `建议` 行，并按风险等级展示中文行动文案。
- 移除 Tooltip 的 `Remaining` 与 `Cost` 行，但不改变 ACP `usage_update`、`TokenUsage` 或 session cost 数据契约。
- 为阈值边界、颜色和 Tooltip 文案增加 Renderer 组件测试。

## Capabilities

### New Capabilities

- `input-context-usage-display`: 定义 ChatPrompt footer 的 Context 使用率展示、风险阈值、颜色和 Tooltip 建议文案。

### Modified Capabilities

无。

## Impact

- 受影响组件：`src/renderer/src/components/chat/prompt/ContextUsageRing.vue`。
- 受影响测试：新增 `test/renderer/src/components/context-usage-ring.spec.ts`，并保留 `ChatPromptPanel` 现有挂载条件测试。
- 不受影响：ACP `usage_update` 接收、session token usage 状态、cost 数据存储、Context 环显示位置与可见条件。
