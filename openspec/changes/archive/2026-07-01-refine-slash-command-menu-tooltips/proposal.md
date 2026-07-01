## Why

slash command 菜单当前把每条命令的 description 直接渲染在列表里，命令较多时列表密度低、扫读成本高。用户只需要先识别命令名，详细说明和参数提示应在需要时再展开。

## What Changes

- 将 slash command 菜单项从「命令名 + description 两行」调整为仅展示 `/<command.name>` 的单行列表。
- 当用户 hover 某条命令，或通过键盘上下键高亮某条命令时，在右侧 tooltip 中展示该命令可用的 `description` 与 `hint`。
- tooltip 内容按字段可用性展示：有 `description` 显示 description，有 `hint` 显示 hint，两者都有则都显示；两者都没有时不显示 tooltip。
- 继续保留现有搜索、键盘导航、回车选择、ESC 关闭、按钮触发、`/` 触发、命令插入和 hint placeholder 行为。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `chat-interface`: 修改 slash command 菜单项展示规则和高亮项详情展示规则。

## Impact

- 影响 renderer 组件 `src/renderer/src/components/chat/prompt/SlashCommandMenu.vue`。
- 可能影响 `src/renderer/src/composables/useChatPrompt.ts` 与 `src/renderer/src/components/chat/prompt/ChatPromptPanel.vue` 中 slash 菜单触发时序相关测试，但本变更不应改变命令插入语义。
- 需要更新 renderer 组件测试，覆盖单行 label 列表、description/hint tooltip、hover 高亮、键盘高亮、无详情时不显示 tooltip，以及命令顺序/数量不被改变。
