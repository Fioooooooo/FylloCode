## Context

当前 spawned Session inspection 已具备 owner-scoped list/detail IPC、Main live snapshot、durable meta/turn/messages、独立 view wake、行内 `spawn.session` 入口和 composer 内 active-background popover。问题不在于缺少运行事实，而在于入口生命周期和查询成本：Signal 只随父 Agent 文本出现一次，composer 入口在 turn 终态后消失；同时 `listSpawnedSessionsForParent()` 会为父 Session 下每个 spawned Session 读取全部 turn records 与完整 `messages.jsonl`，`useSpawnedSessionStore().handleWake()` 又会刷新所有曾加载过的 detail。把该入口提升为常驻底栏而不调整查询责任，会让 40ms owner wake 合并后的高频 activity 持续触发全量磁盘读取。

这是一项现有开发工具界面的定向演进。视觉继续使用 Nuxt UI、Tailwind 语义 token、Lucide 图标和现有圆角/焦点规则，不引入新设计系统或依赖。设计参数为 `DESIGN_VARIANCE: 3`、`MOTION_INTENSITY: 2`、`VISUAL_DENSITY: 7`：底栏位置稳定、动效只表达 running 状态、内容保持紧凑，并同时适配浅色/深色与窄窗口。

## Goals / Non-Goals

**Goals:**

- 让当前父 Chat Session 的全部 spawned Sessions 在不依赖 Agent 输出 Signal 的情况下稳定可发现。
- 让同一 spawned Session 的后续 turn 在同一 UI identity 上恢复 active 并可查看逐轮历史。
- 保留当前压缩 Transcript 的产品语义：每轮仍从同一结构化 assistant message 投影正文和聚合工具活动，不改成完整聊天复刻。
- 将常驻列表与按需详情的读取责任分开，并保证 wake 在 in-flight、切换父 Session和关闭 Slideover 时不会产生陈旧覆盖或无效刷新。
- 保持 inspection 与 completion notification、Action、EventRail、attention 和 spawned runtime 生命周期隔离。

**Non-Goals:**

- 不增加 UI cancel、continue、retry 或直接向子 Agent 提交 Prompt 的能力。
- 不创建通用后台任务持久化模型、全局 event bus 或 fyllo-specs 风格的 MCP event 文件。
- 不改变 spawned Session 的 ACP process、容量、watchdog、权限、父删除、shutdown、response chunk 或 notification 语义。
- 不删除历史消息中的 `spawn.session` renderer，也不迁移或重写既有 spawned messages/turn files。
- 不在本次变化中引入历史分页、保留期限或 Session 清理 UI。

## Decisions

### 1. Main spawned store与live handle继续作为唯一事实源

`prompt_to_agent` 已通过 typed child-to-Main RPC 进入 `SpawnedSessionManager`；Manager 在首次和续聊 turn 中写 meta、user message、turn record，并在 starting、running activity、terminal 与删除时调用 `scheduleViewWake()`。因此 UI 发现和状态恢复直接依赖 `session:spawned-session:list/getDetail`，不复用 `mcp-events/` 文件 watcher。

`spawn.session` 保留为 assistant message 中的可选详情深链。shared Signal prompt metadata 和 fyllo-spawn tool description 不再要求父 Agent 在新建 Session 后输出它；漏发、重复或 continuation 不输出均不影响底栏列表和状态。

**替代方案：**让 fyllo-spawn 写 MCP event 文件。该方案会在已经存在 typed RPC 和 durable store 的路径旁增加第二事实源、文件消费延迟和重复/漏消费处理，且不适合 running activity 的高频状态，因此拒绝。

### 2. Chat宿主拥有底部活动区域，spawned feature提供公开入口

在 `src/renderer/src/components/chat/ChatContainer.vue` 的 footer 中，将 `ChatPromptPanel` 与新的 `ChatBackgroundActivityBar.vue` 垂直组合；活动栏位于 Prompt 外部、Chat 内容卡片最下方，不进入 `ChatSessionEventRail`，也不占用 `UChatPrompt` footer。`ChatBackgroundActivityBar` 只负责稳定布局和宿主装配，当前从 `@renderer/features/spawned-session-inspector` 公共入口组合 `SpawnedSessionActivityEntry`；不提前建立 runtime contributor registry，未来出现第二类后台来源时再把宿主 slot/props 提升为穷尽 typed contributor contract。

活动栏仅在当前非 draft 父 Session 的 list 非空时显示。紧凑入口显示“子 Agent N”和可选“M 正在运行”，其中 active 定义为最新状态 `starting | running`，不以 `mode` 过滤；点击后列出全部 owner-matched Sessions，active 优先，其余按 `updatedAt` 降序。列表项显示 Agent、Prompt 摘要、明确状态文字和时间，并打开复用的详情 Slideover。窄窗口保持单行摘要和可滚动浮层，不产生横向页面滚动；状态由文字与 icon共同表达，running 旋转动效遵守既有 reduced-motion 规则。

移除 `ChatPromptPanel.vue` 内的 `SpawnedSessionBackgroundEntry` 挂载；feature 可重命名/替换该组件，但外部只通过根 `index.ts` 导入。行内 Signal 与底栏复用同一 store、详情 controller 和 Slideover，不复制状态判断。

**替代方案：**把 spawned Sessions 作为 EventRail contributor。EventRail 当前表达 agenda、proposal 与待处理 Action 等离散会话事件；spawned Session 是持续变化、可回看的后台资源，把它放入 Rail 会混淆事件与运行控制，并让 Rail 的显示生命周期绑定 active 状态，因此拒绝。

### 3. list读取轻量summary，detail按owner单独加载

在 `src/main/infra/storage/spawned-session-store.ts` 拆分当前全量读取：

- `listSpawnedSessionSummariesForParent()` 只读取每个 Session 的 `meta.json` 和确定最新状态所需的 turn record，不读取 `messages.jsonl`；
- `loadSpawnedSessionStoredView(owner)` 只为一个明确 `{workspaceId,parentSessionId,sessionId}` 读取 meta、全部 turns 与 messages，供 detail 使用；
- `SpawnedSessionQueryService.listSpawnedSessions()` 使用 summary 路径，`getSpawnedSessionDetail()` 使用单 Session detail 路径，不再先加载父 Session 下全部详情再 `find()`。

为了在轻量 list 中保留 Prompt 摘要，`SpawnedSessionMeta` 增加可选、长度受限的 `initialPromptPreview` 与 `currentPromptPreview`。首次 Prompt 同时写入两者，continuation 只更新 current；完整 Prompt 仍只来自 detail messages。字段保持 optional，既有 version 1 meta 无需迁移，旧记录缺少摘要时列表显示既有“Prompt 未记录”fallback，打开详情后仍能读取完整历史。preview 不参与授权、Session identity 或 response 内容。

列表仍返回当前父 Session 的全部轻量 summaries；本次不增加分页。读取成本从“Session 数量乘以完整消息历史”降为“Session 目录与小型 meta/latest-turn”，为未来分页保留独立 list contract。

### 4. Main detail按Turn返回现有结构化内容的分组

`SpawnedSessionDetail` 将 turn summary 与本轮内容组合为 `SpawnedSessionTurnDetail`：保留 `turnId`、ordinal、mode、status、时间、error、recentActivity、opaque responseId，并增加本轮 user Prompt 与本轮有序 structured messages。Main 以有序 turn records 的时间窗口和有序 messages 将既有历史分组；每个 user message 开启本轮 Prompt，随后 assistant message（包括 latest live snapshot）只归入对应 Turn。成功 terminal 的内容继续来自 durable assistant message，running latest Turn 可叠加 identity 完全匹配的非 durable live assistant snapshot。

查询不得读取 response 文件正文来构造 UI，也不得改变 `spawnedMessageToResponseMarkdown()` 写入父 Agent response 的逻辑。Renderer 对选中 Turn 的 messages 继续调用既有 `projectSpawnedSessionContent()`：reasoning/dynamic-tool parts 聚合到 Activity，text parts 保持顺序进入 MarkStream Transcript，从而只增加 Turn 边界，不改变当前压缩展示。

旧记录不增加批量迁移。若某轮缺少 user 或 assistant message，该 Turn 仍按 durable record 展示状态并给出局部“Prompt 未记录”“未记录 Activity/文本输出”状态；单条损坏记录不得让后续同 owner Session 不可读，也不得伪造正文。

**替代方案：**只在 Renderer 按 user message ordinal 切分 flat messages。该方案能减少 shared schema 改动，但会把 durable/live 匹配、损坏记录降级和 Turn 归属规则复制到 UI，违背 Main query service 的权威投影边界，因此选择 Main 分组。

### 5. Slideover只增加Turn选择，不改变内容形态

`SpawnedSessionDetailSlideover.vue` 保留现有 Session header 和 summary，新增紧凑 Turn selector，显示“第 X 轮 / 共 N 轮”、本轮状态与时间。默认打开最新 Turn；打开期间若用户仍在跟随最新 Turn，新 Turn 出现时自动选择它；用户主动选择旧 Turn 后保持选择，并以非侵入文字/badge提示最新轮有活动，不强制跳转。选中 Turn 下依次展示“本轮 Prompt”、现有 Activity、现有 Transcript 和本轮 responseId。

Turn selector 使用既有 Nuxt UI 控件、语义 token 和可见 focus，不新增横向 pill 带或装饰卡片；长历史使用下拉选择/前后轮操作而非无限 tabs。loading、query error、not_found、空 Turn、无 Prompt、无 Activity、运行中无 text、terminal 无 text 和 partial error 均保留明确状态。关闭 Slideover 后焦点仍返回实际 trigger。

### 6. Renderer以interest和queued refresh管理wake

`useSpawnedSessionStore()` 继续使用完整 owner key 与 generation，但将“缓存存在”与“详情正在被观察”分开：

- list 为当前 Chat 底栏或历史 Signal 提供 parent-scoped interest；首次挂载主动查询，确保错过 wake 仍可恢复；
- detail 仅在 Slideover `open=true` 时注册 interest 并查询，关闭时注销；缓存可保留供下次打开即时显示，但 `handleWake()` 不再因为 `details.has(key)` 刷新关闭的详情；
- 同 key 请求仍合并；若请求进行中又收到 wake，则设置 queued/dirty，当前请求完成后至少再执行一次权威查询，多个 wake 只排队一次；
- Workspace/父 Session 切换、组件卸载或 `not_found` 递增 generation并释放 interest/queued state，迟到结果不得覆盖新 scope；
- list refresh 与当前打开 detail refresh分别调度。高频 activity 可以合并，但 terminal wake 后最终必须完成一次 post-in-flight reload。

行内 `SpawnedSessionInlineEntry` 首次只从 parent list summary 显示 Agent/status，点击才加载 detail，避免每个历史 Signal 永久建立 detail refresh。多个入口打开同一 owner detail 时使用引用计数或等价 interest set，最后一个关闭后停止刷新。

### 7. notification、EventRail和runtime保持隔离

活动栏挂载、列表刷新、Turn 切换和 Slideover 查看均为只读 inspection：不 claim/dispatch notification，不标记 delivered/unread，不创建 Action/Signal storage，不进入 EventRail或attention，不 prompt 父 Agent。completion notification 继续由独立 durable outbox和 renderer coordinator处理；两类 wake 即使同时到达也不共享状态机。

## Risks / Trade-offs

- [旧 meta 缺少 Prompt preview，轻量列表的信息密度下降] -> 字段保持 optional并使用明确 fallback；打开详情仍读取完整 Prompt，不为只读 UI执行隐式批量重写。
- [时间窗口无法为损坏历史完美恢复消息归属] -> turn record 保持权威，消息仅在明确窗口内归属；不确定内容局部降级而不跨 Turn 猜测或伪造。
- [高频 wake 在磁盘慢或窗口切换时堆积] -> 每 key 最多一个 in-flight和一个 queued refresh，generation丢弃迟到结果，关闭 detail立即释放 interest。
- [全部轻量 summaries 在极长历史下仍是 O(Session 数量)] -> 本次消除 messages 放大项并保持 list contract 独立；若实际规模需要，再在后续 change 引入 cursor pagination，不在本次混入保留策略。
- [底栏未来接入其他后台来源时出现宿主耦合] -> Chat host只组合 feature 公共入口，不让 spawned feature导入 Chat内部；等第二来源出现后再抽 typed contributor，避免当前建立无消费者抽象。
- [Signal 变为可选后历史消息中的上下文入口减少] -> 底栏提供稳定入口；Signal renderer和协议继续兼容，Agent在确有上下文价值时仍可输出。

## Migration Plan

1. 先扩展 optional meta preview和轻量/单详情 storage query，保持现有 IPC消费者可测试。
2. 更新 shared detail schema与 Main query service，以 Turn details投影 durable/live内容；同步更新 preload/renderer类型测试。
3. 重构 renderer store interest、queued refresh和list-summary入口，再实现 Turn selector。
4. 将 spawned活动入口从 `ChatPromptPanel` 移到 `ChatContainer` 底部宿主，并保留行内 Signal深链。
5. 最后调整 Signal registry和 fyllo-spawn tool description，移除对必需Signal的依赖；旧消息和旧 meta无需迁移。

回滚时可恢复旧 Renderer入口和 flat detail schema；新增 meta preview为 optional，旧版本读取时若 strict schema不认识新字段会失败，因此发布/回滚必须保证写入 preview 的 Main 与读取 schema 同版本。若需要支持跨版本回滚，应在上线前选择提升 meta version并增加兼容 parser；本项目桌面应用按整包升级，本方案默认不支持新数据由旧二进制读取。

## Open Questions

无。底栏第一版保持只读、全部轻量 Session可访问、详情默认最新 Turn；分页和通用后台 contributor推迟到有第二来源或真实规模证据时再设计。
