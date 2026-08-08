## Context

`fyllo-spawn` Phase 1 与 background spawned Sessions 已完成。当前 Main 已具备：

- `SpawnedSessionManager` 对可信 `{ workspaceId, parentSessionId }` 的 owner校验、1/4/8 active容量、10分钟 inactivity、5秒 cancel grace与 process generation失效处理；
- `AcpSession` + `driveAcpTurn` + `MessageAssembler` 的唯一 ACP turn主干；
- `spawn/<sessionId>/meta.json`、`turns/<turnId>.json`、`messages.jsonl`和不可变 `responses/<responseId>.md`；
- background terminal turn内嵌的 durable notification outbox，以及 Workspace定向 wake和父 Chat至多一次 reminder调度；
- 启动后把无 live handle的非终态 turn收敛为 `interrupted / APP_RESTARTED` 的 reconciliation语义。

当前 renderer只消费 completion notification以驱动父 Agent reminder，没有用户可见的 spawned Session查询或详情模型。旧版 `references/designs/fyllo-spawn/03_signal-spawned-session.md` 假设单一 `response.md`、renderer增量事件表和Signal中的可信 `agentId/label`，均不符合现状。

本变更跨 shared协议、Main service/storage、IPC/preload、renderer store/bootstrap、Fyllo Signal和Chat UI。它必须让持久化记录与Main live handle继续作为事实来源，并保持notification outbox的投递状态机完全独立。

## Goals / Non-Goals

**Goals:**

- 让父 Chat assistant text中的 `spawn.session` 成为可点击、可恢复、无副作用的 spawned Session入口。
- 让同步和background新建 spawned Session均可产生同一Signal；同步调用通常首次可见时已经terminal。
- 提供严格owner-scoped的只读列表/详情IPC，返回可信状态、Agent、时间、Prompt、turns、结构化messages与response引用。
- 用现有`MessageAssembler`产生running assistant snapshot，不复制ACP事件映射或turn driver。
- 让renderer reload、窗口关闭重开、重复wake和历史消息重新打开都通过Main重新构建状态；应用重启后显示`interrupted / APP_RESTARTED`。
- 在Chat composer附近只聚合当前Workspace、当前父Chat Session下的active background turns。
- 保持Signal不进入Action状态机、EventRail、attention或任何Signal持久化；重复或漏发Signal不影响服务端任务事实。

**Non-Goals:**

- 不增加、删除或重命名`available_agents`、`prompt_to_agent`、`check_session_status`、`read_response`四个Agent tools。
- 不恢复`responsePath`，不允许renderer读取、拼接或提交app-data路径。
- 不让background turn跨应用进程继续，不增加绝对运行时长限制或累计Session上限。
- 不改变completion notification的at-most-once claim、dispatch、delivered或delivery_unknown语义。
- 不允许用户从UI继续prompt、cancel、retry或修改spawned Session；本阶段查询和详情均为只读。
- 不把同步active turn加入composer background聚合；同步Session仍可通过其行内Signal查看terminal详情。
- 不批量迁移或改写既有version 1 spawned meta/turn/message/response数据。

## Decisions

### 1. `spawn.session` 是不可信的opaque pointer，payload只包含`sessionId`

Shared Signal registry新增：

```ts
export interface SpawnSessionSignalPayload {
  sessionId: string;
}
```

schema使用strict object；`sessionId`长度为1到256，禁止`/`、`\\`和NUL。payload不允许`workspaceId`、`parentSessionId`、`agentId`、`label`、状态、内容、`responseId`或路径。

prompt contract规定：

1. 只有本次`prompt_to_agent`输入省略`sessionId`且结果包含`sessionId`时才输出；
2. 同步和background新建均适用；
3. 同一新建调用在一个assistant response中最多输出一次；
4. continuation调用、capacity结果或没有Session identity的RPC失败不输出；
5. Signal独占顶层Markdown block并遵守现有公共换行规则。

`src/mcp-servers/fyllo-spawn/src/tools/index.ts` 的tool description只提醒Agent在新建成功后遵守已注入的`spawn.session` contract，不复制payload字段、example或格式规则。schema、example和约束继续由`src/shared/fyllo-signal/registry.ts`单点驱动。

重复Signal不会被注册或持久化。多个节点可以指向同一Session，但renderer store以完整owner key合并in-flight请求和cache；重复挂载最多形成重复入口，不形成重复任务、turn或notification。Agent漏发Signal时，Main记录和composer background入口仍正常。

**替代方案：在Signal中携带agentId/label。** 拒绝，因为Agent输出不是授权或身份事实，且字段可能与Main meta冲突。

### 2. 新增独立`session:spawned-session`只读IPC area

新增以下domain-first contract：

- `src/shared/ipc/session/spawned-session.channels.ts`
- `src/shared/ipc/session/spawned-session.schemas.ts`
- `src/main/ipc/session/spawned-session.ts`
- `src/preload/api/session/spawned-session.ts`
- `src/renderer/src/api/session/spawned-session.ts`

公开通道：

```text
session:spawned-session:list
session:spawned-session:getDetail
session:spawned-session:wake
```

输入均为strict object：

```ts
type ListInput = { workspaceId: string; parentSessionId: string };
type DetailInput = { workspaceId: string; parentSessionId: string; sessionId: string };
type WakePayload = { workspaceId: string; parentSessionId: string; sessionId: string };
```

Main handler必须先调用`requireWorkspaceSender(event.sender, workspaceId)`，再使用现有Chat Session storage/service确认`parentSessionId`属于该Workspace且未删除。query service只读取`spawn/<sessionId>`中owner完全匹配的数据；跨Workspace、跨父Session、已删除父Session、未知或损坏目标统一返回`not_found`，不得泄露目标是否存在。

返回值不得包含`workspaceId`/`parentSessionId`之外的其他owner identity、app-data路径、response文件名或可由renderer控制的授权字段。`responseId`保持opaque reference；UI最终文本来自结构化assistant text parts，不通过路径读取response Markdown。

该IPC没有create、claim、dispatch、cancel、retry或continue方法。查询不得调用`claimSpawnNotification()`、`dispatchSpawnNotification()`或改变pending/dispatched/delivered状态。Main在服务查询前可以复用既有一次性Workspace reconciliation，把遗留非终态按既有契约durable收敛为`APP_RESTARTED`；这属于应用生命周期恢复，不由Signal payload决定，也不得重投已经dispatched的notification。

**替代方案：扩展`session:chat:spawn-notifications`。** 拒绝，因为notification API的唯一职责是父Agent自动提醒；把用户详情混入会使读取与claim语义耦合。

### 3. Query service以durable record为基线，再叠加匹配的Main live snapshot

新增`src/main/services/session/spawn/spawned-session-query-service.ts`。它通过`src/main/infra/storage/spawned-session-store.ts`新增的父作用域枚举函数读取meta、turn records和messages；storage仍拥有所有磁盘路径，service和IPC不拼接路径。

列表按`updatedAt`倒序，并将active项排在terminal项前。每项至少包含：

```ts
interface SpawnedSessionSummary {
  sessionId: string;
  agent: { agentId: string; name: string };
  status: "starting" | "running" | "idle" | "error" | "expired" | "interrupted";
  mode?: "sync" | "background";
  startedAt?: string;
  lastActivityAt?: string;
  updatedAt: string;
  promptPreview?: string;
  currentTurnId?: string;
  latestResponseId?: string;
  error?: { code: string; message: string };
}
```

Agent名称通过现有catalog按meta中的可信`agentId`只读解析，不启动AgentProcess；Agent已卸载时name回退为`agentId`。

详情包含summary、第一条user message形成的`initialPrompt`、最后一条user message形成的`currentPrompt`、按创建时间排序的turn summaries，以及结构化messages。message schema只允许当前spawn主干会产生的user text、assistant text、reasoning和dynamic-tool parts；时间统一序列化为ISO string。terminal数据来自`messages.jsonl`，running时可附加一条`durable: false`的live assistant message。每个turn summary只携带opaque`responseId`。

既有单Session单active turn保证消息顺序为user prompt后跟其assistant消息。UI需要分轮展示时可按有序user/assistant消息与有序turn records做ordinal投影；损坏或缺失message只产生局部空态，不猜造正文。无需给version 1 record增加message path或批量迁移。

状态投影规则：

| Main事实                                       | UI状态                                        |
| ---------------------------------------------- | --------------------------------------------- |
| 最新turn `starting`                            | `starting`                                    |
| 匹配live handle，或record `running/cancelling` | `running`                                     |
| 最新turn `completed`且response已durable        | `idle`                                        |
| turn/meta `error`                              | `error`                                       |
| turn/meta `expired`或generation失效            | `expired`                                     |
| turn `interrupted`                             | `interrupted`                                 |
| 遗留非终态且无live handle                      | reconciliation后`interrupted / APP_RESTARTED` |

`cancelling`继续是Main内部phase；公开投影为`running`，活动文案可显示“正在取消…”。query service不得因为meta仍为`running`就覆盖更具体的terminal turn record。

### 4. Running内容从唯一`MessageAssembler`读取，不建立第二套事件驱动

为`src/main/domain/session/chat/message-assembler.ts#MessageAssembler`增加只读`snapshot()`，返回当前assistant `UIMessage`的深拷贝且不flush、不改变active part索引或tool delta状态。

扩展`AcpTurnHooks.onContentEvent`，在现有`CONTENT_KINDS`分支完成`assembler.apply(event)`后同时传递snapshot。普通Chat stream仍从同一event映射发送chunk；spawn manager把snapshot写入当前`ActiveTurn.liveAssistantMessage`，并继续通过现有`touch()`更新时间和recent activity。不得复制`CONTENT_KINDS` switch、ACP mapper或新建renderer专用assembler。

`ActiveTurn`与最新durable turnId严格匹配时，query service才叠加live snapshot；terminal finalizer完成后live entry释放，后续查询只读durableassistant message和turn record。

### 5. View wake是独立、level-triggered、可丢失的刷新提示

`SpawnedSessionManager`增加独立view wake handler，在以下节点通知`WorkspaceWindowManager.sendToWorkspace()`：

- starting turn record durable；
- prompt dispatched并转running；
- text/reasoning/tool/usage等有效activity更新；
- completed/error/expired/interrupted terminal record durable；
- 父Session删除导致owner不可用。

高频content event按owner/session进行短间隔合并；coalescing timer归现有spawned-session lifecycle owner，在`beginShutdown()`、`dispose()`和`forceDispose()`清理，不新增独立shutdown deadline或资源owner。

wake payload只用于定位需要重新查询的scope，renderer不得把payload中的状态或内容写入cache。窗口关闭、renderer reload或事件丢失由首次list/detail恢复；重复事件通过store in-flight合并和generation检查保持幂等。view wake与`SessionChatNotificationChannels.wake`使用不同channel，terminal时可以同时发出，但互不claim或ack。

### 6. Renderer状态归session domain store，UI归独立inspection feature

新增`src/renderer/src/stores/session/spawned-session.ts`并从session/root store barrel显式导出。store按`workspaceId + parentSessionId + sessionId`完整key维护：

- 父作用域summary list、loading/error和request generation；
- detail cache、单key in-flight promise和refresh generation；
- 当前Workspace/父Session切换时的迟到响应隔离；
- wake后的owner-scoped re-fetch；
- `activeBackgroundForParent` selector，仅选择mode=`background`且status=`starting|running`的条目。

新增`src/renderer/src/features/spawned-session-inspector/`，因其同时拥有Signal、composer、Slideover多入口和异步view model，采用实际需要的`model/application/ui`层并提供README与根公共入口；宿主装配继续留在现有Fyllo Signal integration与Chat composer：

- model：状态presentation、active background predicate、structured message到activity/transcript的纯selector；
- application：围绕公开session store的查询/打开用例，不直接调用`window.api`；
- ui：inline entry、background popover、detail Slideover；
- 现有host/integration：`features/fyllo-signal`负责Signal type adapter，`ChatPromptPanel.vue`负责composer装配；两者只从inspection feature根公共入口导入稳定组件。

`features/fyllo-signal/ui/signals/SpawnSessionSignal.vue`只作为Signal type adapter，从`@renderer/features/spawned-session-inspector`公共入口使用稳定inline组件，不深路径导入内部文件；spawned-session-inspector不反向依赖fyllo-signal，避免循环。

### 7. Signal host context是查询上下文，不是授权

`AssistantMessage.vue`已经知道assistant message所属`workspaceId`和父`sessionId`。新增最小`FylloSignalHostContextInput { workspaceId, parentSessionId }`，由`AssistantMessage -> MarkStream`显式传入并由Fyllo Signal integration通过provide/inject交给type component。`show.time`忽略该context。

`spawn.session`在缺少host context时显示“Session信息不可用”的非交互fallback，不使用当前active Session猜测owner。即使renderer提交了伪造context，Main仍按sender Workspace、父Session存在性和spawn owner重新验证；context只决定查询键，不授予访问权。

历史assistant message重新打开时会从持久化text重新解析Signal，再用该message所属父Session执行detail query。Signal自身不保存状态、ordinal或Action ID。

### 8. Slideover只从结构化parts构造Prompt、Activity和Transcript

Slideover复用现有`SubagentCallSlideover.vue`的`USlideover`宽度、header、close button、焦点恢复和语义token模式，但不复用其Agent-specific tool tree数据源。

信息架构：

1. Header：Prompt摘要、明确状态文字+icon、可信Agent name/id、started/last activity/updated时间和稳定error code/message；
2. 原始委派Prompt：第一条user text，保留换行；
3. Activity：从assistant reasoning/dynamic-tool parts产生`AssistantActivityEntry[]`，按消息/turn分组，默认折叠并复用`ChatActivityGroup.vue`和`ChatToolItem.vue`；
4. Transcript：按turn顺序只渲染assistant text parts，使用`MarkStream`但关闭Actions和Signals；不得通过CSS隐藏`em`、heading或其他Markdown元素；
5. Response reference：只显示可用的`responseId`，不读取或展示路径。

loading、query error、not_found、无Prompt、无Activity、无text transcript分别使用清晰局部状态；完整空态使用`AppEmptyState`。状态不能只靠颜色。trigger支持button语义、Enter/Space、可见focus和`aria-expanded`，Slideover关闭后焦点返回对应Signal或popover item。宽度使用`w-[min(100vw,760px)]`并在窄窗口避免横向滚动；浅色/深色沿用Nuxt UI semantic tokens和全局overlay。

### 9. Composer入口只聚合当前父Chat的active background turns

在`ChatPromptPanel.vue` footer左侧现有action/command/config区域附近装配`SpawnedSessionBackgroundEntry`：

- 没有active parent Session或active background为0时隐藏；draft Session不显示；
- 显示“正在运行 N 个后台任务”文字、spinner和`aria-label`，不能只用颜色或图标；
- popover只列当前`{workspaceId,parentSessionId}`下mode=`background`且status为`starting|running`的记录；
- 每项显示Agent、Prompt摘要、状态文字和开始时间，点击打开同一详情Slideover；
- 不列出同Workspace的其他父Session，不列sync turn、idle或terminal历史；
- 当前父Session切换时立即使用新scope generation，旧结果和旧wake不得污染列表。

这个入口直接读取Main list，与Signal是否存在或是否已加载无关，因此父Agent漏发或重复发Signal都不会改变全局background计数。

### 10. Completion notification保持原有事实源和投递边界

以下代码路径不得被inspection feature调用或替换：

- `spawnNotificationService.list/claim/buildReminder/markDelivered/markDeliveryUnknown`；
- renderer `useChatStore().requestSpawnNotificationDrain()`；
- `SessionChatNotificationChannels.list/dispatch/wake`；
- parent Chat per-session gate和at-most-once claim。

新view query读取同一turn record但不解释`notification.state`为UI Session状态，也不把它返回给renderer。terminal持久化仍先保证assistant message和immutable response可读，再写completed/error turn与pending notification；view wake只能在对应事实durable后发出。

### 11. 父删除、窗口、重启和多窗口沿用现有生命周期

- Workspace切换：store清除旧scope或递增generation并销毁旧subscription；迟到response丢弃。
- 父Session切换：composer只订阅/查询新父Session；历史Signal使用其消息所属父Session，不使用active fallback。
- 多窗口：Main只向匹配Workspace窗口发送wake，每个窗口再独立查询其父Session；sender验证仍在IPC执行。
- macOS窗口关闭：app-owned spawn继续运行；窗口重开首次list/detail恢复。
- renderer reload：没有内存增量依赖，bootstrap重建listener并按需pull。
- 重复wake：只触发合并后的pull；重复Signal只共享cache。
- 父Session删除：沿用fence → cancel/settle → suppress → delete；query返回not_found，已开Slideover显示不可用并停止refresh。
- 应用正常shutdown：active turn按既有语义写`APP_SHUTDOWN`；强制退出遗留由下次reconciliation写`APP_RESTARTED`。
- AgentProcess invalidation：显示`expired / AGENT_PROCESS_INVALIDATED`，不在新generation恢复。

## Risks / Trade-offs

- **[高频ACP delta导致IPC/query压力]** → Main按spawn owner合并view wake，renderer合并同key in-flight查询；事件永远只触发pull，不携带完整状态。
- **[live snapshot不durable，崩溃时部分文本可能丢失]** → 这是现有turn持久化契约；重启后明确显示`APP_RESTARTED`并只展示已durable内容，不伪造跨进程continuation。本变更不把每个token写盘。
- **[version 1消息与turn没有显式foreign key]** → 利用单Session单active turn及user/assistant顺序做ordinal投影；缺损数据局部降级，不改写旧record。若未来需要随机访问任意历史turn，再单独提案增加message identity字段。
- **[Agent漏发Signal]** → composer background入口和Main query不依赖Signal；服务端事实不受影响。
- **[Agent重复发Signal]** → Signal无注册/写入；owner-keyed store合并查询，多个入口只读同一Session。
- **[renderer伪造parentSessionId/sessionId]** → Main校验sender Workspace、父Session存在性及spawn owner；失败统一not_found。
- **[UI查询意外消费父Agent通知]** → 新IPC与notification channel/service分离，测试断言list/detail/open均不调用claim/dispatch且不改变notification state。
- **[新增feature与fyllo-signal形成循环]** → fyllo-signal仅从spawned-session-inspector根公共入口导入UI adapter；inspection feature不导入fyllo-signal。
- **[状态出现短暂回退]** → Main以latest terminal record优先于meta，renderer以request generation拒绝迟到结果，terminal状态不会被旧running响应覆盖。

## Migration Plan

1. 扩展shared Signal与spawned-session IPC schema，保持现有Signal和Agent RPC兼容。
2. 为`MessageAssembler`/`driveAcpTurn`增加只读snapshot出口，并在spawn manager维护live view与独立wake；普通Chat和现有spawn terminal路径先通过回归测试。
3. 在storage增加父作用域枚举，在Main query service完成owner验证、durable+live投影和restart reconciliation读取；不修改version 1磁盘格式。
4. 接入IPC/preload/renderer API和session store，再接bootstrap wake listener与scope generation。
5. 实现spawned-session-inspector feature、Signal adapter、Slideover和composer入口。
6. 补齐shared/main/preload/renderer与生命周期测试，更新`guidelines/MainProcess.md`和`guidelines/RendererProcess.md`中新的只读query、view wake和store边界。
7. Apply阶段先运行`sh scripts/prepare-worktree-env.sh`，再运行聚焦main/renderer测试、`pnpm typecheck`和`pnpm lint`；不执行`pnpm build`，除非用户针对Apply明确授权。

回滚时可以移除新Signal type、查询IPC、renderer store/feature和view wake；既有spawn meta/turn/messages/responses与notification outbox未改变，无需数据回滚。

## Open Questions

无。范围已确定：行内Signal覆盖同步与background新建Session；composer只聚合当前父Chat Session的active background turns。
