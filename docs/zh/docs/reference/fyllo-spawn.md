---
sidebar:
  group: 参考
  order: 25
---

# fyllo-spawn MCP

`fyllo-spawn` 是 FylloCode 内置的跨 ACP Agent 委派服务。当前 Chat Agent 可以把一个聚焦任务交给另一个已安装的 Agent，同步等待结果或让 Main 在后台持有 turn；所有调用都固定在发起委派的 Workspace 与父 Chat Session 作用域内。

## 可用条件

`fyllo-spawn` 只通过 HTTP bundled MCP 提供，不支持 stdio fallback。它只会出现在满足以下条件的 Chat Session 中：

- Session 使用 `FylloCode` 模式；
- 当前 Agent 声明 HTTP MCP capability；
- 应用级 `fyllo-spawn` backend 已就绪。

原生模式、缺少 HTTP MCP 支持或 backend 不可用时，activation 会省略这个 server。其他允许 stdio fallback 的 bundled MCP server 不受影响。

## Tool 列表

| Tool | 输入 | 作用 |
| --- | --- | --- |
| `available_agents` | 无 | 返回已安装的 registry Agent 与有效 custom Agent；不启动进程或创建 Session |
| `prompt_to_agent` | `agentId`、`prompt`，可选 `sessionId`、`config`、`background` | 新建 spawned Session，或继续同一 owner 下仍可复用的 Session |
| `check_session_status` | `sessionId` | 不等待运行中 turn，直接读取当前状态快照 |
| `read_response` | `sessionId`、`responseId`，可选 `cursor`、`maxBytes` | 用不透明 cursor 分段读取已完成响应 |
| `cancel_session` | `sessionId` | 请求取消当前父 Session 名下正在运行的 spawned Session |

`prompt_to_agent` 省略 `sessionId` 时创建新 Session；提供 `sessionId` 时继续已有 Session。`config` 的值可以是 string 或 boolean，Main 会按 Agent 返回的 config schema 校验并在 prompt 前逐项设置。某项设置失败不会阻断 prompt，但会出现在 `warnings` 中。

`background` 默认为 `true`。后台调用在 Main 已持久化 turn、应用配置并提交 ACP prompt 后返回 `accepted`；这只表示 Main 已接管，父 Agent 可以继续工作或汇报进度，最终结果通过 `check_session_status` 和 `read_response` 获取。只有简单、快速且父 Agent 需要主动阻塞等待的任务才显式传 `background: false`：同步调用等待 terminal result，并直接返回最多 24 KiB 的 UTF-8 安全响应前缀，但阻塞期间 Agent 无法输出任何内容，`spawn.session` Signal 只能在任务完成后才显示。

`cancel_session` 请求 Main 取消正在运行的 spawned Session。返回 `{ cancelled: true }` 只表示取消请求已触发，不代表 ACP turn 已确认取消；turn 可能再运行几秒，随后以 `error` 状态（错误码 `TURN_CANCELLED_BY_PARENT`）结束，且该 Session 不可再复用。最终状态需要通过 `check_session_status` 确认。目标不在运行状态时（不存在、已结束或属于其他父 Session），统一返回 `{ cancelled: false, reason: "Session not found" }`，不区分具体情况。

## 状态与响应

`check_session_status` 返回以下状态：

| 状态 | 含义 |
| --- | --- |
| `not_found` | 目标不存在或不属于当前 Workspace / 父 Session；两种情况不会被区分 |
| `running` | turn 正在运行，包含 mode、时间和最多三条最近 Activity |
| `idle` | 最新 turn 已完成，可包含 `latestResponseId` |
| `error` | turn 失败，包含稳定 code 与 message |
| `expired` | AgentProcess generation 已变化，旧 ACP Session 不能继续 |
| `interrupted` | 应用正常退出或重启恢复后确认 turn 未继续 |

完整响应使用不可变 `responseId` 标识。`read_response` 默认每次读取 24 KiB，`maxBytes` 上限为 64 KiB；cursor 只能使用 server 返回的不透明值。Tool 不接受或暴露 app-data 文件路径。

## 并发、超时与权限

- 同一个 spawned Session 同时只能有一个 active turn。
- 同一个父 Chat Session 最多同时运行 4 个 spawned turns，全应用最多 8 个。
- 达到容量时立即返回可重试的 `SPAWN_CAPACITY_EXCEEDED`，不会排队。
- turn 没有绝对运行时长限制；连续 10 分钟没有 ACP activity 时会请求取消，并等待 5 秒确认。
- spawned Agent 复用父 Session 创建时固定的 `cwd` 与 `additionalDirectories`，不会使用当前 Workspace 的新成员扩大授权。
- spawned Agent 不接收 FylloCode system reminder 或任何 bundled MCP，并沿用现有 ACP connection 的 `allow_once` 权限策略。

多个 spawned Agent 共享同一组 Workspace 目录。并行委派时必须拆分互不重叠的文件范围，`fyllo-spawn` 不提供独立 worktree、文件锁或自动合并。

## 用户可见检查

新建 spawned Session 后，父 Agent 可以按 [Fyllo Signal](/docs/reference/fyllo-signal) 契约输出一次 `spawn.session`。点击后，FylloCode 从 Main 查询可信状态、原始 Prompt、Activity、Transcript 与 response ID；当前父 Session 的 active background turns 也会汇总在 Chat 输入区附近。

这些入口只读。打开、关闭或刷新详情不会继续、取消、重试任务，也不会消费后台完成通知。窗口重开会重新查询持久化记录；后台 turn 不跨应用进程继续，正常退出记录为 `APP_SHUTDOWN`，异常重启后的遗留非终态记录为 `APP_RESTARTED`。

## Owner 与数据边界

调用方的 `workspaceId` 与父 Session ID 只来自 Main proxy 注入的可信请求上下文，tool input 不能覆盖。Main 会重新校验父 Session、固定 Workspace snapshot 和 spawned Session owner；跨 Workspace 或跨父 Session 的 ID 统一返回 `not_found`。

消息、turn record 和完整 response 保存在父 Session 的本地数据目录下，并随父 Session 删除。删除会先阻止新 turn、取消关联工作并抑制未投递通知，再清理整个父 Session 目录；迟到事件不能重新创建已删除的数据。
