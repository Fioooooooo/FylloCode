# mcp-workspace-authorization Specification

## Purpose

定义 bundled MCP activation 的 Workspace v2 授权边界：Main 投影不可变 Folder allowlist，以可撤销 capability 隔离 HTTP 请求，并让 HTTP/stdio tool、worktree 校验与 MCP event identity 统一遵循当前 descriptor。

## Requirements

### Requirement: MCP activation 使用不可变 Workspace v2 descriptor

Main SHALL 为每次 bundled MCP activation 构造 `version: 2` 的 `McpWorkspaceDescriptorV2`，包含 `workspaceId`、`workspaceKind`、`primaryFolderId`、有序且非空的 `{ folderId, folderName, folderPath }[]`、`workspaceDataDir` 与可选的 `mcpEventDir/sessionId`。Folder ID SHALL 唯一，primary SHALL 恰好出现一次，Folder paths SHALL 为该 activation 的 canonical 授权快照；descriptor 建立后 SHALL NOT 因 Workspace registry 变化而被原地改写。

#### Scenario: Chat descriptor 保留完整授权顺序

- **WHEN** 已验证的 Collection Session snapshot 按顺序授权 primary A、secondary B 与 secondary C
- **THEN** Main SHALL 生成 folders 顺序为 A、B、C 的 Workspace v2 descriptor
- **AND** primaryFolderId SHALL 为 A
- **AND** descriptor 的 data/event 目录 SHALL 由 workspaceId 的 storage helpers 投影

#### Scenario: Descriptor invariant 无效

- **WHEN** 待签发 descriptor 没有 Folder、包含重复 folderId、primary 缺失或出现多次，或 folderPath 不是 canonical absolute path
- **THEN** Main SHALL 拒绝 MCP activation
- **AND** SHALL NOT 签发 token或启动 stdio MCP child

#### Scenario: Workspace 编辑不热修改 descriptor

- **WHEN** activation 建立后当前 Workspace 新增成员、改变 primary 或重命名 Folder
- **THEN** 既有 descriptor SHALL 保持原快照不变
- **AND** 新 Workspace 定义 SHALL 只影响后续 activation

### Requirement: HTTP capability grant 绑定 activation 主体与 server scope

Main SHALL 为每次 draft probe、`newSession`、`resumeSession`、`loadSession` 或 fresh fallback 的 HTTP MCP activation 签发独立、不可猜测的 opaque bearer token。production默认签发的 grant SHALL 将 `expiresAt` 固定为`2099-12-31T23:59:59.999Z`，使已绑定 activation在正常应用生命周期内不因固定小时级TTL失效；内存registry SHALL只保存token hash，并将其绑定到唯一`activationId`、可选Fyllo/ACP Session identity、`workspaceId`、允许的bundled server names、不可变descriptor、`issuedAt`与`expiresAt`。明文token SHALL NOT被持久化、记录日志、返回renderer或写入MCP tool output。实现 SHALL保留基于`expiresAt`的授权拒绝与惰性移除机制，并 MAY通过显式测试依赖签发更短有效期的grant，但production调用方 SHALL NOT覆盖固定远期日期。

#### Scenario: 两个 Session 获得不同 capability

- **WHEN** 同一应用运行中的两个 ACP Session 使用相同 bundled server 与相同 Workspace
- **THEN** Main SHALL 为两个 activation 签发不同 token
- **AND** 每个 token SHALL 只解析到自身 registry grant

#### Scenario: Token 只能访问 allowlist server

- **WHEN** 有效 token 请求不在 `allowedServerNames` 内的 bundled server
- **THEN** Main proxy SHALL 拒绝请求
- **AND** SHALL NOT 将请求转发给任何 backend

#### Scenario: Production grant 使用固定远期日期

- **WHEN** Main 为正常 draft probe、`newSession`、`resumeSession`、`loadSession` 或 fresh fallback 创建 HTTP MCP activation
- **THEN** grant的`expiresAt` SHALL等于`2099-12-31T23:59:59.999Z`
- **AND** 同一activation在签发一小时后仍 SHALL通过token与server allowlist校验

#### Scenario: 显式短期 grant 过期

- **WHEN** 测试或内部受控调用显式签发短期grant且请求时刻已超过其`expiresAt`
- **THEN** registry SHALL将其视为无效并移除grant
- **AND** proxy SHALL NOT注入或暴露该grant的descriptor

### Requirement: Grant 随 ACP activation 生命周期撤销与重签

系统 SHALL 让grant覆盖其绑定ACP activation的多轮prompt与多次MCP请求。正常`done`、terminal `error`、由stream finalise触发的MessagePort自关闭以及ACP `session/cancel` SHALL只结束当前prompt turn，SHALL NOT关闭ACP Session、调用`forgetActiveAcpSession()`或撤销已绑定grant。系统 SHALL在`session/close`、activation替换、probe丢弃、Agent process invalidation、bundled MCP host停止或应用退出时立即幂等撤销grant。`resumeSession`、`loadSession`与fresh recovery SHALL只在既有activation因上述真实生命周期边界不再active时签发新token，SHALL NOT因普通turn终态重签；有效direct prompt与probe-to-chat promotion SHALL复用其当前绑定grant，不签发未被Agent使用的额外token。

#### Scenario: Probe 提升复用 grant

- **WHEN** ready probe 的 ACP Session 被匹配的 Chat Session consume
- **THEN** probe 的 activation grant SHALL 转移给同一个 ACP Session
- **AND** Main SHALL NOT 因 promotion 签发第二个 token

#### Scenario: 连续多轮复用 active grant

- **WHEN** 一个prompt以done或terminal error结束且对应Agent process、ACP Session与MCP activation仍active
- **THEN** stream终态关闭 SHALL NOT触发runner cancel或撤销grant
- **AND** 下一轮direct prompt SHALL复用同一个activation与token

#### Scenario: Prompt turn 被取消

- **WHEN** renderer在prompt完成前停止stream并使Main发送ACP `session/cancel`
- **THEN** Agent SHALL取消当前prompt turn
- **AND** Main SHALL保留该ACP Session的active标记与已绑定MCP grant
- **AND** 下一轮prompt SHALL NOT仅因上轮取消进入cold recovery或重签token

#### Scenario: 未绑定 activation 在取消时清理

- **WHEN** prompt在`newSession`、`resumeSession`或`loadSession`完成并绑定MCP activation之前被取消
- **THEN** 本次未绑定grant SHALL被立即幂等撤销
- **AND** 系统 SHALL NOT把从未完成的activation标记为active

#### Scenario: Cold recovery 重签 token

- **WHEN** persisted ACP Session因应用或Agent process重启、真实Session关闭、activation替换或host生命周期切换而没有active grant
- **THEN** 系统 SHALL NOT直接发送prompt
- **AND** SHALL通过resume/load/fresh recovery创建新的activation并签发新token

#### Scenario: Session 关闭或替换

- **WHEN** 系统调用`session/close`、fresh fallback以新ACP Session替换旧Session，或Agent process被invalidate
- **THEN** 旧activation grant SHALL立即失效
- **AND** 使用旧token的后续请求 SHALL被拒绝

#### Scenario: Host 重启

- **WHEN** bundled MCP host 停止后重新启动
- **THEN** registry 中此前签发的全部 HTTP grants SHALL 失效
- **AND** 新 activation SHALL 使用新的 capability 与内部 backend token

### Requirement: Shared MCP resolver 只解析 descriptor allowlist

Bundled MCP shared runtime SHALL 提供 `resolveWorkspace()`、`resolveFolder(folderId)`、`resolvePrimaryFolder()` 与 `validateWorktree(folderId, worktreePath)` 作为统一作用域入口。resolver SHALL 只读取当前不可变 descriptor，不得查询 Workspace registry 扩大 Folder 集合，不得接受 caller 提交的任意 owner absolute path，也不得回退到 `process.cwd()` 或 legacy Project env。

#### Scenario: 解析授权 Folder

- **WHEN** tool 以 descriptor 中的 folderId 请求 Folder
- **THEN** resolver SHALL 返回该 entry 的 snapshot folderPath
- **AND** SHALL NOT 用 registry 当前 path替换 snapshot path

#### Scenario: 拒绝非成员 Folder

- **WHEN** tool 请求的 folderId 不在 descriptor folders 中
- **THEN** resolver SHALL 返回明确的 unauthorized Folder error
- **AND** SHALL NOT 尝试从全局 Folder registry 查找该 ID

#### Scenario: 校验 registered worktree

- **WHEN** tool 提供 folderId 与 worktreePath
- **THEN** resolver SHALL 仅接受等于该 Folder snapshot root或属于该 repository 当前 registered worktree 的 canonical path
- **AND** SHALL 拒绝未注册路径、其他 Folder worktree、symlink/relative 逃逸和字符串前缀伪造

#### Scenario: Multi-root 调用缺少必要 owner

- **WHEN** repository-scoped MCP operation 需要 Folder root但 descriptor 包含多个 Folder且调用未能提供唯一 folderId
- **THEN** tool SHALL 返回明确的 owner-required error
- **AND** SHALL NOT 静默选择 primary或第一个 Folder

### Requirement: stdio activation 使用 Workspace JSON 与独立 child

对于 stdio fallback，系统 SHALL 为每次 MCP activation 提供只含同一 `McpWorkspaceDescriptorV2` 的 `FYLLO_WORKSPACE_JSON` 启动配置，并 SHALL 要求 Agent runtime 为该 activation 创建独立 bundled MCP child且不跨 activation 复用。stdio child SHALL 在启动时严格解析并冻结 descriptor；tool 调用仍 SHALL 受 shared resolver allowlist 约束。

#### Scenario: stdio child 启动

- **WHEN** Agent 不支持 HTTP MCP或目标 HTTP backend 不可用
- **THEN** ACP MCP spec SHALL 包含 `FYLLO_WORKSPACE_JSON`
- **AND** SHALL NOT 包含 `FYLLO_PROJECT_PATH`、`FYLLO_PROJECT_DATA_DIR`、`FYLLO_MCP_EVENT_DIR` 或 `FYLLO_SESSION_ID`

#### Scenario: stdio descriptor 无效

- **WHEN** `FYLLO_WORKSPACE_JSON` 缺失、JSON 无效或不符合 Workspace v2 schema
- **THEN** bundled MCP child SHALL 拒绝开始处理 tools
- **AND** SHALL NOT 回退 `cwd` 或 legacy env 构造单根 context

#### Scenario: Agent runtime 无法隔离 stdio child

- **WHEN** Agent runtime 不能保证一个 stdio child只服务单一 activation
- **THEN** 系统 SHALL NOT 为该 Agent 的 multi-root activation启用 stdio bundled MCP
- **AND** SHALL 返回明确的 transport capability error

### Requirement: MCP events 携带 Workspace 与 Folder identity

新写入的 bundled MCP proposal event SHALL 携带 `workspaceId`、`sessionId`、`proposalRef { folderId, changeId }`、`worktreeMode` 与 `worktreePath`；session-scoped plan event SHALL 携带 `workspaceId`、`sessionId` 与 `planSlug`，并 SHALL NOT 要求或推断 repository `folderId`。两类事件 SHALL 写入 descriptor 的 Workspace-owned event directory。Main consumer SHALL 验证 event Workspace；对于 proposal event 还 SHALL 验证 Folder owner 和 proposal target，不得从 path、primary Folder 或 event directory 反推 owner；对于 plan event SHALL 按 Workspace 与 Session 关联 lineage，不得执行 repository owner 解析。

#### Scenario: 写入有唯一 owner 的 proposal event

- **WHEN** `create-proposal` 在授权 Folder target 成功创建新 proposal
- **THEN** event SHALL 包含当前 descriptor 的 `workspaceId`、`sessionId` 和完整 `ResolvedProposalTarget`
- **AND** consumer SHALL 保留 `ProposalRef` 用于 lineage 与后续 owner routing

#### Scenario: 重复 proposal 不写 event

- **WHEN** `create-proposal` 发现 `ProposalRef` 已存在并返回 `PROPOSAL_ALREADY_EXISTS`
- **THEN** 系统 SHALL NOT 写新的 created event
- **AND** SHALL NOT 覆盖既有 origin

#### Scenario: Event workspace 或 proposal owner 不匹配

- **WHEN** consumer 读到 `workspaceId` 不匹配、`folderId` 不属于该 Workspace，或 `worktreePath` 不属于 owner repository 的 proposal event
- **THEN** consumer SHALL 拒绝消费该 event
- **AND** SHALL NOT 将其关联到当前 Workspace 的 Session 或 lineage

#### Scenario: Proposal owner 无法唯一确定

- **WHEN** repository-scoped operation 需要 owner，但 multi-root descriptor 与 tool input 无法确定唯一 `folderId`
- **THEN** operation SHALL 在写 proposal event 前失败
- **AND** SHALL NOT 通过 primary 或 repository path 猜测 owner

#### Scenario: Multi-root Session 创建 Plan event

- **WHEN** `create-plan` 在含多个 Folder 的 descriptor 中仅收到合法的 `goal` 与 `slug`
- **THEN** 系统 SHALL 在当前 `workspaceDataDir` 与 `sessionId` 对应的 Plan 目录创建文档并返回可读写的 `state.planPath`
- **AND** plan event SHALL 包含当前 `workspaceId`、`sessionId` 与完整日期前缀 `planSlug`
- **AND** tool 与 consumer SHALL NOT 要求、选择或推断 `folderId`

#### Scenario: Plan event 关联 Workspace Session lineage

- **WHEN** consumer 在 Workspace event directory 读到 `workspaceId` 匹配的 plan event
- **THEN** consumer SHALL 使用 `sessionId` 与 `planSlug` 记录当前 Workspace subject 的 Plan link
- **AND** SHALL NOT 查询 Folder membership 或 repository worktree
- **AND** event 含有旧版本额外 `folderId` 时 SHALL 忽略该字段而不改变关联结果

#### Scenario: Plan 文件作用域隔离与冲突

- **WHEN** 不同 Workspace 或不同 Session 使用相同合法 slug 创建 Plan
- **THEN** 系统 SHALL 将文档写入各自 Workspace/Session 目录且路径互不冲突
- **AND** 同一 Workspace/Session 在同一天重复使用相同 slug 时 SHALL 返回结构化冲突错误并保留已有文件

#### Scenario: Plan 输入或写入失败

- **WHEN** `create-plan` 收到非法 slug，或 Plan 目录/文件无法创建
- **THEN** tool SHALL 返回包含明确类型、消息和可用底层错误码的结构化 error state
- **AND** SHALL NOT 返回不存在或未完整写入的 `state.planPath`

### Requirement: Cortex separates Workspace data from repository evidence scope

Bundled `fyllo-cortex` SHALL use the immutable Workspace descriptor's `workspaceDataDir` for knowledge and Workspace subject data. Guidelines, file/package evidence, Git history, proposal trace, and commit trace SHALL first select an authorized `folderId`; optional worktree input SHALL pass the shared registered-worktree validator. Cortex SHALL NOT derive Workspace storage from a repository path or infer a repository owner from primary in a multi-root descriptor.

#### Scenario: Workspace knowledge with multiple repository members

- **WHEN** a Cortex knowledge call runs with a multi-root descriptor
- **THEN** it SHALL read the descriptor Workspace's knowledge root without requiring one repository owner
- **AND** each repository anchor SHALL independently resolve its explicit `folderId`

#### Scenario: Repository operation uses unauthorized Folder

- **WHEN** a guidelines or lineage call names a Folder outside the descriptor allowlist
- **THEN** shared resolver SHALL reject the operation
- **AND** Cortex SHALL NOT query a global registry, process cwd, or legacy Project environment to expand scope

#### Scenario: Multi-root repository operation omits owner

- **WHEN** a Cortex operation requires repository state but the descriptor contains multiple Folders and no owner can be proven from input
- **THEN** the operation SHALL return an owner-required error
- **AND** Workspace-owned knowledge state SHALL remain available to independent knowledge operations
