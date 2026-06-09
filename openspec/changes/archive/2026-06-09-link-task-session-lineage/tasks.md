## 1. 共享类型与 schema

- [x] 1.1 在 `src/shared/types/chat.ts` 的 `Session` 接口新增可选字段 `originTaskRef?: LineageTaskRef`（从 `@shared/types/lineage` 导入 `LineageTaskRef`）。验收：类型编译通过，`Session` 暴露该字段。
- [x] 1.2 在 `src/shared/schemas/ipc/chat.ts` 的 `createSessionInputSchema` 新增可选 `taskRef`（zod 字符串，校验形如 `<source>:<id>`，可用 `z.string().regex(/^(local|yunxiao|github):.+/)` 或 `.refine`）。验收：合法 ref 通过、缺失时为 optional。
- [x] 1.3 新增 `src/shared/schemas/ipc/lineage.ts`，定义 `ensureTaskSubjectInputSchema`（`projectId` 非空 + `snapshot` 含 `ref`/`snapshot`/`capturedAt`）、`linkTaskSessionInputSchema`（`projectId` + `taskRef` + `sessionId`）、`getByTaskInputSchema`（`projectId` + `ref`）。复用 `src/shared/types/lineage.ts` 的 `LineageTaskSnapshot`/`LineageTaskRef` 形态。验收：三个 schema 导出，非法入参被拒。
- [x] 1.4 新增 lineage IPC channel 常量（参照 `ChatChannels` 模式，置于 `src/shared/types/channels.ts` 或新增 lineage 段）：`lineage:ensureTaskSubject`、`lineage:linkTaskSession`、`lineage:getByTask`。验收：常量导出，命名与现有 channel 风格一致。

## 2. 主进程 session meta（write-once originTaskRef）

- [x] 2.1 在 `src/main/infra/storage/session-store.ts` 的 `SessionMeta` 接口新增 `originTaskRef?: LineageTaskRef`。验收：落盘 key 为驼峰 `originTaskRef`。
- [x] 2.2 在同文件的 `SessionMetaPatch` 类型的 `Omit` 列表加入 `originTaskRef`（与 `sessionId`/`createdAt`/`tokenUsage` 并列）。验收：尝试在 patch 入参传 `originTaskRef` 时 TypeScript 编译报错。
- [x] 2.3 在 `src/main/services/chat/chat-service.ts` 的 `createSession` 入参类型新增可选 `taskRef`，并在构造 `meta` 时：`if (input.taskRef) meta.originTaskRef = input.taskRef`（write-once，仅此一处写入）。验收：携带 taskRef 时 meta 含该字段，未携带时不含。
- [x] 2.4 在 `chat-service.ts` 的 `toSession` 中把 `meta.originTaskRef` 映射到 `Session.originTaskRef`。验收：`listSessions`/`createSession` 返回值含该字段（未持久化为 `undefined`）。

## 3. lineage 服务便利 API

- [x] 3.1 在 `src/main/services/lineage/lineage-service.ts` 新增 `linkTaskSession(projectPath, taskRef, sessionId)`，内部经 `index.tasks[taskRef]` 命中既有 subjectId 后调用现有 `linkSession(projectPath, sessionId, subjectId)`；命中失败（subject 不存在）时返回 `null` 并由调用方按尽力而为处理。复用现有 `readWritableIndex`/`linkSession`。验收：对已存在 subject 的 ref 挂边成功且幂等；对同一 `(taskRef, sessionId)` 重复调用不产生重复 link。
- [x] 3.2 为 `linkTaskSession` 补充单测（`test/main/services/lineage/`，镜像 src 结构），覆盖：命中复用、幂等、subject 缺失返回 null、与 `ensureTaskSubject` 组合不冲突。验收：`pnpm test` 通过。

## 4. lineage IPC / preload / renderer api

- [x] 4.1 新增 `src/main/ipc/lineage.ts`，导出 `registerLineageHandlers()`，注册三个 handler：`ensureTaskSubject`/`linkTaskSession`/`getByTask`，均用 `wrapHandler` + `validate`（schema 来自 1.3），并复用 lineage 服务现有的 projectId→projectPath 解析方式。验收：三 channel 注册，入参经 schema 校验。
- [x] 4.2 在主进程 IPC 注册入口（参照 `src/main/ipc/index.ts` 现有 `registerChatHandlers` 等的注册处）调用 `registerLineageHandlers()`。验收：应用启动后 channel 可被 invoke。
- [x] 4.3 新增 `src/preload/api/lineage.ts`，通过 contextBridge 暴露 `lineageApi`（`ensureTaskSubject`/`linkTaskSession`/`getByTask`），并补充 preload 接口类型声明（参照 `src/preload/api/task.ts` 模式）。验收：`window.api.lineage` 三方法可用，类型完整。
- [x] 4.4 新增 `src/renderer/src/api/lineage.ts`，封装 `lineageApi` 调用（参照 `src/renderer/src/api/task.ts`）。验收：renderer 可 import 并调用，返回 `IpcResponse<...>`。

## 5. system-reminder 任务感知

- [x] 5.1 在 `src/main/services/chat/system-reminder/types.ts` 的 `SystemReminderContext` 新增可选 `taskRef?: LineageTaskRef`。验收：类型编译通过。
- [x] 5.2 在 `src/main/services/chat/acp-session.ts` 的 `ReminderContext` 类型（含 `changeId` 的同一处）新增可选 `taskRef`，使其经 `reminderContext` 透传至 `resolveReminderParts`（无需改 `resolveReminderParts` 的展开逻辑，`...this.opts.reminderContext` 已覆盖）。验收：传入 taskRef 能流到 `resolveSystemReminder`。
- [x] 5.3 在 `src/main/ipc/chat.ts` 的 stream handler `onReady` 内（已 `loadSessionMeta` 处，约 `chat.ts:233`）读取 `meta.originTaskRef`，在 `new AcpSession({...})` 时把 `reminderContext: { taskRef: meta.originTaskRef }` 传入（与现有 reminderContext 合并，注意不覆盖其他字段）。验收：关联会话发起 stream 时 reminderContext.taskRef 被赋值。
- [x] 5.4 在 chat reminder 模板（`src/main/services/chat/system-reminder/templates/chat.txt`）新增任务感知段落，使用白名单变量 `{{taskRef}}`；并在 `src/main/services/chat/system-reminder/providers/shared.ts`（或变量白名单定义处）把 `taskRef` 加入白名单变量，沿用 sanitize（含尖括号返回 null）。`taskRef` 为空时该段落应渲染为空/省略。验收：携带 taskRef 时 reminder 含感知文本；无 taskRef 时不含且其余内容正常；值含 `<`/`>` 时 provider 返回 null。
- [x] 5.5 为 reminder 任务感知补充/更新单测（`test/main/services/chat/system-reminder/`），覆盖：携带 taskRef 注入、无 taskRef 不注入、尖括号 sanitize。验收：`pnpm test` 通过。

## 6. 渲染进程发起讨论流程改造

- [x] 6.1 在 `src/renderer/src/stores/chat.ts` 的 `sendMessage` 增加可选参数透传 taskRef（建议签名 `sendMessage(parts, options?: { taskRef?: LineageTaskRef })`），在 draft 分支把 `taskRef` 传入 `sessionStore.createSession({ ..., taskRef })`；非 draft 分支不涉及。务必不破坏 `carryProbe` 逻辑。验收：从任务发起时 createSession 入参含 taskRef。
- [x] 6.2 在 `src/renderer/src/stores/session.ts` 的 `createSession` 入参类型与 `chatApi.createSession` 调用中透传 `taskRef`。验收：taskRef 经 IPC 到达主进程。
- [x] 6.3 改造 `src/renderer/src/pages/task.vue` 的 `startChatFromTask`：构造 `taskRef = ` `${task.source}:${task.id}` ``与`LineageTaskSnapshot`（`{ ref, snapshot: task, capturedAt: new Date().toISOString() }`）；先 `await lineageApi.ensureTaskSubject(projectId, snapshot)`，失败则 toast 提示并 `return`（不调用 sendMessage、不导航）；成功后再 `beginDraftSession()`+`sendMessage(parts, { taskRef })`+`router.push('/chat')`。验收：subject 失败时不发起对话；成功时会话携带 taskRef。
- [x] 6.4 为 `startChatFromTask` 改造补充/更新组件或 store 测试（`test/renderer/`），覆盖 ensureTaskSubject 失败中断分支。验收：`pnpm test` 通过。

## 7. createSession handler 编排关联边

- [x] 7.1 在 `src/main/ipc/chat.ts` 的 `chat:createSession` handler 中，于 `createSession(form)` 返回 session 后，若 `form.taskRef` 非空则 `await linkTaskSession(projectPath, form.taskRef, session.id)`，用 try/catch 包裹，失败仅 `logger.error` 并继续返回 session。需先 `resolveProjectPath(form.projectId)`（已有该工具）。import lineage-service 仅在 handler 层，`chat-service` 不 import。验收：携带 taskRef 时挂边；linkTaskSession 失败不阻断、仍返回 session；无 taskRef 不调用。

## 8. 对话页关联任务吸顶条

- [x] 8.1 在 `src/renderer/src/stores/session.ts` 新增内存缓存 `taskInfoBySessionId`（`Map<string, { source: TaskSource; title: string; ref: LineageTaskRef }>`，非持久化）。验收：状态存在且可读。
- [x] 8.2 在 `selectSession` 内：若目标 session 的 `originTaskRef` 非空且未在 `taskInfoBySessionId` 缓存，调用 `lineageApi.getByTask(projectId, originTaskRef)`，从返回的 `task.snapshot` 解析 `title`、从 ref 解析 `source`，写入缓存；返回 null 时降级缓存 `{ source: 解析自ref, title: ref原文 }`。复刻 `loadedSessionIds` 懒加载模式。验收：首次切换发请求并缓存；再次切换零请求；null 降级。
- [x] 8.3 新增 ChatContainer 顶部吸顶来源条组件（建议 `src/renderer/src/components/chat/OriginTaskBanner.vue`），sticky 定位，读取当前活跃 session 的 `taskInfoBySessionId` 缓存项；`originTaskRef` 为空时不渲染、不占位。展示 source 徽标 + title。验收：关联会话展示、未关联会话不展示、第三方关闭任务仍展示（走快照）。
- [x] 8.4 在 ChatContainer（聊天主容器组件）顶部挂载 `OriginTaskBanner`，置于消息列表之上、随内容吸顶。验收：视觉上吸顶，不破坏既有滚动布局。

## 9. 文档与 guidelines

- [x] 9.1 评估并更新本地仓库 guidelines：检查 `guidelines/IPC.md` 是否需补充 lineage IPC channel 的登记；检查 `guidelines/DataModel.md` 是否需记录 `SessionMeta.originTaskRef` 的 write-once 约束与 lineage 关系图谱入口。按实际差异更新对应文件。验收：涉及的 guideline 文件反映本次新增的 IPC 与数据契约，或确认无需更新并说明理由。

## 10. 验证

- [x] 10.1 运行 `pnpm typecheck` 确保 Node 与 Web 两侧类型检查通过。
- [x] 10.2 运行 `pnpm test` 确保全部测试通过。
- [x] 10.3 运行 `pnpm lint` 确保无 lint 错误。
- [x] 10.4 手动验证发起讨论全链路：从任务页点击"发起讨论"→ 新会话创建并携带 originTaskRef → 对话页顶部展示来源条 → reminder 感知任务 → 切换会话缓存命中零请求。
