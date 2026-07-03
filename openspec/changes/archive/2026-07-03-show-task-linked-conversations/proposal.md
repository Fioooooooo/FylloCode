## Why

任务与会话已经通过 lineage 建立关联，会话列表也能展示当前会话的来源任务，但任务看板缺少反向视图。用户在任务页无法判断某个任务是否已有相关讨论，也无法从任务直接回到关联会话，导致任务到对话的追踪链路不完整。

## What Changes

- 在任务看板的任务卡上展示该任务已关联的会话入口。
- 当任务存在关联会话时，用户可以从任务卡查看关联会话列表，并打开指定会话。
- 打开关联会话时保持当前 `/chat` 单页路由模型：先进入 `/chat`，再通过 session store 选中目标会话。
- 新增一个集中式打开聊天会话的前端 helper/composable，隔离当前 store 选中逻辑，并为未来迁移到 `/chat/:sessionId` 子路由保留单一调整点。
- 关联会话信息加载失败时不阻塞任务列表；任务卡仍可查看详情、发起讨论和执行原有操作。
- 不新增 lineage 存储字段，不修改 lineage 文件格式，不新增主进程 IPC；复用现有 `lineageApi.getByTask(projectId, ref)` 返回的 `TaskDownstreamProjection.links`。

## Capabilities

### New Capabilities

- `task-linked-conversations`: 定义任务看板中展示任务关联会话、并从任务打开关联会话的用户可见行为。

### Modified Capabilities

- None.

## Impact

- 影响前端页面与组件：
  - `src/renderer/src/pages/task.vue`
  - `src/renderer/src/components/task/TaskCard.vue`
  - `src/renderer/src/components/chat/SessionItem.vue`
  - 新增或复用 `src/renderer/src/composables/useOpenChatSession.ts`
- 影响前端 API 使用：复用 `src/renderer/src/api/lineage.ts` 的 `lineageApi.getByTask()`。
- 影响测试：
  - `test/renderer/src/pages/task.spec.ts`
  - `test/renderer/src/components/task-card.spec.ts`
  - `test/renderer/src/components/session-item.spec.ts`
  - 新增 `test/renderer/src/composables/use-open-chat-session.spec.ts` 或等价覆盖。
- 不影响 Electron 主进程、preload IPC、shared lineage 类型、lineage 存储格式或任务聚合服务。
