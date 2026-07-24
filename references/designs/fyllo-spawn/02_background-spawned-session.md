# 异步派生会话（Background Spawned Session）

> 前置：[01_fyllo-spawn-design.md](01_fyllo-spawn-design.md) Phase 1 已完成。

## 概述

在 Phase 1 的同步派生基础上，增加 `background` 模式支持。主 agent 调用 `prompt_to_agent(background=true)` 时，MCP tool call 立即返回，子 agent 在后台执行。任务完成后，主进程通知 renderer，renderer 自动向主 agent 发送 system-reminder prompt，驱动主 agent 报告结果。

## Tool API 变更

### `prompt_to_agent` 新增 `background` 参数

在 Phase 1 的 `prompt_to_agent(agentId, prompt, sessionId?, config?)` 基础上新增：

| 参数       | 类型    | 必填 | 默认值 | field describe                                                                                              |
| ---------- | ------- | ---- | ------ | ----------------------------------------------------------------------------------------------------------- |
| background | boolean | 否   | false  | `Run without waiting for completion. Use check_session_status to poll for progress and the final response.` |

**Tool description 更新（替换 Phase 1 的 description）：**

```
Send a prompt to another installed agent. Returns a sessionId and a responsePath pointing to a file containing the agent's output — read it with your file-reading tool.

Omit sessionId to start a new conversation; include a sessionId from a previous call to continue an existing one. The agent uses its default configuration unless the user explicitly asks for a specific model or setting — do not pass config unless needed. When starting a new session, the response includes a config object listing adjustable settings (model, thought_level) with their current values and available options — use the config parameter in subsequent calls to change them. Set background=true for long-running work — the call returns immediately with no responsePath; poll with check_session_status to get it when the task finishes. Do not send a new prompt to a session that is still running — wait until check_session_status reports idle. The agent runs in the same project directory with its own context window and tool set.
```

**返回值差异：**

- 同步模式（`background=false`，默认）：`{ sessionId, responsePath, config? }` — responsePath 指向已生成的 response.md，首次创建 session 时附带 config
- 异步模式（`background=true`）：`{ sessionId, config? }` — 无 responsePath（子 agent 尚未完成），首次创建 session 时附带 config

**background=true 时 config 的返回时机：**

即使 `background=true`，tool call 返回前仍需等待 `config_option_update` 到达。流程为：

1. `newSession` → 同步等待，拿到 acpSessionId
2. 等待 `config_option_update` 事件到达（子 agent 在 `newSession` 后异步推送，通常是 `setTimeout(0)` 级别延迟）
3. 发送 `session/prompt`（异步，不等待完成）
4. 从 `SpawnedSessionEntry.configOptions` 提取精简 config → 返回 MCP tool response

步骤 2 的等待窗口极短（microtask/macrotask 级别），不影响 background 模式的即时返回体验。如果超时未收到（agent 不推送 configOptions），config 字段为空，不阻塞返回。

### `prompt_to_agent` 对 running session 的处理

如果调用 `prompt_to_agent` 时目标 session 的上一次 prompt 仍在执行（status 为 running），tool call 返回错误：

```json
{
  "error": "session_busy",
  "message": "Session sess_abc123 is still running. Wait until check_session_status reports idle before sending another prompt."
}
```

主 agent 应通过 `check_session_status` 轮询，等到 `idle` 状态后再发送新 prompt。这避免了对同一 session 并发 prompt 导致的 ACP 协议冲突。

### `check_session_status` description 更新

```
Check the current state of a spawned agent session. Returns status, and — depending on state — the agent's response path (idle), recent activity snippets (running), or an error message (error). Use this to poll background tasks started with prompt_to_agent(background=true), monitor progress, or detect failures.
```

## 后台任务完成通知

### 问题

`prompt_to_agent(background=true)` 时，子 agent 在后台执行，主 agent 的 prompt turn 已经结束（MCP tool 立即返回）。子 agent 完成后，主 agent 处于 idle 状态，没有正在处理的 prompt turn，无法"中途注入"通知。

ACP 协议没有 Client→Agent 的推送通道，唯一向 agent 发送信息的方式是 `session/prompt` RPC。

### 方案：renderer 驱动的 system-reminder prompt

子 agent background 任务完成后，主进程通过 `webContents.send()` 通知 renderer，renderer 构造 system-reminder prompt 并调用 `streamMessage`，与用户发消息走**同一条通信路径**。

```
子 agent 完成
  → 主进程检测到（sessionHandler done 事件）
  → 通过 webContents.send() 向 renderer 推送事件
    { type: "spawn:done", sessionId, parentSessionId, status, responsePath }
  → renderer 收到事件
  → 构造 system-reminder prompt parts
  → 调用 streamMessage()（与用户发消息走同一路径）
  → agent 收到通知，产生回复 → 正常 streaming 渲染
  → 用户看到 agent 的回复，但看不到 system-reminder 消息
```

**选择 renderer 驱动而非主进程直接发送 session/prompt 的原因：**

现有 streaming 通道（`makeStreamChannel`）由 renderer 发起 IPC invoke 建立，依赖 `IpcMainInvokeEvent` 中的 `event.sender.postMessage()` 推送 MessagePort。主进程要主动建立 stream channel 需要引入第二种通信路径——同一页面的 assistant 消息不应有两种通信方式。让 renderer 发起 `streamMessage` 调用，通知消息和用户消息走完全相同的路径。

### 通知 prompt 内容

```
<system-reminder>
A background spawned-agent task has completed.

Session: sess_abc123
Agent: codex-acp
Status: idle
Response: /path/to/response.md

Read the response file to see what the agent produced, then report the result to the user.
</system-reminder>
```

### UI 透明性

`<system-reminder>` 包裹的 prompt 在前端不渲染——`UserMessage.vue` 中 `isSystemReminderPart()` 检测到后跳过该 part。用户看不到这条"用户消息"，但能看到 agent 收到通知后产生的回复（"后台任务已完成，以下是结果..."）。对话流保持自然。

### 主进程推送事件

主进程通过 `webContents.send()` 在子 agent 生命周期的关键节点推送事件：

| 事件            | 时机                     | payload                                                |
| --------------- | ------------------------ | ------------------------------------------------------ |
| `spawn:started` | background prompt 发出后 | `{ sessionId, parentSessionId, agentId }`              |
| `spawn:done`    | 子 agent turn 完成       | `{ sessionId, parentSessionId, status, responsePath }` |
| `spawn:error`   | 子 agent 出错            | `{ sessionId, parentSessionId, error }`                |

`spawn:done` 和 `spawn:error` 触发 renderer 发送 system-reminder prompt。`spawn:started` 供 renderer 记录"有进行中的异步任务"（Phase 3 的 UI 会用到）。

### 持久化

通知场景下主 session 的 `messages.jsonl` 中会多出两条记录：

```
{ role: "user",      parts: [用户原始输入] }           ← 用户原始消息
{ role: "assistant", parts: [回复 A] }                  ← 正常 stream 结束
{ role: "user",      parts: [{ type: "text", text: "<system-reminder>..." }] }  ← 通知消息
{ role: "assistant", parts: [回复 B] }                  ← 通知触发的 stream
```

- **system-reminder user message**：由 renderer 通过 `streamMessage` 发送，prompt parts 中包含 `<system-reminder>` 文本
- **回复 B**：agent 收到通知后的回复，正常持久化

UI 侧 `UserMessage.vue` 的 `isSystemReminderPart()` 检测到 system-reminder 标签后跳过渲染，reload 后也不会展示。回复 A 和回复 B 是两条独立的 assistant 消息，各自正常渲染。

**ACP session recovery 的兼容性**：现有 `acp-session-recovery.ts` 中 `isSystemReminderText()` 在恢复历史时过滤掉 system-reminder 消息，避免重复注入。通知消息同样会被过滤，不影响 session recovery。

### 并发处理

子 agent 完成的通知到达 renderer 时，可能正好有 stream 在进行中（agent 还在回复用户的上一条消息）。

**核心策略：renderer 侧 pending 队列 + onDone drain**

```
renderer chat store:
  pendingSpawnNotifications: SpawnNotification[]

收到 spawn:done / spawn:error 事件时：
  pendingSpawnNotifications.push(notification)
  if 当前无 stream（idle 状态）:
    → 立即发起 streamMessage(system-reminder)
  else:
    → 入队等待

streamMessage 的 onDone 回调中：
  if pendingSpawnNotifications 非空:
    取出合并 → 立即调 streamMessage(system-reminder)
    // 用户发送按钮仍禁用，因为新 stream 已发起
  else:
    解锁用户输入
```

**关键点：用户无法抢先发送**。用户发送按钮的解锁在 `onDone` 回调中控制。只要 pending 通知的 `streamMessage` 在解锁之前发出，用户就没有机会在通知之前点击发送。竞争窗口被消除。

**idle 场景**（用户未发消息，也无进行中的 stream）：renderer 收到事件后直接发起 `streamMessage`，无竞争。

**多通知合并**：如果多个 background 任务在同一个 stream 期间完成，`onDone` 时合并为一条 system-reminder prompt 发送，减少不必要的 turn 往返。

**用户不在 chat 页面时**：chat store 是 Pinia 全局单例（`defineStore`），生命周期等同于 app，不因组件卸载而销毁。`streamStateBySessionId` 按 sessionId 隔离，`sendMessage` / `streamSessionMessage` 内部按 sessionId 操作，不依赖当前活跃页面。因此无论用户在设置页、其他 session、或任何非 chat 页面，spawn 事件监听器都能正常接收并处理通知。

### 与同步模式的关系

同步模式（`background=false`，默认）不需要此机制——MCP tool call 会阻塞等待子 agent 完成，直接在 tool response 中返回 sessionId 和 responsePath。

此通知机制仅在 `background=true` 时激活。

### error 通知

子 agent 出错时同样发送通知（`spawn:error` 事件），system-reminder 中 status 为 error，附带 error message，让主 agent 可以向用户汇报错误。

## 实现要点

1. **触发时机**：`SpawnedSessionManager` 监听 spawned session 的 done 事件，当 `background=true` 的 session turn 完成时触发通知
2. **主 agent session 定位**：通过 `SpawnedSessionEntry.parentSessionId` 找到主 agent 对应的 renderer window，通过 `webContents.send()` 推送事件
3. **renderer 侧注册**：preload 暴露 spawn 事件监听 API，chat store 注册监听器管理 pending 队列
4. **streamMessage 复用**：通知的 system-reminder prompt 完全走现有 `streamMessage` 路径，不引入新的 stream channel 建立方式
