## Why

session 列表当前只能通过小图标看出会话已关联任务，但 hover 后没有展示任务上下文，用户仍然无法在列表中确认关联的是哪个来源任务。lineage 已经提供 `originTaskRef` 和 `lineage:getByTask`，可以在用户需要时按需展示任务来源和标题。

## What Changes

- 在 chat session 列表项中，当 `session.originTaskRef` 非空时展示一个常驻的小任务图标，表示该会话已关联任务。
- 图标使用统一任务语义图标，不按任务平台切换图标，避免 source 扩展时产生不一致的视觉规则。
- 鼠标 hover 任务图标时展示 popover，popover 内容包含任务来源 source 和任务标题 title。
- 任务来源从 `originTaskRef` 的 source 段本地解析；任务标题通过现有 `lineage:getByTask` 读取 lineage task snapshot。
- 不新增 IPC、不扩展 `chat:listSessions` 返回结构、不在列表打开时批量预取 lineage task snapshot。
- 未关联任务的会话保持现有列表项布局与文案。

## Capabilities

### New Capabilities

- `chat-session-task-indicator`: 定义 chat session 列表项如何标识已关联任务的会话，以及 hover popover 如何展示任务来源和标题。

### Modified Capabilities

- 无。

## Impact

- 影响 `src/renderer/src/components/chat/SessionItem.vue` 的列表项展示。
- 复用已有 `Session.originTaskRef`、`lineage:getByTask` 和 session store 的关联任务信息缓存，不涉及主进程、preload、IPC schema 或持久化结构。
- 需要更新 `test/renderer/src/components/session-item.spec.ts`，并按需补充 `test/renderer/src/stores/session.spec.ts` 对懒加载入口的覆盖。
