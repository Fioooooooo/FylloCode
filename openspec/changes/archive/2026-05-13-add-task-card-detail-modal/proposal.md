## Why

当前 TaskCard 只展示标题和 2 行截断的描述摘要，用户无法在任务列表页查看完整描述内容；本地任务虽然在数据层已经有 `updateTask` 能力，但 UI 上没有编辑入口，创建之后只能删除不能修改。这导致用户需要记忆任务全文或反复重建任务，完整性缺失。

## What Changes

- 为 TaskCard 增加点击交互：卡片主体区域（描述及分割线以上）点击后打开「任务详情弹窗」；分割线以下的操作区保持原有按钮行为不受影响。
- 新增「任务详情弹窗」组件，默认进入**查看模式**，完整展示任务标题、元数据（来源标识、创建时间、标签）和描述全文（保留换行）。
- 本地任务在详情弹窗中提供**编辑模式**切换：点击「编辑」按钮后，`title` 与 `description` 变为可编辑表单，字段形态与创建弹窗保持一致（`UInput` + `UTextarea`），提供「取消」与「保存」操作。
- 外部任务（云效、GitHub）详情弹窗**只读**，不展示「编辑」按钮。
- 编辑模式关闭弹窗或取消时**不做未保存改动的二次确认**，直接丢弃本地表单状态。
- 详情弹窗**不重复** TaskCard 已有的业务操作按钮（发起讨论、任务来源、关联 Proposal、删除），弹窗职责限定在「阅读 + 编辑」。

## Capabilities

### New Capabilities

<!-- 无新增独立 capability，本次改动属于 task-panel 现有 capability 的扩展。 -->

### Modified Capabilities

- `task-panel`: 新增「任务卡片点击打开详情弹窗」「任务详情弹窗查看与编辑本地任务」相关 requirement；既有「任务卡片支持主操作与次操作」requirement 需明确点击分区规则，避免与新点击行为冲突。

## Impact

- **前端组件**：`frontend/src/components/task/TaskCard.vue` 调整点击区域与事件分发；新增 `frontend/src/components/task/TaskDetailModal.vue` 承载查看/编辑两种模式。
- **页面集成**：`frontend/src/pages/task.vue` 需要持有「当前打开详情的任务」状态，接入新弹窗。
- **状态管理**：复用已有的 `taskStore.updateTask(taskId, updates)`，不新增 IPC 接口、不改动主进程。
- **数据模型**：沿用现有 `TaskItem`，本次只触达 `title` 和 `description` 字段；其他可编辑字段（`status`、`labels`、`assignee`、`proposalId`）不在本 change 范围内。
- **测试**：需新增 TaskDetailModal 组件的 Vitest 用例，并补充 TaskCard 点击分区的单元测试。
