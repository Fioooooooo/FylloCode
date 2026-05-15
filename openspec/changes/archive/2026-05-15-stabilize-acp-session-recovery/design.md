## Context

`AcpSession.start()` 当前仅依据一个持久化字段 `acpSessionId` 来决定 session 生命周期行为。这个策略在第一版 ACP 集成里足够简单，但它把 FylloCode 的磁盘元数据与 agent 进程里的实时内存 session 混为一谈。应用重启或 agent 进程重启后，磁盘上的 `acpSessionId` 仍然存在，但 adapter 侧可能已经忘记了对应的 live session，于是用户的下一轮消息会在真正开始工作前就失败。

当前约束并不均匀：

- ACP adapter 不提供统一的恢复能力。有的支持 `resumeSession`，有的只支持 `loadSession`，还有的不会用 `resource_not_found`，而是直接抛普通 JSON-RPC 错误。
- FylloCode 已经为 chat / apply / archive 场景持久化了组装后的 UI 历史，但这些历史不是 ACP session 的逐字节快照，无法无损回放。
- `loadSession` 会触发历史 `session/update` 回放；当本地没有历史时这很有价值，但当 FylloCode 已经拥有本地权威历史时，这些 replay 反而会造成重复消息。

因此，这次变更会同时影响 `AcpSession`、进程能力缓存以及流式事件分发，但它仍应收敛在 ACP 集成边界内，不应为此引入一套泛化的“工作流恢复引擎”。

## Goals / Non-Goals

**Goals:**

- 让 session 复用在应用重启和 agent 进程重启后仍然可恢复，而不假设所有 ACP adapter 都表现一致。
- 让恢复顺序由 initialize 协商出的 capability 决定，而不是写死 `resumeSession` 优先。
- 只有当 prompt 失败被明确归类为 “missing session”，且当前 turn 尚未产出任何 ACP update 时，才自动进入恢复流。
- 当 FylloCode 已经拥有目标 session 的本地持久化历史时，抑制 `loadSession` 的历史 replay。
- 提供一个确定性的最终兜底：当 ACP 原生恢复不可用时，创建新的 ACP session，并基于本地历史重建上下文。
- 保持代码可读、边界清楚：使用小而聚焦的 helper 组织恢复判定和 replay 处理，但不为未来未知的 ACP 差异预先搭建过度抽象。

**Non-Goals:**

- 不尝试从本地 UIMessage 历史中精确还原 agent 内部 session state。
- 不构建一个跨 agent 的大一统错误归一化层，把所有 ACP 错误都改写成全新的内部错误体系。
- 本次变更不新增面向 renderer 的恢复进度 IPC 协议。
- 不做基于内容对比的 `loadSession` replay 去重；replay 抑制采用阶段门控。

## Decisions

### 1. 为每个 live agent 进程缓存协商后的 ACP capabilities

`acp-process-pool.ts` 已经执行了 `initialize()`。本次会把返回的 `InitializeResponse` 与 live connection 一起缓存，这样 `AcpSession` 就能直接判断当前 adapter 是否支持 `session.resume`、`loadSession`、`session.list` 等能力。

原因：

- 恢复顺序必须由 capability 驱动，才能同时兼容 Claude ACP、Codex ACP、Gemini CLI 这类能力集不一致的 adapter。
- 这能避免在每次恢复失败时通过“先调一下试试”去探测未支持的方法。

备选方案：

- 在恢复阶段重新执行 `initialize()`，或直接乐观调用方法探测能力。
  不采用，因为这会增加失败噪音、重复握手信息，也不会比缓存已协商结果更正确。

### 2. 对持久化 `acpSessionId` 采用 direct-prompt-first 语义

当 FylloCode 已经持久化了 `acpSessionId` 时，`AcpSession.start()` 将先直接尝试 `connection.prompt()`，而不是立刻调用 `resumeSession` 或 `loadSession`。

原因：

- 最常见的健康路径是“同一个 live agent 进程仍然持有这个 session”，这时 direct prompt 成本最低，也最接近“继续当前会话”的真实语义。
- 这符合多个 adapter 纯内存维护 active session 的事实模型。

备选方案：

- 只要存在 `acpSessionId` 就始终先走 `resumeSession`。
  不采用，因为它会在最常见的 live-session 场景里引入额外恢复流量，而且对把 direct prompt 视为正确路径的 adapter 没有帮助。

### 3. 仅在“当前 turn 尚未产出任何更新”且错误被归类为 missing-session 时进入恢复流

`AcpSession` 会跟踪当前 turn 是否已经观察到任何 `session/update`。只有同时满足以下两个条件，失败的 direct prompt 才会进入恢复流：

- 当前 turn 尚未观察到任何 ACP update
- 抛出的错误命中了 FylloCode 的 missing-session 分类器

分类器将优先使用结构化信号，其次回退到一个短小的已知签名白名单，例如：

- `resource_not_found` / `-32002`
- `-32602` with `Session not found`
- `-32603` with `Session not found`
- details containing `No conversation found with session ID`

原因：

- 一旦 tool call 或 assistant 输出已经开始，mid-turn retry 就不安全。
- 与宽泛的模糊匹配相比，一个小而明确的白名单更容易推理，也更便于随着 ACP adapter 演进逐步扩充。

备选方案：

- 对所有 prompt 失败都自动重试。
  不采用，因为鉴权失败、限流、模型错误、工具错误都会被错误地重试，并可能导致副作用重复执行。

### 4. 恢复顺序由 capability 决定：先 resume，再 load，最后本地历史兜底

进入恢复流后，FylloCode 的顺序为：

1. 若 adapter 声明了 `session.resume`，调用 `resumeSession`
2. 若不支持 resume，或 resume 仍以 missing-session 失败，且 adapter 声明了 `loadSession`，调用 `loadSession`
3. 若两者都失败，则创建 fresh ACP session，并基于 FylloCode 本地持久化历史重建上下文

每个恢复阶段在单个 turn 内最多只尝试一次。

原因：

- 在支持 resume 的 adapter 上，这保留了 ACP 更轻量的 resume 语义。
- 对只实现 `loadSession` 的 adapter 依然兼容。
- 即使 ACP 原生恢复完全不可用，最终兜底也能给用户一条继续工作的路径。

备选方案：

- 无论如何都先调 `loadSession`，因为语义更显式。
  不采用，因为真正支持 resume 的 adapter 不应该被强制进入 replay 或更重的恢复流程。

### 5. 当本地历史已存在时，对 `loadSession` replay 采用阶段性抑制

在执行 `loadSession` 时，如果调用方已经拥有目标 session 的本地持久化历史，`AcpSession` 会进入一个临时 replay-suppression 阶段。在该阶段：

- 消息流事件（`text_delta`、`reasoning_delta`、tool call 事件、usage update，以及任何 user-message replay）都会被 UI 组装和磁盘持久化逻辑忽略
- session 级元数据事件（`available_commands_update`、`session_info_update`）仍然继续透传

`loadSession` 完成后，该阶段结束，随后再按正常流程发起当前用户 turn。

原因：

- 对于重启后的 FylloCode，本地持久化历史已经是权威 UI 数据源。
- 与尝试按内容对比去重相比，阶段性抑制更简单，也更可靠。

备选方案：

- 尝试把 replay 事件与本地消息逐条合并或去重。
  不采用，因为本地存的是组装后的 UIMessage，而不是原始 ACP event stream，精确对齐会非常脆弱。

### 6. 最终兜底路径明确为 “双 `system-reminder` + best-effort 上下文重建”

如果 ACP 原生恢复全部失败，FylloCode 会启动一个 fresh ACP session、持久化新的 `acpSessionId`，然后在真正的用户文本之前连续发送两条 `system-reminder`：

1. 现有 new-session 路径 already 使用的 `reminderPart`
2. 新增的一条“历史转录 reminder”，文本内容由 FylloCode 从本地持久化消息中提取并包裹为：

```text
<system-reminder>
请根据一下对话历史，继续与用户进行对话
assistant: ...
user: ...
</system-reminder>
```

这第二条 reminder 表达的是 best-effort transcript 交接，而不是协议级的逐轮历史回放。

原因：

- 在能力不一致的 ACP adapter 之间，这是唯一通用的兜底方式。
- 将历史重建限制在额外的 `system-reminder` 内，可以复用前端现有“隐藏 system-reminder UI 展示”的边界，不必引入新的消息类型。
- 明确把它命名为 best-effort，有助于统一预期，避免未来代码误把它当成无损恢复。

备选方案：

- 把所有本地 UI 消息逐条重新喂回 ACP。
  不采用，因为 ACP 的 prompt 请求表达的是“当前用户消息”，不是一个可移植的多轮 session 序列化日志。

补充约束：

- 两条 `system-reminder` 都允许被持久化到本地消息文件。
- 由于前端已经屏蔽 `system-reminder` 的消息 UI 展示，这两条 reminder 虽然会持久化，但不会对用户形成可见历史噪音。

## Risks / Trade-offs

- [已知 adapter 未来可能出现新的 missing-session 错误签名] → 将分类器保持为集中且小型的单点实现，后续新增签名时不需要改动恢复状态机本身。
- [`loadSession` replay 抑制可能会错过某些嵌在消息流里的有用元数据] → 保留 session 级元数据更新透传，并把抑制范围严格限制在恢复阶段。
- [best-effort 重建后的模型行为可能与原始 session 不完全一致] → 在设计和 spec 中明确其仅为 fallback 行为，且只在 ACP-native 恢复耗尽后使用。
- [能力缓存可能在 agent 重启后过期] → capability 以 live process entry 为单位缓存；当进程池重启 agent 时，用新的 initialize 响应覆盖旧值。

## Migration Plan

- 不需要做持久化数据迁移。
- 现有 `acpSessionId` 会继续保留在 session metadata 中，并继续作为恢复线索使用。
- 回滚路径直接：恢复旧的 `newSession/resumeSession` 行为，并忽略新增的 capability 缓存与 replay suppression 标志即可。

## Open Questions

- 历史转录 reminder 中 assistant / user 消息的截取和压缩策略，可以保留为实现期选择，只要外部契约仍然是“包裹在 `<system-reminder>` 中的 best-effort 本地历史重建”。
- 如果未来 ACP adapter 在 missing-session 错误码上逐渐收敛，FylloCode 可以在不改变本 proposal 外部行为的前提下简化分类器。
