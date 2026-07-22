# fyllo-spawn MCP Server 设计

> 状态：设计讨论中，尚未进入实现。

## 概述

fyllo-spawn 是一个内置 MCP server，允许用户聊天使用的主 agent 派生出用户已安装的其他 ACP agent。MCP server 本身是薄封装，主 agent 发起 MCP tool call 后，通过主进程管理子 agent 的 ACP 连接和生命周期。

## 定位

Claude Code 等 agent 已有内置的 subagent 能力（如 Agent tool），但只能派生自身类型的子 agent。fyllo-spawn 解决的是**跨 agent 类型派生**的问题——比如 Claude 主 agent 派生 Codex 子 agent 执行特定任务。

## Tool API

### `available_agents()`

返回当前已安装可用的 ACP agent 列表。

**Tool description:**

```
List installed agents that can be delegated work via prompt_agent. Call once at the start of a session to discover which agents are available. Returns agent IDs, display names, and short descriptions — does not include configuration options (use check_status after establishing a session to get those).
```

**参数：** 无

**返回：**

```json
[
  {
    "agentId": "codex-acp",
    "name": "Codex",
    "description": "OpenAI Codex agent"
  }
]
```

**设计决策：**

- 不在此 tool 返回 configOptions。agent 的 configOptions（model、thought_level 等）是 ACP session 建立后的运行时数据，需要先 spawn 进程 + ACP initialize + 创建 session 才能获取。为拿 configOptions 把所有 agent 都启动一遍成本过高。
- configOptions 在 `check_status` 中返回（session 已建立后）。
- 只返回已安装的 agent。未安装的不在列表中。

### `prompt_agent(agentId, prompt, sessionId?, background?, config?)`

向指定 agent 发送 prompt。无 sessionId 时创建新 ACP session，有 sessionId 时在已有 session 上继续对话。

**Tool description:**

```
Send a prompt to another installed agent and return its text response. Omit sessionId to start a new conversation; include a sessionId from a previous call to continue an existing one.

Set background=true for long-running work — the call returns immediately and you can poll with check_status for progress and the final result. The agent runs in the same project directory with its own context window and tool set.
```

**参数：**

| 参数       | 类型                                | 必填 | 默认值 | field describe                                                                                                                                                                   |
| ---------- | ----------------------------------- | ---- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| agentId    | string                              | 是   | —      | `Agent ID from available_agents.`                                                                                                                                                |
| prompt     | string                              | 是   | —      | `The task or question to send. Be specific — the agent has no prior context unless you reuse a sessionId.`                                                                       |
| sessionId  | string                              | 否   | —      | `Session ID from a previous prompt_agent call. Pass this to continue a multi-turn conversation; omit to start fresh.`                                                            |
| background | boolean                             | 否   | false  | `Run without waiting for completion. Use check_status to poll for progress and the final response.`                                                                              |
| config     | Record\<string, string \| boolean\> | 否   | —      | `Session config overrides applied before sending the prompt. Keys are option IDs (e.g. "model", "thought_level"); use check_status on an idle session to see available options.` |

**返回：**

```json
{
  "sessionId": "sess_abc123",
  "response": "子 agent 的完整文本输出"
}
```

background=true 时，response 为占位文本（如 `"Background task started, use check_status to monitor progress"`），主 agent 通过 `check_status` 轮询获取进度和最终结果。

**设计决策：**

- tool name 用 `prompt_agent` 而非 `spawn_agent`，避免"每次调用都创建新进程"的语义歧义。`prompt` 直接对应 ACP 的 `session/prompt` 语义。
- 超大 response 处理（v1 暂定截断 + truncated 标记，后续可考虑 resource URI 或分段读取）。

**config 参数与指定 model 的设计：**

主 agent 在 prompt 时可能需要指定子 agent 使用的 model 或 effort level（例如"用 o3 跑这个任务"）。ACP 已有 `session/set_config_option` RPC，现有主进程 `config-option-service.ts` 通过 `connection.setSessionConfigOption()` 实现。

v1 方案：`prompt_agent` 增加可选 `config` 参数：

```
prompt_agent(agentId, prompt, sessionId?, background?=false, config?)
```

`config` 为 `Record<string, string | boolean>`，key 是 configOption 的 `id`（如 `"model"`、`"thought_level"`），value 是目标值。主进程在发送 prompt 之前，逐个调用 `connection.setSessionConfigOption()` 设置。

执行顺序：

1. 获取或创建 ACP session
2. 如果有 config 参数，逐个调用 `setSessionConfigOption`
3. 发送 prompt

config 设置失败不阻塞 prompt（agent 可能不支持 `set_config_option`），但在返回中附带 warning。

主 agent 通过 `check_status` 的 `configOptions` 字段获知子 agent 支持哪些选项和当前值，再在后续 `prompt_agent` 中通过 `config` 参数指定。典型流程：

```
1. prompt_agent("codex-acp", "分析这段代码")     → 首次，创建 session
2. check_status(sessionId)                        → idle, 拿到 configOptions
3. prompt_agent("codex-acp", "重写这个函数",      → 续 session，切换 model
     sessionId, config: { "model": "o3" })
```

### `check_status(sessionId)`

查询指定 session 的当前状态。

**Tool description:**

```
Check the current state of a spawned agent session. Returns status, and — depending on state — the agent's response text (idle), recent activity snippets (running), available config options (idle), or an error message (error). Use this to poll background tasks started with prompt_agent(background=true), to discover config options for a session, or to detect failures.
```

**参数：**

| 参数      | 类型   | 必填 | field describe                                         |
| --------- | ------ | ---- | ------------------------------------------------------ |
| sessionId | string | 是   | `Session ID returned by a previous prompt_agent call.` |

**返回示例：**

running 状态：

```json
{
  "status": "running",
  "recentActivity": [
    "正在读取 src/main/services/chat...",
    "找到了 3 个相关的配置项...",
    "开始修改路由逻辑..."
  ],
  "lastActivityAt": "2026-07-22T10:30:05Z"
}
```

idle 状态：

```json
{
  "status": "idle",
  "response": "已完成代码重构，修改了 3 个文件...",
  "lastActivityAt": "2026-07-22T10:31:00Z",
  "configOptions": [
    { "id": "model", "type": "select", "currentValue": "o3", "options": [...] },
    { "id": "thought_level", "type": "select", "currentValue": "medium", "options": [...] }
  ]
}
```

error 状态：

```json
{
  "status": "error",
  "error": "agent process exited unexpectedly (code=1)",
  "lastActivityAt": "2026-07-22T10:29:50Z"
}
```

**status 枚举：**

| 值          | 含义                               |
| ----------- | ---------------------------------- |
| `not_found` | sessionId 无效或已过期             |
| `running`   | prompt 正在执行中                  |
| `idle`      | session 存在，上次 prompt 已完成   |
| `error`     | 发生错误（进程 crash、连接断开等） |

**各状态下的返回字段：**

| 状态      | response             | recentActivity    | lastActivityAt | error    | configOptions |
| --------- | -------------------- | ----------------- | -------------- | -------- | ------------- |
| not_found | —                    | —                 | —              | —        | —             |
| running   | —                    | 最近 3 条文本片段 | 有             | —        | —             |
| idle      | 上次 prompt 完整输出 | —                 | 有             | —        | 有            |
| error     | —                    | —                 | 有             | 错误描述 | —             |

**recentActivity 说明：**

- 固定最多 3 条，按时间顺序排列（最旧在前）。
- 每条为子 agent 最近产生的文本片段（agent_message_chunk 或 tool_call title），截取前 N 个字符后加 `...`。
- 主进程侧用固定长度 3 的环形缓冲区实现，每次 session/update 事件到来时增量更新。
- 目的是让主 agent 能回答用户"到哪了"这类问题，不需要结构化的 plan 或 tool call 元数据。

**configOptions 说明：**

- idle 状态时返回当前 session 的 configOptions，结构复用现有 `AcpSessionConfigOption`（select / boolean）。
- configOptions 是 ACP session 建立后的运行时数据，由 agent 在 `newSession` 响应或 `config_option_update` 通知中推送，不是静态注册信息。因此只在 session 已建立后（idle 状态）才有值。
- `available_agents` 不返回 configOptions，因为拿到它需要先启动 agent 进程 + 创建 session，成本过高。

**error 状态的触发场景：**

- 子 agent 进程 crash（acp-process-pool 的 `child.on("exit")` 检测到）
- ACP 连接断开
- prompt 执行抛出未捕获异常

### Tool Prompt 设计说明

**原则：**

1. **项目无关**：description 和 field describe 不引用任何具体项目、框架或文件路径。示例中的 agent ID 用 placeholder 而非真实值。
2. **告诉 agent "什么时候用"**：tool description 开头说明用途，附带典型触发场景（如 "Call once at the start"、"Use this to poll background tasks"）。
3. **说明关键行为差异**：prompt_agent 的同步/异步模式、check_status 各状态返回不同字段——这些在 description 中点明，减少主 agent 误用。
4. **field describe 简洁直接**：一句话说清约束和来源（如 "Agent ID from available_agents"），不重复 tool description 已经说过的内容。
5. **对齐现有 MCP server 风格**：与 fyllo-specs/fyllo-cortex 的 tool description 保持一致——1-3 句话，不用 markdown 格式，不加示例代码。

## 不做 kill_agent 的原因

ACP 进程管理模型决定了 kill 操作在 v1 中不可行：

1. acp-process-pool 按 agentId（不是 sessionId）管理进程。kill 一个 session 不等于 kill 进程，kill 进程又会影响同一 agent 的其他 session。
2. ACP 的 `closeSession` 是可选协议，很多 agent 没有实现。
3. session 状态是内存数据，强制终止可能导致状态不一致。

如果未来需要"停止正在运行的子 agent turn"，可以加 `cancel_prompt(sessionId)`，对应 ACP 的 `session/cancel`——取消当前 prompt，不销毁 session。

## 架构位置

fyllo-spawn 作为第三个 bundled MCP server，与 fyllo-specs、fyllo-cortex 并列注册在 `src/main/infra/mcp/bundled-mcp-servers.ts` 中。

```
src/mcp-servers/
├── fyllo-specs/
├── fyllo-cortex/
└── fyllo-spawn/        # 新增
    └── src/
        ├── server.ts
        └── tools/
            ├── index.ts
            ├── available-agents.ts
            ├── prompt-agent.ts
            └── check-status.ts
```

### 递归防护

子 agent 不应被注入 fyllo-spawn，防止无限派生。在 `bundled-mcp-servers.ts` 中，fyllo-spawn 创建子 agent session 时应排除自身。

## Session ID 分层

MCP tool 层面暴露的 `sessionId` 是 FylloCode 生成的 `fylloSessionId`，**不是** ACP agent 的 `acpSessionId`。主进程内部维护映射：

```
fylloSessionId (tool 暴露) → acpSessionId (ACP 内部)
```

主 agent 永远不接触 acpSessionId。这与现有 chat session 的模式一致——renderer 也只持有 fylloSessionId，acpSessionId 由主进程管理。

## 主进程管理

### SpawnedSessionManager

主进程新增 `SpawnedSessionManager`，管理所有由 fyllo-spawn 派生的 agent session。

#### Session 注册表

```
Map<fylloSessionId, SpawnedSessionEntry>
```

SpawnedSessionEntry:

| 字段           | 类型                       | 说明                                       |
| -------------- | -------------------------- | ------------------------------------------ |
| fylloSessionId | string                     | FylloCode 生成的 session ID（tool 层暴露） |
| agentId        | string                     | 子 agent ID                                |
| acpSessionId   | string                     | ACP 层 session ID（内部使用，不暴露）      |
| status         | `running \| idle \| error` | 当前状态                                   |
| lastResponse   | string \| null             | idle 时填充上次 prompt 完整输出            |
| activityRing   | string[]                   | 最近 3 条文本片段（running 时更新）        |
| lastActivityAt | string \| null             | 上次收到 session/update 的时间戳           |
| configOptions  | AcpSessionConfigOption[]   | session 建立后由 agent 推送                |
| error          | string \| null             | error 时填充错误描述                       |

#### 与现有模块的复用关系

**直接复用：**

- `acp-process-pool`：spawned session 使用的子 agent 与用户手动选择的 agent 共享同一个 AgentProcess。一个 connection 上可跑多个 ACP session，这是 ACP 的正常使用方式。
- `AcpSession` 类：每次 `prompt_agent` 调用本质是一次 ACP prompt turn，可复用 AcpSession 的 process acquisition、session recovery、prompt dispatch 逻辑。

**不复用：**

- `session-registry`：现有 owner 类型（chat/apply/archive）都是 renderer 驱动，cancel 语义（用户 UI 操作触发）不适用于 spawned session。SpawnedSessionManager 自行管理注册和取消。
- `acp-stream-driver`：它把 SessionEvent 转发到 renderer 的 StreamOutput。spawned session 不需要推 renderer，需要的是收集事件构建 response + 维护 activity snapshot。
- `session-probe-service`：spawned session 不需要 probe，直接 newSession 就能拿到 configOptions。

#### 事件收集

spawned session 的 sessionHandler 做两件事（替代 acp-stream-driver 的 renderer 转发）：

1. **构建最终 response**：累积 `agent_message_chunk` 文本，prompt 完成后拼成完整 response 存入 entry.lastResponse。
2. **维护 activity snapshot**：每次 `agent_message_chunk` 或 `tool_call`（取 title）到来时，截取前 N 字符存入 3 槽环形缓冲区 entry.activityRing，更新 entry.lastActivityAt。

#### 错误处理

监听 `onAgentUnavailable` 事件。当子 agent 进程 crash 时，把所有该 agentId 的 spawned session 标记为 `error`，确保 `check_status` 立刻返回 error 而非永远 running。

#### 生命周期

v1 不做清理。entry 是纯内存数据，app 退出即消失。后续如有需要可加：

- 跟随父 session 清理（需记录 parentFylloSessionId）
- TTL 自动过期

## 通信机制

### 方案评估

在 stdio 架构下，fyllo-spawn 运行在 ACP agent 的子进程中，与主进程之间没有直接父子进程关系。评估了四种通信方案：

| 方案                  | 机制                                    | 结论                                                                                                                                                                                                 |
| --------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. MCP Event File     | 复用 `FYLLO_MCP_EVENT_DIR` + `fs.watch` | **排除**。现有 event file 是 fire-and-forget 侧信道，不支持请求/响应。要支持需加回传文件 + 轮询，等于在文件系统上造 RPC。`fs.watch` 延迟不可控（macOS 几十到几百毫秒），同步 `prompt_agent` 会很慢。 |
| B. Unix Domain Socket | 主进程创建 socket，路径通过 env 注入    | **可行**。天然请求/响应，延迟低。但引入新通信原语，需处理 socket 生命周期和跨平台差异（Unix socket vs named pipe）。                                                                                 |
| C. Node IPC           | `child_process` 内置 IPC channel        | stdio 架构下**排除**（MCP server 是 agent 的子进程，非主进程的子进程）。HTTP 化后**采用**（主进程直接 spawn fyllo-spawn，天然有 IPC channel）。                                                      |
| D. HTTP localhost     | 主进程起 HTTP server，端口通过 env 注入 | **可行**。标准请求/响应，调试方便，Node `http` 零依赖。需绑 127.0.0.1 + token 校验。                                                                                                                 |

### 采用方案：先 HTTP 化，再用 Node IPC

#### 前置：bundled MCP server HTTP 化

当前 stdio 模式存在进程膨胀问题。每个 ACP agent 进程收到 `newSession({ mcpServers })` 后，为每个 stdio MCP server 各 spawn 一个子进程：

```
当前：进程数 = agents × bundledMcpServers

claude-acp 进程
  ├── fyllo-specs 子进程
  ├── fyllo-cortex 子进程
  └── fyllo-spawn 子进程

codex-acp 进程
  ├── fyllo-specs 子进程
  ├── fyllo-cortex 子进程
  └── fyllo-spawn 子进程
```

将 bundled MCP server 迁移到 HTTP 模式后，由主进程统一托管，通过 `McpServerHttp`（`{ type: "http", url, headers }`）传给 ACP agent。ACP agent capability 中支持 HTTP 的使用 `McpServerHttp`，不支持的退化为 stdio 方式。

**fyllo-spawn 只注入给支持 HTTP 的 agent。** fyllo-spawn 依赖 Node IPC channel 与主进程通信，而 IPC channel 要求主进程直接 spawn fyllo-spawn（父子进程关系）。stdio 回退时 fyllo-spawn 是 agent 的子进程（孙进程），IPC 不可用。因此不支持 HTTP 的 agent 不具备跨 agent 派生能力——这是功能降级，但当前主流 ACP agent 均支持 HTTP，实际影响极小。fyllo-specs 和 fyllo-cortex 不受此限制，它们是纯 MCP tool，不需要与主进程做请求/响应通信，stdio 回退无影响。

```
目标：进程数 = agents + bundledMcpServers

主进程
  ├── fyllo-specs 子进程 (HTTP server)
  ├── fyllo-cortex 子进程 (HTTP server)
  └── fyllo-spawn 子进程 (HTTP server + IPC)

claude-acp 进程 (无 MCP 子进程)
codex-acp 进程 (无 MCP 子进程)
```

ACP 协议已原生支持 `McpServerHttp` 类型（`@agentclientprotocol/sdk` 的 `McpServer` union 包含 `{ type: "http", url, headers, name }`）。

**需要验证：**

- 各 ACP agent 实现（Claude Code、Codex 等）是否支持 `type: "http"` 的 MCP server
- stdio → HTTP 迁移后的 session 隔离：现有 `FYLLO_SESSION_ID`、`FYLLO_PROJECT_PATH` 等进程级 env 变量需改为请求级参数（HTTP header）

#### fyllo-spawn 通信：Node IPC Channel

HTTP 化完成后，bundled MCP server 由主进程直接 spawn 为子进程。fyllo-spawn 与主进程之间有直接父子关系，可以使用 Node 内置 IPC channel。

主进程 spawn fyllo-spawn 时配置 `stdio: ['pipe', 'pipe', 'pipe', 'ipc']`，第四个 fd 自动建立 IPC 通道。fyllo-spawn 的 tool handler 通过 `process.send()` / `process.on('message')` 与主进程通信：

```
fyllo-spawn 子进程                     主进程
─────────────────                     ──────
tool handler 收到 MCP request
  → process.send({ type, params })  →  process.on('message') 收到
                                        → 调用 SpawnedSessionManager
                                        → child.send({ id, result })
  ← process.on('message') 收到     ←
  → 返回 MCP tool response
```

Node IPC channel 的特性：

- POSIX 底层用 Unix domain socket，Windows 用 named pipe，API 完全跨平台透明
- 不需要端口分配、socket 文件路径、token 校验
- 消息有序，JSON 序列化由 Node 运行时自动处理
- 与 MCP HTTP transport 使用的 stdin/stdout 互不干扰（独立 fd）
- 进程退出时自动清理，无需手动管理生命周期

fyllo-spawn 代码保持独立（`src/mcp-servers/fyllo-spawn/`），不依赖主进程的任何模块，只依赖 IPC 消息协议。主进程侧暴露一组 IPC message handler 调用 `SpawnedSessionManager`。

#### 执行计划

1. **先做 bundled MCP HTTP 化**：将 fyllo-specs、fyllo-cortex 迁移到 HTTP 模式，由主进程直接 spawn 并托管。
2. **再做 fyllo-spawn**：作为独立 MCP server 模块（`src/mcp-servers/fyllo-spawn/`），由主进程 spawn，通过 Node IPC channel 调用主进程的 `SpawnedSessionManager`。

## 待讨论

- [ ] 子 agent 的 MCP servers 配置：子 agent 是否需要 fyllo-specs / fyllo-cortex
- [ ] 子 agent 权限模型：requestPermission 策略
- [ ] 超大 response 的最终方案
