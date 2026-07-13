# Task Board

状态：未来重组方向，仅作边界留存；当前生产代码尚未迁入本目录。

## 目标

将任务来源/状态筛选、详情编辑、linked conversation 查询以及从任务发起 Chat 的页面用例收敛到 Task Board，减少 route SFC 中的业务流程和竞态状态。

## 当前来源

- `src/renderer/src/pages/task.vue`
- `src/renderer/src/components/task/**`
- `src/renderer/src/utils/task.ts`
- Task 页面使用的 `useOpenChatSession` 编排

## 预期边界

- `model`：task 展示 selector、source/status filter、linked-session projection。
- `application`：board 加载、详情 lifecycle、linked conversation batch 和 start-discussion 用例。
- `ui`：TaskCard、CreateTaskModal、TaskDetailModal 和 board content。
- `integration`：route 与 Chat session opening 的桥接。
- `pages/task.vue` 最终只保留页面布局和 feature 挂载。

## 保持在 feature 外

- `src/renderer/src/api/automation/task.ts`
- `src/renderer/src/stores/automation/task.ts`
- task/lineage shared contracts
- Fyllo Action 的 `task.create` handler

迁移必须保持 task source、状态过滤、linked conversation 和发起讨论的现有行为不变。
