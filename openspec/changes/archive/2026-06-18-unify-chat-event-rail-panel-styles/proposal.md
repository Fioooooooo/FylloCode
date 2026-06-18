## Why

`ChatSessionEventRail` 中同时存在 `ChatPlanPanel`（执行计划）与 `ChatProposalPanel`（会话提案）时，两者在标题、容器、交互、语言四个维度视觉不统一，导致右侧边栏显得拼凑。需要以最小侵入的方式统一 Panel 的 Header 与间距，使多个 Panel 在 Rail 中堆叠时更加协调。

## What Changes

- 统一 `ChatPlanPanel` 与 `ChatProposalPanel` 的 Section Header：
  - 都改为可折叠按钮形态；
  - 标题统一使用中文（"执行计划" / "会话提案"）；
  - 统一字号、字重、颜色、字间距、图标风格；
  - 标题右侧统一显示计数与折叠 chevron。
- 调整 `ChatSessionEventRail` 内多个 Panel 之间的间距，使堆叠节奏一致。
- 修复 `ChatProposalPanel` 卡片内标题与状态 badge 的布局：change id 占剩余宽度，状态 badge 不被挤压，两者间保留合理 gap。
- `ChatProposalPanel` 在 `creating` 状态不再显示“查看详情”按钮。
- 修复 `ChatProposalPanel` 标题显示为 raw change id 的问题：当 renderer 收到 `proposal:statusChanged` 事件且 `useProposalStore` 中不存在该 proposal 时，先刷新 `useProposalStore`，再用完整 `ProposalMeta` 更新 `sessionProposals`，使 `proposal.title` 为主进程生成的友好化标题。
- 保留各 Panel 的内容形态：
  - `ChatPlanPanel` 仍使用无背景列表展示计划条目；
  - `ChatProposalPanel` 仍使用卡片式 item 展示 proposal。
- 不改动现有状态展示、操作按钮行为、IPC 与 store 逻辑。

## Capabilities

### New Capabilities

- `chat-event-rail-panel-style`: 定义 Chat EventRail 内多个 Panel 的视觉统一要求（Header、间距、文案语言）。

### Modified Capabilities

- 无。本次变更仅调整 UI 呈现，不修改 `chat-event-rail-proposal-status` 等功能性 spec 的行为契约。

## Impact

- 受影响文件：
  - `src/renderer/src/components/chat/event/ChatSessionEventRail.vue`
  - `src/renderer/src/components/chat/event/ChatPlanPanel.vue`
  - `src/renderer/src/components/chat/event/ChatProposalPanel.vue`
  - `src/renderer/src/stores/session.ts`
  - `src/renderer/src/stores/proposal.ts`
- 无新增依赖、无 IPC/存储格式变更、无行为契约变化。
