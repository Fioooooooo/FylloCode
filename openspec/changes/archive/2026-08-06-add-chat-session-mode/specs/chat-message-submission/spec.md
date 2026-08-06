## ADDED Requirements

### Requirement: 首次提交固定并校验 draft 会话模式

草稿 prompt首次提交时，Renderer SHALL在开始提交前捕获当前 `sessionMode`，并 SHALL使用该快照创建唯一真实 Session、选择可提升 probe和执行全部 scope校验。Session创建、附件物化、首条 Message durable append或激活完成前模式发生变化时，旧提交 SHALL失效并沿用现有未提交 Session清理语义；迟到结果 SHALL NOT覆盖当前 draft。

#### Scenario: 首发持久化当前模式

- **WHEN** 用户以非空 text在 `native` draft提交首条消息
- **THEN** createSession请求 SHALL携带 `native`
- **AND** 返回的 Session SHALL持久化并投影 `native`

#### Scenario: Carry probe 模式匹配

- **WHEN** 首发前存在与当前 Workspace、Agent和 mode匹配的 ready probe
- **THEN** Renderer SHALL只携带该 probe的 ACP session与配置创建 Session
- **AND** Main SHALL在 promotion时再次验证 mode

#### Scenario: 提交期间模式变化

- **WHEN** Session创建、附件保存或首条 Message durable append期间 `draftSessionMode`变化
- **THEN** 旧提交 SHALL被视为 scope changed
- **AND** 已创建的未提交 Session及其 attachment copies SHALL被删除
- **AND** 用户输入和本地附件草稿 SHALL保留以供新模式重试

#### Scenario: 迟到 probe 使用旧模式

- **WHEN** 旧模式 probe update在用户已切换到新模式后到达 Renderer
- **THEN** Renderer SHALL忽略该 update
- **AND** SHALL NOT把旧 probe用于新模式首次提交
