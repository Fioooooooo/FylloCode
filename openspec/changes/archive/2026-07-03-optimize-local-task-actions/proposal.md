## Why

本地任务看板默认停留在“打开”列表，但任务卡片当前直接暴露永久删除入口，容易把日常任务收尾操作和不可恢复删除混在一起。将卡片上的快捷操作改为关闭任务，并把删除放入编辑弹窗，可以降低误删风险，同时让“打开 / 关闭”任务流更清晰。

## What Changes

- 打开状态的本地任务卡片不再展示删除按钮，改为在卡片操作区展示一个 icon-only 的关闭按钮。
- 点击关闭按钮后复用现有确认弹窗，用户确认后把该本地任务状态更新为 `closed`；取消确认时不改变任务。
- 已关闭的本地任务卡片不展示关闭或删除 icon button。
- 本地任务删除入口迁移到任务详情的编辑 modal 内部：进入编辑态后，在 footer 左侧展示 `删除任务` danger 按钮，右侧继续展示 `取消` / `保存`。
- 删除本地任务前继续二次确认；确认后永久删除，取消时不删除。
- 不新增任务 IPC、shared type、存储字段或主进程服务；复用现有 `taskApi.updateTask()` / `taskApi.deleteTask()` 和 renderer `useConfirmDialog()`。

## Capabilities

### New Capabilities

- `local-task-actions`: 定义本地任务在任务卡片和任务详情编辑 modal 中的关闭、编辑与删除操作行为。

### Modified Capabilities

- None.

## Impact

- 影响 renderer 页面与组件：
  - `src/renderer/src/components/task/TaskCard.vue`
  - `src/renderer/src/components/task/TaskDetailModal.vue`
  - `src/renderer/src/pages/task.vue`
- 影响 renderer 测试：
  - `test/renderer/src/components/task-card.spec.ts`
  - `test/renderer/src/components/task-detail-modal.spec.ts`
  - `test/renderer/src/pages/task.spec.ts`
- 不影响 Electron 主进程、preload IPC、`src/shared/types/task.ts`、任务存储格式或任务聚合服务。
