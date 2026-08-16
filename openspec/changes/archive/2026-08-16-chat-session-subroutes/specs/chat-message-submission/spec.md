## MODIFIED Requirements

### Requirement: 首次提交按唯一 Session 顺序物化附件

草稿 prompt 首次提交时，Renderer SHALL 先从非空用户 text 生成标题并创建唯一真实 Session，再把该 prompt 的所有附件持久化到创建结果返回的同一 `workspaceId/sessionId`。全部附件成功后，Renderer SHALL 先持久化首条 user message，再把 Session 加入列表并设为 active，最后启动 ACP prompt。首次提交 SHALL NOT 使用 renderer 的可变 active Session 状态重新决定附件 owner。首条消息 durable append 成功后，Renderer SHALL 将当前 URL 切换到新建会话的 `/chat/:sessionId` 子路由。

Session fallback title SHALL 优先提取用户 text 中的 `**标题**:` 行；不存在结构化标题时 SHALL trim text、把连续空白归一化为单个空格，并截取前 30 个 Unicode code point。

#### Scenario: ready probe 首发携带多个附件

- **WHEN** ready probe 后用户以非空 text 和多个附件提交首条消息
- **THEN** Renderer SHALL 只创建一个 Fyllo Session，并携带该 probe 的 `fylloSessionId`、`acpSessionId`、config options 与 available commands
- **AND** 每个附件 SHALL 在该创建请求成功后保存到返回的同一 Session ID
- **AND** 首条持久化 Message SHALL 按选择顺序保存所有 attachment handles
- **AND** ACP prompt SHALL 复用该 ready probe 的 ACP Session

#### Scenario: 首条消息生成 fallback title

- **WHEN** 用户以 `  hello\n\nworld   example  ` 作为首条 text 提交草稿
- **THEN** 新 Session 的初始标题 SHALL 为 `hello world example`
- **AND** 附件存在与否 SHALL NOT 使标题回退为 `New Session`

#### Scenario: 首条消息使用结构化标题

- **WHEN** 首条用户 text 包含 `**标题**: 修复附件会话竞态`
- **THEN** 新 Session 的初始标题 SHALL 优先使用 `修复附件会话竞态`
- **AND** 超过 30 个 Unicode code point 时 SHALL 截取前 30 个

#### Scenario: 无 ready probe 的正常首发

- **WHEN** 草稿没有可复用的 ready probe，但用户以非空 text 和附件提交首条消息
- **THEN** Renderer SHALL 创建一个普通 Session
- **AND** SHALL 在该真实 Session 创建成功后按相同顺序持久化附件、消息并启动 ACP prompt

#### Scenario: 持久化完成前 Session 不可见

- **WHEN** Main 已返回新 Session，但一个或多个附件保存或首条 Message durable append 尚未完成
- **THEN** Renderer SHALL NOT 把该 Session 加入左侧列表或设为 active
- **AND** SHALL 禁止同一 prompt 重复提交

#### Scenario: 首发成功后更新会话路由

- **WHEN** 草稿态首条消息创建的新 Session 已完成首条 user message durable append
- **THEN** Renderer SHALL 使用 replace 方式将当前 URL 切换到该 Session 的 `/chat/:sessionId`
- **AND** 浏览器历史栈 SHALL NOT 保留已消费的草稿态 `/chat` 入口
- **AND** 后续 streaming 与消息加载 SHALL 继续围绕该 Session 执行
