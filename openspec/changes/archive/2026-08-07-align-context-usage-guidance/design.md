## Context

`ContextUsageRing.vue` 当前直接从 `TokenUsage.used / TokenUsage.size` 计算百分比，以 `usageColorClass` 在 success、warning、error 三种颜色间切换，并通过 `tooltipRows` 展示 Context、Remaining 和可选 Cost。该组件已经把 Tooltip 可见内容同步到 `sr-only` 文本，因此新的建议行应继续复用同一数据源，而不是维护第二套辅助功能文案。

本变更只影响 Renderer 展示。`ChatPromptPanel.vue` 继续负责在 active session 且 `tokenUsage.used > 0` 时挂载组件，Main、Preload、ACP mapper、session store 和 `TokenUsage` 类型均不修改。

## Goals / Non-Goals

**Goals:**

- 按 75%、90%、95% 三个边界提供逐级增强的颜色反馈。
- Tooltip 只保留 Context 用量和达到阈值后的中文建议。
- 让可见 Tooltip 与屏幕阅读器文本使用完全相同的 label 和 value。
- 用组件测试锁定每个边界的颜色、建议文案及被移除行。

**Non-Goals:**

- 不增加自动总结、自动新建会话或 handoff 操作。
- 不移除 `TokenUsage.cost`，也不改变 ACP usage/cost 数据采集和持久化。
- 不改变 Context 环的位置、尺寸、进度几何或挂载条件。

## Decisions

### 1. 在组件内派生单一风险级别

继续使用钳制到 0–100 的 `percent` 作为事实源，并在组件内派生四档状态：`<75`、`>=75 && <90`、`>=90 && <95`、`>=95`。颜色与建议文案都从该状态派生，避免两组条件漂移。

备选方案是分别维护颜色条件和 Tooltip 条件；该方案重复阈值，后续调整时容易产生颜色与文案不一致，因此不采用。

### 2. 保留语义色并为橙色档使用 Tailwind palette

正常、黄色和红色继续使用 `text-success`、`text-warning`、`text-error`。Nuxt UI 没有能与黄色 warning 同时表达第二级警告的独立橙色语义 token，因此 90%–95% 使用 `text-orange-500 dark:text-orange-400`，并在浅色、深色主题下人工检查环形 stroke 对比度。

### 3. Tooltip 行由同一 computed 列表驱动

`tooltipRows` 始终生成 label 为 `Context` 的用量行；仅当百分比达到 75% 时追加 label 为 `建议` 的行。移除 Remaining 与 Cost 行，`tooltipText` 继续由 `tooltipRows` 拼接，确保可见 Tooltip 和 `sr-only` 同步。

Context 数值继续使用现有 K/M Token 格式。环内整数百分比使用向下取整，颜色仍按原始百分比判断，使 74.x、89.x、94.x 不会在视觉数字上提前跨入下一阈值。

### 4. 沿用项目既有“会话/对话”术语

需要创建新的 Session 时使用项目现有操作词“新建会话”；需要概括当前消息内容时使用“总结当前对话”。因此中高档建议为“请新建会话或总结当前对话”，最高档建议为“下一次提问可能失败，请新建会话”。

## Risks / Trade-offs

- [橙色使用 palette class 而非 Nuxt UI 语义 token] → 仅用于 warning 与 error 之间的明确风险等级，并验证浅色、深色主题下的对比度。
- [Tooltip 不再展示 Remaining 与 Cost] → 这是有意的信息收敛；底层数据仍保留，后续若需要可在更合适的 session 详情入口展示。
- [百分比整数改为向下取整] → 显示值最多比原先四舍五入低 1 个百分点，但可确保显示数字不会先于真实用量跨越风险边界。
