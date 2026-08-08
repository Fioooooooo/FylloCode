# spawned-session-inspection Specification

## Purpose

定义 Chat 页面查询和展示 spawned Agent Session 的权威只读边界：Main 按 Workspace 与父 Session 校验并聚合持久化记录及匹配的实时 ACP 状态，Renderer 仅消费结构化状态、活动、Prompt、Transcript 与不透明 responseId；Signal 只提供查询入口，不承担授权、持久化或通知投递职责。

## Requirements

### Requirement: Renderer只能通过owner-scoped只读接口查询spawned Session

系统 SHALL 提供按`{workspaceId,parentSessionId}`列出spawned Sessions和按`{workspaceId,parentSessionId,sessionId}`读取详情的只读IPC。Main SHALL以Workspace窗口的可信sender context验证`workspaceId`，确认父Chat Session存在且属于该Workspace，并验证目标spawned Session的持久化owner完全匹配；任何跨Workspace、跨父Session、未知、已删除或损坏的目标 SHALL 投影为`not_found`且不得泄露目标是否存在。

list/detail SHALL NOT接受或返回app-data绝对路径、response文件路径、caller提供的Agent/status/content或notification投递字段。查询 MAY 返回opaque`responseId`引用，但renderer SHALL NOT用该引用拼接磁盘路径。

#### Scenario: 同owner查询列表和详情

- **WHEN** Workspace窗口查询其当前父Chat Session下的spawned Sessions并打开其中一个详情
- **THEN** Main SHALL返回只属于同一`{workspaceId,parentSessionId}`的summary和detail
- **AND** Agent、状态、时间、内容和response引用 SHALL来自Main live state或持久化记录

#### Scenario: 跨父Session猜测spawned Session ID

- **WHEN** renderer在合法Workspace sender下用父Session A查询实际属于父Session B的spawned sessionId
- **THEN** Main SHALL返回`not_found`
- **AND** SHALL不返回Agent、状态、Prompt、活动、transcript、error或responseId

#### Scenario: Renderer提交非权威字段

- **WHEN** renderer在list/detail输入中附加agentId、status、responseId、path、notificationId或正文
- **THEN** strict input schema SHALL拒绝请求
- **AND** Main SHALL不使用这些字段覆盖持久化事实

### Requirement: 查询状态以durable turn为基线并叠加匹配live handle

Main SHALL从spawned meta、按时间排序的versioned turn records和持久化messages建立查询基线，并仅在`{workspaceId,parentSessionId,sessionId,turnId}`全部匹配时叠加当前Main-owned active turn的last activity与live assistant message。公开状态 SHALL仅为`starting`、`running`、`idle`、`error`、`expired`或`interrupted`；内部`cancelling`phase SHALL投影为`running`，不得扩大公开状态联合。

最新terminal turn SHALL优先于可能滞后的meta projection。既有version 1 meta-only Session SHALL继续可读；系统 SHALL NOT要求批量迁移或改写历史record。

#### Scenario: Running turn覆盖durable基线

- **WHEN** 最新turn record为running且Main存在identity完全匹配的active handle
- **THEN** detail SHALL返回`running`、当前turnId、mode、startedAt、lastActivityAt、recent activity与live assistant snapshot
- **AND** SHALL不创建第二个ACP session、turn driver或MessageAssembler

#### Scenario: Terminal record优先于旧meta

- **WHEN** completed、error、expired或interrupted turn已经durable但meta仍短暂保留running
- **THEN** list/detail SHALL以terminal turn投影状态
- **AND** SHALL不把状态回退为running

#### Scenario: 应用重启后遗留非终态

- **WHEN** 应用启动发现starting、running或cancelling record且没有对应live handle
- **THEN** 既有lifecycle reconciliation SHALL先把它durable收敛为`interrupted / APP_RESTARTED`
- **AND** list/detail SHALL显示interrupted而不是伪报任务仍运行
- **AND** SHALL不启动AgentProcess、resume或load该turn

### Requirement: Detail返回Prompt、turns、结构化messages与response引用

spawned Session detail SHALL包含可信Session summary、第一条user text形成的原始委派Prompt、最后一条user text形成的当前Prompt、按创建时间排序的turn summaries，以及按消息和part原始顺序排列的结构化messages。结构化message SHALL只允许spawn主干产生的user text与assistant text、reasoning、dynamic-tool parts，并 SHALL将时间序列化为ISO string。

每个turn summary MAY包含其opaque`responseId`，但 SHALL不包含response正文文件路径。Running live assistant message SHALL标记为非durable；terminal内容 SHALL来自持久化`messages.jsonl`。单条损坏或缺失message SHALL产生局部不可用/空投影，不得伪造正文或阻断同owner其他Session。

#### Scenario: 成功terminal详情

- **WHEN** 一个spawned Session已完成至少一轮且assistant message与immutable response均durable
- **THEN** detail SHALL返回原始Prompt、有序assistant structured parts、completed turn和responseId
- **AND** responseId SHALL不附带磁盘路径或文件名

#### Scenario: Running详情包含live结构化输出

- **WHEN** 当前turn已收到text、reasoning和tool activity但尚未terminal
- **THEN** detail SHALL在durable history之外返回同一MessageAssembler的live assistant snapshot
- **AND** snapshot SHALL保留part类型与顺序
- **AND** SHALL标明该snapshot尚未durable

#### Scenario: 错误turn只有部分assistant输出

- **WHEN** ACP turn失败且只持久化了部分assistant message
- **THEN** detail SHALL返回稳定error code/message和可用的partial structured parts
- **AND** SHALL不声称存在completed response引用

### Requirement: Running view复用现有ACP事件与MessageAssembler

`AcpSession`、`driveAcpTurn`和`MessageAssembler` SHALL继续作为spawned turn的唯一协议、事件和消息组装主干。`MessageAssembler` SHALL提供不flush、不修改active indices或tool delta状态的只读snapshot；spawn manager SHALL在现有content-event分支应用事件后更新`ActiveTurn` live view。

系统 SHALL NOT为了UI实现第二套ACP event switch、renderer专用turn driver、额外AgentProcess pool或并行写入同一assistant message的assembler。

#### Scenario: Content event更新live snapshot

- **WHEN** 现有turn driver收到text_delta、reasoning_delta、tool_call_start或tool_call_update
- **THEN** 同一MessageAssembler SHALL先应用事件并产生只读snapshot
- **AND** spawn active entry SHALL更新该snapshot和lastActivityAt
- **AND** terminal持久化仍 SHALL由原有driver hooks完成一次

#### Scenario: Snapshot读取不终止组装

- **WHEN** query service在turn running期间取得MessageAssembler snapshot
- **THEN** 后续delta SHALL继续追加到同一active parts
- **AND** terminal flush SHALL仍返回完整assistant message

### Requirement: View wake只触发重新查询且与notification wake分离

Main SHALL在spawned turn starting、running activity、terminal或父Session删除时，通过独立spawned-session view channel向对应Workspace发送level-triggered wake。Wake MAY丢失或重复，payload SHALL只包含scope identity，不包含状态、正文、error或response路径；renderer收到wake后 SHALL重新调用owner-scoped list/detail并以查询结果为准。

高频activity wake SHALL按spawn owner合并；任何coalescing timer SHALL归现有spawned-session lifecycle owner并在quiesce/dispose/force dispose时清理。View wake SHALL NOT复用completion notification channel，也 SHALL NOT claim、ack或改变notification outbox。

#### Scenario: Renderer reload错过wake

- **WHEN** spawned turn在renderer reload或窗口关闭期间更新或完成
- **THEN** 重载/重开后的首次list/detail SHALL从Main事实恢复最新状态和durable内容
- **AND** SHALL不依赖旧renderer内存事件表

#### Scenario: 重复wake

- **WHEN** 同一spawned Session收到多个重复或合并前后的wake
- **THEN** renderer SHALL合并同owner in-flight查询并重新读取权威状态
- **AND** SHALL不创建重复Session、turn、Signal record或notification

#### Scenario: Terminal同时产生两类wake

- **WHEN** background turn terminal后同时需要更新用户view并唤醒父Agent notification drain
- **THEN** Main MAY分别发送view wake与notification wake
- **AND** view查询 SHALL不改变pending/dispatched/delivered状态

### Requirement: Slideover按结构化parts分离Activity与Transcript

spawned Session Slideover SHALL显示明确状态、可信Agent、started/last activity/updated时间、稳定error信息、原始委派Prompt、默认折叠Activity、仅由assistant text parts组成的Transcript和可选responseId。Activity SHALL从assistant reasoning/dynamic-tool parts构造，并 SHALL复用现有`ChatActivityGroup`/`ChatToolItem`展示逻辑；Transcript SHALL保持text part原始顺序并使用MarkStream渲染，同时关闭Actions和Signals。

系统 SHALL NOT通过隐藏所有`em`、heading或其他Markdown元素过滤tool marker，也 SHALL NOT从response文件路径读取Transcript。Slideover SHALL区分loading、query error、not_found、无Prompt、无Activity和无text输出状态。

#### Scenario: 同一assistant message包含正文和工具活动

- **WHEN** structured parts依次包含text、reasoning、dynamic-tool和text
- **THEN** Activity区域 SHALL只展示reasoning/tool parts并保持顺序
- **AND** Transcript SHALL只展示两个text parts且不重复工具活动
- **AND** 普通Markdown斜体 SHALL继续正常显示

#### Scenario: Running状态没有文本输出

- **WHEN** turn正在运行且只有reasoning/tool parts
- **THEN** Slideover SHALL显示running状态和Activity
- **AND** Transcript SHALL显示“正在等待子 Agent 输出…”的明确局部状态

#### Scenario: 可访问的Slideover交互

- **WHEN** 用户通过键盘激活行内Signal或background列表项并随后关闭Slideover
- **THEN** trigger SHALL具备可见focus与可理解的aria label
- **AND** Slideover关闭后 SHALL把焦点恢复到原trigger
- **AND** 状态 SHALL由文字和icon共同表达而非只用颜色

### Requirement: Composer入口只聚合当前父Session的active background turns

Chat composer附近 SHALL在存在active background turns时显示可理解的活动入口，并 SHALL只聚合当前Workspace中当前父Chat Session下mode为`background`且状态为`starting`或`running`的记录。入口 SHALL不列出其他父Session、sync turn、idle或terminal历史；draft Chat没有父Session时 SHALL不显示。

入口 SHALL显示“正在运行 N 个后台任务”等状态文字和icon，点击后以popover列出Agent、Prompt摘要、状态文字和开始时间，每项可打开同一detail Slideover。该列表 SHALL直接来自Main list，与父Agent是否发出`spawn.session`无关。

#### Scenario: 当前父Session有两个background turns

- **WHEN** 当前父Session有两个running background turns、一个running sync turn和一个idle background Session
- **THEN** composer入口 SHALL显示“正在运行 2 个后台任务”
- **AND** popover SHALL只列出两个active background turns

#### Scenario: 同Workspace其他父Session仍在运行

- **WHEN** 父Session B有running background turn但用户当前查看父Session A
- **THEN** 父Session A的composer入口 SHALL不显示B的任务或内容
- **AND** 切换到B后 SHALL通过B的owner scope重新查询

#### Scenario: Agent漏发或重复Signal

- **WHEN** 父Agent没有输出Signal或输出多个相同sessionId的Signal
- **THEN** composer active background数量 SHALL仍由Main list正确计算
- **AND** SHALL不创建重复服务端记录

### Requirement: Renderer按完整owner key管理查询与切换生命周期

Renderer SHALL使用`workspaceId + parentSessionId + sessionId`作为detail cache identity，并使用`workspaceId + parentSessionId`作为list identity。Workspace或父Session切换 SHALL递增request generation或清除旧scope，使迟到list/detail结果、旧Workspace wake和已关闭Slideover refresh不得覆盖当前scope。

历史Signal SHALL使用其所在持久化assistant message的Workspace/父Session host context；缺少context时 SHALL显示非交互不可用fallback，且 SHALL NOT回退当前active Session猜测owner。Main SHALL继续重新校验所有renderer context。

#### Scenario: Workspace切换时旧请求迟到

- **WHEN** Workspace A的detail请求尚未返回时窗口切换到Workspace B
- **THEN** A的迟到结果 SHALL被丢弃
- **AND** SHALL不出现在B的Signal、popover或Slideover中

#### Scenario: 历史Signal不属于当前active Session

- **WHEN** renderer重新挂载父Session A的历史assistant message但当前active Session已经是B
- **THEN** Signal SHALL使用消息所属的A作为parentSessionId查询
- **AND** SHALL不使用B替换owner context

### Requirement: 窗口、父删除、重启与process invalidation保持既有语义

关闭Workspace窗口 SHALL不取消Main-owned background spawned turn；窗口重开 SHALL通过首次query恢复。父Session删除 SHALL继续执行fence、cancel/settle、notification suppress和storage delete，之后list不再包含该Session且detail返回not_found。AgentProcess失效 SHALL显示`expired / AGENT_PROCESS_INVALIDATED`；应用正常shutdown SHALL显示durable`interrupted / APP_SHUTDOWN`，崩溃遗留 SHALL在下次启动显示`interrupted / APP_RESTARTED`。

系统 SHALL NOT因打开、关闭或刷新inspection UI而改变1/4/8容量、10分钟inactivity watchdog、5秒cancel grace、ACP Session复用、process generation或父删除/shutdown顺序。

#### Scenario: macOS窗口关闭后任务完成

- **WHEN** Workspace窗口关闭但应用仍运行且background turn完成
- **THEN** Main SHALL继续完成assistant/response/turn持久化和notification pending
- **AND** 窗口重开后的query SHALL显示idle和最终Transcript

#### Scenario: 父Session在Slideover打开时被删除

- **WHEN** 用户正在查看spawned Session详情且其父Session被删除
- **THEN** 后续wake/query SHALL返回not_found并停止该scope refresh
- **AND** UI SHALL显示详情已不可用而不泄露已删除内容

#### Scenario: AgentProcess generation变化

- **WHEN** spawned Session对应AgentProcess退出并产生新generation
- **THEN** detail SHALL显示expired与`AGENT_PROCESS_INVALIDATED`
- **AND** SHALL不在新process上resume旧spawned Session

### Requirement: Inspection不参与Action、EventRail或completion notification状态机

挂载、重复挂载、点击或刷新`spawn.session`及其Slideover/composer入口 SHALL不创建Action ID，不调用Action IPC，不写session actionStates，不改变attention count，不向EventRail添加item，也不创建Signal storage record。Inspection list/detail SHALL不调用notification claim/dispatch，不返回notification state，也不改变at-most-once父Agent reminder投递边界。

#### Scenario: 打开已完成background Session详情

- **WHEN** turn notification仍为pending且用户打开Signal或composer Slideover
- **THEN** notification SHALL继续保持pending直到既有notification coordinator claim
- **AND** 打开详情 SHALL不触发父Agent prompt

#### Scenario: 重复挂载同一Signal

- **WHEN** 同一历史assistant message被多次挂载或包含重复`spawn.session`标签
- **THEN** EventRail和attention count SHALL保持不变
- **AND** Main SHALL不新增spawned Session、turn、response或notification record
