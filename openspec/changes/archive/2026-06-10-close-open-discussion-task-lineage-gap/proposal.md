## Why

task → session → proposal 的血缘链路目前只覆盖"从任务页发起讨论"这一条路径。当用户直接在对话中讨论一个开放需求并最终创建 proposal 时，这条会话从未绑定任何任务，血缘缺了源头：proposal 挂在一个 chat-origin subject 上，但没有对应的本地任务，团队无法从任务视角回溯这次工作。

本 change 补齐这个缺口：让 agent 在创建 proposal 后判断当前会话是否已绑定任务，未绑定时提示用户创建本地任务，并把新建任务回绑到当前会话的 lineage subject，使开放讨论也能形成完整的 task → session → proposal 链路。

## What Changes

- **reminder 注入任务标题**：当会话源自任务（`taskRef` 非空）时，chat system-reminder 不再只注入不透明的 `taskRef`，而是额外注入任务**标题**作为 agent 的语义锚点。**BREAKING**（修改现有 SHALL NOT：原契约禁止注入标题/描述，现放开为"可注入标题、仍禁止描述全文"）。
- **agent 分支行为**：chat reminder 新增规则——`create-proposal` 返回后、写入 proposal artifacts 之前，agent SHALL 判断当前会话是否已绑定任务。已绑定则仅创建 proposal；未绑定则先通过 `<fyllo-action type="task.create">` 提示用户创建本地任务（标题/描述由 agent 依据对话生成），再继续写 artifacts。
- **新增 lineage 协调 API**：新增 `lineage:createSessionTask` channel，在主进程内一次性完成"创建本地任务 + 回绑到当前会话 subject"。创建任务为硬要求，回绑为 best-effort。
- **task.create 改走新 API**：用户确认 `task.create` action 后，在 chat 上下文中 dispatcher 改为调用 `lineage:createSessionTask`（携带当前 `sessionId`），而非直接调用 `task:create`，从而完成会话与任务的绑定。
- **TaskItem 字段调整**：移除从未投入使用的 `proposalId` 字段（**BREAKING**，删除一处 TaskCard 上的展示状态）；新增 write-once 字段 `originSessionId`，记录任务的来源会话，使 task → session 边在极端情况下可由 `rebuildIndex` 从任务侧反推重建。

## Capabilities

### New Capabilities

（无新增能力，全部为现有能力的契约修改）

### Modified Capabilities

- `system-reminder-injection`: 放开"仅 ref 级别感知"的 SHALL NOT，允许在 chat reminder 中注入任务标题；新增 agent 在 create-proposal 后按绑定状态分支创建任务的行为契约；模板变量白名单扩展。
- `lineage-ipc`: 新增 `lineage:createSessionTask` channel 及其入参 schema，定义"建任务 + 回绑会话 subject"的契约与失败语义。
- `fyllo-action-tags`: 修改 `task.create` action 的确认 handler 契约——在 chat 上下文改为经 `lineage:createSessionTask` 创建并绑定任务。
- `task-local`: 移除 `TaskItem.proposalId`；新增 write-once `TaskItem.originSessionId`，并约束其唯一写入路径。

## Impact

- **shared 类型**：`src/shared/types/task.ts`（移除 `proposalId`、新增 `originSessionId`、调整 patch 类型）、`src/shared/types/lineage.ts`（如需扩展协调入参类型）、`src/shared/types/channels.ts`（新增 `LineageChannels.createSessionTask`）、`src/shared/schemas/ipc/task.ts` 与 `src/shared/schemas/ipc/lineage.ts`。
- **主进程**：`src/main/services/chat/system-reminder/`（reminder context、provider、`chat.txt` 模板、变量白名单）、`src/main/ipc/chat.ts`（reminder context 填入标题）、`src/main/services/lineage/lineage-service.ts`（新增协调函数）、`src/main/ipc/lineage.ts`、`src/main/services/task/task-service.ts`、`src/main/infra/storage/task-store.ts`。
- **preload / renderer**：`src/preload/api/lineage.ts`、`src/renderer/src/api/lineage.ts`、`src/renderer/src/composables/useFylloActionDispatcher.ts`、`src/renderer/src/components/task/TaskCard.vue`（移除 proposalId 徽标）、fyllo-action host context 透传 `sessionId`。
- **存储格式**：`tasks.json` 中 task 记录的字段变更（去 `proposalId`、加 `originSessionId`），需在读取时向后兼容。
- **测试**：lineage-service、chat-service/reminder、task-service/store、dispatcher 相关单测需新增或更新。
