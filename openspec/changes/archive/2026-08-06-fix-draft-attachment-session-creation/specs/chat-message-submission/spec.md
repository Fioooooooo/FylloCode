## ADDED Requirements

### Requirement: 每次用户消息必须包含非空 text

Renderer SHALL 仅允许提交至少包含一个 trim 后非空、且不是 system reminder 的 `text` part 的用户消息。图片、文件、附件名称、附件摘要、system reminder 或其他非 text prompt part SHALL NOT 替代用户 text。提交按钮状态、组件提交 handler 与 Chat store 提交入口 SHALL 执行一致的拒绝规则。

#### Scenario: text 与附件一起发送

- **WHEN** 用户输入 trim 后非空的 text，并选择零个或多个当前 Agent 支持的附件
- **THEN** Renderer SHALL 允许提交消息
- **AND** 附件 SHALL 作为该 text 消息的可选附加 parts 发送

#### Scenario: 仅附件消息

- **WHEN** 用户未输入 text 或 text trim 后为空，但已选择一个或多个附件
- **THEN** Renderer SHALL 禁用提交操作
- **AND** 组件 handler 与 Chat store SHALL 在任何 Session 创建、消息持久化或 ACP prompt 前拒绝提交

#### Scenario: system reminder 不能替代用户 text

- **WHEN** prompt parts 只包含 system reminder text 和附件，不包含 trim 后非空的用户 text
- **THEN** Chat store SHALL 拒绝提交

#### Scenario: 非组件调用绕过按钮状态

- **WHEN** 任务联动或其他 renderer 调用方直接请求发送不含非空用户 text 的 prompt parts
- **THEN** Chat store SHALL 拒绝请求
- **AND** SHALL NOT 创建 Session、追加 Message 或启动 stream

### Requirement: 草稿附件选择不创建 Session

没有 active Session 时，Renderer SHALL 把用户选择的图片或文件保留为当前 prompt 的本地草稿和预览，SHALL NOT 因附件选择而创建、持久化、展示或激活 Session，亦 SHALL NOT 在真实 Session 创建前调用 Session-scoped attachment 保存接口。

#### Scenario: ready probe 后一次选择多个文件

- **WHEN** draft probe 已 ready、active Session 为空，且用户一次选择 X 个图片或文件
- **THEN** 左侧 Session 列表和 active Session SHALL 保持不变
- **AND** Renderer SHALL NOT 发起任何 `createSession` 或 `saveAttachment` 请求
- **AND** X 个本地附件 SHALL 按选择顺序出现在 prompt 预览中

#### Scenario: 草稿态分两次选择附件

- **WHEN** 用户在同一草稿 prompt 中先选择一个文件，随后再次选择一个或多个文件
- **THEN** 全部附件 SHALL 继续属于同一个未提交 prompt
- **AND** 每次选择都 SHALL NOT 创建或激活 Session

#### Scenario: 删除草稿附件

- **WHEN** 用户在提交前移除一个附件或离开当前 prompt
- **THEN** Renderer SHALL 释放该附件的本地预览资源
- **AND** Main SHALL 不存在需要清理的 Session attachment copy

### Requirement: 首次提交按唯一 Session 顺序物化附件

草稿 prompt 首次提交时，Renderer SHALL 先从非空用户 text 生成标题并创建唯一真实 Session，再把该 prompt 的所有附件持久化到创建结果返回的同一 `workspaceId/sessionId`。全部附件成功后，Renderer SHALL 先持久化首条 user message，再把 Session 加入列表并设为 active，最后启动 ACP prompt。首次提交 SHALL NOT 使用 renderer 的可变 active Session 状态重新决定附件 owner。

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

### Requirement: 已有 Session 的附件保持当前归属

存在 active Session 时，Renderer SHALL 把新选择的附件保存到该 Session 的 attachment directory，并在后续消息中只提交该 Session 返回的 opaque handles。选择一个或多个附件 SHALL NOT 创建其他 Session或改变 active Session。

#### Scenario: 已有 Session 选择多个附件

- **WHEN** 用户在已有 active Session 中一次选择多个受支持文件
- **THEN** 所有 `saveAttachment` 请求 SHALL 使用该 active Session 的固定 `workspaceId/sessionId`
- **AND** Session 列表 SHALL 不增加新条目

#### Scenario: 已有 Session 分次选择附件

- **WHEN** 用户在已有 active Session 中先后多次选择附件并发送一条非空 text 消息
- **THEN** 所有 attachment handles SHALL 可由该 active Session 解析
- **AND** ACP prompt SHALL NOT 返回跨 Session attachment 错误

### Requirement: 首次提交失败不留下空 Session

首次提交在新 Session 创建、附件保存或首条 Message durable append 阶段失败时，Renderer SHALL 保持草稿态和用户输入，SHALL NOT 消费 ready probe，并 SHALL 删除本次创建的 Session及其已写入附件。迟到的异步结果或 Workspace/Agent/Session scope 变化 SHALL NOT 激活已取消的 Session。

#### Scenario: Session 创建失败

- **WHEN** 首次提交的 Session 创建请求失败
- **THEN** Session 列表与 active Session SHALL 保持不变
- **AND** text、附件预览与 ready probe SHALL 保留以供重试

#### Scenario: 部分附件保存后失败

- **WHEN** 同批附件中部分已保存，但后续附件保存失败
- **THEN** 系统 SHALL 删除刚创建的 Session及其全部 attachment copies
- **AND** Renderer SHALL 保留原始 text 和本地附件草稿
- **AND** 重试 SHALL 创建新的唯一 Session并重新上传全部附件

#### Scenario: 首条 Message 持久化失败

- **WHEN** 所有附件保存成功，但首条 user message durable append 失败
- **THEN** 系统 SHALL 删除刚创建的 Session及其 attachment copies
- **AND** SHALL NOT 启动 ACP prompt或清除 ready probe

#### Scenario: 提交期间 scope 变化

- **WHEN** 首次提交进行中用户切换 Workspace、Agent 或 active Session，或新的 draft run 取代旧 run
- **THEN** 旧提交的迟到结果 SHALL 被丢弃
- **AND** 旧提交创建的未提交 Session SHALL 被清理，SHALL NOT 覆盖当前 renderer 状态
