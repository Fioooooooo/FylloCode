## Context

Chat 启动时通过 `useSessionStore().loadSessions()` 一次性加载当前 Workspace 的全部 Session meta，`ChatSidebar.vue` 仅按置顶与更新时间展示这些元数据。正文保存在 `<workspaceDataDir>/sessions/<sessionId>.messages.jsonl`，只有打开会话时才通过 `loadMessages` 读取；因此 Renderer 能低成本过滤标题，却不能在不扩大内存占用与 IPC 数据量的前提下完成正文搜索。

当前生产 Workspace 约有 77 个会话、108MB 消息 JSONL。搜索必须留在 Main 侧按需执行，并避免每次键入触发并行全量扫描。现有 `SessionItem.vue` 包含置顶、改名、删除与 attention 等侧栏职责，不适合作为只读搜索结果行复用；打开结果应继续走 `useOpenChatSession()`，保持路由和临时 Chat 状态清理一致。

## Goals / Non-Goals

**Goals:**

- 在 Chat 侧栏提供容易发现且键盘可访问的历史会话搜索入口。
- 在当前 Workspace 内统一搜索标题、Session ID 与 User/Assistant 可见正文。
- 让正文搜索排除 system reminder、reasoning、Tool 输入输出及其他非 text part，减少内部内容和工具日志噪声。
- 对 100MB 级历史数据保持 Renderer 流畅，拒绝迟到结果覆盖新查询，并避免同一 Modal 发起并行磁盘扫描。
- 复用既有 Session storage、Workspace sender 校验和会话打开流程，不改变任何持久化格式。

**Non-Goals:**

- 不实现模糊搜索、分词、正则、大小写敏感开关或高级筛选。
- 不创建倒排索引、缓存文件、数据库表或搜索历史。
- 不搜索 reasoning、Tool 名称/输入/输出、附件内容、Workspace 文件内容、Task/Proposal/Knowledge 或 Spawned Session。
- 不改变 ChatSidebar 的置顶/最近分组，也不在搜索结果中提供改名、置顶或删除操作。
- 不新增全局快捷键或跨 Workspace 搜索。

## Decisions

### 1. 新增 Main 侧 Workspace-scoped 搜索 API

在现有 `session:chat` area 增加 `searchSessions`：

- `src/shared/ipc/session/chat.channels.ts` 新增 `session:chat:searchSessions`。
- `src/shared/ipc/session/chat.schemas.ts` 新增严格输入 schema：`workspaceId` 与 trim 后 1–200 字符的 `query`。
- `src/main/ipc/session/chat.ts` 使用 `requireWorkspaceSender()` 验证窗口归属，再调用 Session service。
- `src/preload/api/session/chat.ts`、`src/renderer/src/api/session/chat.ts` 暴露同形 typed wrapper。

选择 Main API 而非 Renderer 过滤，是因为正文文件不应被批量传入 Renderer；选择现有 `session:chat` area 而非新 domain，是因为搜索只读取 Session 自身的 meta/messages，并返回 Session 导航投影。

### 2. 使用独立搜索 service 和纯匹配 helper

新增 `src/main/services/session/chat/session-search-service.ts` 编排 `listSessionMetas()` 与 `loadMessages()`。新增 `src/main/domain/session/chat/session-search.ts` 放置纯函数，负责：

- trim 查询并使用 Unicode 字符串的大小写不敏感 substring 匹配；不做分词或模糊匹配。
- 从 `role === "user" | "assistant"` 的 `part.type === "text"` 提取可搜索正文。
- 从 text 中移除所有 `<system-reminder>…</system-reminder>` 区段，完全由 reminder 组成的 part 不产生候选文本。
- 把连续空白折叠为单个空格，并围绕首次命中生成最长 160 字符的单行 snippet；截断侧使用 `…`。

Main service 先判断标题，再判断 Session ID；只有二者都不匹配时才按 Session meta 的 `updatedAt` 倒序、逐个且顺序读取消息 JSONL，找到该 Session 的首次正文命中后立即停止读取其余消息内容。每个 Session 最多返回一条结果。

不直接把匹配逻辑放进 `session-store.ts`：storage 继续负责容错读取原始数据，查询语义属于 domain/service。V1 复用 `loadMessages()`，一次只保留一个 Session 的消息数组，避免同时展开整个 Workspace 的 108MB JSONL。

### 3. 返回稳定、最小的搜索投影

在 `src/shared/types/chat.ts` 新增：

```ts
type SessionSearchMatchKind = "title" | "session-id" | "message";

interface SessionSearchResult {
  sessionId: string;
  title: string;
  updatedAt: Date;
  matchKind: SessionSearchMatchKind;
  snippet?: string;
}
```

结果优先级固定为 `title` → `session-id` → `message`，同一优先级按 `updatedAt` 降序，最多返回 50 条。标题或 Session ID 命中时不强制继续读取正文，因此 `snippet` 可缺省；正文命中必须返回 snippet。最小 DTO 避免把 `messages`、配置或 action state 重复传回 Renderer。

### 4. Modal 使用局部 latest-query-wins 状态

新增 `src/renderer/src/components/chat/SessionSearchModal.vue`，由 `ChatSidebar.vue` 通过 `v-model:open` 控制。该能力只有单一入口、没有跨页面共享状态，不满足 renderer feature 或 Pinia store 的准入条件，因此状态保留在组件内。

Modal 行为：

- 使用 `UModal`，内容宽度 `max-w-2xl`；标题为“搜索会话”，描述明确范围是当前 Workspace。
- 每次打开清空上次 query/results/error，并在 `nextTick` 后聚焦带搜索 icon 的 `UInput`。
- trim 后为空时不调用 API，展示输入提示；非空输入等待 300ms debounce 后查询。
- 同一 Modal 同时最多有一个 IPC 查询。查询期间继续输入时只记录最新 pending query；当前请求结束后仅执行最新值。
- 每次请求绑定递增 generation 与发起时 `workspaceId`。Modal 关闭、Workspace 改变或 query 更新后，迟到响应不得写入当前结果。
- 搜索中展示明确加载状态；成功但无匹配使用 compact `AppEmptyState`；失败展示“搜索失败”及可重试说明。
- 结果区为可滚动的语义 button 列表，展示标题、可选 snippet、更新时间；正文 snippet 使用普通 Vue 文本渲染，不使用 `v-html`。

`ChatSidebar.vue` 顶部操作区改为 `gap-2`：现有“新建会话”按钮占剩余宽度，右侧增加 `color="neutral" variant="outline"` 的方形 search icon button，并使用 `UTooltip` 与 `aria-label="搜索会话"`。不改变新建会话行为或分组可用高度计算。

### 5. 结果选择复用既有打开入口

搜索结果点击后调用 `useOpenChatSession().openChatSession(sessionId)`。成功发起选择时关闭 Modal；若目标会话已被删除或加载失败，保留/恢复 Modal 并展示错误，避免静默丢失用户查询。搜索结果不写入或重排 `sessionStore.sessions`。

## Risks / Trade-offs

- **[按需扫描大 Workspace 可能较慢]** → 300ms debounce、单 Modal 串行请求、标题/ID 短路、逐 Session 顺序读取、50 条上限；V1 不用持久化索引换取无迁移与结果实时一致。
- **[无法真正取消已进入 Main 的磁盘读取]** → Renderer 丢弃迟到结果并不并行发起下一次扫描；关闭 Modal 后旧请求只完成只读工作，不再影响 UI。
- **[substring 匹配不支持复杂检索]** → 明确 V1 语义，优先满足用户记得关键词的找回场景；后续真实数据证明需要时再单独提案索引或模糊搜索。
- **[system reminder 与正文共处同一 text part]** → 纯 helper 删除 part 内所有 reminder 区段，而不是只判断整个 part 是否被 wrapper 包裹。
- **[搜索时 Session 被修改或删除]** → 每次查询从当前 meta/messages 读取；打开阶段继续由既有 Session 校验处理竞态，并向用户反馈失败。

## Migration Plan

无需数据迁移。发布后搜索直接读取现有 Session meta 与消息 JSONL；回滚只需移除 UI 与只读 IPC/API，不会遗留新增数据。若未来引入索引，必须作为独立持久化契约变更处理。

## Open Questions

无。搜索范围、排除项、结果形态和 V1 无索引策略已由用户确认。
