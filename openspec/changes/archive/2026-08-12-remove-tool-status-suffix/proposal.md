## Why

普通工具把不应展示的执行状态作为 `UChatTool` suffix 渲染，再通过 `sr-only` 隐藏；展开 Activity Group 后，这些绝对定位的隐藏节点会扩大消息列的 `scrollWidth`，导致对话区出现横向滚动条。既有规范还把视觉隐藏误写成了屏幕阅读器状态要求，需要按已确认的产品意图统一纠正。

## What Changes

- pending、in_progress、completed、failed 四种普通工具状态均不再渲染 suffix，也不再提供对应的屏幕阅读器状态文字。
- pending 与 in_progress 继续由 Nuxt UI shimmer 表达运行中状态，completed 继续显示稳定工具名称。
- failed 不再显示“失败”文字，仅保留具体工具 icon 的 error 语义色；可用错误文本继续显示在可折叠详情的 `Error` 分区。
- 直接工具与 Activity Group 子工具应用同一规则，Activity Group 顶层摘要、图标和 streaming 规则保持不变。
- 移除由隐藏 suffix 引起的消息列横向溢出，不使用外层 `overflow-x-hidden` 掩盖问题。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `assistant-activity-display`: 修改普通工具的状态展示与可访问性要求，四种状态均不再产生 suffix 或状态文字，失败仅保留错误色 icon 和 Error 详情。

## Impact

- Renderer：`src/renderer/src/components/chat/message/ChatToolItem.vue` 的 `UChatTool` props 与状态样式映射。
- 测试：`test/renderer/src/components/shared/ui-message-list.spec.ts` 中直接工具及 Activity Group 子工具的状态断言。
- 规范：`openspec/specs/assistant-activity-display/spec.md` 中“普通工具展示明确执行状态与失败信息”要求。
- Guideline：`guidelines/UiDesign.md` 中普通工具状态的文案、可访问性和人工验证约定。
- 不影响 ACP 事件、共享 schema、消息持久化、工具详情数据或主进程。
