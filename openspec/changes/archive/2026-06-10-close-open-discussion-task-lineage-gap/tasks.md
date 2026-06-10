## 1. shared 类型与 schema

- [x] 1.1 在 `src/shared/types/task.ts` 移除 `TaskItem.proposalId`、`CreateLocalTaskInput.proposalId`，并从 `UpdateTaskInput` 的 `Pick` 中移除 `proposalId`；新增 `TaskItem.originSessionId?: string`，注释标注 write-once。确认 `UpdateTaskInput` 不含 `originSessionId`。
- [x] 1.2 在 `src/shared/schemas/ipc/task.ts` 移除 `createTaskInputSchema` 与 `updateTaskInputSchema` 中的 `proposalId` 字段；不新增 `originSessionId`（该字段不经 task IPC 写入）。
- [x] 1.3 在 `src/shared/types/channels.ts` 的 `LineageChannels` 新增 `createSessionTask: "lineage:createSessionTask"`。
- [x] 1.4 在 `src/shared/schemas/ipc/lineage.ts` 新增 `createSessionTaskInputSchema`：`{ projectId: string.min(1), sessionId: string.min(1), title: string.min(1), description: string.optional() }`。

## 2. 主进程：task 存储与服务

- [x] 2.1 在 `src/main/infra/storage/task-store.ts` 的读取规范化逻辑（约 `:181`）移除对 `proposalId` 的读取分支，忽略历史文件中的该字段；新增对 `originSessionId` 的规范化（缺失时为 `undefined`，存在且为非空字符串时保留）。
- [x] 2.2 在 `src/main/services/task/task-service.ts` 的 `createTask` 移除 `proposalId: input.proposalId`；`applyPatch` 移除 `proposalId` 行。`createTask` 增加可选内部入参以写入 `originSessionId`（仅供 lineage 协调函数调用，不经 `task:create` IPC 暴露），普通路径下 `originSessionId` 为 `undefined`。
- [x] 2.3 在 `src/main/ipc/task.ts` 的 `task:create` handler（约 `:51`）移除 `proposalId: form.proposalId`。

## 3. 主进程：lineage 协调函数与 IPC

- [x] 3.1 在 `src/main/services/lineage/lineage-service.ts` 新增 `createSessionTask(projectPath, { sessionId, title, description })`：调用 task-service 创建本地任务（`description` 包装为 `{ format: "plain_text", content: description ?? "" }`，写入 `originSessionId = sessionId`）；任务创建失败则抛错。创建成功后回绑——`getBySession(sessionId)` 取 subjectId，无则 `ensureChatSubject(sessionId)`，再 `backfillTask(subjectId, 任务快照)`；回绑阶段 try/catch，失败仅 `logger` 记录并返回已创建 `TaskItem`。返回 `TaskItem`。确认未 import 逆向依赖（task-service 不 import lineage）。
- [x] 3.2 构造回绑用的 `LineageTaskSnapshot`：`ref = "local:<taskId>"`、`snapshot = 新建 TaskItem`、`capturedAt = nowIso()`，复用 `lineage-store`/`subject` 既有快照结构。
- [x] 3.3 在 `src/main/ipc/lineage.ts` 注册 `LineageChannels.createSessionTask` handler：用 `wrapHandler` + `validate(createSessionTaskInputSchema)`，`resolveProjectPath(projectId)` 后调 `createSessionTask`，返回 `TaskItem`。
- [x] 3.4 验证 `backfillTask`→`attachTask` 不改 `origin`（仅设置 `task` 字段），确保回绑后 chat subject 的 `origin` 保持 `"chat"`，且 `index.tasks["local:<taskId>"]` 指向同一 subject。

## 4. preload 与 renderer api

- [x] 4.1 在 `src/preload/api/lineage.ts` 新增 `createSessionTask(projectId, input)`，`ipcRenderer.invoke(LineageChannels.createSessionTask, { projectId, ...input })`。
- [x] 4.2 在 `src/renderer/src/api/lineage.ts` 新增对应 wrapper `createSessionTask(projectId, { sessionId, title, description })`。

## 5. renderer：fyllo-action dispatcher 改走 lineage

- [x] 5.1 确认 fyllo-action host context（`MarkStream` 注入的 `fylloActionHostContextKey`）已暴露当前 chat `sessionId`；若 dispatcher 取不到，则在 `FylloActionNode.vue` 调用 dispatcher 时透传 host context 的 `sessionId`。
- [x] 5.2 修改 `src/renderer/src/composables/useFylloActionDispatcher.ts` 的 `task.create` 分支：改为调用 `lineageApi.createSessionTask(projectId, { sessionId, title, description: taskPayload.description })`（透传原始字符串，不在 renderer 包装结构化 description）；不再调用 `useTaskStore().createTask()`。`projectId` 取自 project store。
- [x] 5.3 当上下文缺少 `sessionId` 时，dispatcher 返回 `{ ok: false, error: ... }`，使 action card 进入 failed 状态。
- [x] 5.4 在 `src/renderer/src/components/task/TaskCard.vue` 移除基于 `task.proposalId` 的徽标块（约 `:118-123`）。

## 6. 主进程：reminder 注入任务标题与 agent 分支规则

- [x] 6.1 在 `src/main/services/chat/system-reminder/types.ts` 的 `SystemReminderContext` 新增可选 `taskTitle?: string`。
- [x] 6.2 在 `src/main/ipc/chat.ts` 的 `streamMessage` handler `onReady`（约 `:298`）：读取 `meta.originTaskRef` 后，若非空则调 `lineage-service.getByTask(projectPath, originTaskRef)` 取快照标题，填入 `reminderContext.taskTitle`；`getByTask` 失败或缺标题时该字段为 `undefined`（try/catch，不阻断）。
- [x] 6.3 在 `src/main/services/chat/system-reminder/providers/shared.ts` 的变量白名单新增 `taskRef`、`taskTitle`（`taskRef` 此前若未在白名单则一并补齐），undefined 渲染为空字符串，沿用尖括号 sanitize 规则。
- [x] 6.4 修改 `src/main/services/chat/system-reminder/templates/chat.txt`：在既有 `{{#taskRef}}` 任务感知段落中加入任务标题 `{{taskTitle}}`（仅标题，不含描述）；新增 agent 分支规则段落——`create-proposal` 返回后、写 artifacts 前，按是否含任务感知段落分支（已绑定仅建 proposal；未绑定先输出 `<fyllo-action type="task.create">` 再写 artifacts），复用既有 fyllo-action 协议说明，不重复 payload schema。

## 7. 测试

- [x] 7.1 `test/main/services/lineage/` 新增 `createSessionTask` 单测：覆盖建任务成功 + 回绑成功、回绑失败仍返回 TaskItem 且 originSessionId 已写入、会话无 subject 时 ensureChatSubject 兜底、subject origin 保持 "chat"。
- [x] 7.2 `test/main/services/task/` 更新：验证普通 createTask 不写 originSessionId、applyPatch 不触及 originSessionId、读取含遗留 proposalId 的文件被忽略不报错。
- [x] 7.3 `test/main/services/chat/` 更新 reminder 相关测试：taskRef 非空且有标题时注入标题、快照缺标题仅注入 ref、无 taskRef 不注入、不注入描述、尖括号 sanitize；并覆盖 chat.txt 含 agent 分支规则文本。
- [x] 7.4 `test/renderer/` 更新 dispatcher 测试：task.create 走 `createSessionTask` 并透传 sessionId、缺 sessionId 进入失败、不再调用 taskStore.createTask。
- [x] 7.5 运行 `pnpm typecheck`、`pnpm lint`、`pnpm test` 全绿。

## 8. 文档与 guidelines

- [x] 8.1 评估并更新 `guidelines/DataModel.md`：补充 `TaskItem.originSessionId` 的 write-once 约束（参照现有 `SessionMeta.originTaskRef` 条目的写法），并移除/修订涉及 `TaskItem.proposalId` 的描述。
- [x] 8.2 评估 `guidelines/IPC.md` 是否需补充 `lineage:createSessionTask` channel；如有 lineage/IPC 清单则同步新增。
