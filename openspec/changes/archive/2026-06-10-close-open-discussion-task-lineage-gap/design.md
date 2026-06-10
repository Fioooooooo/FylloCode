## Context

FylloCode 的 task → session → proposal 血缘已具备主干能力：

- 从任务页发起讨论时，`task.vue:startChatFromTask` 先调 `lineage:ensureTaskSubject` 写入 task 快照，再创建携带 `taskRef` 的 session，由 `chat:createSession` handler 调 `linkTaskSession` 建立 task→session 边。
- proposal 创建时，`mcp-event-consumer` 监听 MCP 事件并调 `recordProposal` 建立 session→proposal 边；找不到 subject 时用 `ensureChatSubject` 兜底再重试。

缺口在"开放讨论"路径：用户不经任务、直接在对话中讨论需求并创建 proposal。此时 session 在 proposal 落地时由 `ensureChatSubject` 建出一个 `origin: "chat"` 的 subject，但没有任何本地任务与之关联，血缘缺了任务源头。

现有相关约束（必须遵守或显式修改）：

- `system-reminder-injection` spec 已有 requirement「chat reminder 感知会话所针对的已存在任务」，其中一条 SHALL NOT 明确禁止在 reminder 注入标题/描述（"仅 ref 级别感知"）。本 change 需修改这条 SHALL NOT。
- reminder 只在新建 ACP session 时注入一次（绑定 `connection.newSession()` 成功），resume 不注入。
- `TaskItem` 现有可选字段 `proposalId` 从未被任何创建路径写入，是死字段；`TaskCard.vue` 有基于它的展示徽标，实际运行中永不显示。
- `SessionMeta.originTaskRef` 是 write-once 字段的既有范本：通过 `SessionMetaPatch = Omit<SessionMeta, "originTaskRef" | ...>` 在类型层堵死改写，唯一写入者为 `chat-service.createSession`。

## Goals / Non-Goals

**Goals:**

- 开放讨论路径下，agent 在创建 proposal 后能判断会话是否已绑定任务，未绑定时提示用户建任务并完成会话↔任务绑定。
- 新建任务回绑到当前会话的既有 chat subject（保持 `origin: "chat"`），不新建第二个 subject、不劈叉链路。
- 任务侧记录来源会话（`originSessionId`），使 task→session 边在 lineage 索引损坏时可从任务侧反推重建。
- reminder 给 agent 注入任务标题作为语义锚点，提升 agent 对"已绑定任务"的感知质量。

**Non-Goals:**

- 不在 reminder 注入任务**描述全文**（仍保留该禁止项，避免 reminder 退化为详情展示通道）。
- 不改动任务详情对用户的展示职责（仍由 `chat-origin-task-banner` 负责）。
- 不改动"从任务页发起讨论"的已绑定路径既有行为（除 reminder 注入标题外）。
- 不为 task→session 回绑失败引入实时重试/对账回路（依赖 `originSessionId` 让未来 `rebuildIndex` 可重建即可）。

## Decisions

### 决策 1：协调逻辑下沉到主进程，且放在 lineage 一侧

**选择**：新增主进程 channel `lineage:createSessionTask`，在 `lineage-service` 内一次性完成"创建本地任务 → 回绑会话 subject"，而非在 renderer 编排"先 `task:create` 再 `lineage:bind`"两步。

**理由**：

- 两段式会让"task 建好但没连上"的部分成功窗口横跨进程边界，renderer 要自己处理中间态与回滚。下沉后竞态收敛到主进程一处。
- 放 lineage 一侧顺依赖方向：`lineage-service` 本已 import task 类型（`LineageTaskSnapshot.snapshot` 即 `TaskItem`），由它调 task-service 不制造逆向依赖；反过来在 task-service 调 lineage 会让底层资源依赖上层血缘模块。

**备选**：renderer 两步编排（否决，竞态跨进程）；放 task-service 协调（否决，逆向依赖）。

### 决策 2：失败语义——建任务硬要求，回绑 best-effort

**选择**：`lineage:createSessionTask` 中，`createLocalTask` 失败则整个调用失败（fyllo-action 卡片标 failed）；`getBySession` / `backfillTask` 回绑失败则仅 `logger` 记录，仍返回已创建的 `TaskItem`（调用成功）。

**理由**：任务是用户的实际交付物，已落盘就不该因二级元数据（lineage 边）失败而被拖成失败态。这与现有 `linkTaskSession` / `recordProposal` 的 best-effort 容错思路一致——lineage 本就按"可重建、可后补"设计。

### 决策 3：回绑用 backfill 到既有 chat subject，origin 保持 chat

**选择**：回绑时先 `getBySession(sessionId)` 找到该会话的既有 subject，再 `backfillTask(subjectId, snapshot)` 把任务挂上；找不到 subject 时用 `ensureChatSubject(sessionId)` 兜底建出再挂。`backfillTask`→`attachTask` 只设置 subject 的 `task` 字段，不改 `origin`。

**理由**：开放讨论的 subject 起源是对话而非任务，`origin` 应保持 `"chat"`，正确反映血缘起源。backfill 后 `index.tasks["local:<taskId>"]` 指向同一 subject，`getByTask` 照常可用，链路不劈叉。

### 决策 4：移除 proposalId，新增 write-once originSessionId

**选择**：移除 `TaskItem.proposalId`（含 `CreateLocalTaskInput` / `UpdateTaskInput` / schema / `task-service` / `task-store` 读取兼容 / `TaskCard.vue` 徽标）；新增 `TaskItem.originSessionId?: string`，镜像 `originTaskRef` 的 write-once 范式。

**理由**：

- `proposalId` 从未被写入，是死字段；其 TaskCard 徽标永不显示，移除是清理死状态。
- `originSessionId` 让任务侧记录来源会话，补齐 task 路径相比 proposal 路径缺失的对账能力——`rebuildIndex` 未来可从任务侧扫 `originSessionId` 反推、重建 task→session 边。
- write-once 实现镜像 `originTaskRef`：`UpdateTaskInput`（task patch 类型）不包含 `originSessionId`，`applyPatch` 自然碰不到；唯一写入者为 `lineage:createSessionTask` 协调函数，普通 `createTask`/`updateTask` 路径不写不改。

**备选**：保留 proposalId 复用为关联字段（否决，语义不符且本就是死字段）；不加 originSessionId、回绑失败即永久丢失（否决，放弃了可重建性，与你"极端情况下可重建"诉求冲突）。

### 决策 5：reminder 注入任务标题（不含描述），修改既有 SHALL NOT

**选择**：reminder 在 `taskRef` 非空时，由 stream handler 用 `getByTask(originTaskRef)` 读出快照标题，经白名单变量注入 chat reminder；仍禁止注入描述全文。

**理由**：

- banner 与 reminder 服务不同消费者：banner 给人看（视觉锚点），reminder 给 agent 聚焦。当前 reminder 只给 agent `local:abc123` 这种不透明 ID，对 agent 无语义。
- 首轮 prompt 虽含标题描述，但会随对话变长被淹没/压缩；reminder 是每次新 session 注入一次的权威锚点，留存性不同。
- 注入标题而非全文，守住"reminder 不是详情展示通道"的原始意图。

**时序前提（已验证）**：`startChatFromTask` 中 `ensureTaskSubject`（写快照）先于 `sendMessage`→创建 session→`streamMessage`（构造 reminder）完成。故 reminder 构造点读 lineage 时，task 快照必然已存在，无需新增存储或改 SessionMeta 格式。

## Risks / Trade-offs

- **回绑 best-effort 失败导致血缘暂时断节** → 由 `originSessionId` 保证可由 `rebuildIndex` 从任务侧重建；失败有 `logger` 记录可观测。
- **proposalId 移除是 BREAKING（存储 + UI）** → 该字段从未写入、徽标永不显示，实际影响为零；读取层做向后兼容（旧文件含 `proposalId` 时忽略该字段，不报错）。
- **修改 system-reminder 既有 SHALL NOT 属契约级变更** → 通过 design 决策 5 显式记录意图边界（只放开标题、保留描述禁止项），spec delta 用 MODIFIED 完整替换该 requirement，避免歧义。
- **agent 分支判断依赖 reminder 文本** → 已绑定信号来自 reminder 是否含任务感知段落（taskRef 非空时注入）；未绑定时 reminder 无该段落，agent 据此走建任务分支。判断不依赖标题内容本身，标题仅为语义增强。

## Open Questions

无。范围与失败语义已在 Chat stage 收敛完毕。
