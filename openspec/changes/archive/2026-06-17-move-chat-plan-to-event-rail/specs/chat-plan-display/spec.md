## MODIFIED Requirements

### Requirement: ChatPlanPanel 展示会话执行计划

渲染进程 SHALL 提供 `ChatPlanPanel.vue` 组件（位于 `src/renderer/src/components/chat/plan/`），展示当前会话的 ACP 执行计划。组件接收 `entries: PlanEntry[]` prop，并 SHALL 作为 Chat 右侧会话事件栏中的执行计划事件卡片渲染。`ChatContainer.vue` SHALL NOT 再把 `ChatPlanPanel` 固定渲染在消息列表与 `ChatPromptPanel` 之间（输入框上方）。

`PlanEntry` 类型由 `src/shared/types/chat.ts` 导出，结构为：

```typescript
interface PlanEntry {
  content: string;
  priority: "high" | "medium" | "low";
  status: "pending" | "in_progress" | "completed";
}
```

视觉映射 SHALL 复用项目既有的语义色与 `i-lucide-*` 图标约定（参照 `ProposalApplySidePanel.vue`）：

- status 图标：`completed` → `i-lucide-check`（success 色，文本加删除线）；`in_progress` → `i-lucide-loader-2`（warning 色，旋转动画，文本高亮加粗）；`pending` → `i-lucide-circle`（dimmed 色）。
- priority 标记：`high` → `bg-error/10 text-error`（"高"）；`medium` → `bg-warning/10 text-warning`（"中"）；`low` → `bg-elevated text-muted`（"低"）。

#### Scenario: 计划面板展示条目与进度

- **WHEN** `entries` 含 5 条，其中 2 条 `completed`、1 条 `in_progress`、2 条 `pending`
- **THEN** 面板标题栏显示"执行计划"与进度计数 `2/5`
- **AND** 列表按数组顺序逐条渲染，每条显示对应 status 图标、content 文本与 priority 标记
- **AND** 存在 `in_progress` 条目时，标题栏显示 warning 色脉冲圆点；否则显示 `i-lucide-list-checks` 图标
- **AND** 面板显示在 Chat 右侧会话事件栏内，而不是底部输入框上方

#### Scenario: 折叠与展开

- **WHEN** 用户点击面板标题栏
- **THEN** 条目列表在展开与折叠之间切换
- **AND** 折叠状态下仍显示标题栏与进度计数

#### Scenario: 空计划不渲染

- **WHEN** `entries` 为空数组
- **THEN** `ChatPlanPanel` 不渲染任何可见内容（整个面板隐藏）

#### Scenario: 草稿会话不展示计划面板

- **WHEN** 当前处于草稿态（`activeSessionId === null`）
- **THEN** `ChatContainer` 不渲染 `ChatPlanPanel`
