# Chat Prompt Timeline

Chat 长对话中的 user prompt 浏览与定位能力。外部宿主只通过
`@renderer/features/chat-prompt-timeline` 使用 `ChatPromptTimeline`，不得导入 feature 内部路径。

## 分层

- `model/`：从宿主无关的 prompt source 纯投影 `ChatPromptTimelineItem[]`，负责 user-only、
  文本优先、附件 fallback、空项排除、顺序和 ordinal。
- `application/`：active reference line、anchor offset 缓存、滚动同步、导航 intent、
  reduced-motion、ResizeObserver/RAF 和 teardown。
- `ui/`：timeline guide、active thumb、popover 以及 pointer/wheel/keyboard 局部交互。
- `integration/`：将 raw Chat `UIMessage` 转为 model source，并连接 session store、
  ChatContainer DOM refs、application 和 UI。

## 公共入口

根 `index.ts` 只导出 `ChatPromptTimeline`。Model 类型、projection adapter、application composable
和 Nav 组件都是 feature 私有实现。

## 保持在 feature 外

- session/chat stores
- 通用 message part 和 system-reminder parser
- Chat Composer 的草稿与提交状态

迁移和后续重构必须保持 `openspec/specs/chat-prompt-timeline/spec.md` 定义的顺序、显示门槛、
system reminder 隐藏、附件摘要、滚动定位、popover 与可访问行为。
