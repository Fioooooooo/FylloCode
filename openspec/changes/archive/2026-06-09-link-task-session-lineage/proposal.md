## Why

主进程 `services/lineage` 已具备完整的 subject / index / 查询能力，但完全未被启用——没有任何 IPC、preload、renderer api 连接，也无任何调用方。与此同时，"发起讨论"链路（`task.vue#startChatFromTask` → `chatStore.sendMessage`）创建的 session 与发起它的 task 之间没有任何持久化关联：会话列表、reminder、UI 都无法感知"这个会话是针对哪个任务的讨论"。

本次变更把 task → session 的关联真正接通，作为 lineage 知识图谱的第一个稳定入口，并据此让新会话的 system-reminder 感知所属任务、让对话页顶部展示关联任务来源。

## What Changes

- **lineage subject 成为发起讨论的硬门槛**：点击"发起讨论"时，先调用新的 lineage IPC 创建/复用 task subject（携带全量 `LineageTaskSnapshot`）；subject 创建失败则中断，不再发起对话。
- **session meta 记录出身任务**：`SessionMeta` / `Session` 新增 write-once 字段 `originTaskRef?: LineageTaskRef`，唯一写入者为 `chat-service.createSession`。**BREAKING**（持久化 schema 扩展，向后兼容读取）。
- **createSession 契约扩展**：`createSessionInputSchema` 新增可选 `taskRef`，由 renderer 经 `sessionStore.createSession` 透传；handler 在 session meta 落盘后编排 `linkTaskSession`（幂等、尽力而为、失败仅记日志）。
- **task→session 边可重建**：边写入失败不阻断对话，可由 `rebuildIndex` 从 subjects 重建；session 出身信息靠 `meta.originTaskRef` 始终可读。
- **system-reminder 感知任务**：`SystemReminderContext` 新增可选 `taskRef`，stream handler 从 meta 读出注入；chat reminder 模板据此告知 agent 当前讨论针对一个已存在 task。
- **对话页顶部吸顶展示关联任务**：session store 新增 `taskInfoBySessionId` 内存缓存，`selectSession` 时若 `originTaskRef` 存在则懒加载 lineage subject 快照（来源 + 标题）；ChatContainer 顶部展示吸顶来源条。即便第三方 task 已关闭、本地不可见，仍能从 lineage 快照展示。
- **lineage IPC/preload/api 全套接入**：新增 `lineage:ensureTaskSubject`、`lineage:linkTaskSession`、`lineage:getByTask` 三个 channel 及对应 preload 暴露与 renderer api。

## Capabilities

### New Capabilities

- `lineage-ipc`: lineage 服务面向渲染进程的 IPC / preload / renderer api 暴露层，覆盖 `ensureTaskSubject`（建/复用 subject，硬门槛）、`linkTaskSession`（幂等挂边）、`getByTask`（读 subject 快照）三个能力的请求-响应契约与 schema 校验。
- `chat-origin-task-banner`: 对话页顶部"关联任务"吸顶展示能力，含 session store 的 `taskInfoBySessionId` 内存缓存与懒加载策略、ChatContainer 吸顶组件、以及第三方任务关闭后仍可展示的降级行为。

### Modified Capabilities

- `session-meta-storage`: `SessionMeta` / `Session` 新增 write-once 字段 `originTaskRef`，唯一写入者为 `chat-service.createSession`；`SessionMetaPatch` 的 `Omit` 排除 `originTaskRef`，从类型层禁止任何 patch 路径改写它。
- `system-reminder-injection`: `SystemReminderContext` 字段列表新增可选 `taskRef`；chat reminder 注入"当前讨论针对一个已存在 task"的感知内容。
- `task-chat-bridge`: 发起讨论流程改为"先建 lineage subject（失败中断）→ createSession 携带 taskRef → handler 挂边"，在原有 prompt 生成 / 自动建会话 / 路由跳转契约之上插入 lineage 关联步骤。
- `project-lineage-model`: 在现有写入编排 API 之上新增便利方法 `linkTaskSession(projectPath, taskRef, sessionId)`，内部组合 `ensureTaskSubject` + `linkSession`，全程幂等。

## Impact

- **共享类型 / schema**：`src/shared/types/lineage.ts`（无需改，复用 `LineageTaskRef`）、`src/shared/types/chat.ts`（`Session.originTaskRef`）、`src/shared/schemas/ipc/chat.ts`（`createSessionInputSchema.taskRef`）、新增 `src/shared/schemas/ipc/lineage.ts` 与 lineage IPC channel 常量。
- **主进程**：`src/main/infra/storage/session-store.ts`（`SessionMeta.originTaskRef` + `SessionMetaPatch` Omit）、`src/main/services/chat/chat-service.ts`（write-once 写入 + `toSession` 映射）、`src/main/ipc/chat.ts`（createSession handler 编排 linkTaskSession；stream handler 读 meta 注入 reminderContext.taskRef）、`src/main/services/lineage/lineage-service.ts`（新增 `linkTaskSession`）、新增 `src/main/ipc/lineage.ts`、`src/main/services/chat/system-reminder/`（context 类型 + chat 模板）。
- **preload**：新增 `src/preload/api/lineage.ts` 及类型声明。
- **渲染进程**：新增 `src/renderer/src/api/lineage.ts`、`src/renderer/src/stores/session.ts`（`taskInfoBySessionId` 缓存 + `selectSession` 懒加载）、`src/renderer/src/pages/task.vue`（`startChatFromTask` 改造）、`src/renderer/src/stores/chat.ts`（`sendMessage` draft 分支透传 taskRef）、ChatContainer 吸顶组件。
- **IPC 契约**：新增 3 个 lineage channel；`chat:createSession` 入参扩展。属 behavior-contract 变更。
- **数据一致性模型**：session meta 为硬锚（含 originTaskRef，write-once），lineage 边为尽力而为且可重建；subject 为硬门槛。
