## Why

现有 `fyllo-spawn` 已能持久化同步与后台 spawned Session，并通过 durable outbox 自动通知父 Agent，但 Chat 用户没有可信、可恢复的入口查看子 Agent 的运行状态、活动和最终输出。旧版 `03_signal-spawned-session.md` 依赖已经废弃的单一 `response.md`、renderer 内存事件表和不安全的 Signal payload，需要按当前 `responseId + read_response`、owner-scoped turn record、应用重启中断语义与结构化 `UIMessage` 重新设计。

## What Changes

- 启用 strict `spawn.session` Fyllo Signal；payload 只携带 opaque `sessionId`，不携带或信任 Workspace、父 Session、Agent、状态、内容、label或本地路径。
- 规定父 Agent 仅在未传 `sessionId` 的 `prompt_to_agent` 新建调用返回 Session identity 后输出一次 Signal；同步与 background 新建 Session 均覆盖，continuation 不重复输出。
- 新增只读、owner-scoped spawned Session 查询能力，按可信 Workspace sender和父 Chat Session校验列表/详情，返回服务端状态、时间、Agent、首次 Prompt、当前/latest turn、结构化 activity/transcript和 `responseId` 引用，不向 renderer暴露磁盘路径。
- 让 running 展示复用现有 `AcpSession`、`driveAcpTurn`、`MessageAssembler` 与 `ActiveTurn`；Main 只发送 level-triggered wake，renderer每次重新查询权威状态，不建立第二套 turn driver或内存事件事实源。
- 在 Chat 中增加可点击的行内 Signal、spawned Session详情 Slideover，以及 composer附近的 background活动入口；全局入口只聚合当前 Workspace中当前父 Chat Session的 active background turns。
- 明确 reload、窗口关闭重开、多窗口、Workspace/Session切换、重复 Signal/wake、父 Session删除和应用重启恢复语义；遗留非终态在重启后显示 `interrupted / APP_RESTARTED`。
- 保持 completion notification outbox和父 Agent自动 reminder的 claim/投递语义独立；UI查询、Signal挂载和详情打开不得 claim、消费或修改 notification。
- 保持现有 HTTP-only四个 tools、Workspace/multi-root授权、`responseId + read_response`、1/4/8 active限制、10分钟 inactivity、5秒 cancel grace、ACP process pool、config recovery、`allow_once`、空 spawned reminder/MCP、父删除与集中 shutdown契约不变。

## Capabilities

### New Capabilities

- `spawned-session-inspection`: 定义可信的 spawned Session列表/详情查询、实时状态投影、结构化活动与 transcript、Chat Slideover、当前父 Session background入口和恢复/隔离行为。

### Modified Capabilities

- `fyllo-spawn`: 增加新建 spawned Session的 `spawn.session` 输出指导与可观察状态投影约束，同时保持四个现有 Agent tools和响应读取契约不变。
- `fyllo-signal-prompt-contract`: 在 shared registry启用 strict `spawn.session` contract，并规定首次新建、同步/background覆盖和重复输出规则。
- `fyllo-signal-rendering`: 允许 `spawn.session` 通过只读外部 view model提供点击与实时展示，同时继续排除 Action状态机、EventRail、attention和Signal持久化副作用。

## Impact

- Shared contracts：`src/shared/fyllo-signal/**`、新增或扩展 `src/shared/ipc/session/**` spawned-session schema/channel、相关 Chat/Message投影类型。
- Main：`src/main/services/session/spawn/**`、`src/main/services/session/chat/acp-stream-driver.ts`、`MessageAssembler` snapshot、`src/main/infra/storage/spawned-session-store.ts`、session IPC注册与 `WorkspaceWindowManager`定向 wake。
- Preload/renderer API：`src/preload/api/session/**`、`src/preload/index.ts`/`index.d.ts`、`src/renderer/src/api/session/**`。
- Renderer：session domain store、bootstrap subscription、`features/fyllo-signal/**`、新的 spawned-session inspection feature、`MarkStream` host context、Chat composer和 Slideover UI。
- Tests：shared/main/storage/IPC/preload、renderer store/bootstrap/Signal/Slideover/composer，以及 reload/restart/delete/multi-window/重复事件和 outbox无副作用回归。
- 不新增运行时依赖，不改变 response文件位置或公开路径，不迁移或批量改写既有 spawned Session数据。
