## 1. 扩展Fyllo Signal与fyllo-spawn prompt contract

- [x] 1.1 在`src/shared/fyllo-signal/protocol.ts`、`schemas.ts`和`registry.ts`新增`SpawnSessionSignalPayload`与`spawn.session`穷尽contract；schema只接受1–256字符且不含`/`、`\\`、NUL的`sessionId`，prompt metadata写明仅在省略sessionId的新建`prompt_to_agent`结果包含Session identity后输出一次，同步/background均覆盖，continuation和无identity错误不输出。更新`test/shared/fyllo-signal/schemas.spec.ts`、`registry.spec.ts`、`parser.spec.ts`、`prompt.spec.ts`覆盖strict额外字段拒绝、example可解析、生成contract顺序及换行规则。
- [x] 1.2 修改`src/mcp-servers/fyllo-spawn/src/tools/index.ts`的`prompt_to_agent`description，只引用已注入的`spawn.session` contract说明新建/continuation时机，不复制payload schema或example；保持四个tools、background说明和`responseId + read_response`不变。扩展`test/mcp-servers/fyllo-spawn/tools.spec.ts`断言同步/background新建指导、continuation禁止重复，以及description不出现`responsePath`、app-data路径或重复JSON example。

## 2. 定义spawned-session只读IPC与结构化投影schema

- [x] 2.1 新增`src/shared/ipc/session/spawned-session.channels.ts`，定义`session:spawned-session:list`、`getDetail`、`wake`；新增`src/shared/ipc/session/spawned-session.schemas.ts`，定义strict list/detail输入、`SpawnedSessionDisplayStatus`、Agent/turn/error/Prompt、结构化user text与assistant text/reasoning/dynamic-tool message、summary/detail/not_found和wake payload。所有日期使用ISO datetime，response只允许opaque`responseId`，schema不得出现path或notification state。新增`test/shared/ipc/session/spawned-session.schemas.spec.ts`覆盖合法分支、额外授权字段拒绝、状态穷尽、live message的`durable:false`和路径字段拒绝。
- [x] 2.2 在shared schema中明确list按父scope返回summary数组、detail返回ready/not_found判别联合，并为renderer selector保留`mode`、`currentTurnId`、started/lastActivity/updatedAt、promptPreview和error；通过类型测试确保`starting/running/idle/error/expired/interrupted`没有`cancelling`公开分支。

## 3. 暴露唯一MessageAssembler的running snapshot

- [x] 3.1 在`src/main/domain/session/chat/message-assembler.ts#MessageAssembler`增加无副作用`snapshot()`，对当前`UIMessage`做深拷贝且不flush、不清空tool output delta或重置active part索引。扩展`test/main/domain/session/chat/message-assembler.spec.ts`覆盖text/reasoning/tool混合snapshot、snapshot后继续追加、调用方修改返回值不污染assembler，以及最终flush仍完整。
- [x] 3.2 扩展`src/main/services/session/chat/acp-stream-driver.ts#AcpTurnHooks.onContentEvent`，在同一`CONTENT_KINDS`分支完成`assembler.apply()`后传递snapshot；适配现有Chat/spawn调用方但不得复制event switch。扩展`test/main/services/session/chat/acp-stream-driver.spec.ts`证明每个content event只组装一次、snapshot顺序正确、terminal hook只finalize一次且普通Chat chunk行为不变。

## 4. 建立Main durable+live查询与view wake

- [x] 4.1 在`src/main/infra/storage/spawned-session-store.ts`新增按`{workspaceId,parentSessionId}`枚举spawned meta、turn records和messages的owner-safe函数，复用`workspace-paths.ts`、identity校验、JSONL parser和现有损坏record隔离；不得把解析出的路径返回service。扩展`test/main/infra/storage/spawned-session-store.spec.ts`覆盖同Workspace不同父Session隔离、legacy meta-only、损坏单Session跳过、消息顺序和无response路径投影。
- [x] 4.2 在`src/main/services/session/spawn/spawned-session-manager.ts`扩展`ActiveTurn`保存`liveAssistantMessage`，在既有`touch()`/content hook中更新snapshot，并提供只读`getInspectionSnapshot({ workspaceId,parentSessionId,sessionId })`，只有turn identity匹配时返回live数据。加入独立view wake handler和按owner合并的timer；在starting/running/activity/terminal/delete节点发wake，并在`beginShutdown()`、`dispose()`、`forceDispose()`清理timer。扩展`test/main/services/session/spawn/spawned-session-manager.spec.ts`覆盖live snapshot、wake合并/丢失无影响、terminal后回落durable、父删除、process invalidation、APP_SHUTDOWN及不改变1/4/8和watchdog。
- [x] 4.3 新增`src/main/services/session/spawn/spawned-session-query-service.ts`，实现`listSpawnedSessions(owner)`与`getSpawnedSessionDetail(owner)`：先确保既有Workspace restart reconciliation完成，再以latest terminal turn优先于meta、叠加匹配live snapshot、用Agent catalog只读解析名称、从messages构造initial/current Prompt和structured messages，并统一投影starting/running/idle/error/expired/interrupted。新增`test/main/services/session/spawn/spawned-session-query-service.spec.ts`覆盖同步/background、多turn ordinal、partial error、legacy、APP_RESTARTED、agent卸载fallback、cross-parent not_found和不启动AgentProcess。
- [x] 4.4 在query/notification集成测试中固定边界：list/detail/open只读路径不得调用`claimSpawnNotification`、`dispatchSpawnNotification`或修改pending/dispatched/delivered；既有`spawnNotificationService.reconcileWorkspace()`仍只按当前规范创建APP_RESTARTED terminal/pending并把dispatched转delivery_unknown，且不得因inspection重投。扩展`test/main/services/session/spawn/spawn-notification-service.spec.ts`覆盖该回归。

## 5. 接入Main IPC、Workspace定向wake与preload API

- [x] 5.1 新增`src/main/ipc/session/spawned-session.ts#registerSpawnedSessionHandlers`，对list/detail使用shared schema、`wrapHandler`和`requireWorkspaceSender`，再调用Chat Session owner校验及query service；在`src/main/ipc/session/index.ts`注册。新增`test/main/ipc/session/spawned-session.spec.ts`覆盖合法owner、伪造Workspace sender、跨父Session、父Session已删除、strict额外字段和统一not_found。
- [x] 5.2 在`src/main/ipc/session/spawned-session.ts`或同area composition root新增`setupSpawnedSessionViewBroadcast(manager)`，把manager view wake通过`WorkspaceWindowManager.sendToWorkspace()`发送到独立channel，并在`src/main/bootstrap/runtime.ts`接入；保持`setupSpawnNotificationBroadcast()`不变。扩展`test/main/bootstrap/workspace-window-manager.spec.ts`与IPC测试覆盖只发匹配Workspace、多窗口隔离、无窗口可丢失和view/notification wake使用不同channel。
- [x] 5.3 新增`src/preload/api/session/spawned-session.ts`并在`src/preload/index.ts`和`src/preload/index.d.ts`暴露`window.api.session.spawnedSession`的list/getDetail/onWake；listener teardown必须幂等。新增`test/preload/api/session/spawned-session.spec.ts`覆盖channel、payload、listener清理、并发调用和不暴露路径；新增`src/renderer/src/api/session/spawned-session.ts`typed wrapper并补对应renderer API测试。

## 6. 建立Renderer owner-scoped store与bootstrap恢复

- [x] 6.1 新增`src/renderer/src/stores/session/spawned-session.ts#useSpawnedSessionStore`，按`workspaceId\0parentSessionId`缓存list、按完整三元owner key缓存detail，合并同key in-flight Promise，并用request generation拒绝Workspace/父Session切换后的迟到结果。实现`loadParentSessions`、`loadDetail`、`handleWake`、`resetWorkspace`和`activeBackgroundForParent`；在`src/renderer/src/stores/session/index.ts`显式导出。新增`test/renderer/src/stores/session/spawned-session.spec.ts`覆盖active background筛选、sync/terminal排除、cross-parent隔离、请求合并、迟到response和not_found清理。
- [x] 6.2 新增`src/renderer/src/bootstrap/tasks/spawned-sessions.ts`，在Workspace critical bootstrap后注册独立view wake listener；wake只调用store re-fetch，不直接写status/content，重新注册时销毁旧listener。接入`src/renderer/src/bootstrap/register.ts`并新增`test/renderer/src/bootstrap/spawned-sessions.spec.ts`覆盖首次无预加载副作用、重复wake合并、listener重建、Workspace切换和renderer reload后的按需恢复；不得修改现有`spawn-notifications.ts`的父Agent drain职责。

## 7. 扩展Signal host context与spawn.session行内入口

- [x] 7.1 在`src/renderer/src/features/fyllo-signal/`新增最小只读host context contract/provider，由`src/renderer/src/components/chat/message/AssistantMessage.vue`把消息所属`workspaceId/sessionId`传给`MarkStream.vue`，再由`FylloSignalNode.vue`提供给type component；缺少context时不得回退active Session。更新`test/renderer/src/components/fyllo-action-markstream.spec.ts`、`test/renderer/src/components/shared/ui-message-list.spec.ts`和Fyllo Signal node测试，覆盖历史消息owner、无Action context仍启用Signal、非Chat host保持literal及show.time不依赖context。
- [x] 7.2 在`src/renderer/src/features/fyllo-signal/ui/signals/SpawnSessionSignal.vue`注册`spawn.session`，只从`@renderer/features/spawned-session-inspector`根入口使用稳定inline组件；更新renderer registry与根入口，不增加Action registration、ordinal或EventRail integration。新增Signal组件测试覆盖loading、六种状态、query error/not_found、重复挂载共享query、点击与键盘打开、关闭焦点恢复，以及payload agent/status字段无法进入ready分支。

## 8. 实现spawned-session-inspector feature与Slideover

- [x] 8.1 新增`src/renderer/src/features/spawned-session-inspector/README.md`、`index.ts`、`model/projection.ts`和`application/use-spawned-session-inspector.ts`；model实现状态label/icon/color、active background predicate，以及structured messages到`AssistantActivityEntry[]`与仅text Transcript的纯投影，application通过`@renderer/stores`根入口协调detail loading/open/close。新增`test/renderer/src/features/spawned-session-inspector/model/projection.spec.ts`和application测试，覆盖part顺序、普通Markdown斜体保留、多turn、空parts和无跨feature深路径依赖。
- [x] 8.2 新增`ui/SpawnedSessionInlineEntry.vue`与`ui/SpawnedSessionDetailSlideover.vue`。Slideover复用`SubagentCallSlideover.vue`的`USlideover`宽度/header/focus模式，显示可信状态、Agent、时间、error、原始Prompt、默认折叠Activity、只含assistant text parts且关闭Actions/Signals的MarkStream Transcript和opaque responseId；Activity必须复用`ChatActivityGroup.vue`。新增组件测试覆盖running实时更新、terminal、partial error、interrupted/expired、loading/error/not_found、无Prompt/Activity/Transcript、键盘/focus、窄宽度和不使用隐藏`em`的CSS。

## 9. 增加当前父Chat的background活动入口

- [x] 9.1 新增`src/renderer/src/features/spawned-session-inspector/ui/SpawnedSessionBackgroundEntry.vue`，使用Nuxt UI popover和语义token展示“正在运行 N 个后台任务”、spinner、Agent、Prompt摘要、状态文字与开始时间，每项打开同一Slideover；0个、draft Chat、非当前父Session、sync和terminal记录不显示。新增组件测试覆盖计数、popover列表、状态不只靠颜色、键盘操作、点击详情、浅色/深色class和窄窗口布局。
- [x] 9.2 在`src/renderer/src/components/chat/prompt/ChatPromptPanel.vue` footer现有action/command/config区域附近装配background入口，传入当前active Session的`workspaceId/id`；切换Session时立即使用新scope。扩展Chat prompt组件测试覆盖同Workspace其他父Session不泄露、Signal漏发/重复不影响计数，以及入口不改变composer内容、chatStatus或用户turn优先仲裁。

## 10. 固定生命周期、隔离与既有契约回归

- [x] 10.1 增加跨层恢复测试：renderer reload/窗口关闭重开从首次query恢复，重复wake不重复记录，多窗口只处理匹配Workspace，父Session删除让list移除/detail not_found，APP_RESTARTED显示interrupted，AgentProcess generation变化显示expired。覆盖`test/main/services/session/spawn/**`、`test/main/bootstrap/workspace-window-manager.spec.ts`、`test/renderer/src/stores/session/spawned-session.spec.ts`和feature组件测试。
- [x] 10.2 扩展现有`test/renderer/src/stores/session/chat.spec.ts`和`test/renderer/src/bootstrap/spawn-notifications.spec.ts`，证明inspection list/detail/Signal/Slideover不claim completion notification、不触发父Agent prompt、不进入`requestSpawnNotificationDrain`，并保持普通用户turn优先、非active父Session reminder和at-most-once语义。
- [x] 10.3 保留并运行`test/shared/types/fyllo-spawn-rpc.spec.ts`与`test/main/services/session/spawn/spawned-session-manager.spec.ts`回归，断言HTTP-only四tools、`responseId + read_response`、空spawned reminder/MCP、`allow_once`、1/4/8容量、10分钟inactivity、5秒cancel grace、process pool复用、parent delete和shutdown顺序未改变。

## 11. 同步guidelines并执行质量门禁

- [x] 11.1 更新`guidelines/MainProcess.md`，记录`session:spawned-session`只读IPC、durable+live query、MessageAssembler snapshot、独立view wake、notification outbox隔离及view coalescing timer仍归现有spawned-session shutdown owner；更新`guidelines/RendererProcess.md`，记录spawned-session domain store、owner-keyed generation、独立bootstrap wake和composer当前父Session作用域。无需修改`RendererFeatures.md`，新feature遵循其现有准入、分层和公共入口规则。
- [x] 11.2 Apply worktree首次运行项目命令前执行`sh scripts/prepare-worktree-env.sh`。开发过程中分别运行受影响的main project聚焦测试和renderer project聚焦测试，至少覆盖本清单新增/修改的shared、MCP、storage、manager、query、IPC、preload、store、bootstrap、Signal、Slideover与composer测试文件；普通断言失败不得归因于沙箱，只有明确网络限制时才按权限流程在沙箱外重跑并保留两次结果。
- [x] 11.3 完成实现后运行`pnpm test`、`pnpm test:coverage`、`pnpm typecheck`、`pnpm lint`和`git diff --check`；冷启动`pnpm lint`预留约5分钟。仅在确有格式差异时运行格式化。该变更不修改构建配置，未经用户针对Apply阶段明确授权 SHALL NOT运行`pnpm build`。
