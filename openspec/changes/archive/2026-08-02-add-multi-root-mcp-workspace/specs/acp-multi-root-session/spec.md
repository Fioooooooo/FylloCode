## ADDED Requirements

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

## MODIFIED Requirements

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
