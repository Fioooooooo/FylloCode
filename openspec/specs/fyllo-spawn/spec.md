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

fyllo-spawn SHALL 从 Main proxy 注入的 `McpWorkspaceDescriptorV2` 请求上下文取得 `workspaceId` 与父 `fylloSessionId`，并 SHALL NOT 接受 tool 参数、caller header或进程级环境变量覆盖该身份。每次续聊、状态查询和响应读取 SHALL 校验 spawned Session属于同一 `{ workspaceId, parentSessionId }`；不匹配时 SHALL 返回 `not_found`且不泄露目标是否存在。`prompt_to_agent.folderId` SHALL只作为父 Session固定授权 snapshot内的显式Folder选择器， SHALL NOT作为Workspace identity或caller可提交的path。

#### Scenario: Agent 不提供父 Session参数

- **WHEN** Agent 调用 `prompt_to_agent` 且tool input只包含agentId、prompt和可选spawned session、folder、config或background参数
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

Main SHALL 根据可信caller identity加载父Chat Session meta并重新校验其固定`SessionWorkspaceSnapshot`。新建调用省略`folderId`时，Main SHALL继续使用完整父snapshot的`cwd`与`additionalDirectories`；新建调用指定`folderId`时，Main SHALL只允许选择父snapshot中完全匹配的Folder identity，并从该Folder派生固定单根snapshot：`cwd`等于其snapshot path、`additionalDirectories`为空、该Folder成为唯一Folder和primary。两种模式都 SHALL在创建前对最终effective snapshot复用现有Agent Workspace compatibility校验并持久化同一snapshot。

续聊 SHALL复用spawned meta中已固定的effective snapshot与scope，不得接受新的`folderId`或恢复为父Session完整scope。Main SHALL NOT使用MCP child回传的path、当前Workspace的新成员集合、任意子目录或primary fallback扩大或改变授权。

#### Scenario: Collection Workspace默认创建 spawned Session

- **WHEN** 父Session snapshot包含primary和两个additional Folder且仍全部有效，调用省略`folderId`
- **THEN** spawned `newSession` SHALL使用snapshot primary path作为cwd
- **AND** SHALL按snapshot顺序传递两个`additionalDirectories`
- **AND** spawned meta SHALL持久化完整父snapshot与`workspace` scope

#### Scenario: Collection Workspace显式选择Folder

- **WHEN** 父Session snapshot包含三个Folder且新建调用指定其中第二个Folder的`folderId`
- **THEN** Main SHALL使用该Folder的snapshot path作为`cwd`并传递空`additionalDirectories`
- **AND** spawned meta SHALL持久化只含该Folder的effective snapshot与`folder` scope
- **AND** SHALL NOT把父primary或其他Folder授权给spawned Agent

#### Scenario: 父 snapshot stale

- **WHEN** 父 Session成员已被移除、缺失或重定位
- **THEN** `prompt_to_agent` SHALL在启动或取得 AgentProcess前返回现有对应 stale error
- **AND** SHALL NOT裁剪snapshot或创建spawned Session

#### Scenario: 目标 Agent不支持默认 multi-root scope

- **WHEN**父snapshot包含`additionalDirectories`、调用未指定`folderId`且目标Agent capability不是supported
- **THEN** `prompt_to_agent` SHALL返回`PROMPT_CAPABILITY_MISMATCH`且说明没有创建Session
- **AND**错误 SHALL列出父snapshot内可选Folder ID与名称，并指导省略`sessionId`、指定一个`folderId`重试
- **AND**任务确需多个Folder时 SHALL指导改用支持additional directories的Agent
- **AND** SHALL NOT发送ACP prompt或隐式回退primary Folder

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

`prompt_to_agent` SHALL在省略spawned sessionId时创建新Session，在提供owner-matched spawned sessionId时继续当前进程世代仍active的ACP Session。新Session SHALL以`newSession().configOptions`作为首次config schema和snapshot的主要来源；resume/load SHALL使用现有config recovery收敛持久化值与activation live options。

`prompt_to_agent` SHALL接受可选string字段`model`与`thought_level`。`model` SHALL只针对live snapshot中唯一的`type=select && category=model` option解析，`thought_level` SHALL只针对唯一的`type=select && category=thought_level` option解析；两者的输入 SHALL表示目标value或查询词而不是option ID。Main SHALL在同一次tool调用内先激活真实ACP Session，再解析和设置语义配置，最后才发送prompt，调用方 SHALL NOT需要先创建探测turn取得option ID。

语义value解析 SHALL依次执行raw value精确匹配、归一化value精确匹配、归一化name精确匹配和保守token包含匹配；每一层一旦产生候选 SHALL不再进入更宽松层。只有候选数量恰好为一时 SHALL设置该value；零候选或两个及以上候选 SHALL返回`configuration_required`及当前支持的options，并 SHALL NOT发送prompt。系统 SHALL NOT按候选顺序、默认provider、currentValue、Agent identity或相似度评分自动决胜。

Main SHALL先应用model，并以每次`session/set_config_option`响应中的完整`configOptions`替换live snapshot，再解析`model_config`、`thought_level`及其他请求。出现语义字段时，语义请求与raw `config` SHALL作为同一desired state逐步收敛；同一option的同值请求 SHALL去重，raw精确值可在属于语义查询候选时提供精确消歧，冲突值 SHALL返回`SPAWN_INVALID_REQUEST`且不得静默覆盖。系统 SHALL对重复snapshot或有限迭代内无法收敛的配置中止prompt。

现有`config` SHALL继续只接受option ID到string/boolean value的映射，并 SHALL在每次prompt前按option id、类型与候选值验证和逐项设置，包含仍active ACP Session的warm direct prompt路径。未提交`model`与`thought_level`的raw-only调用 SHALL保持既有应用顺序与set失败warning-and-continue行为。包含语义字段的调用若语义option缺失/重复、value无法唯一解析、语义set失败、response缺少完整snapshot、输入冲突或配置无法收敛，SHALL不发送prompt。首次accepted、`configuration_required`或同步terminal snapshot SHALL不依赖异步`config_option_update`到达。

#### Scenario: 同步首次prompt返回config

- **WHEN**`newSession`返回model与thought level config options且同步prompt成功
- **THEN**tool结果 SHALL包含spawned sessionId、完成响应和精简config snapshot
- **AND** SHALL NOT等待异步config update才发送prompt

#### Scenario: 后台首次prompt返回config

- **WHEN**`newSession`返回完整config options且后台prompt已经提交
- **THEN**accepted结果 SHALL包含基于该返回值并应用本轮override后的config snapshot
- **AND**后续异步config update SHALL NOT改变已经返回的accepted snapshot

#### Scenario: 首轮指定raw config

- **WHEN**调用方在新Session请求中只提交`config: { model: "o3" }`且`model`是live option ID、该值属于其候选
- **THEN**Main SHALL在发送prompt前调用现有set-config-option RPC
- **AND**accepted或完成结果 SHALL反映成功应用后的current value
- **AND**既有raw-only设置失败warning-and-continue语义 SHALL保持不变

#### Scenario: 首轮指定精确语义model与thought level

- **WHEN**调用方在新Session请求中提交`model`与`thought_level`，且两者分别在对应category option中唯一匹配
- **THEN**Main SHALL从live snapshot取得各自真实option ID，先设置model，再用完整新snapshot设置thought level
- **AND** SHALL在同一次`prompt_to_agent`调用中完成设置并发送正式prompt

#### Scenario: 模型切换重塑thought level

- **WHEN**设置model后Agent返回的完整snapshot改变了`category=thought_level` option ID或候选值
- **THEN**Main SHALL只使用该新snapshot重新解析并设置`thought_level`
- **AND** SHALL NOT使用`newSession`初始snapshot中的旧option ID或候选

#### Scenario: 语义model产生多个模糊候选

- **WHEN**`model=luna`在live model option中匹配两个或以上provider-qualified values
- **THEN**tool SHALL返回`configuration_required`、`promptDispatched=false`和按Agent原顺序排列的匹配候选
- **AND**系统 SHALL NOT选择current/default provider、首项或最高相似度候选
- **AND** SHALL NOT持久化正式user message或turn、发送prompt或创建notification

#### Scenario: 语义配置没有候选

- **WHEN**`model`或`thought_level`在对应live option中没有任何候选，或对应category option缺失/重复
- **THEN**tool SHALL返回`configuration_required`及可用schema/options
- **AND** SHALL NOT在Agent默认配置下发送prompt

#### Scenario: raw config与语义字段重复或冲突

- **WHEN**raw `config`与`model`或`thought_level`最终解析到同一option ID
- **THEN**相同目标值 SHALL去重，raw精确值属于语义候选时 SHALL作为精确消歧
- **AND**不同且不兼容的目标值 SHALL返回`SPAWN_INVALID_REQUEST`
- **AND**系统 SHALL NOT依赖JSON object顺序或last-write-wins静默选择

#### Scenario: warm续聊指定config

- **WHEN**调用方续聊仍active的spawned ACP Session并提交合法raw或语义config override
- **THEN**Main SHALL在direct prompt前使用当前live snapshot验证和应用该override
- **AND** SHALL NOT因跳过cold recovery而静默忽略override

#### Scenario: raw config设置失败

- **WHEN**不含语义字段的合法raw config override被Agent拒绝但ACP Session仍可prompt
- **THEN**系统 SHALL继续发送prompt
- **AND**accepted或完成结果 SHALL包含该option的warning且不得声称设置成功

#### Scenario: 语义config设置失败

- **WHEN**包含`model`或`thought_level`的请求已唯一解析，但对应set RPC失败或没有返回完整config snapshot
- **THEN**系统 SHALL不发送prompt并返回`SPAWN_CONFIG_FAILED`
- **AND**系统 SHALL NOT在默认值或未确认值下执行正式任务

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

除增加首次创建专用的可选`folderId`外，该变化 SHALL保持`prompt_to_agent`既有accepted/completed/error结果、五个HTTP-only tools、`responseId + read_response`契约和异步优先指导不变。`spawn.session` MAY继续作为可选上下文详情深链，但tool description SHALL引用shared Signal contract而不复制payload schema、JSON example或Markdown格式规则。

#### Scenario: Tool description说明自动发现

- **WHEN** 父fyllocode Chat获得fyllo-spawn `prompt_to_agent` tool description
- **THEN** description SHALL说明Main-owned inspection自动提供Session发现和状态
- **AND** SHALL不要求父Agent输出Signal才能让用户观察

#### Scenario: 同一Session开始后续Turn

- **WHEN** 父Agent向owner-matched已有sessionId发送第二个Prompt且不提交`folderId`
- **THEN** Main SHALL按既有runtime和已持久化scope创建新Turn，并通过owner-scoped view更新同一Session
- **AND** 用户可观察性 SHALL不依赖新的Signal或MCP event文件

### Requirement: prompt_to_agent以字段description和可恢复错误指导Folder scope

`prompt_to_agent.folderId`的Agent-facing字段description SHALL明确它是optional、只能在省略`sessionId`的新建调用中使用、只能选择父Session授权snapshot内的Folder、指定后该Folder成为`cwd`且不传additional directories、省略时继承完整父Workspace。`sessionId`字段description SHALL反向明确续聊必须省略`folderId`且既有scope保持固定。Tool description SHALL解释单根Agent在multi-root capability mismatch后可通过新建Folder-scoped Session恢复。

所有与该输入相关的错误 SHALL至少说明失败原因、是否创建了spawned Session、调用方下一步应修改的参数和不能满足时的替代方案。错误 SHALL使用Folder ID和名称指导恢复，不得要求caller提交绝对path；可通过改变参数恢复的错误 SHALL NOT被描述为可原样盲目重试。

#### Scenario: folderId与sessionId同时提交

- **WHEN**调用方同时提交`sessionId`和`folderId`
- **THEN**tool SHALL返回`SPAWN_INVALID_REQUEST`并说明未开始新Turn、既有Session scope不可修改
- **AND**错误 SHALL指导续聊时删除`folderId`，或省略`sessionId`并用`folderId`创建新Session

#### Scenario: folderId不属于父snapshot

- **WHEN**新建调用提交的`folderId`不在父Session固定snapshot中
- **THEN**tool SHALL返回`SPAWN_INVALID_REQUEST`且不创建Session
- **AND**错误 SHALL列出可选Folder ID与名称并指导选择其中一个重试
- **AND** SHALL NOT从当前Workspace registry查找同名或新增Folder

#### Scenario: Agent阅读folderId字段description

- **WHEN**父Agent检查`prompt_to_agent` input schema
- **THEN**`folderId`与`sessionId`字段 SHALL各自说明新建/续聊互斥和scope固定语义
- **AND**父Agent SHALL无需先触发错误才能知道省略`folderId`会继承完整Workspace

### Requirement: Spawned meta持久化显式Workspace或Folder scope

每个新建spawned Session SHALL在既有`workspaceSnapshot`之外持久化discriminated scope：完整继承记录`workspace`及创建时Workspace显示名称，显式Folder选择记录`folder`、`folderId`及创建时Folder显示名称。续聊、错误、过期、应用重启与inspection读取 SHALL保留该Session级scope，不得按最新Turn或当前Workspace primary重新推断。

历史meta缺少scope字段时 SHALL在读取时兼容归一化为`workspace`，不得要求离线批量migration或改写历史记录。该兼容投影 MAY从当前可信Workspace metadata取得显示名称；无法取得时 SHALL使用明确的Workspace fallback标签，不得把单Folder目录形状误报为显式Folder选择。

#### Scenario: 新建完整Workspace scope

- **WHEN**新建调用省略`folderId`
- **THEN**meta SHALL持久化`workspace` scope、创建时Workspace名称和完整effective snapshot
- **AND**后续续聊 SHALL保持同一scope

#### Scenario: 新建单Folder scope

- **WHEN**新建调用指定父snapshot中的Folder
- **THEN**meta SHALL持久化`folder` scope、folderId、创建时Folder名称和单根effective snapshot
- **AND**后续续聊 SHALL继续使用该Folder且不得接受scope变更

#### Scenario: 读取旧版meta

- **WHEN**合法历史meta包含workspaceSnapshot但没有显式scope
- **THEN**存储读取与inspection SHALL将其归一化为`workspace`
- **AND** SHALL不因新增字段把Session投影为损坏或`not_found`

### Requirement: configuration_required 保留可续用的prepared Session

语义配置无法唯一完成时，`prompt_to_agent` SHALL返回`status=configuration_required`、owner-scoped spawned `sessionId`、`promptDispatched=false`、当前精简config snapshot与结构化issues。每个issue SHALL说明parameter、requested value、`unsupported | ambiguous | missing_category_option`原因、可选真实option ID/category及包含value/name/可选group/description的候选列表。

prepared Session SHALL持久化已解析ACP session ID、process generation、固定Workspace scope与完整live config snapshot，并 SHALL保持idle且可在当前process generation内通过同一spawned `sessionId`续用。它 SHALL NOT持久化未dispatch的user message、创建turn/response/notification、占用返回后的active capacity或运行inactivity watchdog。父Agent续聊时 SHALL重新校验live snapshot与精确选择；Agent process失效、应用重启或active handle丢失后 SHALL沿用既有expired语义。

#### Scenario: 后台请求在dispatch前需要配置选择

- **WHEN**`background=true`请求在真实Session中得到歧义model候选
- **THEN**tool SHALL直接返回`configuration_required`而不是`accepted`
- **AND**本次请求结算后 SHALL释放active reservation且不建立background notification

#### Scenario: 父Agent选择候选后续用prepared Session

- **WHEN**父Agent根据issues选择精确value，并以相同owner、agentId、spawned `sessionId`和原正式prompt再次调用
- **THEN**Main SHALL复用当前process generation内的active ACP Session并重新验证live config
- **AND**配置成功后 SHALL只为这次实际dispatch创建user message与turn record

#### Scenario: prepared Session承载进程已经失效

- **WHEN**父Agent续用prepared Session时原Agent process generation或active ACP handle已失效
- **THEN**系统 SHALL返回既有expired结果
- **AND** SHALL NOT在新process中静默重建并使用旧候选

### Requirement: prompt_to_agent字段描述完整指导语义配置

`prompt_to_agent`的Agent-facing总描述 SHALL说明首次调用可直接提供`model`与`thought_level`且无需probe，并说明Main在真实Session的live config中完成解析、设置和prompt dispatch。`model`字段description SHALL说明它解析`category=model`且不是option ID；`thought_level` SHALL说明它在model完整新snapshot之后解析`category=thought_level`；`config` SHALL说明key必须是精确live option ID、适用于mode/model_config/boolean/custom配置，并说明重复同值去重、冲突值拒绝。

总描述与字段description SHALL说明零候选或多候选返回`configuration_required`及options、不会发送prompt，并 SHALL指导父Agent利用已有上下文选择精确value或询问用户后续用同一Session。描述 SHALL NOT声称FylloCode能从initialize、`available_agents`、Agent默认provider或静态缓存预知Session支持的模型列表。

#### Scenario: 父Agent检查首次调用schema

- **WHEN**父Agent读取`prompt_to_agent` tool description与input schema
- **THEN**它 SHALL能区分`model`/`thought_level`语义value查询与`config`精确option ID映射
- **AND**它 SHALL知道精确或唯一匹配可在一次调用中完成，歧义时会收到候选且prompt尚未发送

#### Scenario: 父Agent收到configuration_required

- **WHEN**父Agent收到包含多个model candidates的`configuration_required`
- **THEN**结果与description SHALL提供足够的value/name/group上下文供其自行选择或询问用户
- **AND**父Agent SHALL无需读取错误字符串或创建返回`ok`的探测turn取得option ID
