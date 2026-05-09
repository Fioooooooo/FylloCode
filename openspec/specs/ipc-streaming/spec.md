# ipc-streaming 规范

## Purpose

IPC 流式通信规范定义 AI 聊天 MessagePort 流式输出、流式 chunk 消息语义和事件订阅模式。

## Requirements

### Requirement: AI 聊天流式输出使用 MessagePort 通信

AI 聊天的流式响应 SHALL 通过 MessagePort 传输。Main 进程创建 `MessageChannelMain`，将 port2 通过 `postMessage` 传递给 renderer，在 port1 上逐 chunk 推送数据。

#### Scenario: 发起流式聊天

- **WHEN** renderer 调用 `window.api.chat.streamMessage(sessionId, prompt, callbacks)`
- **THEN** preload 调用 `ipcRenderer.invoke('chat:stream:message', { sessionId, prompt })` 发起流式请求
- **AND** main 创建 MessagePort 并通过 `event.sender.postMessage('chat:stream:port', null, [port2])` 传递给 renderer

#### Scenario: 流式完成

- **WHEN** AI 服务完成响应
- **THEN** main 通过 port1 发送 `{ type: 'done', data: { totalTokens: number } }`
- **AND** 关闭 port1
- **AND** preload 层调用 `callbacks.onDone(data)` 回调

#### Scenario: 流式错误

- **WHEN** AI 服务返回错误
- **THEN** main 通过 port1 发送 `{ type: 'error', data: { code: string, message: string } }`
- **AND** 关闭 port1
- **AND** preload 层调用 `callbacks.onError(error)` 回调

### Requirement: 接收流式 chunk

系统 SHALL 通过 MessagePort 传输 `StreamMessage<MessageChunkData>` 类型的消息，其中 `MessageChunkData` 为联合类型，支持 `text_delta`、`tool_call_start`、`tool_call_update`、`session_info_update`、`user_message`、`status` 六种 chunk 语义。Preload 层的 `StreamCallbacks.onChunk` 回调参数类型 SHALL 更新为新的 `MessageChunkData`。

`MessageChunkData` 定义（新增 `user_message` 分支）：

```typescript
type MessageChunkData =
  | { kind: "text_delta"; text: string }
  | { kind: "tool_call_start"; toolCallId: string; title: string; toolKind: string }
  | {
      kind: "tool_call_update";
      toolCallId: string;
      status: "in_progress" | "completed" | "failed";
      input?: Record<string, unknown>;
      content?: string;
    }
  | { kind: "session_info_update"; title: string }
  | { kind: "user_message"; message: UIMessage<MessageMeta> }
  | { kind: "status"; agentStatus: ChatStatus };
```

`user_message` 分支 SHALL 由 `proposal:stageStream` / `proposal:archive` handler 在流启动初期直接通过 sink 发送（不经 `session-event-mapper`，因为 user message 源自主进程落盘动作，不是 ACP `SessionEvent`）。`chat:stream:message` handler 在当前 change 范围内 SHALL NOT 发送 `user_message` chunk（chat 的 user message 由渲染进程本地 push + `chat:persistMessage` 落盘）。

所有消费 `MessageChunkData` 的 switch/分支 SHALL 处理新增的 `user_message` 分支；TypeScript 穷尽检查 SHALL 在编译期发现漏处理。

#### Scenario: 接收 text_delta chunk

- **WHEN** main 进程从 Claude CLI 收到文本增量
- **THEN** 通过 port1 发送 `{ type: "chunk", data: { kind: "text_delta", text: string } }`
- **AND** preload 层调用 `callbacks.onChunk({ kind: "text_delta", text })` 回调

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

### Requirement: 流式 API 封装为回调式接口

Preload 暴露给 renderer 的流式 API SHALL 采用回调式接口，renderer 不直接接触 MessagePort 对象。

#### Scenario: 流式 API 签名

- **WHEN** renderer 使用流式聊天功能
- **THEN** 调用签名为 `streamMessage(sessionId, prompt, { onChunk, onDone, onError })`
- **AND** 返回一个 `cancel()` 函数用于中断流式传输

#### Scenario: 取消流式传输

- **WHEN** 用户在流式输出过程中点击停止
- **THEN** renderer 调用 `cancel()` 函数
- **AND** preload 关闭 port 并通知 main 中断 AI 调用

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
