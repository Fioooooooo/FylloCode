# ipc-streaming 规范

## Purpose

IPC 流式通信规范定义 AI 聊天 MessagePort 流式输出、流式 chunk 消息语义和事件订阅模式。

## Requirements

### Requirement: AI 聊天流式输出使用 MessagePort 通信

AI 聊天的流式响应 SHALL 通过 MessagePort 传输。Preload SHALL 为每次 `window.api.chat.streamMessage(...)` 调用生成一个不透明且在当前 renderer 进程内唯一的 `streamId`，并在 `chat:stream:message` invoke payload 中传给 main。Main 进程创建 `MessageChannelMain` 后，SHALL 将 port2 通过 `postMessage` 传递给 renderer，并在该 port 事件 payload 中携带同一个 `streamId`；preload SHALL 只把该 MessagePort 绑定到 `streamId` 匹配的 pending stream，在 port1 上逐 chunk 推送数据。

#### Scenario: 发起流式聊天

- **WHEN** renderer 调用 `window.api.chat.streamMessage(sessionId, prompt, callbacks)`
- **THEN** preload 生成 `streamId`
- **AND** preload 调用 `ipcRenderer.invoke('chat:stream:message', { sessionId, prompt, streamId, ... })` 发起流式请求
- **AND** main 创建 MessagePort 并通过 `event.sender.postMessage('chat:stream:port', { streamId }, [port2])` 传递给 renderer
- **AND** preload 将该 port 绑定到相同 `streamId` 的 callbacks

#### Scenario: 多个 chat stream 端口乱序到达

- **WHEN** preload 已发起 stream A 与 stream B，分别生成 `streamId: "A"` 和 `streamId: "B"`
- **AND** main 先发送 `{ streamId: "B" }` 的 `chat:stream:port`
- **THEN** preload 只为 stream B 注册该 port 的 `onmessage`
- **AND** stream A 的 callbacks 不会收到 stream B 的 chunk/done/error

#### Scenario: 流式完成

- **WHEN** AI 服务完成响应
- **THEN** main 通过 port1 发送 `{ type: 'done', data: { totalTokens: number } }`
- **AND** 关闭 port1
- **AND** preload 层调用该 `streamId` 对应的 `callbacks.onDone(data)` 回调
- **AND** preload 清理该 `streamId` 的 pending stream 记录

#### Scenario: 流式错误

- **WHEN** AI 服务返回错误
- **THEN** main 通过 port1 发送 `{ type: 'error', data: { code: string, message: string } }`
- **AND** 关闭 port1
- **AND** preload 层调用该 `streamId` 对应的 `callbacks.onError(error)` 回调
- **AND** preload 清理该 `streamId` 的 pending stream 记录

### Requirement: 接收流式 chunk

系统 SHALL 通过 MessagePort 传输 `StreamMessage<MessageChunkData>` 类型的消息，其中 `MessageChunkData` 为联合类型，支持 `text_delta`、`reasoning_delta`、`tool_call_start`、`tool_call_update`、`session_info_update`、`user_message`、`available_commands_update`、`usage_update`、`status` 九种 chunk 语义。Preload 层的 `StreamCallbacks.onChunk` 回调参数类型 SHALL 更新为新的 `MessageChunkData`。

`MessageChunkData` 定义：

```typescript
type AcpAvailableCommand = {
  name: string;
  description: string;
  hint?: string;
};

type MessageChunkData =
  | { kind: "text_delta"; text: string }
  | { kind: "reasoning_delta"; text: string }
  | { kind: "tool_call_start"; toolCallId: string; title: string; toolKind: string }
  | {
      kind: "tool_call_update";
      toolCallId: string;
      status: "in_progress" | "completed" | "failed";
      input?: Record<string, unknown>;
      content?: string;
    }
  | {
      kind: "usage_update";
      used: number;
      size: number;
      cost?: { amount: number; currency: string };
    }
  | { kind: "session_info_update"; title: string }
  | { kind: "user_message"; message: UIMessage<MessageMeta> }
  | { kind: "available_commands_update"; commands: AcpAvailableCommand[] }
  | { kind: "status"; agentStatus: ChatStatus };
```

`user_message` 分支 SHALL 由 `proposal:stageStream` / `proposal:archive` handler 在流启动初期直接通过 sink 发送（不经 `session-event-mapper`，因为 user message 源自主进程落盘动作，不是 ACP `SessionEvent`）。`chat:stream:message` handler SHALL NOT 发送 `user_message` chunk（chat 的 user message 由渲染进程本地 push + `chat:persistMessage` 落盘）。

`reasoning_delta` 分支 SHALL 由 `acp-mapper` 从 ACP `agent_thought_chunk` 映射产生，经 `session-event-mapper` 透传为 chunk；`chat:stream:message` / `proposal:stageStream` / `proposal:archive` 三处 handler 均 SHALL 将该事件分派到 `MessageAssembler.apply` 与 sink.sendChunk 双通路。

`available_commands_update` 分支 SHALL 由 `acp-mapper` 从 ACP `available_commands_update` 映射产生，经 `session-event-mapper` 透传为 chunk；仅 `chat:stream:message` handler SHALL 将该 chunk 透传到渲染端（绕过 `MessageAssembler`），并同时通过 `session-store` 的统一 session meta 更新入口将 commands 持久化到当前 session meta 的 `available_commands` 字段；`proposal:stageStream` / `proposal:archive` handler SHALL 对该事件显式忽略（不进 assembler、不透传、不写磁盘）。

所有消费 `MessageChunkData` 的 switch/分支 SHALL 处理 `reasoning_delta` 与 `available_commands_update` 分支；TypeScript 穷尽检查 SHALL 在编译期发现漏处理。

#### Scenario: 接收 text_delta chunk

- **WHEN** main 进程从 ACP agent 收到文本增量
- **THEN** 通过 port1 发送 `{ type: "chunk", data: { kind: "text_delta", text: string } }`
- **AND** preload 层调用 `callbacks.onChunk({ kind: "text_delta", text })` 回调

#### Scenario: 接收 reasoning_delta chunk

- **WHEN** main 进程从 ACP agent 收到 `agent_thought_chunk`，经 mapper 产出 `reasoning_delta` 事件
- **THEN** 通过 port1 发送 `{ type: "chunk", data: { kind: "reasoning_delta", text: string } }`
- **AND** preload 层调用 `callbacks.onChunk({ kind: "reasoning_delta", text })` 回调

#### Scenario: 接收 tool_call_start chunk

- **WHEN** main 进程收到工具调用开始事件
- **THEN** 通过 port1 发送 `{ type: "chunk", data: { kind: "tool_call_start", toolCallId, title, toolKind } }`
- **AND** preload 层调用 `callbacks.onChunk({ kind: "tool_call_start", ... })` 回调

#### Scenario: 接收 tool_call_update chunk

- **WHEN** main 进程收到工具调用更新事件
- **THEN** 通过 port1 发送 `{ type: "chunk", data: { kind: "tool_call_update", toolCallId, status, input, content } }`
- **AND** preload 层调用 `callbacks.onChunk({ kind: "tool_call_update", ... })` 回调

#### Scenario: 接收 user_message chunk

- **WHEN** `proposal:stageStream` 或 `proposal:archive` handler 在流启动初期落盘 user 消息后
- **THEN** 通过 port1 发送 `{ type: "chunk", data: { kind: "user_message", message } }`
- **AND** preload 层调用 `callbacks.onChunk({ kind: "user_message", message })` 回调

#### Scenario: 接收 available_commands_update chunk 并持久化

- **WHEN** `chat:stream:message` handler 从 `AcpSession` 收到 `available_commands_update` 事件
- **THEN** 通过 port1 发送 `{ type: "chunk", data: { kind: "available_commands_update", commands } }`
- **AND** preload 层调用 `callbacks.onChunk({ kind: "available_commands_update", commands })` 回调
- **AND** 主进程通过 `session-store` 的统一 session meta 更新入口将 `commands` 写入当前 session meta 的 `available_commands` 字段
- **AND** `commands` 为空数组时仍然发送并持久化（用于传达"agent 明确声明无命令"语义）

#### Scenario: proposal 流不透传 available_commands_update

- **WHEN** `proposal:stageStream` 或 `proposal:archive` handler 从 `AcpSession` 收到 `available_commands_update` 事件
- **THEN** handler 显式忽略该事件：不调用 `MessageAssembler.apply`、不调用 `sink.sendChunk`、不写磁盘
- **AND** renderer 不会从 proposal 流收到 `available_commands_update` chunk

### Requirement: 流式 API 封装为回调式接口

Preload 暴露给 renderer 的流式 API SHALL 采用回调式接口，renderer 不直接接触 MessagePort 对象。Chat 流式 API 的 `streamId` SHALL 是 preload/main 的内部关联标识，不要求暴露给 renderer 组件或 store。

Preload 返回的 cancel 函数 SHALL 是幂等的。调用 cancel 时，preload SHALL 调用对应的 stream cancel IPC 通道通知 main 进程，并关闭当前 `streamId` 绑定的 MessagePort（如果已经收到）。如果 cancel 发生在 MessagePort 到达 preload 之前，preload SHALL 记录该 `streamId` 的 pending cancel；当后续收到匹配 `streamId` 的 MessagePort 时，preload SHALL 立即关闭该 port，且 SHALL NOT 发送 `{ type: "ready" }` 启动业务流。

Preload SHALL 使用共享 dispatcher 或等价机制处理 `chat:stream:port`，不得为每次 chat stream 调用注册一个无条件消费下一个 port 事件的 `ipcRenderer.once(ChatStreamChannels.streamPort, ...)` 监听器。未匹配任何 pending stream 的 chat stream port SHALL 被关闭。

#### Scenario: 流式 API 签名

- **WHEN** renderer 使用流式聊天功能
- **THEN** 调用签名为 `streamMessage(sessionId, prompt, { onChunk, onDone, onError })`
- **AND** 返回一个 `cancel()` 函数用于中断流式传输
- **AND** renderer 组件和 store 不需要直接传入或读取 `streamId`

#### Scenario: 取消流式传输

- **WHEN** 用户在流式输出过程中点击停止
- **THEN** renderer 调用 cancel 函数
- **AND** preload 关闭该 `streamId` 对应的 port 并通知 main 中断 AI 调用

#### Scenario: port 到达前取消流式传输

- **WHEN** renderer 已调用流式 API 并获得 cancel 函数
- **AND** MessagePort 尚未到达 preload
- **AND** renderer 调用 cancel 函数
- **THEN** preload 记录该 `streamId` 的 pending cancel 并通知 main 中断 AI 调用
- **AND** 匹配该 `streamId` 的 MessagePort 后续到达时被立即关闭
- **AND** preload 不发送 `{ type: "ready" }`

#### Scenario: 未匹配 streamId 的 port 被关闭

- **WHEN** preload 收到 `chat:stream:port` 事件
- **AND** 事件 payload 中的 `streamId` 不存在于 pending stream registry
- **THEN** preload 关闭该 MessagePort
- **AND** 不调用任何 stream callbacks

### Requirement: 事件推送使用 ipcRenderer.on 订阅模式

非流式的事件推送（下载进度、agent 安装进度等）SHALL 使用 `event.sender.send` + `ipcRenderer.on` 模式，preload 封装为订阅/取消订阅 API。

#### Scenario: 订阅下载进度事件

- **WHEN** renderer 调用下载进度订阅 API 并传入 handler
- **THEN** preload 内部注册对应的 `ipcRenderer.on('<domain>:event:progress', handler)`
- **AND** 返回 unsubscribe 函数

#### Scenario: 取消订阅

- **WHEN** 组件卸载时调用 unsubscribe 函数
- **THEN** preload 移除对应的 `ipcRenderer` 监听器
- **AND** 不影响其他组件的同事件监听

### Requirement: 所有订阅 API 必须返回取消订阅函数

Preload 暴露的每个事件订阅方法 SHALL 返回一个 `() => void` 类型的取消订阅函数，用于精确移除对应的监听器。

#### Scenario: 多组件同时订阅同一事件

- **WHEN** 两个组件分别调用同一事件的订阅 API 并传入 handlerA 和 handlerB
- **THEN** 两个 handler 均被注册
- **AND** 调用 handlerA 的 unsubscribe 不影响 handlerB

### Requirement: 事件推送的消息结构统一

所有事件推送消息 SHALL 包含 `type` 和 `payload` 字段，其中 type 标识事件类型，payload 为事件数据。

#### Scenario: 下载进度事件结构

- **WHEN** 文件下载进度更新
- **THEN** 推送消息为 `{ type: 'progress', payload: { taskId, percent, bytesDownloaded, totalBytes } }`

#### Scenario: Agent 安装进度事件结构

- **WHEN** agent 安装进度更新
- **THEN** 推送消息为 `{ type: 'installProgress', payload: { agentId, percent, status } }`

### Requirement: 流式 handler 必须通过 `makeStreamChannel` 实现

所有基于 `MessageChannelMain` 的流式 IPC handler（包括但不限于 `chat:stream:message`、`proposal:stageStream`、`proposal:archive`）SHALL 通过 `ipc/_kit/stream-channel.ts` 导出的 `makeStreamChannel` 创建。禁止在 handler 内部自行调用 `new MessageChannelMain()`、手动维护 `portClosed` 守卫、手写 `sendChunk` / `sendDone` / `sendError` 三件套、或复制 `SessionEvent → MessageChunkData` 映射。

#### Scenario: 流式 handler 使用 kit

- **WHEN** 查看 `main/ipc/chat.ts` 的 `streamMessage` handler 实现
- **THEN** handler 通过 `makeStreamChannel({ event, portChannel, onReady, mapEvent })` 创建 channel
- **AND** 不包含 `new MessageChannelMain()`、`port1.close()`、`portClosed.value = true` 等模式

#### Scenario: 流式映射统一

- **WHEN** 在代码库中搜索将 `SessionEvent` 转换为 `MessageChunkData` 的实现
- **THEN** 仅存在一份位于 `services/chat/session-event-mapper.ts`，`chat` / `proposal-apply` / `archive` 三处流式 handler 共用

#### Scenario: kit 处理提前关闭

- **WHEN** renderer 在流式过程中关闭 port
- **THEN** `makeStreamChannel` 检测到 port close，自动调用 runner 的 `cancel()`
- **AND** 随后 handler 产生的 chunk 被静默丢弃，不再 postMessage 到已关闭 port

### Requirement: 流式 handler 具备统一的 ready 握手与错误归一

`makeStreamChannel` SHALL 实现以下协议：向 renderer `postMessage(portChannel, null, [port2])` → 等待 renderer 通过 port 发送 `{ type: "ready" }` → 调用业务提供的 `onReady(send)` 获取 `{ start, cancel }` → 调用 `start()`；过程中 kit 负责将业务事件映射为 `chunk`、业务完成映射为 `done`、业务异常或 port 关闭映射为 `cancel` 并在必要时发送 `error`。

#### Scenario: ready 之前不启动业务

- **WHEN** handler 被调用但 renderer 尚未回复 ready
- **THEN** 业务侧 `start()` 尚未被调用，AcpSession 等资源未分配

#### Scenario: 业务抛错归一化

- **WHEN** `start()` 抛出 Error（或 reject）
- **THEN** kit 通过 port 发送 `{ type: "error", data: { code: "ACP_ERROR", message } }`
- **AND** 关闭 port，并调用 runner 的 `cancel()`（如已启动）

### Requirement: MessageChunkData 包含 config_options_update 分支

`MessageChunkData` 联合类型 SHALL 新增 `config_options_update` 分支，用于流式协议在 turn 进行中传递 ACP 会话配置选项的全集替换。该分支结构 SHALL 为：

```typescript
{ kind: "config_options_update"; options: AcpSessionConfigOption[] }
```

`AcpSessionConfigOption` 类型由 `src/shared/types/acp-config.ts` 导出（脱 SDK 类型，不依赖 `@agentclientprotocol/sdk` 导入到 shared / preload / renderer）。

`session-event-mapper.toMessageChunk` SHALL 处理 `SessionEvent { type: "config_options_update", options }`，返回 `{ kind: "config_options_update", options }`，让 `chat:stream:message` handler 可以通过 `sink.sendChunk` 透传给 renderer。

所有消费 `MessageChunkData` 的 switch/分支 SHALL 处理 `config_options_update` 分支；TypeScript 穷尽检查 SHALL 在编译期发现漏处理。

#### Scenario: 接收 config_options_update chunk

- **WHEN** main 进程从 `AcpSession` 收到 `config_options_update` 事件，`options` 含 3 项
- **THEN** 通过 port1 发送 `{ type: "chunk", data: { kind: "config_options_update", options: [<3 项>] } }`
- **AND** preload 层调用 `callbacks.onChunk({ kind: "config_options_update", options })` 回调

#### Scenario: 空数组的 config_options_update 仍透传

- **WHEN** `AcpSession` emit `config_options_update` 且 `options.length === 0`
- **THEN** main 仍通过 port1 发送对应 chunk
- **AND** preload 仍触发 `onChunk`

#### Scenario: proposal 流不发送 config_options_update

- **WHEN** `proposal:stageStream` 或 `proposal:archive` handler 从其 `AcpSession` 收到 `config_options_update`
- **THEN** handler 显式忽略，不调用 `sink.sendChunk`
- **AND** renderer 不会从 proposal 流收到 `config_options_update` chunk

#### Scenario: shared 层 AcpSessionConfigOption 不依赖 SDK

- **WHEN** 审查 `src/shared/types/acp-config.ts` 的 import 列表
- **THEN** 不存在 `from "@agentclientprotocol/sdk"` 的运行时或类型 import
- **AND** 类型字段（`type` discriminator、`category` 开放枚举、`options` 平铺/分组 union）独立定义

### Requirement: 非 done 终止时持久化已组装的 assistant 消息

所有基于 `makeStreamChannel` 的流式 IPC handler（`chat:stream:message`、`proposal:stageStream`、`proposal:archive`）SHALL 在**非 `done` 终止**时也持久化当前已组装的 assistant 消息。非 `done` 终止指两类出口：

1. **`error` 出口**：handler 的 `session.on("event")` 回调收到 `{ type: "error" }` 事件。
2. **`cancel` 出口**：`makeStreamChannel` 返回的 runner 的 `cancel()` 被调用（由 renderer 关闭 port，或由对应的 `streamCancel` / `stageStreamCancel` / `archiveCancel` IPC 经 `sessionRegistry.cancel` 触发 `AcpSession.cancel()` 后，port close 链路命中 `runner.cancel`）。

每个 handler SHALL 通过其已持有的 `MessageAssembler` 实例与该 handler 对应的落盘函数完成持久化：

- `chat:stream:message` → `appendMessage`
- `proposal:stageStream` → `appendApplyRunMessage`
- `proposal:archive` → `appendArchiveMessage`

持久化 SHALL 复用 `done` 出口已有的"取出消息再落盘"两步：先调用 `assembler.flush()`，仅当返回非 `null` 时调用对应落盘函数 append 该消息。

去重 SHALL 依赖 `MessageAssembler.flush()` 的一次性所有权语义：`flush()` 首次调用同步取走 `currentMessage` 并置为 `null` 后返回该消息，后续调用返回 `null`。因此在 `done`、`error`、`cancel` 任意先后组合命中的情况下，同一条 assistant 消息 SHALL 最多落盘一次。handler SHALL NOT 为去重引入额外的布尔标志或独立状态。

落盘 SHALL NOT 改变被中断消息的数据形态：消息作为普通 assistant `UIMessage<MessageMeta>` 落盘，SHALL NOT 新增"中断 / 出错"标记字段，SHALL NOT 改变 `.messages.jsonl` 存储格式。

本 requirement SHALL NOT 改变各 handler 既有的非消息状态逻辑：`proposal:stageStream` 与 `proposal:archive` 在 `error` 出口对 runMeta / archive `status` 的更新保持原样；新增的消息落盘 SHALL 作为这些出口的附加动作，不替换、不依赖其执行结果。

当 `error` 或 `cancel` 在任何 `text_delta` / `reasoning_delta` / `tool_call_*` 事件到达之前发生时，`assembler` 的 `currentMessage` 为 `null`，`flush()` 返回 `null`，handler SHALL NOT append 任何消息（不落盘空消息）。

非 done 终止时的消息落盘失败 SHALL 被捕获并记录日志，SHALL NOT 阻断该出口既有的终止动作（`sink.sendError` / `sink.sendDone` / `sessionRegistry.unregister` / 状态机更新）。

#### Scenario: chat 流式 error 时落盘已组装消息

- **WHEN** `chat:stream:message` 已通过 `assembler.apply` 组装了部分 assistant 内容（至少一个 `text_delta`）
- **AND** handler 的事件回调随后收到 `{ type: "error", code, message }`
- **THEN** handler 调用 `assembler.flush()` 取出该 assistant 消息并通过 `appendMessage` 落盘到该 session 的 `.messages.jsonl`
- **AND** handler 仍调用 `sink.sendError(mapAcpErrorCode(code), message)` 与 `sessionRegistry.unregister("chat", sessionId)`
- **AND** 重启后 `loadMessages` 能读到该条 assistant 消息

#### Scenario: chat 用户 stop 时落盘已组装消息

- **WHEN** `chat:stream:message` 已组装部分 assistant 内容
- **AND** 用户 stop 导致 runner 的 `cancel()` 被调用
- **THEN** handler 在 `cancel` 出口调用 `assembler.flush()` 取出消息并通过 `appendMessage` 落盘
- **AND** handler 仍调用 `session.cancel()` 与 `sessionRegistry.unregister("chat", sessionId)`

#### Scenario: 同一轮先 error 后 cancel 不重复落盘

- **WHEN** `chat:stream:message` 在 `error` 出口已落盘该 assistant 消息（`flush()` 已取走 `currentMessage`）
- **AND** 随后 `sink.sendError` 关闭 port，port close 链路触发 runner 的 `cancel()`
- **THEN** `cancel` 出口再次调用 `assembler.flush()` 返回 `null`
- **AND** handler 不再 append，`.messages.jsonl` 中该消息只出现一次

#### Scenario: 终止发生在任何 delta 之前不落盘空消息

- **WHEN** 流式刚启动、尚未收到任何 `text_delta` / `reasoning_delta` / `tool_call_*` 事件
- **AND** 发生 `error` 或用户 stop
- **THEN** `assembler.flush()` 返回 `null`
- **AND** handler 不调用任何 append 落盘函数，磁盘上不新增空 assistant 消息

#### Scenario: proposal stageStream error 时落盘并保留 runMeta 错误状态

- **WHEN** `proposal:stageStream` 已组装部分 assistant 内容
- **AND** handler 收到 `{ type: "error" }`
- **THEN** handler 调用 `assembler.flush()` 并通过 `appendApplyRunMessage(projectPath, changeId, stageIndex, message)` 落盘
- **AND** handler 仍执行既有的 `updateRunMetaIfCurrent(... status: "error" ...)` 与 `sink.sendError`
- **AND** runMeta 的 `status` 仍被置为 `"error"`（消息落盘不替换、不影响该状态更新）

#### Scenario: proposal stageStream 用户 stop 时落盘已组装消息

- **WHEN** `proposal:stageStream` 已组装部分 assistant 内容
- **AND** 用户 stop 导致 runner 的 `cancel()` 被调用
- **THEN** handler 在 `cancel` 出口调用 `assembler.flush()` 并通过 `appendApplyRunMessage` 落盘
- **AND** handler 仍调用 `session.cancel()` 与 `sessionRegistry.unregister("apply", runId)`

#### Scenario: proposal archive error 时落盘并保留 archive 错误状态

- **WHEN** `proposal:archive` 已组装部分 assistant 内容
- **AND** handler 收到 `{ type: "error" }`
- **THEN** handler 调用 `assembler.flush()` 并通过 `appendArchiveMessage(projectPath, changeId, message)` 落盘
- **AND** handler 仍执行既有的 `persistArchiveStatus("error")` 与 `sink.sendError`

#### Scenario: proposal archive 用户 stop 时落盘已组装消息

- **WHEN** `proposal:archive` 已组装部分 assistant 内容
- **AND** 用户 stop 导致 runner 的 `cancel()` 被调用
- **THEN** handler 在 `cancel` 出口调用 `assembler.flush()` 并通过 `appendArchiveMessage` 落盘
- **AND** handler 仍调用 `session.cancel()` 与 `sessionRegistry.unregister("archive", sessionKey)`

### Requirement: MessageChunkData 包含 plan_update 分支

`MessageChunkData` 联合类型 SHALL 包含 `agenda_update` 分支，用于流式协议在 turn 进行中传递 ACP Agent 行动清单的全量替换。该分支结构 SHALL 为：

```typescript
{ kind: "agenda_update"; entries: AgendaEntry[] }
```

`AgendaEntry` 类型由 `src/shared/types/chat.ts` 导出（脱 SDK 类型，不依赖 `@agentclientprotocol/sdk` 导入到 shared / preload / renderer），字段为 `content: string`、`priority: "high" | "medium" | "low"`、`status: "pending" | "in_progress" | "completed"`。

`session-event-mapper.toMessageChunk` SHALL 处理 `SessionEvent { kind: "agenda_update", entries }`，返回 `{ kind: "agenda_update", entries }`，让 `chat:stream:message` handler 可以通过 `sink.sendChunk` 透传给 renderer。

所有消费 `MessageChunkData` 的 switch/分支 SHALL 处理 `agenda_update` 分支；TypeScript 穷尽检查 SHALL 在编译期发现漏处理。`useUIMessageAssembler.applyChunk` 与现有 `available_commands_update`/`config_options_update` 一样将 `agenda_update` 归入“忽略（不组装进 message parts）”的分支。

#### Scenario: 接收 agenda_update chunk

- **WHEN** main 进程从 `AcpSession` 收到 `agenda_update` 事件，`entries` 含 3 项
- **THEN** 通过 port1 发送 `{ type: "chunk", data: { kind: "agenda_update", entries: [<3 项>] } }`
- **AND** preload 层调用 `callbacks.onChunk({ kind: "agenda_update", entries })` 回调

#### Scenario: 空数组的 agenda_update 仍透传

- **WHEN** `AcpSession` emit `agenda_update` 且 `entries.length === 0`
- **THEN** main 仍通过 port1 发送对应 chunk
- **AND** preload 仍触发 `onChunk`

#### Scenario: proposal 流不发送 agenda_update

- **WHEN** `proposal:stageStream` 或 `proposal:archive` handler 从其 `AcpSession` 收到 `agenda_update`
- **THEN** handler 显式忽略，不调用 `sink.sendChunk`
- **AND** renderer 不会从 proposal 流收到 `agenda_update` chunk

#### Scenario: assembler 忽略 agenda_update

- **WHEN** `useUIMessageAssembler.applyChunk` 收到 `{ kind: "agenda_update", entries }`
- **THEN** 不修改 `messages`，不创建或更新任何 message part
- **AND** TypeScript 穷尽检查通过（`agenda_update` 被显式纳入忽略分支）

### Requirement: MessageChunkData 与 SessionEvent 复用共享 StreamContentEvent 子集

系统 SHALL 在 `src/shared/types/stream-event.ts` 定义跨进程同构的流式内容子集 `StreamContentEvent`，作为主进程 `SessionEvent` 与跨进程 `MessageChunkData` 的公共基底，消除两者之间逐字段重复定义与逐字段抄写式转换。

`StreamContentEvent` SHALL 包含以下 9 个判别成员（判别字段为 `kind`，工具类别字段为 `toolKind`）：`text_delta`、`reasoning_delta`、`tool_call_start`、`tool_call_update`、`usage_update`、`session_info_update`、`available_commands_update`、`agenda_update`、`config_options_update`。其字段定义见 `acp-chat-backend` 能力中 `StreamContentEvent` 的 TypeScript 定义（含 tool_call 的 `input?`/`diff?`/`locations?`/`parentToolCallId?` 等可选字段）。

`MessageChunkData` SHALL 定义为：

```typescript
type MessageChunkData =
  | StreamContentEvent
  | { kind: "user_message"; message: UIMessage<MessageMeta> }
  | { kind: "status"; agentStatus: ChatStatus };
```

`SessionEvent` SHALL 定义为 `StreamContentEvent` 与主进程控制流变体（`done` / `error` / `session_id_resolved`）的并集，详见 `acp-chat-backend` 能力。

#### Scenario: 共享事件子集单点定义

- **WHEN** 新增或修改跨进程同构内容事件字段
- **THEN** 字段 SHALL 优先定义在 `src/shared/types/stream-event.ts`
- **AND** `SessionEvent` 与 `MessageChunkData` SHALL 通过该共享子集获得一致类型
- **AND** `session-event-mapper.toMessageChunk` SHALL 对同构成员做结构化透传，不逐字段重建

### Requirement: tool_call chunk 携带字段位置无关提取的可选字段

`MessageChunkData` 的 `tool_call_start` 与 `tool_call_update` 分支 SHALL 通过共享 `StreamContentEvent` 携带可选的 `input?: Record<string, unknown>`、`diff?: ToolCallDiff[]`、`locations?: ToolCallLocation[]` 字段，以承载 acp-mapper 字段位置无关提取的结果（无论字段来自 ACP `tool_call` 还是 `tool_call_update`）。`tool_call_update` 额外携带可选 `title?`、`toolKind?` 供下游孤儿建卡使用。

`ToolCallDiff` 与 `ToolCallLocation` 类型 SHALL 由 `src/shared/types/stream-event.ts` 导出，不依赖 `@agentclientprotocol/sdk` 导入到 shared / preload / renderer。本期消费方对 `locations` / `parentToolCallId` 仅透传、不强制渲染。

#### Scenario: tool_call_start 携带 start 期 diff

- **WHEN** main 收到 codex edit 类工具的 `tool_call`（start 时 `content[]` 已含 `type === "diff"` 项），经 acp-mapper 提取为 `diff`
- **THEN** 通过 port1 发送 `{ kind: "tool_call_start", toolCallId, title, toolKind, diff: [<diff 项>] }`
- **AND** preload 触发 `onChunk`，`diff` 字段保留

#### Scenario: tool_call_update 携带提取的 diff

- **WHEN** main 收到 gemini/opencode edit 类工具的 `tool_call_update`（`content[]` 含 `type === "diff"` 项）
- **THEN** 通过 port1 发送的 chunk 携带 `diff` 字段

#### Scenario: 孤儿 update 携带建卡所需字段

- **WHEN** main 收到无前置 start 的 `tool_call_update`（gemini）
- **THEN** chunk 携带 `title` 与 `toolKind`（若 update 自带），使渲染进程 assembler 能据此惰性建卡
