## ADDED Requirements

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

Main SHALL 为每次 draft probe、`newSession`、`resumeSession`、`loadSession` 或 fresh fallback 的 HTTP MCP activation 签发独立、不可猜测、短期有效的 opaque bearer token。内存 registry SHALL 只保存 token hash，并将其绑定到唯一 `activationId`、可选 Fyllo/ACP Session identity、`workspaceId`、允许的 bundled server names、不可变 descriptor、`issuedAt` 与 `expiresAt`；明文 token SHALL NOT 被持久化、记录日志、返回 renderer或写入 MCP tool output。

#### Scenario: 两个 Session 获得不同 capability

- **WHEN** 同一应用运行中的两个 ACP Session 使用相同 bundled server 与相同 Workspace
- **THEN** Main SHALL 为两个 activation 签发不同 token
- **AND** 每个 token SHALL 只解析到自身 registry grant

#### Scenario: Token 只能访问 allowlist server

- **WHEN** 有效 token 请求不在 `allowedServerNames` 内的 bundled server
- **THEN** Main proxy SHALL 拒绝请求
- **AND** SHALL NOT 将请求转发给任何 backend

#### Scenario: Token 过期

- **WHEN** 请求携带的 capability token 已超过 `expiresAt`
- **THEN** registry SHALL 将其视为无效并移除 grant
- **AND** proxy SHALL NOT 注入或暴露该 grant 的 descriptor

### Requirement: Grant 随 ACP activation 生命周期撤销与重签

系统 SHALL 让 grant 覆盖其绑定 ACP activation 的多次 MCP 请求，并 SHALL 在 activation 关闭、取消、替换、probe 丢弃、Agent process invalidation、bundled MCP host 停止或应用退出时立即幂等撤销。`resumeSession`、`loadSession` 与 fresh recovery SHALL 签发新 token，SHALL NOT 复用历史 token；有效的 direct prompt与 probe-to-chat promotion SHALL 复用其当前绑定且未过期的 grant，而不签发未被 Agent 使用的额外 token。

#### Scenario: Probe 提升复用 grant

- **WHEN** ready probe 的 ACP Session 被匹配的 Chat Session consume
- **THEN** probe 的 activation grant SHALL 转移给同一个 ACP Session
- **AND** Main SHALL NOT 因 promotion 签发第二个 token

#### Scenario: Cold recovery 重签 token

- **WHEN** persisted ACP Session 没有 active grant或其 grant 已过期
- **THEN** 系统 SHALL NOT 直接发送 prompt
- **AND** SHALL 通过 resume/load/fresh recovery 创建新的 activation并签发新 token

#### Scenario: Session 取消或替换

- **WHEN** activation 被取消、关闭或 fresh fallback 以新 ACP Session替换
- **THEN** 旧 activation grant SHALL 立即失效
- **AND** 使用旧 token 的后续请求 SHALL 被拒绝

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

新写入的 bundled MCP proposal/plan event SHALL 携带 `workspaceId` 与明确的 owner `folderId`，并 SHALL 使用 descriptor 的 Workspace-owned event directory。Main consumer SHALL 验证 event workspace与正在扫描的 Workspace 一致，并 SHALL 使用 folderId 作为 repository owner identity，不得从 `projectPath` 或 event directory反推 owner。

#### Scenario: 写入有唯一 owner 的 event

- **WHEN** bundled MCP operation 在可唯一确定 owner Folder 的 activation 中成功创建 proposal或 plan event
- **THEN** event SHALL 包含当前 descriptor 的 workspaceId与 owner folderId
- **AND** consumer SHALL 保留该 identity用于 lineage与后续 owner routing

#### Scenario: Event workspace 不匹配

- **WHEN** consumer 在 Workspace A 的 event directory读到声明 workspaceId 为 B 的 event
- **THEN** consumer SHALL 拒绝消费该 event
- **AND** SHALL NOT 将其关联到 Workspace A的 Session或 lineage

#### Scenario: Owner 无法唯一确定

- **WHEN** operation 需要 repository owner但当前 multi-root descriptor 与 tool input无法确定唯一 folderId
- **THEN** operation SHALL 在写 event前失败
- **AND** SHALL NOT 通过 primary或 repository path猜测 owner
