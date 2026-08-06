## MODIFIED Requirements

### Requirement: ACP lifecycle 从固定授权快照派生 MCP Workspace descriptor

Chat与 probe在所有会话模式下 SHALL使用已经通过 stale校验的同一 `SessionWorkspaceSnapshot` 派生 ACP `cwd/additionalDirectories`。`fyllocode`模式的 bundled MCP descriptor SHALL从该 snapshot派生，其 `workspaceId`、`workspaceKind`、`primaryFolderId` 和完整有序 folders SHALL与本次 ACP目录授权一致；Main SHALL在签发 HTTP grant或构造 stdio spec前完成校验。`native`模式 SHALL不构造 bundled MCP descriptor或签发 MCP scope，并 SHALL向 ACP lifecycle传递空 `mcpServers`。两种模式均不得从当前 Workspace registry增加成员、裁剪 stale成员或替换 snapshot paths。

#### Scenario: Multi-root FylloCode probe activation

- **WHEN** `fyllocode` draft probe使用授权 A、B、C的有效 Workspace snapshot创建 ACP Session
- **THEN** ACP `cwd/additionalDirectories` SHALL对应 A与 B、C
- **AND** bundled MCP descriptor folders SHALL按相同顺序包含 A、B、C
- **AND** HTTP或 stdio transport的 tool resolver SHALL使用该固定 allowlist

#### Scenario: Multi-root native probe activation

- **WHEN** `native` draft probe使用授权 A、B、C的有效 Workspace snapshot创建 ACP Session
- **THEN** ACP `cwd/additionalDirectories` SHALL对应 A与 B、C
- **AND** ACP lifecycle `mcpServers` SHALL为空
- **AND** Main SHALL NOT为该 activation构造 bundled MCP descriptor

#### Scenario: FylloCode resume 与 load 重签相同 scope

- **WHEN** `fyllocode` multi-root Session通过 `resumeSession`、`loadSession` 或 config-option reload恢复
- **THEN** Main SHALL从持久化 snapshot重新派生相同 Folder集合的 descriptor
- **AND** SHALL为该 lifecycle activation签发新 grant或新 stdio child配置
- **AND** SHALL NOT复用历史 token

#### Scenario: Native resume 与 load 保持空 MCP

- **WHEN** `native` multi-root Session通过 `resumeSession`、`loadSession` 或 fresh fallback恢复
- **THEN** 每次 lifecycle request SHALL继续使用持久化 snapshot的目录集合
- **AND** `mcpServers` SHALL保持为空
- **AND** Main SHALL NOT签发 grant或创建 stdio child配置

#### Scenario: FylloCode direct prompt 复用 active activation

- **WHEN** `fyllocode` persisted ACP Session在当前 Agent process中仍 active且已绑定未过期 grant
- **THEN** direct prompt SHALL复用现有 MCP activation
- **AND** SHALL NOT创建不会传给 ACP lifecycle的额外 token或 stdio spec

#### Scenario: Native direct prompt 复用 active session

- **WHEN** `native` persisted ACP Session在当前 Agent process中仍 active且记录了无 MCP的 activation状态
- **THEN** direct prompt SHALL复用该 ACP Session
- **AND** SHALL NOT仅因 activation没有 grant而进入 cold recovery

#### Scenario: Snapshot stale 时不启动任一模式

- **WHEN** snapshot任一 Folder已 removed、missing或 relocated
- **THEN** Main SHALL在构造 descriptor或启动 native ACP lifecycle之前返回既有 Session stale error
- **AND** SHALL NOT创建部分 Folder授权、签发 MCP scope或继续 Agent activation

#### Scenario: FylloCode probe 提升保持相同 scope

- **WHEN** `fyllocode` Chat consume一个 mode与 snapshot均匹配的 ready probe ACP Session
- **THEN** Chat SHALL继承该 probe已经绑定的 MCP activation与 descriptor
- **AND** SHALL NOT从 current Workspace重新生成 scope或重新签发 token

#### Scenario: Native probe 提升保持无 MCP

- **WHEN** `native` Chat consume一个 mode与 snapshot均匹配的 ready probe ACP Session
- **THEN** Chat SHALL继承该无 MCP的 ACP activation状态
- **AND** SHALL NOT在 promotion时补充 bundled MCP specs
