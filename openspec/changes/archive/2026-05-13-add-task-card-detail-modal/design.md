## Context

当前 `frontend/src/components/task/TaskCard.vue` 用 `line-clamp-2` 截断描述，任务详情无法在当前页面完整查看。`frontend/src/stores/task.ts` 的 `updateTask(taskId, updates)` 已经实现并通过 IPC 调通主进程，但前端没有任何 UI 入口调用这个方法。创建弹窗 `CreateTaskModal.vue` 已经是基于 `@nuxt/ui` `UModal` 的标准表单形态，外部任务（`yunxiao`、`github`）目前通过 `task.vue` 中的 `mockYunxiaoTasks` / `mockGithubTasks` 以只读方式展示。本次需要在**不改动数据层、不扩展 IPC、不改动 spec 之外的任务字段**的前提下，为 TaskCard 补齐「查看完整详情 + 编辑本地任务」能力。

## Goals / Non-Goals

**Goals:**

- 用户可以在任何渠道（本地 / 云效 / GitHub）点击 TaskCard 主体区域，打开详情弹窗查看完整描述（保留换行）、标题、元数据（来源、时间、标签）。
- 本地任务可以在详情弹窗内切换到编辑模式，修改 `title` 和 `description` 并保存。
- 外部任务在详情弹窗内保持只读形态，不暴露「编辑」入口。
- 保持 TaskCard 底部操作区按钮（发起讨论 / 任务来源 / 关联 Proposal / 删除）既有行为不变，不与新点击交互冲突。

**Non-Goals:**

- 不修改 `status`、`labels`、`assignee`、`proposalId` 等字段，这些留给未来独立 change。
- 不实现未保存改动的二次确认；取消或关闭弹窗直接丢弃编辑中的本地表单状态。
- 不在详情弹窗内重复业务操作按钮（发起讨论、任务来源、关联 Proposal、删除）。
- 不新增或修改 IPC 接口和主进程代码；复用 `taskStore.updateTask`。
- 不改动外部任务（mock）的数据形态或数据来源。

## Decisions

### Decision 1: 卡片点击分区以现有分割线为边界

TaskCard 模板中，描述区与底部操作区之间已经存在 `border-t border-default pt-3` 分割线。**分割线以上** 的内容（标题行、描述段落、标签行）统一包裹在一个带 `@click` 的容器内触发详情弹窗；**分割线以下** 的底部操作区保持现状不挂 `@click`，其内部按钮原封不动地触发既有业务。

**Alternative considered**：让整张卡片都可点击，再给底部每个按钮加 `@click.stop`。放弃原因：按钮数量会随未来扩展（发起讨论、任务来源、关联 Proposal、删除）持续增加，每次新增按钮都要记得加 `.stop`，容易漏。按「点击分区」做，新增底部按钮不需要任何额外防护。

### Decision 2: 查看模式 vs 编辑模式单一弹窗 + 模式切换

新建 `TaskDetailModal.vue`，内部用一个局部 `mode: "view" | "edit"` 状态在两种形态间切换，而不是拆成两个独立组件。查看模式以**格式化的只读视图**渲染（标题大字号、描述用 `whitespace-pre-wrap` 正常段落），编辑模式复用 `CreateTaskModal` 的表单形态（`UInput` 标题 + `UTextarea` 描述，`rows=4`）。

**Alternative considered**：「默认直接编辑态」或「拆两个 Modal 组件」。放弃原因：用户主要诉求是查看完整描述，直接进入输入框形态会破坏长文本阅读体验；而拆两个组件会造成 props/emit 重复定义，两套开关状态更易出错。

### Decision 3: 外部任务弹窗的只读策略

外部任务（`task.source !== "local"`）在详情弹窗中：

- 永远停留在查看模式，不渲染「编辑」按钮。
- 弹窗底部仅展示「关闭」按钮。
- 所有字段的渲染规则与本地任务查看模式保持一致（相同的排版、相同的空描述占位）。

**Alternative considered**：「为外部任务编辑本地镜像（如 labels、proposalId）」。本次明确不做，理由是 proposal 已圈定范围为 `title` + `description`，外部任务的 `title` / `description` 回写无 IPC 通路，此时给外部任务加入编辑按钮会让用户误以为可以修改源系统内容。

### Decision 4: 编辑模式表单状态在「打开编辑」时一次性初始化

- 打开弹窗时 `mode = "view"`，不初始化表单状态。
- 点击「编辑」时将当前 task 的 `title`、`description` 一次性 copy 到本地 `ref` 表单状态，并切换 `mode = "edit"`。
- 点击「取消」或关闭弹窗：直接清空本地表单状态并回到查看模式（或关闭弹窗），**不做二次确认**。
- 点击「保存」：调用 `taskStore.updateTask(task.id, { title, description })`，成功后将 `mode` 切回 `"view"`，弹窗继续停留、展示新值；失败不切换，错误沿用 store 中的错误状态，由弹窗内就近的表单错误渲染提示用户。

**Alternative considered**：「弹窗打开即 copy 一份表单 draft，查看模式用 draft 的只读渲染」。放弃原因：查看模式和编辑模式的数据语义不一样（查看展示持久化后的 `task`，编辑展示用户修改中的草稿），混用一份 state 会在刷新时序上踩坑。

### Decision 5: TaskCard 不直接持有详情弹窗

详情弹窗由 `frontend/src/pages/task.vue` 持有（类似 `CreateTaskModal`），通过 `v-model:open` 和 `:task` 两个 prop 驱动；TaskCard 只负责 `emit("view-detail", task)`。

**Alternative considered**：「把详情弹窗直接放在 TaskCard 内部」。放弃原因：一张卡片一个 Modal 实例会导致列表中同时存在多个 Modal DOM 节点，`UModal` 的 teleport 渲染成本叠加；且页面还要考虑「点击 A 卡片打开详情后点 B 卡片应切换」的场景，由页面持有单一弹窗更自然。

## Risks / Trade-offs

- **分割线结构未来被改动** → 点击分区失效。Mitigation：在 TaskCard 内把「上半区」抽成一个明确命名的元素（如 `<div class="task-card__viewable-area">`），后续重构时能被搜索到；测试用例覆盖「点击标题触发事件、点击底部按钮不触发事件」两条路径。
- **UModal 关闭时动画 + 外部任务切换 `task` prop** → 弹窗在消失前短暂显示下一条任务内容。Mitigation：页面端在关闭弹窗（`open = false`）时保留当前 `task` 引用，直到 Modal 动画结束再清空；或者直接让弹窗内部用 `computed(() => props.task)` 渲染，外部 `open` 触发后由 Modal 自身负责 unmount 节奏，避免父级手动清空。
- **保存失败后弹窗状态** → 用户修改内容丢失风险。Mitigation：保存失败不切换回查看模式、不清空表单、直接在表单下方显示错误文案（复用 `UFormField` 的 `:error`），用户可以继续编辑重试。
- **与现有测试的兼容** → TaskCard 行为扩展会触及既有单元测试。Mitigation：更新对应测试，并补充新增用例（点击视图区域触发 `view-detail`、点击底部按钮不冒泡）。
