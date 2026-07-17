## Context

会话数据以每个项目的 session meta JSON 文件持久化。`listSessions()` 将 meta 转为 `Session` 后按 `updatedAt` 倒序返回；renderer 的 `useSessionStore()` 保持这个数组，`ChatSidebar.vue` 直接逐项渲染。会话标题与 Agent 已通过 `session:chat:updateSession` 及 `SessionMetaPatch` 修改。

置顶是项目内会话的 durable 状态，必须经过既有 main/preload/renderer session 契约保存。它只服务一个聊天侧栏与现有 session store，不具备独立 feature 的准入条件，因此不创建 renderer feature 或第二套状态容器。

当前每个项目最多保留一个可用项目窗口：`ProjectWindowManager.openProjectWindow()` 对同一 `projectId` 复用并聚焦既有窗口。因此本次不新增跨同项目窗口的实时广播；重新加载会话列表时从持久化状态恢复即可。

## Goals / Non-Goals

**Goals:**

- 让用户从既有会话菜单置顶或取消置顶一个会话，并在重启或重新加载后保留结果。
- 在 sidebar 中明确分组置顶会话和普通会话，保证置顶内容最多占会话列表可用高度的一半。
- 保持普通会话创建、会话选择、消息加载、任务关联、attention badge 与 running 指示器的现有行为。
- 让旧 session meta 文件无需迁移即可被安全读取。

**Non-Goals:**

- 不支持拖拽排序、手动设置置顶会话的相对顺序、批量置顶或跨项目置顶。
- 不将草稿态持久化；点击“新建会话”仍只进入草稿态，首次发送后创建的会话默认不置顶。
- 不新增多窗口状态同步、全局置顶列表、筛选或搜索功能。
- 不改变现有 session 的创建时间、最近活动时间或消息 JSONL 格式。

## Decisions

### 1. 用 `isPinned` 作为 session meta 的向后兼容字段

在 `SessionMeta` 中增加可选的 `isPinned?: boolean`，以便读取历史 JSON 时缺失字段仍合法；在共享的 renderer 可见 `Session` 中使用必有的 `isPinned: boolean`。`toSession()` 和 renderer 的 `normalizeSession()` 均将只有严格 `true` 的值视为置顶，其他值统一归为 `false`。

写入置顶状态时，在现有 `patchSessionMeta()` 的单文件写入锁内保存布尔值。选择它而非 renderer localStorage 的原因是 session meta 已是项目级会话元数据的唯一 durable source，能够在重启与重新加载后恢复，也不会让多个 renderer 状态源分叉。

### 2. 复用 `updateSession`，但让仅置顶 patch 保持 `updatedAt`

扩展现有 `SessionPatch`、`updateSessionInputSchema`、preload API、renderer `chatApi.updateSession()` 和 service patch，增加可选 `isPinned`。不新增 IPC channel。

`updateSession()` 必须只在 patch 包含 `title` 或 `agentId` 时维持现有更新时间写入语义；patch 仅包含 `isPinned` 时不得写入 `updatedAt`。这样置顶行为不会错误改变两个分组内的“最近活动”排序。服务返回完整 `Session`，renderer 只在成功响应后合并它。

### 3. session store 是置顶写入 owner，sidebar 只派生分组

`useSessionStore()` 新增 `setSessionPinned(sessionId, isPinned)`：使用当前项目的 `chatApi.updateSession()`，成功后复用 `mergeSessionMeta()` 更新本地会话，失败时不修改 `sessions` 并通过现有 toast 提示具体失败动作后再抛出错误。`mergeSessionMeta()` 与 `normalizeSession()` 必须复制/规范化 `isPinned`。

`ChatSidebar.vue` 从同一个 `sessions` 数组计算 `pinnedSessions` 与 `recentSessions`。每组按既有 `updatedAt` 降序派生，且每个会话恰好属于一个组；不在组件或 store 中维护第二份排序数组。现有全局 `sortSessions()` 可以保留，置顶切换不需要因排序更新而调用它。

### 4. 以受限的 nested scroll groups 实现 50% 容量保护

“会话列表可用高度”定义为 ChatSidebar 中顶部“新建会话”区域下方的 `flex-1 min-h-0` 容器。若至少有一个置顶会话，整个置顶分组（分组标题与其可滚动条目区域）使用该容器的 `max-height: 50%`；置顶条目区域在溢出时独立纵向滚动。最近会话组占用剩余空间并独立纵向滚动。

当没有置顶会话时，保持当前无分组标题的完整普通列表，避免为默认状态增加噪声。当同时存在置顶和普通会话时，展示“置顶会话”与“最近会话”标题；若普通组为空，保留下半部可用空间但不显示伪空状态。首次发送产生的新会话默认进入最近组并位于该组顶部，因此不会被置顶内容遮挡。

分组标题提供文本，不以颜色作为唯一识别；置顶状态只由“置顶会话”分组标题表达，`SessionItem.vue` 不重复显示条目级图钉。菜单使用“置顶会话”或“取消置顶”文字和相应图标，菜单事件继续阻止条目点击，以免切换置顶时选中其他会话。

### 5. 复用现有会话条目，不新增 props 或破坏 attention 约束

`SessionItem` 继续只接收 `session` prop，并从 `session.isPinned` 渲染置顶或取消置顶菜单动作。这样保留 `session-attention` spec 对 `SessionItem` props 与 ChatSidebar 调用形状的约束，attention badge 和 running pulse 的定位、行为均不变。

## Risks / Trade-offs

- [置顶区内容过多] → 将组标题和条目一起限制为可用列表高度的 50%，只在置顶条目内部滚动，普通组始终可获得剩余空间。
- [历史或损坏 meta 的置顶字段不是布尔值] → 读取时仅接受 `true`，任何其他值回退为未置顶；不因该字段阻止整个 session 列表加载。
- [置顶请求失败导致前后端不一致] → 不做乐观分组移动，收到成功 `Session` 后才合并本地状态；失败保留原分组并显示具体 toast。
- [置顶操作污染“最近活动”排序] → service 对仅 `isPinned` 的 patch 不写 `updatedAt`，并测试返回时间和两组排序。
- [nested scroll 在窄窗口难以察觉] → 两组使用 `min-h-0`、清晰文本标题和独立 `overflow-y-auto`；renderer 视觉检查覆盖窄窗口与置顶溢出。

## Migration Plan

1. 发布读取兼容逻辑：缺失 `isPinned` 的现有 JSON 在返回 renderer 时表现为 `false`，无需批量迁移。
2. 后续用户首次置顶/取消置顶时，已有原子 meta 写入路径将该字段写入对应 session 文件。
3. 若需回滚 UI 或调用端，保留的 JSON `isPinned` 字段会被旧版本忽略；旧版本仍可读取其已知字段，不影响消息 JSONL。

## Open Questions

无。置顶排序、范围、容量边界和失败行为均已在本提案中确定。
