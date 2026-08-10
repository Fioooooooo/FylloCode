## 1. 搜索契约与纯语义

- [x] 1.1 在 `src/shared/types/chat.ts` 定义 `SessionSearchMatchKind` 与最小 `SessionSearchResult` DTO；在 `src/shared/ipc/session/chat.channels.ts` 和 `chat.schemas.ts` 增加严格的 `searchSessions` channel/input schema（当前 Workspace、trim 后 1–200 字符 query），并在 `test/shared/ipc/session/chat.schemas.spec.ts` 覆盖空白、超长和合法输入。
- [x] 1.2 新增 `src/main/domain/session/chat/session-search.ts`，实现大小写不敏感 substring、User/Assistant text-only 提取、part 内全部 `<system-reminder>` 区段剥离、空白归一化与最长 160 字符 snippet；新增镜像测试 `test/main/domain/session/chat/session-search.spec.ts` 覆盖正文、reasoning/Tool 排除、混合 reminder、Unicode 与双侧截断。

## 2. Main、IPC 与 Preload 查询链路

- [x] 2.1 新增 `src/main/services/session/chat/session-search-service.ts`，复用 `listSessionMetas()` / `loadMessages()` 逐 Session 顺序扫描，实现 title → session-id → message 优先级、同类 `updatedAt` 降序、每 Session 单结果和 50 条上限；新增 `test/main/services/session/chat/session-search-service.spec.ts` 覆盖短路、排序、上限、正文命中与损坏/空消息降级。
- [x] 2.2 在 `src/main/ipc/session/chat.ts` 注册 `searchSessions` handler，使用 schema 校验、`requireWorkspaceSender()` 和新 service；扩展 `test/main/ipc/session/chat.spec.ts` 验证 sender Workspace 隔离与 service 参数。
- [x] 2.3 在 `src/preload/api/session/chat.ts`、`src/preload/index.ts` / `index.d.ts`（仅在现有聚合类型需要时）和 `src/renderer/src/api/session/chat.ts` 暴露 typed `searchSessions`，并扩展 `test/preload/api/session/chat.spec.ts` 验证 channel 与参数透传。

## 3. 搜索 Modal 与 ChatSidebar 入口

- [x] 3.1 新增 `src/renderer/src/components/chat/SessionSearchModal.vue`：使用 `UModal` / `UInput` / `AppEmptyState`，实现每次打开重置并聚焦、300ms debounce、单一 in-flight + latest pending query、generation/Workspace/close fencing，以及初始、加载、结果、无结果、失败/重试状态；结果使用安全文本、可滚动语义 button 列表展示标题、snippet 和更新时间。
- [x] 3.2 在 `SessionSearchModal.vue` 复用 `useOpenChatSession()` 打开结果；成功关闭 Modal，打开失败保留查询并展示错误，且不修改 `sessionStore.sessions`。
- [x] 3.3 修改 `src/renderer/src/components/chat/ChatSidebar.vue` 顶部操作区，在现有“新建会话”旁加入 `neutral` outline 搜索 icon button、tooltip 与 `aria-label`，挂载 `SessionSearchModal`，并保持既有新建、分组、折叠和滚动行为。
- [x] 3.4 新增 `test/renderer/src/components/session-search-modal.spec.ts`，覆盖空 query 不请求、debounce、连续输入串行与迟到结果、Workspace/关闭 fence、所有状态及选择结果；扩展 `test/renderer/src/components/chat-sidebar.spec.ts` 覆盖搜索按钮打开 Modal且不触发新建会话。

## 4. 验证与人工验收准备

- [x] 4.1 运行 Main 聚焦测试：`pnpm exec vitest run --project main test/shared/ipc/session/chat.schemas.spec.ts test/main/domain/session/chat/session-search.spec.ts test/main/services/session/chat/session-search-service.spec.ts test/main/ipc/session/chat.spec.ts test/preload/api/session/chat.spec.ts`。
- [x] 4.2 运行 Renderer 聚焦测试：`pnpm exec vitest run --project renderer test/renderer/src/components/session-search-modal.spec.ts test/renderer/src/components/chat-sidebar.spec.ts`，再运行 `pnpm typecheck:node`、`pnpm typecheck:web` 与 `pnpm lint`。
- [x] 4.3 在浅色/深色主题及窄/桌面窗口中人工检查搜索按钮、Modal overlay、输入焦点、长结果滚动、键盘焦点、加载/空/错状态，并使用现有生产历史关键词确认标题和正文结果可打开且 Tool/system reminder 不产生噪声。
