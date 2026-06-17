## Why

当前通过 `<fyllo-action type="task.create">` 在对话过程中创建的任务虽然会被持久化到任务存储和 lineage subject，但会话 meta 中只保留了 `originTaskRef`（会话发起时讨论的上游来源任务）。这导致：

1. 会话 meta 中没有记录会话过程中创建的下游任务，数据关联不完整；
2. `OriginTaskBanner` 只能展示上游来源任务，无法回显会话中创建的任务。

需要让 `fyllo-action task.create` 创建的任务也能绑定到当前会话，并在 `OriginTaskBanner` 中展示。

## What Changes

- **变更 `originTaskRef` 语义**：从「会话发起时讨论的上游来源任务」扩展为「当前会话绑定的任务」。
- **解除 `originTaskRef` 的 write-once 约束**：允许在会话运行期间被更新，但仅限两个受控写入入口：
  1. `chat-service.createSession`（初始化写入，来自上游 `taskRef`）。
  2. `lineage-service.createSessionTask`（更新写入，来自 `fyllo-action task.create` 成功后）。
- **新增受控写入函数**：在 `session-store.ts` 中新增 `updateSessionOriginTaskRef`，通用 `SessionMetaPatch` 继续禁止传入 `originTaskRef`。
- **修改 `createSessionTask` 流程**：任务创建成功后，把新任务的 `LineageTaskRef` 写回对应 session meta 的 `originTaskRef`。
- **更新 `OriginTaskBanner` 展示语义**：banner 展示当前 `originTaskRef` 指向的任务，无论该任务是上游来源还是本会话中创建。
- **保持一一绑定关系**：一个 session 同时只绑定一个 task；新的 `task.create` 会覆盖旧的 `originTaskRef`。

## Capabilities

### New Capabilities

（无新增能力）

### Modified Capabilities

- `session-meta-storage`：修改 `originTaskRef` 的语义和写入约束，新增受控写入函数 `updateSessionOriginTaskRef`。
- `chat-origin-task-banner`：更新 banner 展示语义，支持展示会话过程中通过 `fyllo-action` 创建的任务。
- `fyllo-action-tags`：更新 `task.create` 行为描述，明确要求成功后在 session meta 中更新 `originTaskRef`。

## Impact

- `src/main/infra/storage/session-store.ts`：`SessionMetaPatch` 类型、`updateSessionOriginTaskRef` 函数。
- `src/main/services/chat/chat-service.ts`：`createSession` 保持初始化写入逻辑不变。
- `src/main/services/lineage/lineage-service.ts`：`createSessionTask` 成功后调用 `updateSessionOriginTaskRef`。
- `src/main/services/task/task-service.ts`：可能需要在 `createTask` 中返回足够信息以构造 `LineageTaskRef`（已返回 `TaskItem`，可直接构造）。
- `src/renderer/src/stores/session.ts`：更新 `activeSession.originTaskRef` 和 `taskInfoBySessionId` 缓存，使 banner 能立即回显新任务。
- `src/renderer/src/composables/useFylloActionDispatcher.ts`：`task.create` 成功后可能需要触发 session 刷新或返回 task ref。
- `src/renderer/src/components/chat/OriginTaskBanner.vue`：展示逻辑基本不变，数据源仍为 `originTaskRef`。
