## 1. 同步 UI Guideline

- [x] 1.1 修改 `guidelines/UiDesign.md` 的“文案与可访问性”和“验证”段落，明确普通工具四种状态均不渲染可见或屏幕阅读器专用 suffix，pending/in_progress 继续使用 shimmer、completed 使用稳定标题、failed 仅使用错误色具体工具 icon 并保留 Error 详情；其他 UI 状态继续遵守不只靠颜色表达的通用规则。

## 2. 移除工具状态 Suffix

- [x] 2.1 修改 `src/renderer/src/components/chat/message/ChatToolItem.vue`，让有详情和无详情两条 `UChatTool` 分支都不再传递 `statusPresentation.text` 到 `suffix`，并让 `toolUi` 仅在 `getToolStatusPresentation(part).visible` 表示 failed 时覆盖 `leadingIcon` 为 `text-error`；pending、in_progress、completed、failed 均不得创建状态 suffix DOM。

## 3. 更新 Renderer 测试

- [x] 3.1 修改 `test/renderer/src/components/shared/ui-message-list.spec.ts` 的直接工具状态测试，覆盖 pending、in_progress、completed、failed，断言四者均未传递 suffix，pending/in_progress 的 streaming 状态保持不变，且只有 failed 使用 `text-error` leading icon。
- [x] 3.2 修改同一测试文件的 Activity Group 展开场景，断言所有子工具均未传递 suffix、失败子工具仍使用错误色 icon，并保留工具详情可展开及 Error 分区既有行为。

## 4. 验证

- [x] 4.1 运行 `test/renderer/src/components/shared/ui-message-list.spec.ts` 的聚焦 Vitest 测试，确认工具展示、Activity Group 与 Error 详情相关用例通过。
- [x] 4.2 运行 Renderer 类型检查和 `git diff --check`；在 dev 环境展开包含多个工具的 `ChatActivityGroup`，确认 `chat-message-scroll-container.scrollWidth` 不再因状态 suffix 大于 `clientWidth`，且对话区不出现横向滚动条。
