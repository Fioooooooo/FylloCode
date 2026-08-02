# acp-multi-root-session Specification

## Purpose

定义 ACP Chat Session 对 multi-root Workspace 的固定授权快照、全生命周期目录传递、Agent 能力兼容与 stale 校验，以及附件和成员文件资源的安全解析边界；本规范是相关 Session 行为的主要契约来源。

## Requirements

### Requirement: ACP lifecycle 使用固定的 Workspace 目录集合

系统 SHALL 为 draft probe、`newSession`、`resumeSession`、`loadSession` 与 fresh fallback 传递目标 `SessionWorkspaceSnapshot` 的 `cwd` 与 `additionalDirectories`。所有路径 SHALL 来自同一快照；系统 SHALL NOT 只在首次 newSession 传递附加目录，亦 SHALL NOT 在恢复时改用当前 Workspace resolver 的新目录集合。

#### Scenario: Multi-root draft probe

- **WHEN** 新 probe 的 snapshot 包含 primary 与两个 secondary Folder
- **THEN** probe `newSession` SHALL 以 primary path 为 `cwd`
- **AND** SHALL 按 snapshot Folder 顺序把两个 secondary paths 传为 `additionalDirectories`

#### Scenario: Resume 与 load 使用相同目录

- **WHEN** 已持久化 multi-root Session 进入 resume 或 load recovery
- **THEN** 每个 lifecycle request SHALL 使用持久化 snapshot 的相同 `cwd/additionalDirectories`
- **AND** SHALL NOT 根据当前 Workspace primary 或成员顺序重算

#### Scenario: Fresh fallback 不丢失附加目录

- **WHEN** resume/load 报 session missing 并进入 fresh newSession fallback
- **THEN** fresh request SHALL 继续使用目标 snapshot 的完整目录集合

### Requirement: Session 持久化完整 Workspace 授权快照

每个新 Chat Session SHALL 持久化 `SessionWorkspaceSnapshot`，包含 `workspaceId`、`workspaceKind`、`primaryFolderId`、按 Workspace 成员顺序排列的 `{ folderId, folderName, folderPath }[]`、`cwd` 与 `additionalDirectories`。`folders` SHALL 只包含创建 activation 时实际可用且授权给 Agent 的 Folder，并 SHALL 恰好包含 primary；`cwd` SHALL 等于 primary snapshot path，`additionalDirectories` SHALL 等于其余 Folder paths。

#### Scenario: Missing secondary 不进入新 snapshot

- **WHEN** 新建 Session 时 primary 可用但一个 secondary Folder missing
- **THEN** snapshot SHALL 排除该 missing Folder
- **AND** 可用 Folder 的 identity、名称和路径 SHALL 完整持久化

#### Scenario: Probe 提升为 Chat

- **WHEN** draft probe 已建立 ACP session，随后以匹配的 workspace/agent/ACP session ID 提升为 Chat
- **THEN** Session meta SHALL 持久化 probe 创建时的 snapshot
- **AND** SHALL NOT 在提升时从当前 Workspace 重新生成快照

#### Scenario: Workspace 编辑不热修改 Session

- **WHEN** Session 创建后 Workspace 增删成员、改变 primary 或修改 Folder 显示名称
- **THEN** 已持久化 snapshot SHALL 保持不变
- **AND** 变化 SHALL 只影响后续新 Session

#### Scenario: Legacy Folder Workspace Session

- **WHEN** 没有 workspace snapshot 的历史 Session 属于当前唯一 Folder 可用的 Folder Workspace
- **THEN** Main MAY 在首次恢复前生成并持久化等价单成员 snapshot
- **AND** SHALL 在 Agent activation 前完成回填

#### Scenario: Legacy Collection Session 无快照

- **WHEN** 没有 workspace snapshot 的历史 Session 属于 Collection Workspace
- **THEN** Main SHALL 拒绝猜测其历史授权成员
- **AND** SHALL 要求用户新建 Session

### Requirement: Session snapshot 先于 Agent activation 完成 stale 校验

Main SHALL 在 resume/load、fresh fallback、system reminder、结构化 member file resource 与任何依赖 Session 路径的操作前，逐个校验 snapshot Folder 仍属于当前 Workspace、当前 registry path 存在且等于 snapshotted `folderPath`。任一失败 SHALL 拒绝整个路径能力，不得静默裁剪 snapshot、替换路径或回退 primary。

#### Scenario: Snapshot member 被移出 Workspace

- **WHEN** snapshot 中的 `folderId` 不再属于当前 Workspace
- **THEN** 系统 SHALL 返回 `SESSION_FOLDER_REMOVED`
- **AND** 即使 Folder 仍存在于全局 registry 也 SHALL NOT 恢复或裁剪授权

#### Scenario: Snapshot path missing

- **WHEN** snapshot Folder 的相同 registry path 当前不存在
- **THEN** 系统 SHALL 返回 `SESSION_FOLDER_PATH_MISSING`
- **AND** SHALL NOT 启动 Agent 或发送部分 reminder

#### Scenario: Folder 已重定位

- **WHEN** 相同 `folderId` 的当前 registry path 与 snapshot `folderPath` 不同
- **THEN** 系统 SHALL 返回 `SESSION_FOLDER_RELOCATED`
- **AND** SHALL NOT 把旧 Session 静默切换到新路径

#### Scenario: 重新加入同一成员

- **WHEN** 曾移除的相同 `folderId` 重新加入 Workspace
- **THEN** membership 校验 SHALL 继续检查其 path missing/relocated 状态
- **AND** 只有全部 snapshot members 的 identity/path 校验通过时才可恢复

### Requirement: Workspace reminder 安全投影完整 Session 授权

Chat/probe system reminder SHALL 从已验证的 `SessionWorkspaceSnapshot` 投影 `<workspace>` block，完整包含 `workspaceId`、`workspaceKind`、`primaryFolderId` 与所有授权 Folder 的 `folderId/folderName/folderPath`。动态对象 SHALL 先 `JSON.stringify`，再编码 `<` 与 `>`；字段值 SHALL 被声明为数据而非指令。reminder projection 的 `folderName` SHALL 最多 120 个 Unicode code point（超过时保留前 119 个并追加 `…`），编码后 Workspace JSON SHALL 不超过 64 KiB。

#### Scenario: 恶意 Folder 名称

- **WHEN** snapshot `folderName` 或 path 含引号、反斜杠、换行或 `</workspace>`
- **THEN** reminder Workspace payload SHALL 保持合法 JSON
- **AND** 动态值 SHALL NOT 闭合或改变外层 reminder contract

#### Scenario: 超长 Folder 名称

- **WHEN** snapshot `folderName` 超过 120 个 Unicode code point
- **THEN** reminder 中 SHALL 使用 119 个 code point 加 `…`
- **AND** 持久化 snapshot 的完整名称 SHALL 保持不变

#### Scenario: Reminder JSON 超限

- **WHEN** 安全编码后的 Workspace JSON 超过 64 KiB
- **THEN** Agent activation SHALL 以 `WORKSPACE_REMINDER_TOO_LARGE` 失败
- **AND** SHALL NOT 截断路径、省略成员或发送部分授权列表

#### Scenario: Stale snapshot 不生成 reminder

- **WHEN** Session snapshot membership/path 校验失败
- **THEN** Main SHALL 在 reminder 注入前返回对应 stale error
- **AND** Agent SHALL NOT 收到从 current registry 修补的 Workspace block

### Requirement: Session attachment copy 使用不透明作用域 handle

用户上传的 attachment SHALL 作为独立副本写入 `<workspaceDataDir>/sessions/<sessionId>/attachments`，并以 Main 生成的 opaque `attachmentId` 作为公开 identity。Main SHALL 从 IPC sender 解析 Workspace、验证 Session 归属，并只在该 Workspace/Session 的固定 attachment directory 内解析 handle；renderer SHALL NOT 提交或持久化任意 `file://` URI 作为读取授权。

#### Scenario: 上传并发送 attachment

- **WHEN** 用户向 Session 上传文件并随后发送给 Agent
- **THEN** 持久化 message SHALL 保存 attachment handle、文件名和 MIME type
- **AND** Main SHALL 只在构造 ACP prompt 时把 handle 解析为实际副本

#### Scenario: 原文件或成员变化

- **WHEN** 上传后的原文件被删除、Folder 被移除或重定位
- **THEN** Workspace-owned attachment copy SHALL 继续可读
- **AND** SHALL NOT 重新访问原文件路径

#### Scenario: 跨 Session 或 Workspace 复用 handle

- **WHEN** renderer 在其他 Session 或 Workspace 提交一个有效 attachment ID
- **THEN** Main SHALL 拒绝访问
- **AND** SHALL NOT 暴露副本 absolute path

#### Scenario: Renderer 提交 file URI

- **WHEN** renderer 试图通过 attachment read/stream contract 提交任意 `file://` URI
- **THEN** schema 或 Main SHALL 拒绝请求
- **AND** SHALL NOT 按 URI 读取磁盘文件

#### Scenario: 删除 Session

- **WHEN** Session 被删除
- **THEN** 系统 SHALL 删除该 Session 的全部 attachment copies

### Requirement: Member file resource 使用结构化 owner reference

Session message 中的成员文件实时引用 SHALL 使用 `{ folderId, worktreePath, repositoryRelativePath }`，不得持久化裸 absolute target path。Main SHALL 在捕获、preview、持久化、resume/load 与 prompt dispatch 时验证 Folder 属于 Session snapshot且未 stale，`worktreePath` 是该 repository 的 main 或 registered worktree，canonical relative target 不逃逸 worktree。

#### Scenario: Snapshot 内 main worktree 文件

- **WHEN** resource ref 的 `folderId` 属于有效 Session snapshot、`worktreePath` 等于 snapshot Folder root且相对路径未逃逸
- **THEN** Main SHALL 解析到该文件并允许构造 Agent resource

#### Scenario: Registered linked worktree 文件

- **WHEN** resource ref 指向 snapshot Folder repository 的 registered linked worktree
- **THEN** Main SHALL 在该 worktree 下解析 repository-relative path
- **AND** SHALL 保留原 `worktreePath` owner

#### Scenario: Relative path 逃逸

- **WHEN** `repositoryRelativePath` 为 absolute path、包含逃逸或 canonical target 位于 worktree 外
- **THEN** Main SHALL 拒绝 resource
- **AND** SHALL NOT 通过字符串拼接读取目标

#### Scenario: Worktree 被移除

- **WHEN** 持久化 ref 的 linked worktree 已删除或不再注册
- **THEN** Main SHALL 返回明确 unavailable error
- **AND** SHALL NOT 回退 main worktree 查找同名相对路径

#### Scenario: Window-only preview 转 resource

- **WHEN** preview target 仅有 Window trust而不属于有效 Session snapshot
- **THEN** Main SHALL 拒绝创建 `WorkspaceFileResourceRef`

### Requirement: Apply 与 Archive Agent 保持 owner-only 目录范围

本提案启用 Workspace Chat多根目录时，proposal apply/archive activation SHALL 继续只传 run固定 owner的 Folder root或 registered worktree作为 `cwd`，其 `additionalDirectories` SHALL 为空；对应 `McpWorkspaceDescriptorV2` SHALL 只包含该 owner Folder且将其设为 primary，不得因来源 Workspace有多个成员而向文件系统、reminder或 bundled MCP暴露其他 Folder paths。

#### Scenario: Multi-root Workspace proposal apply

- **WHEN** proposal来源 Workspace含多个可用 Folder且 apply run已固定 owner worktree
- **THEN** apply Agent `cwd` SHALL 等于该 owner worktree
- **AND** `additionalDirectories` SHALL 为空
- **AND** MCP descriptor folders SHALL 只包含 run owner Folder
- **AND** descriptor primaryFolderId SHALL 等于该 owner folderId

#### Scenario: Multi-root Workspace proposal archive

- **WHEN** archive activation来源 Workspace含多个可用 Folder且 run已固定 owner
- **THEN** archive Agent `cwd` SHALL 使用该 owner root或 registered worktree
- **AND** `additionalDirectories` SHALL 为空
- **AND** MCP descriptor与 reminder SHALL NOT 包含任何其他 Workspace成员

### Requirement: ACP lifecycle 从固定授权快照派生 MCP Workspace descriptor

Chat与 probe的 bundled MCP descriptor SHALL 从已经通过 stale校验的同一 `SessionWorkspaceSnapshot` 派生，其 `workspaceId`、`workspaceKind`、`primaryFolderId` 和完整有序 folders SHALL 与本次 ACP `cwd/additionalDirectories` 授权一致。Main SHALL 在签发 HTTP grant或构造 stdio spec前完成校验；不得从当前 Workspace registry增加成员、裁剪 stale成员或替换 snapshot paths。

#### Scenario: Multi-root probe activation

- **WHEN** draft probe使用授权 A、B、C的有效 Workspace snapshot创建 ACP Session
- **THEN** ACP `cwd/additionalDirectories` SHALL 对应 A与 B、C
- **AND** bundled MCP descriptor folders SHALL 按相同顺序包含 A、B、C
- **AND** HTTP或 stdio transport的 tool resolver SHALL 使用该固定 allowlist

#### Scenario: Resume 与 load 重签相同 scope

- **WHEN** multi-root Session通过 `resumeSession`、`loadSession` 或 config-option reload恢复
- **THEN** Main SHALL 从持久化 snapshot重新派生相同 Folder集合的 descriptor
- **AND** SHALL 为该 lifecycle activation签发新 grant或新 stdio child配置
- **AND** SHALL NOT 复用历史 token

#### Scenario: Direct prompt 复用 active activation

- **WHEN** persisted ACP Session在当前 Agent process中仍 active且已绑定未过期 grant
- **THEN** direct prompt SHALL 复用现有 MCP activation
- **AND** SHALL NOT 创建不会传给 ACP lifecycle的额外 token或 stdio spec

#### Scenario: Snapshot stale 时不签发 MCP scope

- **WHEN** snapshot任一 Folder已 removed、missing或 relocated
- **THEN** Main SHALL 在构造 descriptor与签发 grant之前返回既有 Session stale error
- **AND** SHALL NOT 创建部分 Folder allowlist或继续 Agent activation

#### Scenario: Probe 提升保持相同 scope

- **WHEN** Chat consume一个 snapshot匹配的 ready probe ACP Session
- **THEN** Chat SHALL 继承该 probe已经绑定的 MCP activation与 descriptor
- **AND** SHALL NOT 从 current Workspace重新生成 scope或重新签发 token
