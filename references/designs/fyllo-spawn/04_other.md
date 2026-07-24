## 全盘边界审视

---

### 1. Session 创建 & 首次通信

| 边界点                             | 现状                                                                                                                                           | 建议                                                                                                                                                                    |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **agent 进程未启动时的冷启动延迟** | 01 说复用 `acp-process-pool`，但没讨论首次 spawn 需要启动进程 + ACP initialize + newSession 的耗时，同步模式下 MCP tool call 会阻塞很久        | 值得在 01 记一笔预期延迟范围，以及是否需要在 tool response 前给主 agent 一个"正在连接"的中间状态（MCP 本身不支持 progress，但可以在 description 里提示 agent 告知用户） |
| **newSession 失败**                | 01 提到了 error 状态的触发场景（crash、断连、未捕获异常），但没覆盖 **newSession 本身失败**（比如 agent 拒绝、quota 超限、ACP handshake 失败） | `prompt_to_agent` 应有明确的首次创建失败返回格式（区别于 session_busy）                                                                                                 |
| **agentId 无效**                   | `available_agents` 返回列表，但 `prompt_to_agent` 传入不存在的 agentId 没有讨论                                                                | 应返回明确错误，比如 `agent_not_found`                                                                                                                                  |

### 2. 同步 prompt turn 执行中

| 边界点                            | 现状                                                                                                                                                                    | 建议                                                                                                                                                                                                                                    |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **主 agent cancel（用户点停止）** | 01 "不做 kill_agent" 章节提到了未来可加 `cancel_prompt`，但没讨论当**主 session 的 turn 被用户 cancel** 时，正在阻塞等待的同步 `prompt_to_agent` MCP tool call 如何中断 | 这是个真实场景：用户在主 session 点 Stop，主进程 cancel 主 session 的 ACP prompt，但子 agent 的 prompt 还在跑。需要定义：(a) 是否级联 cancel 子 agent 的 prompt？(b) cancel 后子 session 的状态是什么？(c) response.md 是否保留半成品？ |
| **同步模式超时**                  | 子 agent 的 prompt turn 可能跑很久（10min+），同步模式下 MCP tool call 一直阻塞。ACP 有 timeout 吗？MCP SDK 有 tool call timeout 吗？                                   | 如果 MCP SDK 层有超时，同步模式可能在子 agent 还在跑时就超时返回错误。需要确认并决定：是否设置合理的超时？超时后子 session 状态如何处理？这也是为什么 background 模式很重要——但 agent 需要知道什么时候该用 background                   |
| **response.md 覆盖写入的竞争**    | 01 说每次 turn 覆盖写入 response.md。如果主 agent 在读 response.md 的同时子 agent 的下一个 turn 在写，会有部分读取                                                      | 同步模式下不太可能（turn 完成才返回），但续 session 时如果用户快速操作可能出现。可以忽略（极低概率），但值得记一笔                                                                                                                      |

### 3. Background 模式

| 边界点                                   | 现状                                                                                           | 建议                                                                                                                                                               |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **多个 background session 并发**         | 02 的并发处理只讨论了 notification 合并，没讨论 **同时运行多个 background session 的资源问题** | 多个子 agent 同时运行 = 多个进程并发读写项目文件。是否需要限制并发数？还是完全放开让 agent 自己判断？至少值得在文档中表态                                          |
| **background 通知时主 session 已被删除** | 子 agent 在后台跑了很久，用户在这段时间删除了父 session                                        | `spawn:done` 事件到达 renderer，renderer 尝试向已不存在的 session 发 streamMessage。需要 guard                                                                     |
| **background 通知时 app 即将退出**       | 用户关闭 app，子 agent 还在后台执行                                                            | app 退出时子进程会被 kill，但 meta.json 的 status 停留在 running。03 提到了"UI 可标记为中断"——建议在 01 的生命周期章节也提一下 app 退出时的 graceful shutdown 策略 |
| **system-reminder 通知的幂等性**         | 如果通知发出但 agent 处理中 app crash 重启，通知丢失                                           | 这是可接受的（重启后 session 不可续），但值得显式标记为已知限制                                                                                                    |

### 4. Session 续对话 & 多 turn

| 边界点                                  | 现状                                                                                     | 建议                                                                                                                                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **session recovery（子 agent 重启后）** | 01 提到 AcpSession 的 session recovery 可复用，但没展开 spawned session 的 recovery 场景 | 子 agent 进程重启（crash 后 acp-process-pool 自动重启）时，现有 AcpSession recovery 机制是否能恢复 spawned session？如果不能，`check_session_status` 是否应从 `running` 变成 `error`？ |
| **stale session 的生命周期**            | 01 "v1 不做主动清理"，内存 entry 在 app 退出时消失                                       | 长时间运行的 app（用户不关 app）可能累积大量 idle 的 SpawnedSessionEntry。内存消耗不大，但应有上限意识。可以 noted as known limitation                                                 |

### 5. fyllo-signal & UI（03）

| 边界点                              | 现状                                                                                                                                          | 建议                                                                                                                                                                                                                                                            |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Signal 在对话历史中的持久性**     | 03 定义了 signal 是 agent 文本输出中嵌入的 tag，持久化在 messages.jsonl 中。app 重启后 signal 能正常渲染吗？                                  | 需要确认：reload 后 signal 组件能从 sessionId 查到磁盘上的 meta.json，即使内存 entry 已丢失。03 的 slideover 数据来源已经写了从磁盘读，这点应该是通的，但 signal 的 status 实时更新（spawn:* 事件）在重启后不再推送——signal 应该 fallback 到从 meta.json 读状态 |
| **Slideover 的 running 态实时更新** | 03 说 "主进程推送 session/update 事件到 renderer"，但这与 01 的设计矛盾——01 说 spawned session 不用 acp-stream-driver，事件收集在主进程侧完成 | 需要明确：slideover 的 activity 实时更新是通过什么通道？新的 IPC 事件？还是复用 spawn:* 事件携带 activity 数据？                                                                                                                                                |

### 6. 安全 & 权限

| 边界点                          | 现状                                               | 建议                                                                                                                                           |
| ------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **子 agent 权限模型**           | 01 待讨论列表中有 `requestPermission 策略`，未解决 | 这是最重要的未决项。子 agent 执行 tool call 时谁来批准？静默批准？转发给主 session 的用户？如果转发，UI 如何展示？这直接影响用户体验和安全模型 |
| **子 agent 对项目文件的写操作** | 没有讨论                                           | 多个 agent（主 + 子）并发写同一个文件是真实风险。是否需要文件锁？还是通过限制并发数来规避？                                                    |

### 7. 跨文档一致性小问题

- 01 的 `check_session_status` description 写的是 `"Use this to monitor progress or detect failures."`，02 更新后变成 `"Use this to poll background tasks started with prompt_to_agent(background=true), monitor progress, or detect failures."`——02 的版本是增量替换，合理
- 01 `available_agents` 的 description 说 `"does not include configuration options (use check_session_status after establishing a session to get those)"`，但实际设计是 **prompt_to_agent** 返回 config，不是 check_session_status。需要修正

---

### 总结：最关键的 3 个遗漏

1. **用户 cancel 主 session 时同步 prompt_to_agent 的级联中断** — 不处理的话子 agent 会无意义地跑完整个 turn，浪费资源和 token
2. **子 agent requestPermission 策略** — 已在待讨论列表但必须在 Phase 1 实现前定义，直接影响是否可用
3. **available_agents description 中关于 config 来源的表述错误** — 小修，但会误导 agent
