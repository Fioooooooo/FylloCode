# fyllo-spawn Delta Specification

## Purpose

修改 fyllo-spawn 的 `background` 参数默认值和工具描述，鼓励异步使用模式以提升可观测性。

## MODIFIED Requirements

### Requirement: fyllo-spawn 只向具备 HTTP MCP 能力的 fyllocode Chat 提供四个 tools

系统 SHALL 将 `fyllo-spawn` 注册为 HTTP-only bundled MCP server，并 SHALL 提供 `available_agents`、`prompt_to_agent`、`check_session_status`、`read_response` 与 `cancel_session` 五个 tools。`native` Chat、缺少 HTTP MCP 能力的 Agent或 fyllo-spawn backend 不可用的 activation SHALL 不获得该 server。

#### Scenario: 支持 HTTP 的 fyllocode Chat

- **WHEN** fyllocode Chat 创建 ACP activation，Agent 声明 HTTP MCP capability且 fyllo-spawn backend ready
- **THEN** activation SHALL 获得 fyllo-spawn HTTP spec和五个 tools（包含新增的 cancel_session）
- **AND** SHALL NOT 为该 activation 创建 fyllo-spawn stdio child

### Requirement: background prompt 在 durable dispatch 后返回 accepted且继续持有 turn

`prompt_to_agent` SHALL接受默认值为**true**的可选`background`参数。`background=false` SHALL保持同步等待terminal result的现有行为；`background=true` SHALL在父snapshot与Agent校验、user message与running turn record持久化、ACP activation及config处理完成、session handler注册且`connection.prompt`已经提交后返回`accepted`。accepted结果 SHALL包含`sessionId`、`turnId`、`startedAt`、最终config snapshot与warnings，且 SHALL NOT包含`responseId`、content、cursor或文件路径。

后台首次RPC返回 SHALL NOT取消或释放 ACP turn；Main SHALL继续持有runner、registry entry、busy状态、inactivity watchdog与父级/全局active容量，直至terminal finalizer完成。后台RPC在accepted前被取消 SHALL取消该turn；accepted结算后客户端断连 SHALL NOT取消已经由Main接管的turn。

Tool description SHALL 强调异步模式的优势：

- 父 Agent 可以在等待时继续工作或报告进度
- 用户可以同时观察两个 Agent 的工作状态
- 适合长耗时或复杂的委托任务
- 同步模式仅用于必须立即阻塞等待结果的简单场景

#### Scenario: 后台新Session被接受

- **WHEN**可信父Agent调用`prompt_to_agent`且未显式指定`background`（默认为 true），且ACP prompt成功提交
- **THEN**tool SHALL返回`status: accepted`、owner-scoped spawned sessionId、唯一turnId、startedAt、config和warnings
- **AND** SHALL不等待首个ACP activity或terminal result
- **AND** SHALL不返回responseId、响应正文或路径

#### Scenario: 显式请求同步模式

- **WHEN** 父 Agent 调用 `prompt_to_agent` 并显式传递 `background: false`
- **THEN** tool SHALL 阻塞等待 terminal result
- **AND** 返回 completed 或 error 状态（不返回 accepted）

#### Scenario: accepted后同Session再次收到prompt

- **WHEN**后台调用已返回accepted但对应ACP turn尚未进入终态
- **THEN**同一owner再次向该spawned Session发送prompt SHALL立即返回busy
- **AND**父级与全局active容量 SHALL继续包含该turn

#### Scenario: accepted持久化失败

- **WHEN**ACP prompt已在本地提交但accepted turn record无法durable写入
- **THEN**Main SHALL请求取消runner并以错误结束首次调用
- **AND** SHALL NOT返回accepted或completed

## ADDED Requirements

### Requirement: Tool description 明确异步优先的使用指导并说明同步模式限制

`prompt_to_agent` tool description SHALL 在开头明确建议使用默认异步模式（`background: true`），并说明：

- **推荐做法**：使用默认异步模式，调用后立即输出 `spawn.session` Signal，然后通过 `check_session_status` 轮询进度
- **同步模式适用场景**：仅当任务简单、耗时短（< 30秒）且父 Agent 无其他工作时才使用 `background: false`
- **同步模式限制**：由于同步调用阻塞到完成，Agent 无法在执行期间输出 Signal，Signal 会在任务完成后才显示，影响用户可观测性
- **轮询模式**：提供轮询的伪代码示例，展示如何在等待时向用户报告进度

#### Scenario: Agent 阅读 tool description

- **WHEN** 父 Agent 查询 `prompt_to_agent` tool 的描述
- **THEN** description SHALL 在开头说明异步是推荐模式
- **AND** 提供轮询和进度报告的示例代码
- **AND** 明确同步模式的适用场景、可观测性限制和 Signal 延迟问题
