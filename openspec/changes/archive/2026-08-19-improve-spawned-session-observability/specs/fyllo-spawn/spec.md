## ADDED Requirements

### Requirement: prompt_to_agent不依赖spawn.session提供用户可观察性

`prompt_to_agent`的Agent-facing description SHALL说明FylloCode通过Main-owned owner-scoped inspection自动发现并更新spawned Sessions，用户可观察性不依赖父Agent输出`spawn.session`。Description SHALL NOT要求新建调用后立即输出Signal，也 SHALL NOT把continuation不输出Signal描述为可观察性缺失。

该变化 SHALL保持`prompt_to_agent`现有输入、accepted/completed/error结果、五个HTTP-only tools、`responseId + read_response`契约和异步优先指导不变。`spawn.session` MAY继续作为可选上下文详情深链，但tool description SHALL引用shared Signal contract而不复制payload schema、JSON example或Markdown格式规则。

#### Scenario: Tool description说明自动发现

- **WHEN** 父fyllocode Chat获得fyllo-spawn `prompt_to_agent` tool description
- **THEN** description SHALL说明Main-owned inspection自动提供Session发现和状态
- **AND** SHALL不要求父Agent输出Signal才能让用户观察

#### Scenario: 同一Session开始后续Turn

- **WHEN** 父Agent向owner-matched已有sessionId发送第二个Prompt
- **THEN** Main SHALL按既有runtime创建新Turn并通过owner-scoped view更新同一Session
- **AND** 用户可观察性 SHALL不依赖新的Signal或MCP event文件

## MODIFIED Requirements

### Requirement: Tool description 明确异步优先的使用指导并说明同步模式限制

`prompt_to_agent` tool description SHALL 在开头明确建议使用默认异步模式（`background: true`），并说明：

- **推荐做法**：使用默认异步模式，让Main-owned inspection自动向用户展示Session与状态；父Agent可通过`check_session_status`轮询进度，并在等待时继续工作或报告进度；
- **同步模式适用场景**：仅当任务简单、耗时短（< 30秒）且父Agent无其他工作时才使用`background: false`；
- **同步模式限制**：同步调用会阻塞父Agent直到terminal，但FylloCode inspection仍 MAY在运行期间通过Main view wake展示该sync Turn；
- **轮询模式**：提供轮询的伪代码示例，展示如何在等待时向用户报告进度；
- **Signal边界**：`spawn.session`只可作为shared contract定义的可选详情深链， SHALL NOT被描述为用户可观察性的必要步骤。

#### Scenario: Agent阅读tool description

- **WHEN** 父Agent查询`prompt_to_agent` tool的描述
- **THEN** description SHALL在开头说明异步是推荐模式
- **AND** SHALL提供轮询和进度报告示例并明确同步模式限制
- **AND** SHALL说明用户inspection独立于Signal，不再指导“立即输出Signal”

## REMOVED Requirements

### Requirement: prompt_to_agent引导父Agent为新建Session输出spawn.session

**Reason**: 新建和续聊Session的权威事实已经由Main typed RPC、durable records和view wake掌握，要求父Agent输出Markdown Signal会把可观察性错误绑定到不稳定文本。

**Migration**: 用“prompt_to_agent不依赖spawn.session提供用户可观察性”替代必需输出指导；shared Signal与历史renderer保持兼容并作为可选深链。

#### Scenario: 旧Signal指导被移除

- **WHEN** 新版本fyllo-spawn注册`prompt_to_agent`
- **THEN** tool description SHALL不再要求新建结果输出Signal
- **AND** SHALL保持accepted、continuation、status和response读取语义不变
