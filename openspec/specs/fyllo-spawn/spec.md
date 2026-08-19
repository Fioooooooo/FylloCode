# fyllo-spawn Specification

## Purpose

定义 FylloCode 通过 HTTP-only bundled MCP 将可信父 Session 的工作委派给复用现有 ACP runtime 的 spawned Sessions，并约束 Workspace 归属、并发、持久化、超时、响应分段和生命周期清理。

## Requirements

### Requirement: fyllo-spawn 只向具备 HTTP MCP 能力的 fyllocode Chat 提供五个 tools

系统 SHALL 将 `fyllo-spawn` 注册为 HTTP-only bundled MCP server，并 SHALL 提供 `available_agents`、`prompt_to_agent`、`check_session_status`、`read_response` 与 `cancel_session` 五个 tools。`native` Chat、缺少 HTTP MCP 能力的 Agent或 fyllo-spawn backend 不可用的 activation SHALL 不获得该 server。

#### Scenario: 支持 HTTP 的 fyllocode Chat

- **WHEN** fyllocode Chat 创建 ACP activation，Agent 声明 HTTP MCP capability且 fyllo-spawn backend ready
- **THEN** activation SHALL 获得 fyllo-spawn HTTP spec和五个 tools（包含新增的 cancel_session）
- **AND** SHALL NOT 为该 activation 创建 fyllo-spawn stdio child

#### Scenario: Agent 不支持 HTTP

- **WHEN** fyllocode Chat 的 Agent 不声明 HTTP MCP capability
- **THEN** activation SHALL 省略 fyllo-spawn
- **AND** 其他允许 stdio fallback 的 bundled MCP server SHALL 继续按各自 policy工作

### Requirement: available_agents 只读取已安装 Agent目录

`available_agents` SHALL 返回当前已安装 registry Agent与有效 custom Agent的 `agentId`、显示名称和简短描述，SHALL NOT 为列表查询启动 AgentProcess或创建 ACP Session，且 SHALL NOT 返回 session config options。列表 MAY 包含与调用方同类型的 Agent；spawned ACP Session不获得 fyllo-spawn，因此 SHALL NOT 形成递归派生。

#### Scenario: 查询已安装 Agent

- **WHEN** 当前目录包含两个已安装 registry Agent和一个有效 custom Agent
- **THEN** `available_agents` SHALL 返回三个条目
- **AND** SHALL NOT 调用 ACP `initialize`、`newSession` 或 draft probe

#### Scenario: Agent 未安装

- **WHEN** registry中存在但未安装的 Agent
- **THEN** `available_agents` SHALL 不返回该 Agent

### Requirement: Tool 调用方身份只来自可信 Workspace 请求上下文

fyllo-spawn SHALL 从 Main proxy 注入的 `McpWorkspaceDescriptorV2` 请求上下文取得 `workspaceId` 与父 `fylloSessionId`，并 SHALL NOT 接受 tool 参数、caller header或进程级环境变量覆盖该身份。每次续聊、状态查询和响应读取 SHALL 校验 spawned Session属于同一 `{ workspaceId, parentSessionId }`；不匹配时 SHALL 返回 `not_found`且不泄露目标是否存在。

#### Scenario: Agent 不提供父 Session参数

- **WHEN** Agent 调用 `prompt_to_agent` 且 tool input只包含 agentId、prompt和可选 spawned session/config
- **THEN** fyllo-spawn SHALL 从可信请求上下文取得父 Session identity
- **AND** Agent SHALL 无需知道或提交父 fylloSessionId

#### Scenario: 请求上下文缺少 Session

- **WHEN**可信 descriptor不包含 sessionId
- **THEN** tool SHALL 返回 `SPAWN_PARENT_SESSION_REQUIRED`
- **AND** SHALL NOT 创建任何内存 entry或磁盘目录

#### Scenario: 跨父 Session猜测 spawned ID

- **WHEN** 当前调用方提交属于其他 Workspace或父 Session的 spawnedSessionId
- **THEN** tool SHALL 返回 `not_found`
- **AND** SHALL NOT返回 activity、error、config、responseId或文件内容

### Requirement: Spawned ACP Session 固定继承父 Chat Session的 multi-root 授权

Main SHALL 根据可信 caller identity加载父 Chat Session meta，重新校验其 `SessionWorkspaceSnapshot`，并使用该 snapshot的 `cwd` 与 `additionalDirectories` 创建 spawned ACP Session。Main SHALL 在创建前复用现有 Agent Workspace compatibility校验；SHALL NOT 使用 MCP child回传的 path、当前 Workspace的新成员集合或 primary fallback扩大授权。

#### Scenario: Collection Workspace创建 spawned Session

- **WHEN** 父 Session snapshot包含 primary和两个 additional Folder且仍全部有效
- **THEN** spawned `newSession` SHALL使用 snapshot primary path作为 cwd
- **AND** SHALL按 snapshot顺序传递两个 additionalDirectories
- **AND** spawned meta SHALL持久化同一固定 snapshot

#### Scenario: 父 snapshot stale

- **WHEN** 父 Session成员已被移除、缺失或重定位
- **THEN** `prompt_to_agent` SHALL在启动或取得 AgentProcess前返回现有对应 stale error
- **AND** SHALL NOT裁剪 snapshot或创建 spawned Session

#### Scenario: 目标 Agent不支持 additional directories

- **WHEN**父 snapshot包含 additionalDirectories且目标 Agent capability不是 supported
- **THEN** `prompt_to_agent` SHALL返回现有 `PROMPT_CAPABILITY_MISMATCH`
- **AND** SHALL NOT发送 ACP prompt

### Requirement: Spawned Session 复用现有 ACP runtime且采用 Phase 1最小注入策略

系统 SHALL 复用全局 ACP process pool、`AcpSession` activation/cancel/config与统一 SessionEvent映射。spawned ACP Session SHALL使用空 bundled MCP list和空 FylloCode system reminder，并 SHALL沿用当前 ACP connection的 `allow_once` permission策略；系统 SHALL NOT为 spawned Session创建第二个 AgentProcess池或独立 ACP协议实现。

#### Scenario: 目标 AgentProcess已经 ready

- **WHEN** `prompt_to_agent`选择的 agentId已有 ready AgentProcess
- **THEN** spawned Session SHALL复用该 connection创建新的 ACP Session
- **AND** SHALL NOT spawn第二个相同 agentId进程

#### Scenario: 创建 spawned ACP Session

- **WHEN** Main调用 ACP `newSession`
- **THEN** mcpServers SHALL为空且首轮 prompt SHALL不包含 FylloCode system reminder
- **AND** permission request SHALL继续采用现有 `allow_once`选择逻辑

### Requirement: prompt_to_agent 支持新建、续聊与 config override

`prompt_to_agent` SHALL在省略spawned sessionId时创建新Session，在提供owner-matched spawned sessionId时继续当前进程世代仍active的ACP Session。新Session SHALL以`newSession().configOptions`作为首次config schema和snapshot的主要来源；resume/load SHALL使用现有config recovery收敛持久化值与activation live options。config override SHALL在每次prompt前按option id、类型与候选值验证并逐项设置，包含仍active ACP Session的warm direct prompt路径。设置失败 SHALL不阻断prompt，但 SHALL通过结构化warnings返回；首次accepted或同步terminal snapshot SHALL不依赖异步`config_option_update`到达。

#### Scenario: 同步首次prompt返回config

- **WHEN**`newSession`返回model与thought level config options且同步prompt成功
- **THEN**tool结果 SHALL包含spawned sessionId、完成响应和精简config snapshot
- **AND** SHALL NOT等待异步config update才发送prompt

#### Scenario: 后台首次prompt返回config

- **WHEN**`newSession`返回完整config options且后台prompt已经提交
- **THEN**accepted结果 SHALL包含基于该返回值并应用本轮override后的config snapshot
- **AND**后续异步config update SHALL NOT改变已经返回的accepted snapshot

#### Scenario: 首轮指定config

- **WHEN**调用方在新Session请求中提交`config: { model: "o3" }`且该值属于`newSession`返回候选
- **THEN**Main SHALL在发送prompt前调用现有set-config-option RPC
- **AND**accepted或完成结果 SHALL反映成功应用后的current value

#### Scenario: warm续聊指定config

- **WHEN**调用方续聊仍active的spawned ACP Session并提交合法config override
- **THEN**Main SHALL在direct prompt前验证和应用该override
- **AND** SHALL NOT因跳过cold recovery而静默忽略override

#### Scenario: config设置失败

- **WHEN**一个合法config override被Agent拒绝但ACP Session仍可prompt
- **THEN**系统 SHALL继续发送prompt
- **AND**accepted或完成结果 SHALL包含该option的warning且不得声称设置成功

### Requirement: 系统只限制瞬时并发而不限制累计 spawned Session

同一spawned Session SHALL同时最多运行一个active turn；单个父Session SHALL同时最多运行4个spawned turns，全应用 SHALL同时最多运行8个spawned turns。active SHALL从reservation成功持续到terminal finalization结束；background首次accepted、MCP HTTP response结束或Workspace window关闭 SHALL NOT提前释放计数。系统 SHALL不限制累计创建的spawned Session数量、父Session使用时长或turn绝对运行时长，且 SHALL不因达到resident idle软目标拒绝新Session。

#### Scenario: 同一Session已有active turn

- **WHEN**同一owner再次向仍在starting、running或cancelling的spawned Session发送prompt
- **THEN**`prompt_to_agent` SHALL立即返回busy
- **AND** SHALL包含startedAt与lastActivityAt且不排队第二个turn

#### Scenario: 后台首次调用已经返回

- **WHEN**background调用已返回accepted但turn尚未terminal
- **THEN**该turn SHALL继续占用父Session与全局active容量
- **AND**其他请求 SHALL按同一1/4/8限制判断busy或capacity_exceeded

#### Scenario: 达到父Session并发上限

- **WHEN**同一父Session已有4个active spawned turns并请求第五个
- **THEN**系统 SHALL返回retryable `SPAWN_CAPACITY_EXCEEDED`
- **AND**现有4个turns SHALL继续运行

#### Scenario: 长期顺序创建Session

- **WHEN**父Session长期运行并已累计完成超过任意resident idle软目标数量的spawned Sessions
- **THEN**系统 SHALL仍允许在active容量可用时创建新Session
- **AND** MAY LRU卸载idle内存entry但 SHALL保留磁盘历史

### Requirement: Inactivity watchdog 取消无进展 turn

每个 active turn SHALL设置10分钟无 ACP activity watchdog，并 SHALL在匹配 Session的文本、reasoning、tool start/update、usage等有效进展到达时刷新 lastActivityAt和重置 timer。超时后系统 SHALL调用 ACP `session/cancel`并等待5秒；SHALL NOT因该 Session超时终止共享 AgentProcess。

#### Scenario: 长 turn持续产生进展

- **WHEN**一个 turn运行超过10分钟但每次间隔不足10分钟持续产生有效 ACP activity
- **THEN**watchdog SHALL持续重置
- **AND**系统 SHALL NOT仅因绝对运行时长取消 turn

#### Scenario: 无活动超时且取消确认

- **WHEN**turn连续10分钟无 activity且 ACP prompt在 cancel后的5秒内结算
- **THEN**tool SHALL以 `TURN_INACTIVITY_TIMEOUT`结束
- **AND**系统 SHALL清理 timer、handler与active容量计数

#### Scenario: 取消未确认

- **WHEN**turn连续10分钟无 activity且 cancel后5秒仍未结算
- **THEN**Session SHALL进入不可续用 error状态并返回 `TURN_CANCEL_UNCONFIRMED`
- **AND**迟到事件 SHALL被丢弃且后续 prompt SHALL NOT复用该 ACP Session

### Requirement: Spawned 对话与响应持久化在父 Session子目录

系统 SHALL将spawned meta、versioned turn records、完整`UIMessage` JSONL和不可变turn response写入`sessionDir(workspaceId, parentSessionId)/spawn/<spawnedSessionId>/`。每轮 SHALL先持久化主Agent发送给子Agent的`role=user` prompt，再持久化统一MessageAssembler产生的assistant message。response SHALL在terminal success record引用其responseId前durable；turn record和meta SHALL使用versioned schema与原子替换，单Session写入 SHALL串行。

#### Scenario: 成功完成一轮同步prompt

- **WHEN**主Agent以同步模式向子Agent发送prompt并收到assistant输出
- **THEN**messages.jsonl SHALL按顺序包含role=user prompt和role=assistant message
- **AND**responses目录 SHALL新增以responseId标识且之后不覆盖的Markdown结果
- **AND**turn record与meta SHALL更新turnCount、tokenUsage、latestResponseId与updatedAt

#### Scenario: 成功完成一轮后台prompt

- **WHEN**background turn收到assistant输出且response写入成功
- **THEN**系统 SHALL先durable写入不可变response
- **AND**再将turn record原子转换为completed、记录responseId并建立pending notification
- **AND**status或notification SHALL NOT在response可读前声称completed

#### Scenario: prompt失败并产生部分输出

- **WHEN**ACP prompt在产生部分assistant事件后失败
- **THEN**系统 SHALL保留user prompt与已组装的部分assistant message
- **AND**turn record与meta SHALL记录稳定error code/message而不伪报idle完成

#### Scenario: terminal持久化失败

- **WHEN**response、assistant message或terminal record的关键持久化无法完成
- **THEN**turn SHALL在仍可写时收敛为`TURN_PERSIST_FAILED`
- **AND** SHALL NOT生成completed success notification或不可读取的response引用

### Requirement: 小响应内联而大响应通过 read_response安全分段读取

同步`prompt_to_agent`成功结果 SHALL直接返回最多24 KiB的UTF-8安全响应前缀、responseId、truncated与可选nextCursor。background accepted结果 SHALL不包含响应；terminal success后`check_session_status` SHALL暴露latestResponseId，父Agent SHALL使用`read_response`读取结果。`read_response` SHALL按opaque cursor读取同一不可变response，默认块大小24 KiB且服务端最大64 KiB；SHALL不向Agent暴露或接受app-data绝对路径。

#### Scenario: 同步响应不超过inline上限

- **WHEN**同步完成响应的UTF-8大小不超过24 KiB
- **THEN**`prompt_to_agent` SHALL返回完整content且truncated为false
- **AND** SHALL不要求调用`read_response`

#### Scenario: 同步响应超过inline上限

- **WHEN**同步完成响应超过24 KiB
- **THEN**`prompt_to_agent` SHALL返回安全前缀、responseId、truncated为true和nextCursor
- **AND**主Agent SHALL可连续调用`read_response`直到done为true

#### Scenario: 后台响应完成

- **WHEN**background turn成功完成且status变为idle
- **THEN**`check_session_status` SHALL返回latestResponseId
- **AND**自动reminder MAY引用该responseId但 SHALL NOT内联响应正文
- **AND**父Agent SHALL通过`read_response`获取内容

#### Scenario: cursor或response归属无效

- **WHEN**`read_response`收到非法cursor、未知responseId或非当前owner的Session
- **THEN**系统 SHALL拒绝读取且不得接受caller提供的文件路径
- **AND**跨owner目标 SHALL投影为not_found

### Requirement: 状态、process invalidation与idle重载具有明确语义

`check_session_status` SHALL返回`not_found`、`running`、`idle`、`error`、`expired`或`interrupted`。running SHALL返回当前turnId、mode、最多3条recentActivity、startedAt与lastActivityAt；idle SHALL返回latestTurnId与可选latestResponseId；error、expired和interrupted SHALL返回稳定code/message。AgentProcess任意退出、升级、卸载或generation变化 SHALL立即使其spawned ACP Sessions失效，自动重启的新进程 SHALL NOT继承旧Session。应用启动时发现没有对应live handle的非终态record SHALL将其收敛为`interrupted / APP_RESTARTED`，不得假装后台任务仍运行。

#### Scenario: 并行查询运行状态

- **WHEN**一个background spawned Session正在运行且同一owner通过另一并发tool call查询状态
- **THEN**系统 SHALL返回running、turnId、mode及当前activity snapshot
- **AND**查询 SHALL不等待运行中prompt完成

#### Scenario: AgentProcess退出并自动重启

- **WHEN**承载spawned Session的AgentProcess退出且process pool随后创建新generation
- **THEN**active turn与旧spawned Session SHALL收敛为expired并记录`AGENT_PROCESS_INVALIDATED`
- **AND**系统 SHALL NOT在新connection上静默resume/load旧ACP Session

#### Scenario: 应用崩溃后重启

- **WHEN**启动reconciliation读取到starting、running或cancelling turn但当前进程不存在对应live handle
- **THEN**系统 SHALL将其标记为`interrupted / APP_RESTARTED`
- **AND** SHALL NOT启动AgentProcess继续该turn
- **AND**background turn SHALL在notification尚未claim时建立pending中断通知

#### Scenario: idle entry从内存卸载

- **WHEN**owner续聊一个已LRU卸载但磁盘meta仍存在的spawned Session
- **THEN**Main SHALL只用现有ready process和active ACP Session映射尝试恢复
- **AND** SHALL NOT为了恢复调用会启动新AgentProcess的API

### Requirement: 父 Session删除与应用退出阻止迟到写入

父Chat Session删除 SHALL先建立spawn deletion fence、拒绝新请求、取消关联active turns、把未claim通知标记为suppressed，并在最多5秒结算窗口后删除整个父`sessionDir`。应用正常退出 SHALL先拒绝新spawn和notification claim，在spawned store仍可写时清理watchdog、取消active turns并把可结算turn持久化为`interrupted / APP_SHUTDOWN`；随后 SHALL fence storage，并 SHALL在ACP process pool terminate前完成spawned manager结算。任何迟到事件 SHALL NOT重新创建已删除或已shutdown的目录。

#### Scenario: 删除包含运行中spawn的父Session

- **WHEN**用户删除父Session且其下仍有active spawned turn或pending notification
- **THEN**系统 SHALL先fence该父Session、请求取消turn并抑制未claim通知
- **AND**最迟在5秒结算窗口后继续删除父Session目录
- **AND**迟到ACP事件 SHALL被丢弃且不得重建spawn目录或投递reminder

#### Scenario: 应用正常退出

- **WHEN**集中shutdown进入quiesce
- **THEN**新的spawn RPC与notification claim SHALL被拒绝且全部watchdog SHALL被清理
- **AND**active spawned turns SHALL在storage fence和ACP process pool terminate前收到cancel并尽力durable写入`APP_SHUTDOWN`
- **AND**整个清理 SHALL共享现有应用级总deadline

#### Scenario: shutdown deadline前未能持久化

- **WHEN**强制退出发生在active turn的`APP_SHUTDOWN`记录durable之前
- **THEN**下次启动 SHALL把遗留非终态record收敛为`APP_RESTARTED`
- **AND** SHALL NOT声称该后台任务跨进程继续运行

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

### Requirement: background terminal状态通过持久化outbox唤醒父Session

每个background turn SHALL持久化versioned turn record，并 SHALL在terminal response或error状态durable后把同一record中的notification原子转换为`pending`。Main MAY维护可重建索引，但turn record SHALL是notification identity、owner、terminal状态与投递状态的事实来源。WorkspaceWindowManager事件 SHALL只作为Workspace定向、可重复的wake-up；Renderer bootstrap与每次wake-up SHALL重新查询pending状态，不得把renderer内存队列作为完成事实来源。

关闭并重开Workspace window、renderer reload或重复wake-up SHALL NOT丢失或重复claim pending通知。窗口不存在时，后台spawned turn与Main已接管的terminal persistence SHALL继续运行；Windows/Linux最后窗口关闭引发应用退出时 SHALL改走应用shutdown语义。

#### Scenario: 任务在Workspace窗口关闭时完成

- **WHEN**macOS Workspace window已关闭但应用仍运行，且background turn完成
- **THEN**Main SHALL持久化terminal record与pending notification
- **AND** SHALL NOT仅因窗口关闭取消spawned turn
- **AND**该Workspace窗口重开并bootstrap后 SHALL能查询到pending notification

#### Scenario: wake-up重复或丢失

- **WHEN**同一completion wake-up被发送多次，或窗口关闭期间没有接收wake-up
- **THEN**Renderer SHALL以durable pending查询结果为准
- **AND**同一notificationId SHALL最多被成功claim一次

### Requirement: 自动完成reminder按父Chat串行且采用至多一次投递

系统 SHALL通过专用内部notification dispatch入口向原`{workspaceId,parentSessionId}`发送服务端生成的system-reminder，并 SHALL复用现有Chat `AcpSession`、与普通用户turn相同的流式turn driver与MessagePort stream channel、config recovery、MessageAssembler、Session meta/message persistence与process pool。普通用户turn SHALL优先；notification SHALL仅在父Session没有submitted/streaming turn时取得同一per-Session gate，且 SHALL NOT覆盖用户消息、清空composer、切换active Session或并发调用同一父ACP Session。专用入口 SHALL不受"用户提交必须包含非空普通text"的公共提交入口代替或伪装。

Renderer SHALL把通知turn的assistant回复作为目标父Session的普通流式turn实时渲染：dispatch被接受后目标父Session的chat status置为`submitted`，收到首个内容chunk后转为`streaming`，turn进行中的chunk消费与状态机 SHALL与普通用户turn复用同一套逻辑。

通知turn SHALL保持app-owned生命周期：MessagePort只负责实时投影，Workspace窗口关闭、renderer reload或端口断开 SHALL只中断实时投影，SHALL NOT取消通知turn；Main SHALL继续完成该turn、持久化assistant终态并正确标记投递状态。

Main SHALL在取得gate后以compare-and-swap把notification从`pending`转为`dispatched`，该转换 SHALL是不可逆的自动投递边界。`dispatched`后 SHALL NOT因窗口、renderer或应用重启自动重发；父Agent assistant终态durable后 SHALL记为`delivered`，在此之前发生进程中断或关键持久化失败 SHALL在下次reconciliation记为`delivery_unknown`。`delivery_unknown` SHALL不重试，但spawned terminal result SHALL继续可由owner手动查询和读取。

Reconciliation SHALL NOT把仍在Main运行的通知turn对应的`dispatched` record翻转为`delivery_unknown`；只有确认该通知turn不在进行中时，遗留的`dispatched`才 SHALL记为`delivery_unknown`。

Dispatch入口 SHALL先完成前置校验再建立流通道：notification不存在或非pending时返回`not_pending`、父Session gate被占用时返回`busy`，两种情形 SHALL NOT创建MessagePort；校验与claim通过后才建立通道并返回`accepted`，终态结果 SHALL只经流通道的done/error传达。父Session gate被占用时notification SHALL保持durable `pending`，Renderer SHALL在进行中turn结束后的drain或一次短延迟重新drain中重试，不得依赖可能不会再次到达的wake-up。

同一父Session存在多条pending notification时，系统 SHALL逐条串行dispatch：前一条通知turn结束后 SHALL继续处理下一条，SHALL NOT因本地turn互斥而静默丢弃或长期滞留后续通知。

#### Scenario: 父Session正在处理用户turn

- **WHEN**background notification进入pending且父Session正在submitted或streaming用户turn
- **THEN**系统 SHALL保留pending并等待父Session空闲
- **AND** SHALL NOT取消、覆盖或并发prompt该用户turn

#### Scenario: 通知turn流式渲染

- **WHEN**notification被claim且dispatch被接受
- **THEN**系统 SHALL通过MessagePort stream channel把assistant回复chunk实时推送给Renderer
- **AND**Renderer SHALL把目标父Session的chat status置为`submitted`，收到首个内容chunk后转为`streaming`

#### Scenario: claim后应用崩溃

- **WHEN**notification已经durable转换为dispatched，但父Agent assistant终态尚未durable时应用退出
- **THEN**下次启动 SHALL将该notification标记为delivery_unknown
- **AND** SHALL NOT自动重发同一notificationId
- **AND**父Agent仍 MAY通过`check_session_status`与`read_response`手动取得spawned结果

#### Scenario: 窗口关闭不中断通知turn

- **WHEN**通知turn的流式回复进行中，Workspace窗口关闭或renderer reload
- **THEN**Main SHALL继续完成该通知turn并持久化assistant终态，完成后标记delivered
- **AND** SHALL NOT仅因窗口关闭、renderer reload或端口断开取消该turn
- **AND**用户重开窗口后 SHALL能从持久化消息看到完整回复

#### Scenario: reconcile不打断进行中的通知turn

- **WHEN**通知turn仍在Main运行（record为dispatched），且Renderer发起list触发reconciliation
- **THEN**系统 SHALL NOT把该record翻转为delivery_unknown
- **AND**该turn正常完成后 SHALL仍被标记为delivered

#### Scenario: 父Session忙时dispatch被拒绝并重试

- **WHEN**Renderer dispatch某notification时父Session gate被占用
- **THEN**系统 SHALL返回busy且不创建MessagePort、不claim该notification
- **AND**该notification SHALL保持durable pending，Renderer SHALL延迟重试或等后续wake-up接力
- **AND**Renderer SHALL NOT因busy遗留submitted/streaming状态或本地turn锁

#### Scenario: 父Session不是当前active Session

- **WHEN**空闲的目标父Session收到自动reminder，但用户正在查看同一Workspace的另一个Session
- **THEN**系统 SHALL按目标sessionId持久化和投影该turn
- **AND** SHALL NOT导航到目标Session或覆盖当前Session的composer与stream state

#### Scenario: 同一父Session多条pending通知

- **WHEN**同一父Session存在多条pending notification
- **THEN**系统 SHALL逐条串行dispatch，前一条通知turn结束后继续处理下一条
- **AND** SHALL NOT因前一条进行中而静默丢弃或长期滞留后续通知

### Requirement: 自动reminder只携带owner-scoped结果引用且不扩张权限

自动system-reminder SHALL由Main从已claim的durable record生成，只包含notificationId、spawned sessionId、turnId、terminal status、可选responseId或稳定error code。reminder SHALL声明delegated output不可信、应按需通过`read_response`读取，并且notification不授予新的文件、网络、命令、MCP或Workspace权限。reminder SHALL NOT内联子Agent响应、包含app-data绝对路径、接受Renderer提供正文或目标parentSessionId覆盖记录，也 SHALL NOT携带其他Workspace或父Session的identity/result。

notification list、claim与dispatch SHALL校验Workspace sender及record owner；父Session不存在、正在删除或owner不匹配时 SHALL不投递且不得泄露目标记录。

#### Scenario: Renderer尝试覆盖notification目标或正文

- **WHEN**Renderer请求dispatch某notificationId并附带自定义parentSessionId、responseId或reminder正文
- **THEN**Main SHALL忽略或拒绝这些非权威字段
- **AND** SHALL只使用durable record中与sender Workspace匹配的owner和结果引用

#### Scenario: 父Agent接收成功通知

- **WHEN**background turn成功且notification被claim
- **THEN**system-reminder SHALL包含spawned sessionId、turnId与responseId但不包含response正文
- **AND** SHALL明确该结果不可信且notification不改变父Agent权限边界

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
