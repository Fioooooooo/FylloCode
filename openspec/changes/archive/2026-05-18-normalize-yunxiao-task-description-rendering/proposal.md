## Why

当前任务看板把云效详情中的 Markdown 字符串或 RichText 原始字符串直接塞进 `TaskItem.description`，导致前端在详情弹窗、任务卡片摘要和“发起讨论”prompt 中无法稳定区分内容格式。结果是 RichText 详情会把 HTML 标签或 JSON payload 暴露到 UI，且实现者无法仅从当前类型契约判断“该内容应该如何展示”。

本次 change 需要把“描述内容”从裸字符串升级为显式格式化对象，并把任务详情展示契约写清楚，避免后续实现 Agent 在主进程与渲染进程之间各自猜测格式语义，导致实现继续偏移。

## What Changes

- 将 `TaskItem.description` 从 `string` 改为结构化对象 `{ format, content }`，明确任务描述的 canonical 数据模型。
- 将本地任务的 `CreateLocalTaskInput` / `UpdateTaskInput` 同步切换到结构化 description，对外不再保留字符串描述契约。
- 调整云效任务映射规则：
  - `MARKDOWN` -> `{ format: "markdown", content: 原始 markdown }`
  - `RICHTEXT` -> 解析云效 payload 并提取 `htmlValue`，映射为 `{ format: "html", content: htmlValue }`
  - RICHTEXT 解析失败时退回 `{ format: "plain_text", content: 原始字符串 }`
- 调整任务详情弹窗展示规则：统一使用 `UEditor` 只读渲染任务详情，并按 `description.format` 映射到 `content-type`。
- 调整任务卡片摘要和“发起讨论”prompt 组装逻辑：从结构化 description 中提取纯文本，而不是直接拼接原始 `content`。
- **BREAKING**：不为旧 `description: string` 本地存储或旧 IPC 输入做兼容；FylloCode 未正式上线，本次直接切换到新契约。

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `task-panel`: 任务卡片摘要、详情弹窗和“发起讨论”prompt 需要基于结构化 description 执行不同展示策略。
- `task-local`: 本地任务的数据模型、存储格式和 IPC 输入输出契约需要改为结构化 description。
- `yunxiao-task-read-model`: 云效任务列表与详情读取需在主进程按 `formatType` 映射结构化 description，而非透传原始字符串。

## Impact

- Shared types and IPC schemas:
  - `shared/types/task.ts`
  - `shared/schemas/ipc/task.ts`
- Main process task pipeline:
  - `electron/main/infra/storage/task-store.ts`
  - `electron/main/services/task/task-service.ts`
  - `electron/main/services/task/adapters/yunxiao-task-adapter.ts`
- Frontend task display pipeline:
  - `frontend/src/components/task/TaskDetailModal.vue`
  - `frontend/src/components/task/TaskCard.vue`
  - `frontend/src/components/task/CreateTaskModal.vue`
  - `frontend/src/pages/task.vue`
  - `frontend/src/stores/task.ts`
  - `frontend/src/utils/task.ts`
- Test suites under:
  - `electron/main/__tests__/infra/storage/task-store.spec.ts`
  - `electron/main/__tests__/ipc/task.spec.ts`
  - `electron/main/__tests__/services/task/*.spec.ts`
  - `frontend/src/__tests__/components/task-*.spec.ts`
  - `frontend/src/__tests__/pages/task.spec.ts`
  - `frontend/src/__tests__/stores/task.spec.ts`
