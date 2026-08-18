## MODIFIED Requirements

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
