## 1. Context 环状态与 Tooltip

- [x] 1.1 修改 `src/renderer/src/components/chat/prompt/ContextUsageRing.vue`：从钳制后的原始百分比派生 `<75`、`75–<90`、`90–<95`、`>=95` 四档状态，并让 `usageColorClass` 分别返回 `text-success`、`text-warning`、`text-orange-500 dark:text-orange-400`、`text-error`；环内整数百分比改为向下取整。
- [x] 1.2 修改 `ContextUsageRing.vue` 的 `tooltipRows`：始终保留现有 `Context` 用量行，删除 Remaining 与 Cost 行，并在三档风险状态下追加 label 为 `建议` 的精确中文文案；继续由 `tooltipRows` 生成 `tooltipText`，保证 `sr-only` 与可见 Tooltip 一致。

## 2. 回归测试

- [x] 2.1 新增 `test/renderer/src/components/context-usage-ring.spec.ts`，直接挂载 `ContextUsageRing.vue` 并覆盖低于 75%、75%、90%、95% 四档颜色及精确建议文案。
- [x] 2.2 在同一测试中覆盖 74.x%、89.x%、94.x% 的向下取整显示，以及携带 `cost` 时 Tooltip 和 `sr-only` 均不包含 Remaining、Cost，低于 75% 时不包含建议行。

## 3. 验证

- [x] 3.1 运行 Context 环定向 Renderer 测试，确认所有阈值、文案和移除字段断言通过。
- [x] 3.2 运行 `pnpm typecheck:web` 与适用的 Renderer 测试，确认组件类型和既有 ChatPromptPanel 挂载行为无回归；人工核对浅色、深色主题下黄色、橙色、红色环的可辨识度。
