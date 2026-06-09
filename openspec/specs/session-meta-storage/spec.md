## Purpose

Session meta storage 规范定义主线程 session meta 的单点持久化边界，以及字段级更新不得覆盖未变更字段的约束。

## Requirements

### Requirement: Session meta updates are centralized in session-store

系统 SHALL 将 chat owner 的 session meta（位于 `data/projects/<encoded>/sessions/<sessionId>.json`）的读取、创建、字段更新和删除能力集中在 `src/main/infra/storage/session-store.ts`。除 session-store 外，其他主进程模块 MUST NOT 直接通过 `loadSessionMeta` 读取后自行 `saveSessionMeta` 回写，也 MUST NOT 构造缺失现存字段的整对象覆盖写入。

`session-store.ts` 的服务边界 SHALL 限定为 `owner === "chat"` 的会话；apply 与 archive owner 的 ACP 会话状态（`acpSessionId`）SHALL 通过各自专属的 `AcpSessionStore` 实现持久化（详见 `proposal-apply-run` spec），SHALL NOT 读写 `sessions/` 目录下的任何文件。

`AcpSession` 与 `session-store` 之间 SHALL 通过 `AcpSessionStore` 接口（`src/main/domain/chat/acp-session-store.ts`）解耦，`ChatAcpSessionStore`（`src/main/infra/storage/chat-acp-session-store.ts`）作为 chat owner 的实现，包装 `loadSessionMeta` / `upsertSessionMeta` 调用。`AcpSession` 模块本身 SHALL NOT 直接 import `session-store.ts`。

`ChatAcpSessionStore` 在 `persistAcpSessionId(acpSessionId)` 中 SHALL 通过 session-store 的字段级更新接口写入 `acpSessionId`、`agentId`、`turnCount`（自增）、`updatedAt`，并保留 session meta 中已有的 `title`、`tokenUsage`、`available_commands` 等所有未变更字段。

#### Scenario: Chat flow updates title through session-store

- **WHEN** chat 主线程处理 `session_info_update`
- **THEN** 它通过 session-store 提供的字段级更新入口修改 `title` 与 `updatedAt`
- **AND** 不在 `ipc/chat.ts` 内手写 `loadSessionMeta -> spread -> saveSessionMeta`

#### Scenario: ChatAcpSessionStore writes acpSessionId via session-store

- **WHEN** `AcpSession.start()` 在 `newSession` 或恢复分支中需要写入 `acpSessionId`、`turnCount` 或 `updatedAt`
- **AND** 当前 owner 为 `"chat"`
- **THEN** 它通过注入的 `ChatAcpSessionStore.persistAcpSessionId` 完成写入
- **AND** `ChatAcpSessionStore` 内部通过 session-store 的字段级更新入口完成写入
- **AND** 现存的 `available_commands`、`tokenUsage.cost` 以及未来新增字段 SHALL 被保留

#### Scenario: ApplyStageAcpSessionStore does not touch session-store

- **WHEN** `AcpSession.start()` 在 apply owner 下调用 `sessionStore.persistAcpSessionId(acpSessionId)`
- **THEN** 持久化通过 `updateRunMetaIfCurrent` 写入 `run.json` 的 `stageAcpSessionIds[stageIndex]`
- **AND** 不调用 `loadSessionMeta` / `upsertSessionMeta` / `saveSessionMeta`
- **AND** 不创建 `data/projects/<encoded>/sessions/` 下的任何文件

#### Scenario: ArchiveAcpSessionStore does not touch session-store

- **WHEN** `AcpSession.start()` 在 archive owner 下调用 `sessionStore.persistAcpSessionId(acpSessionId)`
- **THEN** 持久化通过 `updateArchiveRunAcpSessionId` 写入 `archive.json` 的 `acpSessionId` 字段
- **AND** 不调用 `loadSessionMeta` / `upsertSessionMeta` / `saveSessionMeta`
- **AND** 不创建 `data/projects/<encoded>/sessions/` 下的任何文件

### Requirement: Session meta field updates preserve unrelated fields

系统 SHALL 将 session meta 的增量修改视为字段级合并，而不是整对象覆盖。任何一次更新只允许改变本次明确指定的字段，其余已持久化字段 MUST 原样保留，包括当前未知但合法的扩展字段。

#### Scenario: available_commands survives second-turn session writes

- **WHEN** 某 session 在第一轮对话中已持久化 `available_commands`
- **AND** 第二轮对话启动时 `AcpSession.start()` 更新 `acpSessionId`、`turnCount` 或 `updatedAt`
- **THEN** 写回后的 session meta 仍包含原有 `available_commands`

#### Scenario: usage update does not erase future meta fields

- **WHEN** chat 流式处理 `usage_update` 并更新 `tokenUsage`
- **THEN** session-store 仅修改 `tokenUsage` 与本次需要变化的字段
- **AND** 不删除 `available_commands`、`acpSessionId` 或未来新增的其他 meta 字段

#### Scenario: explicit empty available_commands remains persisted

- **WHEN** agent 推送 `available_commands_update`，其 `commands` 为空数组
- **THEN** session-store 将 `available_commands` 持久化为 `[]`
- **AND** 后续任何其他 session meta 更新都 SHALL 保留该空数组，而不是删除该字段

### Requirement: SessionMeta 持久化 ACP session 级 config_options

`SessionMeta`（`src/main/infra/storage/session-store.ts` 导出）SHALL 包含可选字段 `configOptions?: AcpSessionConfigOption[]`，与 `available_commands?: AcpAvailableCommand[]` 同位治理。落盘 key 名 SHALL 为驼峰 `configOptions`，遵循 FylloCode 持久化字段命名规范（见 `persist-field-naming-conventions` spec）；内存层（`Session.configOptions`）同样为驼峰 `configOptions`。

`session-store.ts` 的字段级更新接口 SHALL 支持把 `configOptions` 当作普通字段进行 patch 写入，遵循"Session meta field updates preserve unrelated fields"约束：单次写入只改本次明确指定的字段，未变更字段（含 `available_commands`、`tokenUsage`、`acpSessionId`、`agentId`、`title` 等）原样保留。

`chat-service#toSession` SHALL 把 `meta.configOptions` 映射到 `Session.configOptions`，使 `chat:listSessions` 与 `chat:createSession` 等返回值一致地暴露 configOptions 内存态字段。

`configOptions` 是 per-session 字段，SHALL NOT 跨 session 复用。任何"按 agentId 缓存 schema"的需求都不在本规范范围内，session-store 也 SHALL NOT 提供按 agentId 聚合 configOptions 的接口。

#### Scenario: 首次 newSession 后写入 configOptions

- **WHEN** ACP `newSession` 响应携带非空 `configOptions`
- **AND** chat handler 在 `enqueueSessionMetaPersist` 中 patch `{ configOptions, updatedAt }`
- **THEN** session meta JSON 文件包含 `configOptions` 字段（驼峰 key）
- **AND** 现存的 `available_commands`、`tokenUsage`、`acpSessionId` 不变

#### Scenario: setConfigOption 响应回写 configOptions

- **WHEN** `chat:setConfigOption` service 调用成功，agent 返回新的 `configOptions`
- **THEN** service 通过 session-store 字段级更新接口写入 `configOptions`
- **AND** 已有 `available_commands` 与其他字段保持原值

#### Scenario: 二次 turn 启动不覆盖 configOptions

- **WHEN** 某 session 已持久化 `configOptions`
- **AND** 后续一次 `AcpSession.start()` 因更新 `acpSessionId`、`turnCount`、`updatedAt` 触发 session meta 写入
- **THEN** 写回后的 session meta 仍保留原有 `configOptions`，除非本 turn 的 `config_options_update` 事件已携带新全集

#### Scenario: 空数组也正确持久化

- **WHEN** agent 推送 `config_option_update` 携带空 `configOptions`
- **THEN** session-store 将 `configOptions` 持久化为 `[]`
- **AND** 后续其他 session meta 更新仍保留该空数组

#### Scenario: listSessions 返回包含 configOptions

- **WHEN** renderer 调用 `chat:listSessions`
- **THEN** main 调用 `listSessionMetas`，并在 `toSession(meta, projectId)` 内把 `meta.configOptions` 映射为 `Session.configOptions`（未持久化时为 `undefined`）

### Requirement: Chat session meta persists Fyllo action states

系统 SHALL 在 chat session meta 中持久化 Fyllo action 的用户交互状态，字段名为 `actionStates`。该字段 SHALL 只服务 Chat 主会话中的 `<fyllo-action>`，Apply / Archive SHALL NOT 读写该字段。

`actionStates` SHALL 是 `Record<string, FylloActionState>`，key 为 action id，value 结构如下：

```json
{
  "type": "task.create",
  "status": "succeeded",
  "updatedAt": "2026-06-08T00:00:00.000Z"
}
```

`FylloActionState` SHALL 只包含：

- `type`: 已注册的 Fyllo action type。
- `status`: `"succeeded" | "failed" | "cancelled"`。
- `updatedAt`: ISO 8601 字符串。

系统 SHALL NOT 持久化 `ready` 或 `running` 状态。缺失 action state SHALL 表示该 action 处于默认 ready 状态。系统 SHALL NOT 在 `actionStates` 中持久化 payload、payload hash、业务 result 或错误详情。

#### Scenario: 用户确认成功后写入 succeeded

- **WHEN** Chat 主会话中的 `task.create` action handler 执行成功
- **THEN** renderer 通过 chat action state IPC 写入当前 session meta
- **AND** session meta 的 `actionStates[actionId]` 为 `{ "type": "task.create", "status": "succeeded", "updatedAt": "<ISO timestamp>" }`
- **AND** session meta 中已有的 `available_commands`、`configOptions`、`tokenUsage` 等字段保持不变

#### Scenario: 用户取消后写入 cancelled

- **WHEN** 用户点击 Chat 主会话中 Fyllo action 的 `取消`
- **THEN** renderer 通过 chat action state IPC 写入当前 session meta
- **AND** session meta 的 `actionStates[actionId].status` 为 `"cancelled"`
- **AND** 不调用该 action 的业务 handler

#### Scenario: handler 失败后写入 failed

- **WHEN** 用户确认 Chat 主会话中的 Fyllo action
- **AND** action handler 返回失败或抛出错误
- **THEN** renderer 通过 chat action state IPC 写入当前 session meta
- **AND** session meta 的 `actionStates[actionId].status` 为 `"failed"`
- **AND** 错误详情不写入 session meta

#### Scenario: 重新加载 session 后回显 action state

- **WHEN** renderer 通过 `chat:listSessions` 或 session meta 恢复一个包含 `actionStates` 的 Chat session
- **THEN** `Session.actionStates` 包含持久化的 action state
- **AND** 对应 action card 按 `succeeded`、`failed` 或 `cancelled` 状态回显

### Requirement: Action state updates use field-level session meta patch

系统 SHALL 通过 `session-store.ts` 的字段级更新接口写入 `actionStates`。写入单个 action state 时 SHALL 合并现有 `actionStates`，并保留 session meta 的所有其他字段。

#### Scenario: 写入一个 action state 保留其他 action state

- **WHEN** session meta 中已有 `actionStates.actionA`
- **AND** renderer 写入 `actionStates.actionB`
- **THEN** 写回后的 session meta 同时包含 `actionA` 和 `actionB`

#### Scenario: action state 写入不覆盖其他 meta 字段

- **WHEN** session meta 中已有 `available_commands`、`configOptions` 和 `tokenUsage`
- **AND** renderer 写入一个 Fyllo action state
- **THEN** 写回后的 session meta 保留原有 `available_commands`、`configOptions` 和 `tokenUsage`

### Requirement: SessionMeta 持久化会话出身任务引用

`SessionMeta`（`src/main/infra/storage/session-store.ts` 导出）SHALL 包含可选字段 `originTaskRef?: LineageTaskRef`，记录该会话发起讨论时所针对的任务引用（形如 `<source>:<id>`）。落盘 key 名 SHALL 为驼峰 `originTaskRef`，遵循 FylloCode 持久化字段命名规范（见 `persist-field-naming-conventions` spec）；内存层（`Session.originTaskRef`）同样为驼峰 `originTaskRef`。

`originTaskRef` SHALL 为 write-once 字段：唯一写入者 SHALL 为 `chat-service.createSession`，在构造并落盘 session meta 时一次写入。系统 SHALL NOT 在创建之后的任何路径改写或清除该字段。为从类型层面钉死该约束，`SessionMetaPatch` 的 `Omit` 列表 SHALL 包含 `originTaskRef`（与 `sessionId`、`createdAt`、`tokenUsage` 并列），使字段级 patch 接口在编译期即禁止修改 `originTaskRef`。

`chat-service#toSession` SHALL 把 `meta.originTaskRef` 映射到 `Session.originTaskRef`，使 `chat:listSessions` 与 `chat:createSession` 等返回值一致地暴露该字段；未持久化时为 `undefined`。

会话未关联任务时 `originTaskRef` SHALL 为 `undefined`，且该 session meta SHALL 可被正常持久化与读取。

#### Scenario: createSession 携带 taskRef 时写入 originTaskRef

- **WHEN** `chat-service.createSession` 收到的入参含非空 `taskRef`
- **THEN** 构造的 session meta 含 `originTaskRef` 字段（驼峰 key），值等于入参 `taskRef`
- **AND** 与 meta 一次原子落盘

#### Scenario: 未携带 taskRef 时不写入该字段

- **WHEN** `chat-service.createSession` 收到的入参无 `taskRef`
- **THEN** 落盘的 session meta 不含 `originTaskRef`（或为 `undefined`）
- **AND** session meta 正常持久化

#### Scenario: 后续字段级更新不改写 originTaskRef

- **WHEN** 某 session 已持久化 `originTaskRef`
- **AND** 后续一次字段级 patch 写入 `acpSessionId`、`turnCount`、`title` 或 `configOptions`
- **THEN** 写回后的 session meta 仍保留原有 `originTaskRef` 不变
- **AND** `SessionMetaPatch` 类型不允许把 `originTaskRef` 作为 patch 字段传入

#### Scenario: listSessions 返回包含 originTaskRef

- **WHEN** renderer 调用 `chat:listSessions`
- **THEN** main 在 `toSession(meta, projectId)` 内把 `meta.originTaskRef` 映射为 `Session.originTaskRef`（未持久化时为 `undefined`）
