## Context

三个流式 IPC handler 共享同一套流式协议（`makeStreamChannel`）和同一个内存组装器（`MessageAssembler`），但落盘逻辑只挂在 `done` 一个出口上：

- `chat:stream:message`（`electron/main/ipc/chat.ts:358-387`）
- `proposal:stageStream`（`electron/main/ipc/proposal-apply.ts:159-224`）
- `proposal:archive`（`electron/main/ipc/proposal-apply.ts:361-422`）

每个 handler 在 `onReady` 闭包内 `new MessageAssembler(...)`，流式事件经 `assembler.apply(ev)` 组装进 `currentMessage`，仅在 `done` 分支 `assembler.flush()` + 对应 append 函数落盘。`error` 分支只发 `sink.sendError`（apply/archive 额外更新状态机），`cancel` 分支（runner 的 `cancel()`）只 `session.cancel()` + `unregister`。两者都不落盘，导致非正常结束时内存中的 assistant 消息丢失。

### 终止路径事实（已逐行核对）

- **用户 stop**：renderer 关闭 port2 → main 的 `port1.on("close")`（`stream-channel.ts:97`）→ 调用 `runner.cancel()`。这是可靠的 remote close。
- **`streamCancel` / `stageStreamCancel` / `archiveCancel` IPC**：经 `sessionRegistry.cancel`（`session-registry.ts:37`）只调 `AcpSession.cancel()`，**不直接**经过 `runner.cancel`；其落盘最终仍由 port close 链路命中 `runner.cancel` 兜底。
- **`AcpSession.cancel()` 之后**：`acp-session.ts` 既不 emit `done` 也不 emit `error`（`runPrompt` 的 `sessionHandler` 在 `cancelled` 时 return；`handleStartError` 在 `cancelled` 时 suppress；`emitDone` 被 `throwIfCancelled` 拦截）。因此 stop 路径下，唯一还能访问 `assembler` 闭包的落盘点就是 `runner.cancel`。
- **`sendError` / `sendDone` 会本地 `port.close()`**（`stream-channel.ts:186-191` 的 `finalise`），而 `port1.on("close")` 又会调 `runner.cancel()`。即任何终止最终都可能再触发一次 `cancel`，故 `error`/`done` 与 `cancel` 的落盘动作存在重入，必须去重。

## Goals / Non-Goals

**Goals:**

- 三个 handler 在 `error` 与 `cancel` 出口都持久化已组装的 assistant 消息。
- 重启后能从 `.messages.jsonl` 读到被中断的部分回复。
- 任意终止路径组合下，同一条消息最多落盘一次。

**Non-Goals:**

- 不抽取三处共用代码（保持就近对称实现，未来再抽通用底层能力）。
- 不在数据上标记消息为"中断/出错"，不改 `shared/types/chat.ts`、不改存储格式、不改渲染端。
- 不改变 apply runMeta / archive 的 `status` 状态机语义（含"用户 stop 后 apply runMeta 停在 running"这一现状——属独立议题，本次不处理）。
- 不改 `AcpSession` 的取消语义（不新增 `aborted` 类 `SessionEvent`）。

## Decisions

### 决策 1：三个出口都落盘，靠 `flush()` 去重，而非单一落盘点

`error` 来自事件回调，`cancel` 来自 runner——代码中没有天然的单一汇聚点。要做成单一落盘点，需让 `AcpSession` 在 cancel 时也 emit 一个终止事件，这会新增 `SessionEvent` 变体并波及 exhaustive switch 与 mapper，跨多个文件，超出本次 scope。

因此选择：`done`（不动）、`error`、`cancel` 三个出口各自调用同一个就近的幂等落盘动作。

去重依赖 `MessageAssembler.flush()` 既有的一次性所有权语义（`message-assembler.ts:115-125`）：

```ts
flush() {
  if (!this.currentMessage) return null;   // 第二次进来必为 null
  const message = this.currentMessage;
  this.currentMessage = null;              // 同步置空，所有权交出
  return message;
}
```

`flush()` 是**同步**的，JS 单线程下不会交错。谁先 flush 拿到非 null 消息，谁就独占落盘责任；后续出口拿到 `null` 直接跳过。**正确性不依赖** "本地 `port.close()` 是否会触发自身 close handler" 这一 Electron 未明确行为——触发则第二次 flush 返回 null，不触发则本就只落盘一次，两种情况结果都对。

**备选（已否决）**：引入独立布尔标志 `persisted`。否决理由——`flush()` 本身已是 assembler 的去重不变式，额外标志只是又一处需与 flush 同步维护的状态，增加而非降低复杂度。

### 决策 2：每个 handler 内定义就近的 persist helper

在每个 `onReady` 闭包内，紧随 `const assembler = new MessageAssembler(...)` 之后定义一个本地异步函数，封装"flush + 对应 append + try/catch 日志"。三处各自独立、不共享，与本次"保持对称、暂不抽取"的约束一致。

- chat：`flush()` → `appendMessage(projectPath, sessionId, message)`
- stageStream：`flush()` → `appendApplyRunMessage(projectPath, form.changeId, form.stageIndex, message)`
- archive：`flush()` → `appendArchiveMessage(projectPath, form.changeId, message)`

helper 内 `flush()` 返回 `null` 时直接 return（不落空消息）。落盘失败 `catch` 后 `logger.error`，不向外抛、不阻断出口的终止动作。

### 决策 3：在出口分支以"附加动作"形式调用，不改既有状态逻辑

- `error` 分支：在既有动作（chat 的 `sink.sendError`；apply 的 `updateRunMetaIfCurrent(status:"error")`；archive 的 `persistArchiveStatus("error")`）旁，附加调用 persist helper。状态机更新与消息落盘相互独立，互不依赖执行结果。
- `cancel` 出口（runner 的 `cancel()` 回调）：在 `session.cancel()` 与 `sessionRegistry.unregister(...)` 之外，附加调用 persist helper。

调用方式用 `void persistXxx().catch(...)`（fire-and-forget + 兜底日志），与 handler 中既有的 `void updateRunMetaIfCurrent(...).catch(...)` 风格一致，避免把同步的 `cancel` 回调改成 async 改变其时序契约。

## Risks / Trade-offs

- **[本地 close 是否回调自身 close handler 未知]** → 不影响正确性：`flush()` 的所有权语义对"触发 / 不触发"两种情况都给出唯一一次落盘。设计刻意不依赖该行为。
- **[`cancel` 是 fire-and-forget，落盘可能在 unregister 之后才完成]** → 可接受：落盘只依赖闭包内的 `assembler`、`projectPath` 等已捕获变量与文件系统 append，不依赖 registry 注册态；`appendFile` 为追加写，无顺序耦合。
- **[stageStream 用户 stop 后 runMeta 仍停在 running]** → 本次明确不处理（Non-Goal）。本改动只补消息落盘，不改状态机；该现状在收尾说明中标注为后续独立议题。
- **[三处重复代码]** → 主动接受的权衡：用户要求保持对称、暂不抽取，便于未来统一抽成通用底层能力。

## Migration Plan

纯主进程行为补强，无数据迁移、无 schema 变更、无 breaking。历史已丢失的消息不可追回，但变更生效后新的中断都会落盘。回滚只需还原两个文件的 handler 改动。
