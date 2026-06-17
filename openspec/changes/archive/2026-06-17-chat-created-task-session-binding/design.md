## Context

当前系统通过 `originTaskRef` 记录会话发起时所针对的上游任务，并在 `ChatContainer` 顶部通过 `OriginTaskBanner` 展示该任务。`originTaskRef` 在 `session-meta-storage` spec 中被定义为 write-once 字段，唯一写入位置是 `chat-service.createSession`。

与此同时，`fyllo-action` 的 `task.create` 类型允许 Agent 在对话过程中引导用户创建本地任务。该任务通过 `lineage:createSessionTask` 创建后，会被写入任务存储（`data/projects/<encoded>/tasks/tasks.json`）和 lineage subject，但**不会**更新 session meta。因此：

- session meta 中没有记录该会话当前绑定的任务；
- `OriginTaskBanner` 无法回显该任务。

本 change 的目标是把 `originTaskRef` 的语义扩展为「当前会话绑定的任务」，并允许 `createSessionTask` 成功后更新它，同时保持写入入口受控。

## Goals / Non-Goals

**Goals:**

- 让 `fyllo-action task.create` 创建的任务成为当前会话的绑定任务。
- 把绑定关系持久化到 session meta 的 `originTaskRef` 字段。
- `OriginTaskBanner` 能够展示当前绑定任务（无论是上游来源还是会话中创建）。
- 限制 `originTaskRef` 的写入入口，只允许 `createSession` 初始化和 `createSessionTask` 更新。

**Non-Goals:**

- 不支持一个 session 同时绑定多个任务；新的绑定会覆盖旧的。
- 不改变 lineage subject 的存储结构或查询接口。
- 不修改任务本身的 CRUD 行为（`task-service` 保持不变，除了传入 `originSessionId` 已存在）。
- 不扩展 `OriginTaskBanner` 的视觉样式，仅变更数据源语义。

## Decisions

### 1. 复用 `originTaskRef` 字段承载当前绑定任务

**选择**：不解绑「来源任务」和「创建任务」为两个字段，而是把 `originTaskRef` 扩展为「当前会话绑定的任务」。

**理由**：

- `OriginTaskBanner` 只需要展示一个任务，复用现有字段改动最小。
- 用户明确要求 UI 与 `OriginTaskBanner` 保持一致，并且绑定到 `originTaskRef`。
- 一个 session 只绑定一个 task，单值字段足够。

### 2. 通过专用函数 `updateSessionOriginTaskRef` 写入，通用 patch 仍禁止

**选择**：在 `session-store.ts` 中新增 `updateSessionOriginTaskRef(projectPath, sessionId, originTaskRef)`，而 `SessionMetaPatch` 继续 omit `originTaskRef`。

**理由**：

- 满足用户「只允许两个位置修改」的约束。
- 防止其他模块通过通用 `patchSessionMeta` 误改绑定关系。
- `createSession` 不经过 patch，它通过 `createSessionMeta` 一次性写入完整 meta，天然受限。

### 3. `createSessionTask` 在主进程完成 `originTaskRef` 更新

**选择**：`lineage-service.createSessionTask` 在任务创建并绑定到 lineage subject 后，调用 `updateSessionOriginTaskRef` 更新 session meta。

**理由**：

- 写 meta 是持久化边界内操作，应集中在主进程。
- renderer 只负责触发 action，更新成功后通过重新加载 session 列表或刷新当前 session 来回显。

### 4. renderer 通过刷新 session 列表来回显新任务

**选择**：不直接修改 `useFylloActionDispatcher` 的返回类型，而是在 `createSessionTask` 成功后让 `sessionStore` 刷新当前 session 的 meta（或重新加载 sessions），从而更新 `activeSession.originTaskRef` 和 `taskInfoBySessionId`。

**理由**：

- 保持 `FylloActionShell` 的通用性，不因为 task.create 引入特殊回显逻辑。
- `OriginTaskBanner` 已经基于 `originTaskRef` 和 `taskInfoBySessionId` 工作，刷新后即可自动回显。

## Risks / Trade-offs

| Risk                                                                       | Mitigation                                                                                                                                |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `originTaskRef` 语义改变后，依赖「来源任务」只读假设的代码可能受影响       | 搜索所有 `originTaskRef` 使用点，确认只有 `createSession`、`toSession`、`OriginTaskBanner`、`mergeSessionMeta` 等读取逻辑；无其他写入者。 |
| 通用 patch 接口被绕过，导致约束失效                                        | `SessionMetaPatch` 继续 omit `originTaskRef`；新增专用函数不暴露为通用 patch 字段。                                                       |
| 会话中创建多个任务时，旧任务被覆盖，用户无法在 banner 看到历史             | 这是设计选择（一个 session 只绑定一个 task）。历史任务仍可通过 lineage subject 和任务面板查看。                                           |
| `createSessionTask` 写 meta 失败但任务已创建，导致任务存在但 banner 不回显 | 任务创建和 meta 更新是顺序执行；meta 更新失败应记录 warning，action card 进入 failed 状态，用户可以重试。                                 |
