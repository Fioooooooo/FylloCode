## ADDED Requirements

### Requirement: prompt_to_agent引导父Agent为新建Session输出spawn.session

`prompt_to_agent`的Agent-facing description SHALL说明：当本次调用省略`sessionId`且结果包含新建Session identity时，父Agent应按照已注入的`spawn.session` Signal contract输出一次创建入口；当调用继续已有sessionId时不再输出。Tool description SHALL引用shared Signal contract而不复制payload schema、JSON example或Markdown格式规则。

该指导 SHALL同时适用于同步和`background=true`的新建调用，并 SHALL保持`prompt_to_agent`现有输入、accepted/completed/error结果、四个HTTP-only tools和`responseId + read_response`契约不变。

#### Scenario: Tool description提示新建Signal

- **WHEN** 父fyllocode Chat获得fyllo-spawn `prompt_to_agent` tool description
- **THEN** description SHALL提示新建结果遵循`spawn.session` contract
- **AND** SHALL提示continuation不重复输出
- **AND** SHALL不宣传responsePath或任何本地路径

#### Scenario: Agent不遵循Signal指导

- **WHEN** 父Agent漏发或重复发出`spawn.session`
- **THEN** Main SHALL不因此创建、删除、继续或复制spawned Session、turn、response或notification
- **AND** owner-scoped status、持久化和background composer入口 SHALL继续正确

### Requirement: 用户可观察性不改变spawned runtime约束

为用户展示spawned Session状态、活动和输出 SHALL复用现有HTTP-only backend、可信父Session context、Workspace snapshot、ACP process pool、`AcpSession`、turn driver、config recovery、persisted meta/turn/messages/responses、process generation、父删除和集中shutdown。系统 SHALL继续使用`allow_once`，不给spawned Agent注入FylloCode system reminder或bundled MCP。

Inspection SHALL不新增Agent tool，不改变单spawned Session 1、单父Session 4、全局8 active turn限制，不改变10分钟ACP inactivity watchdog或5秒cancel grace，也不增加绝对运行时长或累计Session上限。

#### Scenario: UI打开running详情

- **WHEN** 用户在spawned turn running期间打开或刷新详情
- **THEN** Main SHALL只读取现有active handle和durable records
- **AND** SHALL不创建额外AgentProcess、ACP Session、turn reservation或timer

#### Scenario: UI关闭或窗口reload

- **WHEN** 用户关闭Slideover、reload renderer或关闭Workspace窗口
- **THEN** app-owned background spawned turn SHALL按现有生命周期继续
- **AND** active容量与watchdog SHALL保持到terminal finalizer
