## Why

三个流式 IPC handler（`chat:stream:message`、`proposal:stageStream`、`proposal:archive`）目前只在 `done` 事件落盘已组装的 assistant 消息。当会话因 `error` 事件或用户主动 stop（port close / cancel）而非正常结束时，已经流式组装在内存中的 assistant 消息**不会落盘**。重启 FylloCode 后，用户在该会话的历史消息中看到的部分回复**永久丢失**。

## What Changes

- `chat:stream:message`（`electron/main/ipc/chat.ts`）：在 `error` 出口和 `runner.cancel` 出口各自落盘当前已组装的 assistant 消息（沿用现有 `assembler` + `appendMessage`）。
- `proposal:stageStream`（`electron/main/ipc/proposal-apply.ts`）：在 `error` 出口和 `runner.cancel` 出口各自落盘当前已组装的 assistant 消息（沿用现有 `assembler` + `appendApplyRunMessage`）；该 handler 既有的 runMeta `status` 状态机逻辑保持不变。
- `proposal:archive`（`electron/main/ipc/proposal-apply.ts`）：在 `error` 出口和 `runner.cancel` 出口各自落盘当前已组装的 assistant 消息（沿用现有 `assembler` + `appendArchiveMessage`）；该 handler 既有的 archive `status` 状态机逻辑保持不变。
- 去重依赖 `MessageAssembler.flush()` 的一次性所有权语义：首次调用取走消息并置空，后续调用返回 `null`，因此任意终止路径组合下同一条消息只落盘一次。
- 三处保持**对称的就近实现**，本次**不做**共用代码抽取（未来再考虑抽成通用底层能力）。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `ipc-streaming`: 现有规范只定义了 `done` 落盘（`#### Scenario: 流式完成`），对 `error` 与用户 stop（cancel）路径的 assistant 消息落盘行为是空白。本次新增一条 requirement，规定三个流式 handler 在**非 done 终止**时也必须持久化已组装的 assistant 消息，并明确去重语义。

## Impact

- **代码**：`electron/main/ipc/chat.ts`、`electron/main/ipc/proposal-apply.ts` 两个文件的流式 handler 出口分支。
- **测试**：`electron/main/__tests__/ipc/chat.spec.ts`、`electron/main/__tests__/ipc/proposal-apply.spec.ts` 增补 error / cancel 落盘用例。
- **不受影响**：`shared/types/chat.ts`（消息类型）、磁盘存储格式（`.messages.jsonl`）、渲染进程、preload、`MessageAssembler` 实现、apply runMeta / archive 状态机语义。被中断的消息当作普通 assistant 消息落盘，不新增"中断/出错"标记。
