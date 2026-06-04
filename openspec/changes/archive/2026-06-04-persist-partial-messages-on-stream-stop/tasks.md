## 1. chat:stream:message 落盘补强

- [x] 1.1 在 `electron/main/ipc/chat.ts` 的 `ChatStreamChannels.streamMessage` handler 的 `onReady` 闭包内，紧随 `const assembler = new MessageAssembler(sessionId);`（约 `chat.ts:270`）之后，新增本地异步函数 `persistAssembledAssistantMessage`：调用 `assembler.flush()`，返回非 `null` 时调用 `appendMessage(projectPath, sessionId, message)`；整体包 `try/catch`，失败时 `logger.error("[chat] failed to persist partial assistant message on stop", error)`，不向外抛。`flush()` 返回 `null` 时直接 return（不落空消息）。验收：函数仅依赖闭包已捕获的 `assembler` / `projectPath` / `sessionId`，不新增模块级状态。
- [x] 1.2 在 `case "error"` 分支（`chat.ts:384`）的 `sink.sendError(...)` 之前，附加 `void persistAssembledAssistantMessage();`。保留既有 `sink.sendError(mapAcpErrorCode(ev.code), ev.message)` 与 `sessionRegistry.unregister("chat", sessionId)` 不变。验收：error 时先尝试落盘再发错误，落盘失败不阻断 sendError。
- [x] 1.3 在 runner 的 `cancel` 回调（`chat.ts:400-403`）内，于 `session.cancel();` 之后、`sessionRegistry.unregister("chat", sessionId);` 之前，附加 `void persistAssembledAssistantMessage();`。验收：cancel 出口落盘，且 `cancel` 回调签名保持同步（用 `void ...` fire-and-forget，不改为 async）。
- [x] 1.4 确认 `done` 分支（`chat.ts:358-373`）逻辑不变，仍是 `assembler.flush()` + `appendMessage`，依赖 `flush()` 幂等保证与新出口不重复落盘。

## 2. proposal:stageStream 落盘补强

- [x] 2.1 在 `electron/main/ipc/proposal-apply.ts` 的 `ProposalChannels.stageStream` handler 的 `onReady` 闭包内，紧随 `const assembler = new MessageAssembler(fylloSessionId);`（约 `proposal-apply.ts:124`）之后，新增本地异步函数 `persistAssembledStageMessage`：`assembler.flush()` → 非 `null` 时 `appendApplyRunMessage(projectPath, form.changeId, form.stageIndex, message)`；包 `try/catch`，失败 `logger.error("[proposal-apply] failed to persist partial stage message on stop", error)`，不外抛。
- [x] 2.2 在 `case "error"` 分支（`proposal-apply.ts:207-217`）内，于既有 `void updateRunMetaIfCurrent(... status: "error" ...)` 与 `sink.sendError(...)` 之外，附加 `void persistAssembledStageMessage();`。验收：runMeta 仍被置为 `"error"`，消息落盘作为独立附加动作，二者互不依赖。
- [x] 2.3 在 runner 的 `cancel` 回调（`proposal-apply.ts:242-245`）内，于 `session.cancel();` 之后、`sessionRegistry.unregister("apply", form.runId);` 之前，附加 `void persistAssembledStageMessage();`。验收：cancel 回调保持同步。
- [x] 2.4 确认 `done` 分支（`proposal-apply.ts:179-206`）的 `assembler.flush()` + `appendApplyRunMessage` 与 `updateRunMetaIfCurrent`（推进 `currentStageIndex` / `status`）逻辑保持不变。

## 3. proposal:archive 落盘补强

- [x] 3.1 在 `electron/main/ipc/proposal-apply.ts` 的 `ProposalChannels.archive` handler 的 `onReady` 闭包内，紧随 `const assembler = new MessageAssembler(fylloSessionId);`（约 `proposal-apply.ts:334`）之后，新增本地异步函数 `persistAssembledArchiveMessage`：`assembler.flush()` → 非 `null` 时 `appendArchiveMessage(projectPath, form.changeId, message)`；包 `try/catch`，失败 `logger.error("[proposal-archive] failed to persist partial archive message on stop", error)`，不外抛。
- [x] 3.2 在 `case "error"` 分支（`proposal-apply.ts:402-411`）内，于既有 `persistArchiveStatus("error")` 与 `sink.sendError(...)` 之外，附加 `void persistAssembledArchiveMessage();`。验收：archive `status` 仍被置为 `"error"`，消息落盘作为独立附加动作。
- [x] 3.3 在 runner 的 `cancel` 回调（`proposal-apply.ts:428-431`）内，于 `session.cancel();` 之后、`sessionRegistry.unregister("archive", sessionKey);` 之前，附加 `void persistAssembledArchiveMessage();`。
- [x] 3.4 确认 `done` 分支（`proposal-apply.ts:381-401`）的 `assembler.flush()` + `appendArchiveMessage` + `persistArchiveStatus("done")` 逻辑保持不变。

## 4. 测试

- [x] 4.1 在 `electron/main/__tests__/ipc/chat.spec.ts` 仿照既有 `it("persists assembled assistant message before sending done", ...)`（`chat.spec.ts:272`）的事件驱动模式，新增用例：组装一条 assistant 消息（`mocks.assemblerFlush` 返回非 null），触发 `mocks.eventHandler!({ type: "error", code: "ACP_ERROR", message: "boom" })`，断言 `mocks.appendMessage` 被调用一次且参数为 `(projectPath, sessionId, message)`，同时 `sink.sendError` 仍被调用。
- [x] 4.2 在 `chat.spec.ts` 新增 cancel 用例：取得 handler 返回 runner 的 `cancel()` 并调用，断言 `mocks.appendMessage` 被调用一次、`mocks.cancel`（AcpSession.cancel）被调用。
- [x] 4.3 在 `chat.spec.ts` 新增去重用例：先 `eventHandler({ type: "error", ... })` 落盘（`assemblerFlush` 首次返回 message、再次返回 `null`），随后调用 runner 的 `cancel()`，断言 `mocks.appendMessage` 仅被调用一次。
- [x] 4.4 在 `chat.spec.ts` 新增空消息用例：`mocks.assemblerFlush` 返回 `null` 时触发 error / cancel，断言 `mocks.appendMessage` 未被调用。
- [x] 4.5 在 `electron/main/__tests__/ipc/proposal-apply.spec.ts` 仿照既有 `it("updates archive meta before sending stream errors", ...)`（`proposal-apply.spec.ts:270`）模式，为 stageStream 新增 error / cancel 落盘用例：断言 `mocks.appendApplyRunMessage` 在 error 与 cancel 出口各落盘，且 `updateRunMetaIfCurrent` 的 `status: "error"` 行为不受影响。
- [x] 4.6 在 `proposal-apply.spec.ts` 为 archive 新增 error / cancel 落盘用例：断言 `mocks.appendArchiveMessage` 在两出口落盘，且 `persistArchiveStatus`（archive meta `status: "error"`）行为不受影响。
- [x] 4.7 在 `proposal-apply.spec.ts` 各加一条去重用例（stageStream、archive）：error 落盘后再 cancel，断言对应 append 函数仅调用一次。
- [x] 4.8 运行 `pnpm typecheck` 与 `pnpm test`，确认全部通过。

## 5. 规范与文档

- [x] 5.1 评估并更新仓库 guidelines：在 `guidelines/IPC.md` 的流式 handler 相关章节增补一条约定——"三个流式 handler（chat / stageStream / archive）的 `done` / `error` / `cancel` 三个终止出口必须对称地落盘已组装的 assistant 消息，去重依赖 `MessageAssembler.flush()` 的一次性所有权语义；当前为就近对称实现，未来可抽取为通用底层能力"。若 `guidelines/IPC.md` 无合适章节，则在 `guidelines/MainProcess.md` 的流式/会话相关章节记录。验收：guideline 明确点出三出口对称与 flush 去重两点。
- [x] 5.2 在收尾说明中记录一项未纳入本次 scope 的后续议题：`proposal:stageStream` 用户 stop 后 apply runMeta 的 `status` 仍停在 `"running"`（cancel 出口不更新状态机），属独立议题，需单独提案讨论该 cancel 态语义与 UI 表现。
