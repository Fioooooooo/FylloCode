## 1. TaskCard 点击分区改造

- [x] 1.1 在 `frontend/src/components/task/TaskCard.vue` 中，将「标题行 + 描述段落 + 标签行」包裹进一个具有明确命名的容器（例如 `data-role="detail-trigger"` 或语义化 class），并在该容器上挂 `@click` 事件，触发新的 `view-detail` emit
- [x] 1.2 在 TaskCard 组件的 `defineEmits` 中新增 `"view-detail": [task: TaskItem]`
- [x] 1.3 验证底部操作区（分割线 `border-t` 以下的容器）保持不挂 `@click`，其内部按钮的点击不触发 `view-detail`，必要时通过 `.stop` 或结构隔离防止冒泡到父容器
- [x] 1.4 给可点击的主体区域补充 `cursor-pointer` 等视觉指示（与 @nuxt/ui 现有 hover 风格保持一致）

## 2. TaskDetailModal 组件

- [x] 2.1 在 `frontend/src/components/task/` 新建 `TaskDetailModal.vue`，定义 props（`open: boolean`、`task: TaskItem | null`）和 emits（`update:open`、`save: { taskId: string; updates: UpdateTaskInput }`）
- [x] 2.2 组件内维护 `mode: "view" | "edit"` 局部状态，默认 `"view"`；`task` 为外部任务或 `source !== "local"` 时 `mode` 恒为 `"view"`
- [x] 2.3 实现查看模式视图：大字号标题、来源标识（复用 `task.vue` 中的 `buildSourceDisplay` 或抽取为共享工具）、相对创建时间、标签列表（若有）、完整描述（`whitespace-pre-wrap`）；描述为空时显示「暂无描述」占位
- [x] 2.4 实现编辑模式表单：`UInput` 标题（必填）+ `UTextarea` 描述（`rows=4`），字段形态与 `CreateTaskModal.vue` 保持一致；维护本地 `title`、`description`、`titleError` 三个 ref
- [x] 2.5 实现「编辑」入口：仅当 `task.source === "local"` 时，查看模式底部渲染「编辑」按钮；点击切到编辑模式并将当前 `task.title`、`task.description` 拷贝到本地表单状态
- [x] 2.6 实现「取消」行为：编辑模式点击取消，直接切回查看模式并清空本地表单状态，不做二次确认
- [x] 2.7 实现「保存」行为：标题去空白后为空时「保存」禁用；点击保存时 emit `save` 并传递 `{ taskId, updates: { title, description } }`；成功由父层控制切回查看模式，失败时保持编辑模式与输入内容
- [x] 2.8 实现关闭弹窗行为（遮罩/关闭按钮/键盘 ESC）：直接关闭并丢弃本地表单状态，不做二次确认
- [x] 2.9 弹窗内**不**渲染「发起讨论」「任务来源」「关联 Proposal」「删除」等业务按钮

## 3. task.vue 页面集成

- [x] 3.1 在 `frontend/src/pages/task.vue` 中新增 `const showDetailModal = ref(false)` 和 `const activeDetailTask = ref<TaskItem | null>(null)` 两个状态
- [x] 3.2 新增 `handleViewDetail(task: TaskItem)`：设置 `activeDetailTask` 与 `showDetailModal`；新增 `handleSaveDetail({ taskId, updates })`：调用 `taskStore.updateTask(taskId, updates)`，成功后将 `activeDetailTask` 替换为更新后的任务、保留弹窗打开状态以便弹窗切回查看模式
- [x] 3.3 保存失败时保留 `activeDetailTask`、不关闭弹窗，将错误状态透传给弹窗组件（复用 `taskStore.error` 或通过 prop）
- [x] 3.4 在 `<TaskCard>` 标签上新增 `@view-detail="handleViewDetail"` 监听（本地和外部任务两处渲染都要加）
- [x] 3.5 在模板中挂载 `<TaskDetailModal v-model:open="showDetailModal" :task="activeDetailTask" @save="handleSaveDetail" />`

## 4. 共享工具抽取（可选但推荐）

- [x] 4.1 若 `buildSourceDisplay` 需要在 `TaskDetailModal` 中复用，抽取到 `frontend/src/utils/task.ts`（如不存在则新建），保持单一来源

## 5. 测试

- [x] 5.1 在 `frontend/src/__tests__/components/` 新增 `task-card.spec.ts`（或类似），覆盖：点击主体区域触发 `view-detail`、点击「发起讨论」按钮不触发 `view-detail`、点击「删除」按钮不触发 `view-detail`
- [x] 5.2 在 `frontend/src/__tests__/components/` 新增 `task-detail-modal.spec.ts`，覆盖：本地任务默认以查看模式打开、外部任务无「编辑」按钮、点击「编辑」预填字段、标题为空时禁用「保存」、点击「取消」丢弃编辑、点击「保存」触发 `save` emit 且 payload 正确、描述为空时显示占位文案
- [ ] 5.3 运行 `pnpm test` 确认新用例通过且未破坏已有测试

## 6. 类型与构建校验

- [x] 6.1 运行 `pnpm typecheck` 确认无 TS 错误
- [x] 6.2 运行 `pnpm lint` 确认无 lint 错误
- [ ] 6.3 运行 `pnpm dev` 手动验证：本地任务点击卡片 → 查看详情 → 编辑 → 保存，描述换行正常展示；外部任务点击卡片 → 查看详情且无编辑入口；点击「发起讨论」「删除」等按钮不应打开详情弹窗

## 7. 归档准备

- [x] 7.1 确认 `proposal.md`、`design.md`、`specs/task-panel/spec.md`、`tasks.md` 四份文档一致无矛盾
- [x] 7.2 更新 `.openspec.yaml` 的 `status` 为 `draft`（由 propose 阶段完成）或 `applying`（由 apply 阶段完成）
