## ADDED Requirements

### Requirement: Chat底部后台活动栏展示父Session拥有的spawned Sessions

Chat内容卡片底部 SHALL 在Prompt输入框外部提供紧凑后台活动栏，并仅在当前非draft父Chat Session的owner-scoped list至少包含一个spawned Session时显示。活动栏 SHALL显示当前父Session拥有的spawned Session总数与状态为`starting`或`running`的active数量；active判定 SHALL不以`sync`或`background` mode过滤。

活动栏展开后 SHALL列出当前`{workspaceId,parentSessionId}`的全部spawned Sessions，active记录排在terminal记录之前，同组内按`updatedAt`降序排列。列表项 SHALL显示可信Agent、Prompt摘要或明确缺失状态、文字状态与时间，并可打开同一Turn-aware detail Slideover。活动栏 SHALL直接来自Main list，与父Agent是否输出`spawn.session`无关；它 SHALL不进入Chat EventRail，也 SHALL不占用`UChatPrompt`内部footer。

#### Scenario: 当前父Session同时包含运行和历史Session

- **WHEN** 当前父Session包含一个running sync Session、一个running background Session和两个terminal Sessions
- **THEN** 活动栏 SHALL显示4个子Agent Session且active数量为2
- **AND** 展开列表 SHALL先显示两个active Sessions，再按更新时间显示两个terminal Sessions

#### Scenario: 同一Session收到续聊Prompt

- **WHEN** 一个idle spawned Session使用原`sessionId`开始第二个Turn
- **THEN** 活动栏 SHALL保持同一个Session列表identity并将其状态更新为starting/running
- **AND** SHALL不创建第二个列表项或等待新的`spawn.session`

#### Scenario: Signal漏发或重复

- **WHEN** 父Agent未输出`spawn.session`或历史消息包含重复Signal
- **THEN** 活动栏的Session总数、active数量和状态 SHALL仍由Main list正确投影
- **AND** SHALL不创建、复制或隐藏任何spawned Session

#### Scenario: draft或空父Session

- **WHEN** Chat处于draft状态或当前父Session没有spawned Sessions
- **THEN** 底部后台活动栏 SHALL不占用额外可见行
- **AND** SHALL不从其他父Session借用记录

## MODIFIED Requirements

### Requirement: Renderer只能通过owner-scoped只读接口查询spawned Session

系统 SHALL 提供按`{workspaceId,parentSessionId}`列出spawned Session轻量summaries和按`{workspaceId,parentSessionId,sessionId}`读取单Session完整详情的只读IPC。Main SHALL以Workspace窗口的可信sender context验证`workspaceId`，确认父Chat Session存在且属于该Workspace，并验证目标spawned Session的持久化owner完全匹配；任何跨Workspace、跨父Session、未知、已删除或损坏的目标 SHALL 投影为`not_found`且不得泄露目标是否存在。

list SHALL只读取建立summary所需的spawned meta与最新turn状态，不得读取任一Session的完整`messages.jsonl`；Prompt摘要 SHALL来自长度受限的optional meta projection，既有meta缺少该字段时返回明确缺失状态。detail SHALL只读取请求中明确指定的单个spawned Session的turns和messages，不得通过加载父Session下全部详情后再筛选目标。

list/detail SHALL NOT接受或返回app-data绝对路径、response文件路径、caller提供的Agent/status/content或notification投递字段。查询 MAY 返回opaque`responseId`引用，但renderer SHALL NOT用该引用拼接磁盘路径。

#### Scenario: 同owner查询列表和详情

- **WHEN** Workspace窗口查询其当前父Chat Session下的spawned Sessions并打开其中一个详情
- **THEN** list SHALL返回只属于该owner的轻量summaries且不读取完整messages
- **AND** detail SHALL只加载所选Session并返回来自Main live state或持久化记录的可信内容

#### Scenario: 旧meta没有Prompt摘要

- **WHEN** list读取一个在optional Prompt preview字段引入前创建的合法spawned Session
- **THEN** summary SHALL继续返回Agent、状态和时间并将Prompt摘要投影为缺失
- **AND** 打开detail后 SHALL仍从既有messages读取完整Prompt与Turn历史

#### Scenario: 跨父Session猜测spawned Session ID

- **WHEN** renderer在合法Workspace sender下用父Session A查询实际属于父Session B的spawned sessionId
- **THEN** Main SHALL返回`not_found`
- **AND** SHALL不返回Agent、状态、Prompt、活动、transcript、error或responseId

#### Scenario: Renderer提交非权威字段

- **WHEN** renderer在list/detail输入中附加agentId、status、responseId、path、notificationId或正文
- **THEN** strict input schema SHALL拒绝请求
- **AND** Main SHALL不使用这些字段覆盖持久化事实

### Requirement: Detail返回Prompt、turns、结构化messages与response引用

spawned Session detail SHALL包含可信Session summary和按创建时间排序的Turn details。每个Turn detail SHALL包含`turnId`、ordinal、mode、状态、started/last activity/updated时间、recent activity、可选稳定error、可选opaque`responseId`、本轮user Prompt与本轮有序structured messages。结构化message SHALL只允许spawn主干产生的user text与assistant text、reasoning、dynamic-tool parts，并 SHALL将时间序列化为ISO string。

Main SHALL使用有序turn records的时间窗口与有序messages建立Turn归属；一个user message开启本轮Prompt，窗口内assistant message归属同一Turn。Running latest Turn MAY在durable history之后叠加`{workspaceId,parentSessionId,sessionId,turnId}`完全匹配的live assistant snapshot，并 SHALL标记为非durable；terminal内容 SHALL来自持久化`messages.jsonl`。单轮损坏或缺失message SHALL产生该轮局部不可用/空投影，不得将不确定内容移动到另一Turn、伪造正文或阻断同owner其他Session。

每个Turn MAY包含其opaque`responseId`，但 SHALL不包含response正文文件路径。Detail SHALL不读取response文件正文来构造Prompt、Activity或Transcript。

#### Scenario: 多轮成功详情

- **WHEN** 一个spawned Session已完成两个Turns且每轮assistant message与immutable response均durable
- **THEN** detail SHALL返回两个按时间排序、各自携带Prompt、structured messages和responseId的Turn details
- **AND** 第二轮内容 SHALL不与第一轮Activity或Transcript混合

#### Scenario: Running最新Turn包含live结构化输出

- **WHEN** 第二个Turn已收到text、reasoning和tool activity但尚未terminal
- **THEN** detail SHALL只在第二个Turn中叠加同一MessageAssembler的live assistant snapshot
- **AND** snapshot SHALL保留part类型与顺序并标明尚未durable

#### Scenario: 错误Turn只有部分assistant输出

- **WHEN** ACP Turn失败且只持久化了部分assistant message
- **THEN** 对应Turn SHALL返回稳定error code/message和可用partial structured parts
- **AND** SHALL不声称存在completed response引用或把partial内容归入相邻Turn

### Requirement: View wake只触发重新查询且与notification wake分离

Main SHALL在spawned turn starting、running activity、terminal或父Session删除时，通过独立spawned-session view channel向对应Workspace发送level-triggered wake。Wake MAY丢失或重复，payload SHALL只包含scope identity，不包含状态、正文、error或response路径；renderer收到wake后 SHALL以owner-scoped query结果为准，不把payload或内存队列作为状态事实。

Renderer SHALL分别管理parent list interest与打开的detail interest：当前Chat活动栏或历史Signal挂载时 MAY保持对应parent list可查询；仅当某个detail Slideover打开时 SHALL持续刷新该detail，缓存存在但没有打开interest不得触发detail reload。高频activity wake SHALL按owner合并；同key请求进行中再次收到wake时 SHALL最多排队一个post-in-flight refresh，当前请求完成后重新读取一次权威状态。任何coalescing timer、interest或queued状态 SHALL在Workspace/父Session切换、组件卸载与spawn lifecycle dispose时释放。

View wake SHALL NOT复用completion notification channel，也 SHALL NOT claim、ack或改变notification outbox。

#### Scenario: 请求进行中收到terminal wake

- **WHEN** starting状态的list/detail请求仍在进行且同一owner随后发送terminal wake
- **THEN** renderer SHALL在当前请求完成后执行一次queued refresh
- **AND** 最终投影 SHALL收敛到terminal而不永久停留在starting/running

#### Scenario: 关闭详情后继续收到activity

- **WHEN** 用户关闭Slideover但spawned Turn仍在运行并产生高频activity wake
- **THEN** renderer SHALL停止刷新该detail并 MAY保留已有缓存
- **AND** 当前父Session的轻量list SHALL继续按合并节奏更新状态

#### Scenario: Renderer reload错过wake

- **WHEN** spawned turn在renderer reload或窗口关闭期间更新或完成
- **THEN** 重载/重开后的首次list以及重新打开detail时的首次query SHALL恢复最新权威状态
- **AND** SHALL不依赖旧renderer内存事件表

#### Scenario: Terminal同时产生两类wake

- **WHEN** background turn terminal后同时需要更新用户view并唤醒父Agent notification drain
- **THEN** Main MAY分别发送view wake与notification wake
- **AND** view查询 SHALL不改变pending/dispatched/delivered状态

### Requirement: Slideover按结构化parts分离Activity与Transcript

spawned Session Slideover SHALL显示可信Session summary，并提供紧凑Turn selector在历史Turns间切换。首次打开 SHALL默认选择最新Turn；若用户仍在跟随最新Turn，新Turn出现时 SHALL自动选择新Turn；若用户主动选择旧Turn，后续activity SHALL不得强制改变选择，并 SHALL以明确非侵入状态提示最新Turn有活动。

选中Turn SHALL显示本轮状态、时间、稳定error、本轮Prompt、默认折叠Activity、仅由本轮assistant text parts组成的压缩Transcript和可选responseId。Activity SHALL从选中Turn的assistant reasoning/dynamic-tool parts构造，并 SHALL复用现有`ChatActivityGroup`/`ChatToolItem`展示逻辑；Transcript SHALL保持本轮text part原始顺序并使用MarkStream渲染，同时关闭Actions和Signals。系统 SHALL NOT把Slideover改造成完整user/assistant聊天复刻， SHALL NOT跨Turn聚合内容， SHALL NOT通过隐藏Markdown元素过滤tool marker，也 SHALL NOT从response文件路径读取Transcript。

Slideover SHALL区分loading、query error、not_found、无Turn、无Prompt、无Activity、运行中无text输出、terminal无text输出和partial error状态。Turn selector及关闭按钮 SHALL具备可见focus和可理解的aria label，状态 SHALL由文字和icon共同表达而非只用颜色。

#### Scenario: 默认打开最新Turn

- **WHEN** 一个spawned Session包含三个Turns且用户从底栏或Signal打开详情
- **THEN** Slideover SHALL默认选择第三轮并显示“第3轮/共3轮”的等价可理解信息
- **AND** Activity、Transcript与responseId SHALL只来自第三轮

#### Scenario: 查看旧Turn时新Turn开始

- **WHEN** 用户主动选择第一轮后同一Session开始新的Turn
- **THEN** Slideover SHALL保持第一轮选择并提示最新轮正在活动
- **AND** SHALL不把新Turn内容追加到第一轮Transcript

#### Scenario: 同一Turn包含正文和工具活动

- **WHEN** 选中Turn的structured parts依次包含text、reasoning、dynamic-tool和text
- **THEN** Activity区域 SHALL只展示reasoning/tool parts并保持顺序
- **AND** Transcript SHALL只展示两个text parts且不重复工具活动
- **AND** 普通Markdown斜体 SHALL继续正常显示

#### Scenario: Running Turn没有文本输出

- **WHEN** 选中Turn正在运行且只有reasoning/tool parts
- **THEN** Slideover SHALL显示running状态和Activity
- **AND** Transcript SHALL显示“正在等待子 Agent 输出…”的明确局部状态

#### Scenario: 可访问的Slideover交互

- **WHEN** 用户通过键盘激活行内Signal或底栏列表项并随后关闭Slideover
- **THEN** trigger SHALL具备可见focus与可理解的aria label
- **AND** Slideover关闭后 SHALL把焦点恢复到原trigger

### Requirement: Renderer按完整owner key管理查询与切换生命周期

Renderer SHALL使用`workspaceId + parentSessionId + sessionId`作为detail cache identity，并使用`workspaceId + parentSessionId`作为list identity。Workspace或父Session切换 SHALL递增request generation或清除旧scope，使迟到list/detail结果、旧Workspace wake和已关闭Slideover refresh不得覆盖当前scope。

Renderer SHALL将缓存与观察interest分离：行内`spawn.session`首次挂载 SHALL使用消息所属parent list summary显示Agent/status，只有打开Slideover才建立detail interest；底栏与Signal的多个相同detail入口 SHALL共享owner cache，并在最后一个打开入口关闭后停止实时detail刷新。历史Signal SHALL使用其所在持久化assistant message的Workspace/父Session host context；缺少context时 SHALL显示非交互不可用fallback，且 SHALL NOT回退当前active Session猜测owner。Main SHALL继续重新校验所有renderer context。

#### Scenario: Workspace切换时旧请求迟到

- **WHEN** Workspace A的detail请求尚未返回时窗口切换到Workspace B
- **THEN** A的迟到结果 SHALL被丢弃
- **AND** SHALL不出现在B的Signal、活动栏或Slideover中

#### Scenario: 历史Signal只加载summary

- **WHEN** 历史assistant message重新挂载一个owner-matched`spawn.session`但用户未打开详情
- **THEN** Signal SHALL从消息所属parent list summary显示可信Agent和状态
- **AND** SHALL不因detail cache曾存在而持续读取完整messages

#### Scenario: 多入口观察同一detail

- **WHEN** 同一owner detail被两个合法入口打开且随后关闭其中一个
- **THEN** 剩余入口 SHALL继续收到detail refresh
- **AND** 只有最后一个入口关闭后 SHALL停止该detail实时刷新

### Requirement: Inspection不参与Action、EventRail或completion notification状态机

挂载、重复挂载、点击或刷新`spawn.session`、底部后台活动栏、Turn selector及其Slideover SHALL不创建Action ID，不调用Action IPC，不写session actionStates，不改变attention count，不向EventRail添加item，也不创建Signal storage record。Inspection list/detail SHALL不调用notification claim/dispatch，不返回notification state，也不改变at-most-once父Agent reminder投递边界。

#### Scenario: 打开已完成background Session详情

- **WHEN** turn notification仍为pending且用户从Signal或底栏打开Slideover并切换Turns
- **THEN** notification SHALL继续保持pending直到既有notification coordinator claim
- **AND** 打开或浏览详情 SHALL不触发父Agent prompt

#### Scenario: 重复挂载同一Signal

- **WHEN** 同一历史assistant message被多次挂载或包含重复`spawn.session`标签
- **THEN** EventRail和attention count SHALL保持不变
- **AND** Main SHALL不新增spawned Session、turn、response或notification record

## REMOVED Requirements

### Requirement: Composer入口只聚合当前父Session的active background turns

**Reason**: 仅在composer内部显示active background turns会在terminal后移除历史入口，且排除sync Turn；该行为由父Session级底部后台活动栏替代。

**Migration**: 移除`ChatPromptPanel.vue`中的旧入口挂载，使用`ChatContainer.vue`底部宿主组合新的spawned Session活动入口；existing Signal继续打开同一详情。

#### Scenario: 旧composer入口迁移

- **WHEN** 当前父Session包含terminal或sync spawned Sessions
- **THEN** 系统 SHALL通过新的底部活动栏提供入口
- **AND** SHALL不再依赖旧active-background-only composer popover
