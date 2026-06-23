## Context

`chat:listSessions` 已经通过 `Session.originTaskRef` 把会话关联任务状态返回给 renderer。`OriginTaskBanner` 进入会话详情后会通过 `sessionStore.taskInfoBySessionId` 展示来源和标题，但 session 列表项 `SessionItem.vue` 目前只展示标题、更新时间、turn 数、agent 图标和一个任务标识。

正确交互是：列表项常驻显示任务图标；用户 hover 该图标时，按需展示来源和任务标题。临时 UI 中的固定文案 `已关联任务` 不应作为最终行为。

## Goals / Non-Goals

**Goals:**

- 让用户在 session 列表中直接看出某个会话已经关联任务。
- hover 任务图标时展示 popover，内容包含 source 和 title。
- 来源从 `originTaskRef` 的 `<source>:<id>` source 段本地解析。
- 标题来自 lineage task snapshot，不读取实时 `taskApi.getTask`。
- 不新增 IPC，不扩展 `chat:listSessions` DTO。
- 不在 session 列表加载时批量预取任务标题，只在用户 hover 图标时懒加载。

**Non-Goals:**

- 不在 session item 常驻区域直接展示任务标题。
- 不展示任务描述。
- 不改变 `OriginTaskBanner` 的顶部展示逻辑。
- 不改变 `Session.originTaskRef` 的写入、更新或持久化规则。

## Decisions

- **使用 `Session.originTaskRef` 作为图标显示条件。** 该字段已经由 `chat:listSessions` 返回，满足列表即时渲染需求。
- **统一使用 `i-lucide-clipboard-check` 图标。** 该图标表达“任务/检查项”语义，比 `i-lucide-link` 更像任务；相比按 source 显示平台图标，它不依赖每个任务来源都有合适 icon。
- **使用 `UPopover` 而不是固定 `UTooltip` 文案。** popover 能承载结构化的 `source + title` 两行内容，也能自然表达 loading/fallback 状态。
- **复用现有 lineage IPC。** `lineage:getByTask` 已能返回 task snapshot，满足读取标题需求；不得新增 IPC 或扩展 `chat:listSessions`。
- **按 hover 懒加载任务信息。** `SessionItem.vue` 在图标 hover/open 时触发 store 方法，store 负责调用 `lineageApi.getByTask` 并写入缓存，避免组件直接 import API。
- **优先复用 `taskInfoBySessionId`。** 现有缓存已经存储 sessionId -> `{ source, title, ref }`，可作为 popover 数据源。若方法当前只在 `selectSession` 内部使用，应暴露一个明确的 `ensureSessionOriginTaskInfo(session)` 或同等命名方法给 `SessionItem.vue` 调用。

## Risks / Trade-offs

- hover 首次打开时可能短暂显示加载态。通过 popover 中展示 `正在加载任务…` 降低空白感。
- `lineage:getByTask` 可能返回 null 或失败。降级为展示 source 和原始 `originTaskRef`，不阻断列表交互。
- 暴露 store 懒加载方法会增加 session store API 面。该方法仍然保持 renderer 分层：组件调用 store，store 调 API。

## Migration Plan

不需要数据迁移、IPC 迁移或兼容处理。实现完成后，已有 `originTaskRef` 的历史会话会自动显示任务图标，并在 hover 时按需读取 task snapshot 标题。
