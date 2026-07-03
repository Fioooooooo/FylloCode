## Context

当前任务页 `src/renderer/src/pages/task.vue` 默认选中本地任务来源，并通过 `useTaskStore().statusFilter` 默认展示 `open` 任务。`TaskCard.vue` 当前对本地任务直接渲染一个删除 icon button，并在组件内通过 `useConfirmDialog()` 做删除确认后 emit `delete`。`TaskDetailModal.vue` 当前支持本地任务查看与编辑，编辑态可以保存标题、描述和状态，但没有删除入口。

这次变更只调整本地任务的 renderer 交互编排：关闭任务应成为打开列表中的轻量快捷操作，永久删除应被放到用户更明确进入的编辑 modal 中。后端已经支持 `UpdateTaskInput.status` 与 `deleteTask()`，因此不需要新增 IPC、schema 或存储结构。

## Goals / Non-Goals

**Goals:**

- 打开状态的本地任务卡片只提供“关闭任务”这个 icon-only 状态操作，不在卡片上提供永久删除。
- 关闭任务前有二次确认，确认后通过现有 task store 把状态更新为 `closed`。
- 已关闭的本地任务卡片不展示关闭或删除 icon button。
- 本地任务删除入口只在任务详情 modal 的编辑态 footer 内展示，并保留危险操作确认。
- 保持现有任务编辑能力：用户仍可在编辑 modal 中修改标题、描述和状态，包括把已关闭任务重新设为打开。

**Non-Goals:**

- 不修改本地任务数据模型、任务 IPC channel、任务存储格式或主进程 task service。
- 不新增批量任务操作、撤销删除、软删除或归档状态。
- 不改变云效、GitHub 等非本地任务的只读行为。
- 不改变“发起讨论”“关联会话”“任务来源”等卡片操作。

## Decisions

### 1. 卡片关闭操作继续由 `TaskCard.vue` 承担确认 UI

`TaskCard.vue` 应移除 `delete` emit，新增 `close` emit。组件继续复用现有 `useConfirmDialog()` 模式，在用户点击关闭 icon button 时先弹出确认：

- 标题：`关闭任务？`
- 描述：`任务「${task.title}」会移到“关闭”列表，可在关闭 tab 中重新打开。`
- 确认按钮：`关闭任务`
- 确认颜色：`neutral`

用户确认后，`TaskCard.vue` emit `close` 并传出当前 `TaskItem`；用户取消时不 emit。选择让卡片组件持有确认逻辑，是为了延续现有卡片删除确认的局部交互模式，并避免页面层混入按钮文案和确认弹窗细节。

关闭 icon button 只在 `task.source === "local"` 且 `task.status === "open"` 时展示。按钮使用 Nuxt UI icon-only button，建议图标使用 `i-lucide-circle-check` 或等价 check/close 状态图标，按钮必须具备 `aria-label="关闭任务"` 和 `title="关闭任务"`。已关闭本地任务和非本地任务都不展示这个状态操作按钮。

### 2. 页面层负责执行关闭状态更新

`src/renderer/src/pages/task.vue` 应把 `TaskCard` 的 `close` 事件连接到新的 `handleCloseTask(task: TaskItem)`。该函数调用：

```ts
await taskStore.updateTask(task.id, { status: "closed" });
```

不需要额外刷新列表，因为 `useTaskStore().updateTask()` 已经通过 `upsertTask()` 更新本地任务数组；当前本地来源默认展示 `open` 过滤时，任务状态变为 `closed` 后会自然从可见列表移出。失败时沿用 `taskStore.error` 的现有错误状态，不新增 toast 契约。

### 3. 删除入口放在 `TaskDetailModal.vue` 编辑态 footer 左侧

`TaskDetailModal.vue` 应新增 `delete` emit，删除入口只在 `mode === "edit"` 且任务为本地任务时展示。按钮放在编辑态 footer 左侧，使用 icon+text 的 danger 按钮：

- 文案：`删除任务`
- 图标：`i-lucide-trash-2`
- 颜色：`error`
- 建议样式：`variant="ghost"` 或与现有 modal footer 层级一致的 danger 样式

编辑态 footer 右侧保持现有 `取消` / `保存`，避免删除按钮和保存按钮并列成为同一优先级操作。查看态 footer 仍只展示 `关闭` 和本地任务的 `编辑`，不展示删除入口。

点击删除按钮后复用 `useConfirmDialog()`：

- 标题：`删除任务？`
- 描述：`任务「${task.title}」将被永久删除，且不可恢复。`
- 确认按钮：`删除任务`
- 确认颜色：`error`

用户确认后，`TaskDetailModal.vue` emit `delete` 并传出当前 `TaskItem`；用户取消时不 emit。

### 4. 页面层负责删除后的 modal 状态收敛

`src/renderer/src/pages/task.vue` 应继续复用现有 `handleDeleteTask(task: TaskItem)` 调用 `taskStore.deleteTask(task.id)`。删除入口迁移到 modal 后，该函数需要在删除成功后关闭详情 modal、调用 `taskStore.resetDetailState()` 并清空 `activeDetailTask`，避免 modal 继续引用已删除任务。

如果删除失败，沿用 `taskStore.error` 作为错误状态，modal 保持打开，便于用户重试或取消。

## Risks / Trade-offs

- 关闭任务后卡片会从默认“打开”列表消失，用户可能误以为任务被删除 -> 通过确认描述明确说明任务会移到“关闭”列表，且可在关闭 tab 中重新打开。
- 删除入口更深一层，会增加删除路径步骤 -> 这是有意取舍，永久删除应比可逆关闭更不容易误触。
- `ConfirmDialog.vue` 对非 error 颜色当前使用 warning 图标色调 -> 本变更仍选择 `neutral` 确认颜色，因为关闭是可逆操作；如未来要区分图标语义，应单独调整共享确认弹窗。
- Modal footer 布局改为左右分组后可能影响 Nuxt UI 默认 footer 排布 -> 实现应使用稳定的 `flex w-full items-center justify-between gap-3`，并在 renderer 组件测试中验证按钮仍可点击。
