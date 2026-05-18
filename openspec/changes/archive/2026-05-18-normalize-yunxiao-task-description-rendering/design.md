## Context

当前实现中，`TaskItem.description` 是裸字符串。这个约定已经不足以表达真实数据语义：

- 本地任务描述来自 `UTextarea`，语义是纯文本。
- 云效详情可能返回 Markdown，也可能返回 RichText 的 JSON 字符串。
- 当前 `electron/main/services/task/adapters/yunxiao-task-adapter.ts` 会在 `RICHTEXT` 情况下尝试 `JSON.parse`，但仍然把 `htmlValue` 当普通字符串写回 `TaskItem.description`。
- 当前 `frontend/src/components/task/TaskDetailModal.vue` 把 `task.description` 直接以 `content-type="html"` 喂给 `UEditor`，这既不能表达 Markdown，也不能表达纯文本。
- 当前 `frontend/src/components/task/TaskCard.vue` 与 `frontend/src/pages/task.vue` 默认把 `task.description` 当普通文案拼接，导致 HTML 泄漏到列表摘要和聊天 prompt 的风险。

这次 change 的目标不是重做本地任务编辑体验，而是明确描述内容的数据契约和展示语义，让一个不了解当前会话的新 Agent 也能按 spec 准确实现。

## Goals / Non-Goals

**Goals:**

- 为所有任务来源定义统一的 `TaskDescription` 结构：`{ format, content }`。
- 让主进程在云效适配阶段完成 `formatType` -> `TaskDescription` 的映射，renderer 不再猜测云效原始 payload 语义。
- 让任务详情弹窗依据 `description.format` 执行稳定、显式的只读渲染。
- 让任务卡片摘要和“发起讨论”prompt 使用纯文本提取逻辑，而不是拼接原始内容。
- 为后续其他第三方任务来源保留扩展点，避免继续追加 `descriptionFormat` 或 source-specific 特判字段。

**Non-Goals:**

- 不修改本地任务编辑 UI 形态；`CreateTaskModal.vue` 和 `TaskDetailModal.vue` 的编辑态仍使用 `UTextarea`。
- 不引入新的富文本编辑器能力，也不把本地任务编辑升级为 Markdown 编辑器。
- 不为旧本地任务文件或旧 IPC payload 提供兼容迁移。
- 不在本次 change 中新增 GitHub 任务真实接入或其他 provider 的任务描述格式支持。

## Decisions

### 1. 使用结构化 `TaskDescription` 作为唯一 canonical 描述模型

在 `shared/types/task.ts` 中新增：

```ts
export type TaskDescriptionFormat = "plain_text" | "markdown" | "html";

export interface TaskDescription {
  format: TaskDescriptionFormat;
  content: string;
}
```

并将下列类型全部切换为该结构：

- `TaskItem.description`
- `CreateLocalTaskInput.description`
- `UpdateTaskInput.description`

原因：

- 让“内容”和“展示语义”同属于一个字段，避免后续再额外增加 `descriptionFormat` 一类补丁字段。
- 让 main/preload/api/store/component 流程共享单一模型，减少“某些环节是 string、某些环节是 object”的歧义。
- 即使本地任务编辑 UI 仍用 textarea，本地提交逻辑也只需在提交点把字符串包装成 `{ format: "plain_text", content }`。

被放弃的替代方案：

- `description: string + descriptionFormat: ...`
  - 改动面更小，但语义被拆散，不如对象化清晰。
- 仅修改 `TaskItem.description`，不修改 `CreateLocalTaskInput` / `UpdateTaskInput`
  - 会让输入输出契约不一致，增加实现者理解成本。

### 2. 在云效主进程适配层完成格式识别与 RichText 提取

在 `electron/main/services/task/adapters/yunxiao-task-adapter.ts` 中新增一个明确的描述映射函数，例如：

- `mapYunxiaoDescription(workitem: Workitem): TaskDescription`

映射规则固定为：

- `formatType === "MARKDOWN"`：
  - 返回 `{ format: "markdown", content: workitem.description ?? "" }`
- `formatType === "RICHTEXT"`：
  - 尝试把 `workitem.description` 当 JSON 字符串解析
  - 当解析结果中 `htmlValue` 为字符串时，返回 `{ format: "html", content: htmlValue }`
  - 当 JSON 解析失败，或 `htmlValue` 缺失/非字符串时，返回 `{ format: "plain_text", content: workitem.description ?? "" }`
- 其他情况：
  - 返回 `{ format: "plain_text", content: workitem.description ?? "" }`

原因：

- renderer 不应该知道云效 `formatType` 和 RichText payload 细节。
- RichText 的 `htmlValue` 不能稳定转成 Markdown，因此 canonical 形式应保留为 HTML。
- 解析失败时回退到 `plain_text`，优先保证数据可展示而不是抛错中断整个任务详情。

### 3. 详情展示统一走 `UEditor` 只读渲染，`plain_text` 映射到 markdown

在 `frontend/src/components/task/TaskDetailModal.vue` 中，查看态不再直接把 `task.description` 当字符串使用，而是：

- 读取 `task.description.content`
- 根据 `task.description.format` 计算 `UEditor` 的 `content-type`

映射规则固定为：

- `html` -> `html`
- `markdown` -> `markdown`
- `plain_text` -> `markdown`

选择把 `plain_text` 映射到 `markdown` 的原因：

- 用户已经确认这种展示兼容是可接受的。
- 可以复用同一条只读渲染路径，避免详情查看态再保留单独的 `<p>` 分支。

编辑态保持不变：

- `TaskDetailModal.vue` 的 `description` 本地状态继续是 `string`
- `startEditing()` 从 `props.task.description.content` 取值
- `submit()` 时包装为 `{ format: "plain_text", content: description.value.trim() }`

### 4. 非详情场景统一提取纯文本，不得原样拼接结构化 description

在 `frontend/src/utils/task.ts` 中新增两个纯函数，命名可按实现调整，但职责必须清晰：

- `getTaskDescriptionPlainText(description: TaskDescription): string`
- `getTaskDescriptionSummary(task: TaskItem): string`

固定规则：

- `plain_text`：直接返回 `content`
- `markdown`：去掉 Markdown 标记，返回可读纯文本
- `html`：去掉 HTML 标签，返回可读纯文本

明确使用点：

- `frontend/src/components/task/TaskCard.vue`
  - 任务卡片两行摘要只显示 `getTaskDescriptionSummary(task)`
- `frontend/src/pages/task.vue`
  - `buildTaskPrompt(task)` 组装 prompt 时使用提取后的纯文本
  - SHALL NOT 把 `description.content` 原样拼进 prompt，避免 HTML 或 Markdown 标记污染 chat 上下文

### 5. 不做旧数据兼容，不做迁移脚本

本次 change 明确不兼容旧 `description: string` 数据。

含义：

- `electron/main/infra/storage/task-store.ts` 的读写逻辑直接按新结构实现。
- 不新增旧格式兼容分支。
- 不编写一次性迁移脚本。

原因：

- 项目尚未正式上线，不需要承担遗留数据兼容成本。
- 让实现逻辑保持单一模型，避免任务 artifacts 中出现“新旧双轨共存”的歧义。

## Risks / Trade-offs

- `[Risk] plain_text 映射到 markdown 可能让极少数纯文本中的 markdown 特殊符号被解释`
  - Mitigation: 本次按用户确认执行；后续若出现真实误渲染，再单独引入 `plain_text` 专用只读渲染分支。
- `[Risk] html 内容来自第三方系统，若改成 ad-hoc 渲染会有更高风险`
  - Mitigation: 本次仅允许通过现有 `UEditor` 的只读 HTML 路径渲染，明确禁止额外引入 `v-html` 直出。
- `[Risk] 修改 Create/Update 输入契约后，前后端类型与测试会同时破裂`
  - Mitigation: 先从 `shared/types/task.ts` 和 `shared/schemas/ipc/task.ts` 开始改，再按 main/preload/api/store/component 顺序推进，最后统一修测试。
- `[Risk] 云效 RICHTEXT payload 格式异常时详情展示退化`
  - Mitigation: 明确 fallback 为 `plain_text`，保证不会因为单条描述解析失败而导致整条任务不可用。
