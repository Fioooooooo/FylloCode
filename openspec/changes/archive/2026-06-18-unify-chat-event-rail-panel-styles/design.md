## Context

`ChatSessionEventRail` 当前承载两类信息：

1. `ChatPlanPanel`：展示 ACP agent 的执行计划，使用可折叠 Header + 无背景列表。
2. `ChatProposalPanel`：展示与会话关联的 proposal 状态，使用静态英文标题 + 卡片式 item。

两者 recently 在同一 Rail 中并存后，出现标题语言、折叠行为、容器形态、图标风格不一致的问题。本设计在不变更功能与行为契约的前提下，统一两者的 Section Header 与 Rail 内间距。

## Goals / Non-Goals

**Goals：**

1. `ChatPlanPanel` 与 `ChatProposalPanel` 的 Section Header 在视觉和交互上保持一致。
2. 标题统一使用简体中文，去除中英混杂。
3. 两个 Panel 都支持折叠/展开。
4. `ChatSessionEventRail` 内多个 Panel 的垂直间距统一，堆叠时节奏协调。
5. 保留各自内容形态：Plan 维持紧凑列表，Proposal 维持卡片式 item。

**Non-Goals：**

1. 不修改 proposal 状态展示、操作按钮行为、IPC；仅调整 `useSessionStore` 内部在收到 `proposal:statusChanged` 时如何同步 `useProposalStore`。
2. 不将 Plan 条目改为卡片，也不将 Proposal 卡片改为列表。
3. 不改变 Rail 的宽度、展开/收起行为、与 `ChatContainer` 的排布关系。
4. 不新增业务功能（如 tabs、accordion、拖拽排序）。

## Decisions

### Decision 1：Header 统一为可折叠按钮

**Rationale：** `ChatPlanPanel` 已经采用可折叠 Header，是 Rail 内更成熟的交互模式；`ChatProposalPanel` 跟进该模式可降低用户学习成本，并允许用户在 Panel 较多时收起不关注的内容。

**实现方式：** 两个 Panel 内部各自维护 `collapsed` 状态，Header 使用 `<button type="button">` 包裹，点击切换折叠。

### Decision 2：Header 视觉规范

**Rationale：** 统一视觉层级，避免字号、字重、颜色差异带来的凌乱感。

**实现方式：**

- 容器：`w-full flex items-center justify-between gap-2 px-1 py-1.5 text-muted hover:text-highlighted transition-colors`（与现有 `ChatPlanPanel` Header 容器对齐）。
- 左侧：`UIcon` + 中文标题，标题类名为 `text-sm font-medium uppercase tracking-wide`。
- 右侧：计数文本 + chevron 图标。
- 图标：Plan 使用 `i-lucide-list-checks`；Proposal 使用 `i-lucide-file-text`。

### Decision 3：计数展示方式

**Rationale：** Plan 的进度计数 `completed/total` 对用户有价值，保持原样；Proposal 无完成/未完成语义，展示总数即可。

**实现方式：**

- Plan：`<completed>/<total>`。
- Proposal：`<total> 个`。

### Decision 4：Rail 内 Panel 间距

**Rationale：** 当前 `ChatSessionEventRail` 内容区使用 `space-y-4`，但 Panel 内部又有各自的 `space-y`，导致视觉节奏不均。

**实现方式：** 保持 `ChatSessionEventRail` 内容区 `space-y-4`，但要求每个 Panel 的 Header 与内容之间使用一致的 `space-y-2` 或 `space-y-1`；Panel 自身不带额外外边框或背景，避免在 Rail 内形成嵌套卡片感。

### Decision 5：保留内容形态

**Rationale：** Plan 条目是短文本列表，卡片会增加视觉重量；Proposal 包含标题、ID、状态 badge、操作按钮，卡片能清晰划分 item 边界。强行统一形态会牺牲信息密度或增加不必要的厚重感。

**实现方式：** Plan 列表继续使用 `space-y-1` 的无背景条目；Proposal 继续使用 `rounded-lg border border-default bg-default p-3` 的卡片。

### Decision 6：Proposal 卡片内标题与状态 badge 布局

**Rationale：** 当前 `ChatProposalPanel` 卡片顶部使用 `flex items-start justify-between gap-2`，当 change id 较长时，左侧文本会挤压右侧 `UBadge`，导致状态 badge 被压缩甚至换行。

**实现方式：**

- 左侧信息区包裹在 `min-w-0 flex-1` 容器内，内部标题与 change id 各自使用 `truncate`。
- 右侧 `UBadge` 添加 `shrink-0`，确保状态 badge 宽度不被压缩。
- 左侧与右侧之间保持 `gap-2` 或 `gap-3`。
- 标题行（`text-sm font-medium text-highlighted`）展示 `proposal.title`；副标题行（`text-xs text-muted`）展示原始 `proposal.id`。

### Decision 7：creating 状态不显示“查看详情”

**Rationale：** `creating` 状态的 proposal 尚未生成完整提案内容，点击“查看详情”跳转 `/proposal/:id` 没有实际意义，且可能展示空白或加载中的页面。

**实现方式：** `ChatProposalPanel` 中“查看详情”按钮的渲染条件从 `v-else`（即非 draft 且非可归档 applying）改为 `proposal.status !== 'creating'` 的兜底分支。`creating` 状态下该卡片不展示任何操作按钮。

### Decision 8：在 statusChanged 到达时刷新缺失的 proposalStore 数据

**Rationale：** 主进程 `readMetaFromDir` 在读取磁盘 proposal 时已将 change-id 转换为可读标题（`toTitleCase(stripArchivePrefix(entryName))`），该标题随 `proposalApi.list()` 进入 `useProposalStore`。但当 renderer 仅通过 `proposal:statusChanged` 推送首次获知新 proposal 时，`useSessionStore.buildProposalMetaFromPayload` 回退使用原始 change id 作为 title，导致 `ChatProposalPanel` 加粗标题显示为 raw change id。

核心原因是 `useProposalStore` 没有在 proposal 创建后自动刷新。`proposal:statusChanged` 事件由 `proposalStatusService` 在 `mcp-event-consumer` 消费 create-proposal event 后首次启动 watch 时发出，这正是 renderer 最早能感知到新 proposal 的时机。

**实现方式：**

1. 修改 `src/renderer/src/stores/session.ts` 的 `subscribeProposalStatus` 回调：
   - 收到 `proposal:statusChanged` 事件后，先检查 `useProposalStore().proposals` 中是否已存在该 `changeId`。
   - 若不存在，调用 `useProposalStore().loadProposals()` 刷新完整列表。
   - 刷新完成后，使用 `buildProposalMetaFromPayload(payload)` 更新 `sessionProposals`，此时 `proposalStore.proposals` 已包含完整 `ProposalMeta`，`title` 将为主进程生成的友好化字符串。
2. 不新增 friendly fallback 逻辑；`buildProposalMetaFromPayload` 仍保留现有回退行为（title = changeId），用于极端异常场景，但正常流程下不会触发。
3. `ChatProposalPanel` 保持绑定 `proposal.title`，无需额外修改。

## Risks / Trade-offs

| 风险                                                                                       | 缓解                                                                                                  |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Header 统一后，Proposal 的"会话提案"标题与 Plan 的"执行计划"在视觉上过于相似，用户可能混淆 | 通过不同图标（`i-lucide-list-checks` vs `i-lucide-file-text`）区分；内容形态不同也能快速辨认。        |
| 新增折叠能力后，用户可能不知道 Proposal 默认是展开还是折叠                                 | 两者默认均展开（`collapsed = false`），与当前 Plan 行为一致。                                         |
| 计数文本可能因 proposal 标题过长而换行                                                     | Header 使用 `flex items-center justify-between gap-2`，左侧 `min-w-0` + `truncate`，右侧 `shrink-0`。 |

## Open Questions

1. 是否需要为 archived proposal 增加单独的分组或折叠？当前设计保持与现有逻辑一致：archived proposal 仍按创建时间倒序展示在列表中。
