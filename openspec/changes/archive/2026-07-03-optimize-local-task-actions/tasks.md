## 1. 任务卡片关闭操作

- [x] 1.1 修改 `src/renderer/src/components/task/TaskCard.vue` 的 emits：移除 `delete` emit，新增 `close: [task: TaskItem]` emit；验收标准：组件不再向父级发出删除事件，打开状态本地任务确认关闭后发出 `close` 事件。
- [x] 1.2 在 `TaskCard.vue` 中把本地任务卡片右侧删除按钮替换为关闭 icon-only button；验收标准：只有 `task.source === "local"` 且 `task.status === "open"` 时展示该按钮，按钮具备 `aria-label="关闭任务"` 和 `title="关闭任务"`，已关闭本地任务和非本地任务均不展示该按钮。
- [x] 1.3 在 `TaskCard.vue` 中复用 `useConfirmDialog()` 实现关闭确认；验收标准：确认弹窗使用标题 `关闭任务？`、确认按钮 `关闭任务`、`confirmColor: "neutral"`，描述包含任务标题并说明任务会移到“关闭”列表且可重新打开；确认后 emit `close`，取消后不 emit。
- [x] 1.4 修改 `src/renderer/src/pages/task.vue`，新增 `handleCloseTask(task: TaskItem)` 并连接 `<TaskCard @close="handleCloseTask">`；验收标准：确认关闭后页面调用 `taskStore.updateTask(task.id, { status: "closed" })`，不再从卡片接收删除事件。

## 2. 编辑 modal 删除入口

- [x] 2.1 修改 `src/renderer/src/components/task/TaskDetailModal.vue`，新增 `delete: [task: TaskItem]` emit，并引入 `useConfirmDialog()`；验收标准：组件可以在删除确认后向父级发出当前本地任务。
- [x] 2.2 在 `TaskDetailModal.vue` 编辑态 footer 左侧新增 `删除任务` 按钮；验收标准：按钮只在 `mode === "edit"` 且任务为本地任务时展示，使用 `i-lucide-trash-2` 图标、`color="error"`，查看态和非本地任务不展示。
- [x] 2.3 在 `TaskDetailModal.vue` 中实现删除确认；验收标准：确认弹窗使用标题 `删除任务？`、确认按钮 `删除任务`、`confirmColor: "error"`，描述包含任务标题并说明永久删除且不可恢复；确认后 emit `delete`，取消后不 emit 且 modal 保持编辑态。
- [x] 2.4 修改 `src/renderer/src/pages/task.vue` 的删除处理，使删除入口来自 `<TaskDetailModal @delete="handleDeleteTask">`；验收标准：删除成功后调用 `taskStore.deleteTask(task.id)`、关闭详情 modal、调用 `taskStore.resetDetailState()` 并清空 `activeDetailTask`；删除失败时 modal 保持打开。

## 3. Renderer 测试

- [x] 3.1 更新 `test/renderer/src/components/task-card.spec.ts`；验收标准：覆盖打开状态本地任务显示关闭 icon button、点击关闭时先确认、确认后 emit `close`、取消后不 emit、已关闭本地任务不显示关闭或删除按钮，并移除旧的卡片删除断言。
- [x] 3.2 更新 `test/renderer/src/components/task-detail-modal.spec.ts`；验收标准：覆盖查看态不显示删除、本地任务编辑态显示 `删除任务`、非本地任务不显示删除、确认删除后 emit `delete`、取消删除后不 emit。
- [x] 3.3 更新 `test/renderer/src/pages/task.spec.ts` 的 TaskCard 和 TaskDetailModal stubs；验收标准：覆盖卡片 `close` 事件调用 `updateTask(task.id, { status: "closed" })`，以及 modal `delete` 事件调用 `deleteTask(task.id)` 并关闭/清理详情状态。
- [x] 3.4 运行 `pnpm exec vitest run --project renderer test/renderer/src/components/task-card.spec.ts test/renderer/src/components/task-detail-modal.spec.ts test/renderer/src/pages/task.spec.ts`；验收标准：相关 renderer 测试全部通过。
