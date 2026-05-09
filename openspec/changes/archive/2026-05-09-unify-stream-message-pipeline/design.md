## Context

当前 FylloCode 有两条 AI 流式输出链路：

1. **Chat**（`chat:stream:message`）：`electron/main/ipc/chat.ts` 通过 `makeStreamChannel` 启动 `AcpSession`，把 `SessionEvent` 映射为 `MessageChunkData` 转发给渲染进程。**assistant 消息的组装与落盘由渲染进程在 `onDone` 内调 `chat:persistMessage` IPC 触发**；user message 由 renderer 的 `queueUserMessage` 在 `sendMessage` 入口即时通过 `chat:persistMessage` 落盘。
2. **Proposal Apply**（`proposal:stageStream`）：`electron/main/ipc/proposal-apply.ts` 同样用 `makeStreamChannel`，但**在主进程内部维护 `MessageAssembler`**，收到 `done` 后 `flush()` 出完整 assistant UIMessage 并通过 `appendApplyRunMessage` 写入 `stage-{N}.messages.jsonl`。stage 的用户输入（stage prompt）由 `stage-prompts.ts` 在主进程合成，**当前从未被落盘**。
3. **Proposal Archive**（`proposal:archive`）：纯流式，主进程不落盘、不持久化 meta。

渲染侧对应有两份组装逻辑：

- `frontend/src/stores/chat.ts#streamSessionMessage` 内联维护 `activeAssistantId` + chunk 归并；
- `frontend/src/stores/proposal-run.ts#applyChunk` 字面几乎相同的实现。

UI 渲染也不一致：

- chat：`frontend/src/components/chat/ChatContainer.vue` 使用 `UChatMessages` + `UChatTool` + `ChatComark`，通过 `isReasoningUIPart` / `isTextUIPart` / `isToolUIPart` 分派。
- proposal：`frontend/src/components/proposal/ProposalApplySidePanel.vue` 自己写 `v-for part`，只认 `text` 与 `dynamic-tool`。

主进程侧 `MessageAssembler` 实现位于 `electron/main/domain/chat/message-assembler.ts`；`electron/main/services/chat/message-assembler.ts` 是 re-export，目前只有 proposal-apply 使用，chat handler 并没引用。

存储布局：

- chat：`data/projects/<encoded>/sessions/<sessionId>.{json|messages.jsonl}`
- proposal：`data/projects/<encoded>/apply-runs/<changeId>/{run.json,stage-{N}.messages.jsonl}`

## Goals / Non-Goals

**Goals:**

- 把 assistant message 的组装与磁盘写操作统一收敛到主进程（两条链路都走 `MessageAssembler.flush()` → `appendMessage`/`appendApplyRunMessage`/`appendArchiveMessage`）。
- 把 user message 的持久化边界明确下来：chat 侧继续由渲染进程 `chat:persistMessage` 落盘（prompt 原文只存在于 renderer）；proposal 的 stage prompt 由主进程在 `stageStream` 启动时直接落盘，并通过一个新的 `user_message` chunk 推给 renderer 做实时展示。
- archive 按独立实体落盘（`archive.json` meta + `archive.messages.jsonl`），与 stage 语义解耦，支持 reload 恢复。
- 消除 `stores/chat.ts` 与 `stores/proposal-run.ts` 中重复的 `ensureAssistantMessage + applyChunk` 组装逻辑，抽成共享 composable `useUIMessageAssembler`。
- chat 主区域与 proposal SidePanel 的 `UIMessage.parts` 渲染共用同一个组件，通过 `type: "chat" | "side"` prop 预留样式扩展点，本次不做样式差异化。
- message id 规则：渲染端临时 id 与主进程 flush id 各自独立；reload 后 UI 以磁盘 id 为准；不做跨进程 id 比较。

**Non-Goals:**

- 不做 SidePanel 的视觉样式改动（仅对齐 parts 渲染通路，`type` prop 作为未来占位）。
- 不迁移历史存量 `stage-{N}.messages.jsonl`（老文件没有 user message 首行，读取时若首行不是 user 则不做合成）。
- 不改变 `MessageAssembler` 的组装规则本身（`text_delta` / `tool_call_start` / `tool_call_update` 的处理策略保持现状）。
- 不改变 `makeStreamChannel` 的 ready/cancel/error 握手协议。
- 不改 `chat:persistMessage` 的 channel 名与磁盘格式（只做语义收窄）。
- 不实现 message id 跨进程同步机制。

## Decisions

### D1：assistant message 一律由主进程落盘，渲染端仅驱动 UI

**选择**：chat 主进程 stream handler 引入 `MessageAssembler`，在 `text_delta / tool_call_start / tool_call_update` 分支里 `assembler.apply(ev)`；`done` 分支执行 `flush()` → `appendMessage`，之后再 `sink.sendDone`。渲染进程 `chat.ts#streamSessionMessage` 的 `onDone` 不再调 `persistMessage` 落盘 assistant。

**替代方案**：让 renderer 在 `onDone` 把组装好的 assistant 发回主进程落盘（现状）。放弃原因：(1) renderer 关闭时 assistant 会丢失；(2) 两套组装逻辑无法收敛；(3) 与 proposal 的做法不对称，无法共享 service-event-mapper 之外的代码。

**副作用**：chat `sessions/<sessionId>.messages.jsonl` 里 assistant 条目的 `id` 改为主进程 `generateId()` 产生，与渲染端显示时使用的临时 id 不同。按 D6 明确不做跨进程匹配。

### D2：chat user message 保留渲染端持久化路径

**选择**：chat 继续由 `stores/chat.ts#sendMessage` 在 `queueUserMessage` 之后调用 `chat:persistMessage` 落盘 user。`chat:persistMessage` channel 保留，入参校验在 `shared/schemas/ipc/chat.ts` 中收窄为 `message.role === "user"`。

**替代方案**：把 user message 并入 `chat:stream:message` 入参由 main 统一落盘。放弃原因：会扩大契约变更面，且 renderer 端已经需要在 UI 上即时 push user message，双写无价值。

### D3：proposal stage user message 由主进程落盘 + 实时推送

**选择**：`proposal:stageStream` handler 在 `onReady` 解析出 `prompt` 后，立即构造 `UIMessage<MessageMeta>`（`role: "user"`，`parts: [{ type: "text", text: prompt }]`，`metadata.sessionId = stageFylloSessionId`），通过 `appendApplyRunMessage` 写入 `stage-{N}.messages.jsonl`；同时通过新的 chunk kind `{ kind: "user_message"; message }` 推给 renderer。assembler 随后只处理 assistant 事件，`done` 时 flush assistant 并 append 到同一 jsonl 文件（追加）。

**替代方案 A**：不落盘 user、SidePanel 只显示 assistant。放弃原因：与 chat 不一致，且 reload 后看不到任何用户输入。
**替代方案 B**：user message 只落盘不推 chunk，renderer 通过 stage prompt 构造本地显示。放弃原因：renderer 需要知道 prompt 原文（目前由 main 的策略 Map 合成，renderer 并不拥有），否则要在 renderer 复制一份策略。

**副作用**：引入新 chunk kind，需要同步 `shared/types/ipc.ts`、`services/chat/session-event-mapper.ts` 的类型与分支、preload 回调类型、两端 store。`session-event-mapper` 本身不处理 user_message（它只映射 `SessionEvent`），user_message 由 IPC handler 直接 `sink.sendChunk` 推送。

### D4：archive 独立落盘，语义与 stage 解耦

**选择**：新增 `apply-runs/<changeId>/archive.json`（类型 `ArchiveRunMeta`：`{ runId, changeId, status: "running" | "done" | "error", startedAt, updatedAt }`）与 `apply-runs/<changeId>/archive.messages.jsonl`。`proposal:archive` handler 在 onReady 时：写 `archive.json`（`status: "running"`）→ 落盘 user message（archive prompt，`role: "user"`）→ 通过 `user_message` chunk 推给 renderer → 引入 `MessageAssembler` 收集 assistant → `done` 时 flush + append + 更新 `archive.json` 为 `done`。新增 `proposal:loadArchive`（读 `archive.json`）与 `proposal:loadArchiveMessages`（读 jsonl）两个 IPC。

**替代方案 A**：把 archive 追加到 `stage-{last}.messages.jsonl`。放弃原因：stage 含义被污染，stage 编号不再等价于 workflow 内的 stage。
**替代方案 B**：把 archive 作为隐式尾部 stage 写进 `run.json.stages`。放弃原因：改变 stage 数组的稳定语义（workflow 快照），影响 stage 进度条渲染与 stage index 计算。

### D5：resumeRun / resumeArchive 全量读盘渲染

**选择**：`loadApplyRunMessages` 返回的列表已经是 user + assistant 混合有序（按 jsonl 追加顺序），`stores/proposal-run.ts#resumeRun` 直接赋值给 `messages.value`，SidePanel 按序渲染即可。`resumeArchive` 类似，通过新增 IPC 读回 archive meta + messages。老版本 jsonl（没有 user 首行）兼容方式：直接按读到的内容渲染，缺 user 就缺。

### D6：message id 不跨进程同步

**选择**：

- renderer 在流式期间用 `generateId()` 生成临时 assistant id 驱动 UI（共享 composable 内部维护）。
- 主进程 `MessageAssembler.flush()` 使用自己 `generateId()` 生成最终落盘 id。
- reload / resume 时渲染端以磁盘返回 id 为准，清空并重建 UI 列表，不与活跃期的临时 id 做匹配。
- 任何代码禁止用 message id 做跨进程匹配（例如"收到 done 后把渲染端临时 id 改成主进程 id"这种逻辑不要写）。

**替代方案**：主进程在流首个 chunk 前先下发 id，两端统一。放弃原因：要改 chunk 协议、要在 assembler 里提前生成 id，收益小（仅美观）。

### D7：渲染端 UIMessage 组装抽为共享 composable

**选择**：`frontend/src/composables/useUIMessageAssembler.ts` 返回 `{ messages, applyChunk, reset, setMessages, activeAssistantId }`，内部封装 `ensureAssistantMessage` / 三个 chunk 分支 / `user_message` 分支（直接 `messages.push(chunk.message)`）。`chat` store 与 `proposal-run` store 各自持有一个实例，把 session.messages / run messages 的 ref 传入或复制。

**细节**：

- composable 本身返回 `Ref<UIMessage<MessageMeta>[]>`，由调用方自行决定如何对外暴露（chat store 继续通过 `activeSession.messages` 维持原接口，可让 chat store 把 composable 的 messages 合并进 activeSession.messages；或 chat store 把 activeSession.messages 作为 ref 提供给 composable 的 `setMessages` 初始化）。
- 不引入 Pinia store；composable 是纯函数工厂，避免循环依赖。

### D8：共享消息列表组件带 `type` prop

**选择**：新增 `frontend/src/components/shared/UIMessageList.vue`（命名在实现阶段可调，此处作占位），props：`{ messages: UIMessage<MessageMeta>[]; isStreaming: boolean; type: "chat" | "side" }`。内部复用现有 `isReasoningUIPart / isTextUIPart / isToolUIPart` 派发到 `UChatMessage` / `UChatTool` / `ChatComark`。`type` prop 本次不做样式差异化，仅作为 TS 接口预留；实现内部不要出现基于 `type` 的分支（无分支即无回归面）。

`ChatContainer.vue` 与 `ProposalApplySidePanel.vue` 改为使用该组件；SidePanel 保留自己的"stage 进度条 + 空态 + 流式指示"外壳，只把消息列表部分替换掉。

## Risks / Trade-offs

- **chat assistant 落盘时序变化** → renderer `onDone` 触发的 IPC 写盘变成主进程内联写盘，时序上更早（write 在 `sink.sendDone` 之前）。Mitigation：`wrapHandler` 外围的 `try/catch` 已覆盖；落盘失败用 `APPLY_RUN_PERSIST_FAILED`（chat 侧需引入类似的 `CHAT_PERSIST_FAILED` 错误码 → 评估后决定复用 `ACP_ERROR` 还是新增）。→ 决定：本次**不新增**错误码，落盘失败走 `ACP_ERROR`（现有错误码联合），与 proposal 侧的 `APPLY_RUN_PERSIST_FAILED` 保持语义区分。
- **renderer 临时 id 与磁盘 id 不一致** → 若后续有"高亮最新消息"之类基于 id 的业务逻辑跨 reload，会失效。Mitigation：在组件内部只用 `v-for :key="message.id"` 驱动 DOM，不把 id 作为业务状态外抛。
- **user_message chunk 引入** → 所有消费 `MessageChunkData` 的 switch 必须新增分支。Mitigation：用 TypeScript 的穷尽检查（discriminated union），编译期发现漏处理。
- **archive 落盘引入 meta 文件** → 已完成但未归档的旧 changeId 目录下不会有 `archive.json`，`loadArchive` 返回 `null` 即可，不视为错误。
- **stage jsonl 向后兼容** → 老 run（无 user 首行）按实际内容渲染，不做迁移脚本。
- **共享组件窄宽度表现** → `UChatMessages` 本是为 chat 主区设计，SidePanel 宽度 `w-96`。Mitigation：实现阶段抽组件时先在浏览器里验证 SidePanel 内的 message/tool 渲染不溢出，若 `UChatMessages` 容器在窄宽下强制宽度，退化为手写外层容器仅复用 part 分派与 `ChatComark`。

## Migration Plan

1. 合并 spec delta 后先实现主进程侧（chat assembler 接管 + proposal user message 落盘 + archive 落盘 + 新 IPC）。
2. 引入 `user_message` chunk kind 及相关类型，同时升级两端 store 处理新 kind。
3. 抽 `useUIMessageAssembler` composable，先让 proposal-run store 切过去并跑通（改动面小、只有 SidePanel 消费），再切 chat store。
4. 抽共享消息列表组件，先替换 SidePanel 再替换 ChatContainer。
5. 历史数据不迁移；`status === "applying"` 的存量 proposal 仍可 resume，但 stage jsonl 没有 user 首行（SidePanel 不显示用户 prompt，仅显示 assistant，预期行为）。

## Open Questions

（无，四个前置问题已在对话中确认：A、A、独立落盘、共享组件带 type prop 不做样式差异化。）
