## MODIFIED Requirements

### Requirement: Knowledge entries are stored as project-level app data

系统 SHALL 将 durable knowledge 条目存储在当前 `workspaceId` 对应的 Workspace app data `knowledge/` 下，而不是写入仓库工作区或 Folder app data。引用同一 Folder 的其他 Workspace SHALL NOT 隐式继承、合并或修改这些 entries。

每个条目 SHALL 是一个 `*.md` 文件，文件名 SHALL 等于 frontmatter `name` 加 `.md`。`name` SHALL 是 kebab-case 且不得包含路径分隔符、点号或空白字符。

每个条目 SHALL 包含 YAML frontmatter，字段包括：

- `name`
- `description`
- `type: project | reference | feedback`
- `createdAt`
- `updatedAt`
- 可选 `asOf`
- 可选 `anchors`
- 无锚点时必填 `source`

条目正文 SHALL 记录事实、原因、复用场景和会使其失效的条件。

#### Scenario: Missing knowledge directory is empty

- **WHEN** 当前 Workspace app data 目录不存在 `knowledge/`
- **THEN** 系统 SHALL 将 knowledge index 视为空
- **AND** 系统 SHALL NOT 将目录缺失作为错误阻断 chat system-reminder

#### Scenario: Entry filename follows frontmatter name

- **WHEN** agent 写入一个 `name` 为 `markstream-vue-theme-subscription` 的 entry
- **THEN** 系统 SHALL 将该 entry 写入当前 Workspace 的 `knowledge/markstream-vue-theme-subscription.md`
- **AND** 系统 SHALL NOT 允许该 entry 写入 `knowledge/../`、子目录或任意非 `.md` 路径

#### Scenario: Filename mismatch is isolated

- **WHEN** `knowledge/wrong-name.md` 的 frontmatter `name` 为 `right-name`
- **THEN** scanner SHALL 将该文件作为 parse error 隔离
- **AND** scanner SHALL NOT 将该 entry 放入 knowledge index

#### Scenario: Unanchored entry requires source

- **WHEN** agent 起草一个没有 `anchors` 的 knowledge entry
- **THEN** 该 entry SHALL 包含 `source`
- **AND** `feedback` 类型 entry SHALL 始终包含指向用户原话的 `source`

#### Scenario: Scanner tolerates unambiguous YAML shorthand

- **WHEN** knowledge frontmatter 使用可无歧义补齐的 YAML 表达，例如未加引号的时间戳、缺失 `kind` 但包含 `file`+`hash` / `package`+`version`+`resolutionDigest` / `url`+`verifiedAt` 的 anchor，或字符串形式的 `maxAgeDays`
- **THEN** scanner SHALL 在读时规范化这些字段并将该 entry 放入 knowledge index
- **AND** scanner SHALL NOT 将规范化结果自动写回 knowledge markdown 文件
- **AND** scanner SHALL 继续拒绝 filename/frontmatter `name` mismatch、非法 hash、路径逃逸、缺失 `source` 的无锚点条目或无法无歧义推断的 anchor

#### Scenario: Shared Folder does not share knowledge

- **WHEN** Folder A 同时属于 Workspace W1 与 W2
- **THEN** W1 的 knowledge tool、browser 与 reminder SHALL 只读取 W1 knowledge root
- **AND** W2 SHALL NOT 因共享 Folder A 读取或修改 W1 entries

### Requirement: Knowledge anchors determine computed status

系统 SHALL 通过 knowledge entry 的 anchors 计算条目状态，状态 SHALL 为 `active`、`suspect` 或 `unknown`。

`file` anchor SHALL 记录 `folderId`、repository-relative `file` 与写入时文件内容的 SHA-256 digest。`package` anchor SHALL 记录 `folderId`、解析后的 package version 和该 Folder lockfile 中 package resolution entry 的 SHA-256 `resolutionDigest`。`url` anchor SHALL 记录 `verifiedAt` 和可选 `maxAgeDays`，缺省 freshness window 为 90 天且不需要 Folder。`commit` source SHALL 包含 `folderId`；`lineage` source 的 proposal 或 commit repository evidence SHALL 使用 `ProposalRef` 或对应 `folderId`。

所有 Folder-qualified evidence SHALL 只在当前 MCP descriptor / Session snapshot 授权的同 ID Folder main root验证。缺少 owner、owner 未授权、Folder path missing 或 evidence无法读取 SHALL 产生 `unknown`，不得回退 primary或其他 Folder。

`asOf` SHALL 只作为 provenance，不得用于判断条目是否过期。

#### Scenario: File anchor content changed

- **WHEN** knowledge entry 的 `file` anchor 在其 `folderId` owner repository 中的当前 SHA-256 与 frontmatter `hash` 不同
- **THEN** 系统 SHALL 将该 entry 的 computed status 标为 `suspect`
- **AND** 系统 SHALL 在 state 中标明触发 suspect 的 anchor

#### Scenario: Anchor cannot be verified

- **WHEN** knowledge entry 的 anchor 无法验证，例如 Folder 不在当前 Workspace、文件不可读或 lockfile 无法解析
- **THEN** 系统 SHALL 将该 entry 的 computed status 标为 `unknown`
- **AND** 系统 SHALL NOT 将该 entry 标为 `suspect`
- **AND** 系统 SHALL NOT 选择 primary Folder重试

#### Scenario: Package anchor digest changed

- **WHEN** knowledge entry 的 `package` anchor 指向 owner Folder lockfile 中的 package entry 当前 digest 与 frontmatter `resolutionDigest` 不同
- **THEN** 系统 SHALL 将该 entry 的 computed status 标为 `suspect`
- **AND** 系统 SHALL NOT 通过 registry integrity 字符串包含关系判断 package anchor 是否仍 active

#### Scenario: Same relative file exists in two Folders

- **WHEN** 两个成员 Folder 都存在相同相对路径而 anchor 指定 Folder B
- **THEN** scanner SHALL 只验证 Folder B 中的文件
- **AND** Folder A 内容 SHALL NOT 影响 computed status

#### Scenario: Unanchored entry is audit-exempt

- **WHEN** knowledge entry 没有 anchors 且包含合法 source
- **THEN** 系统 SHALL NOT 对该 entry 执行 anchor staleness 检查
- **AND** 系统 SHALL NOT 因仓库中找不到证据而自动 suspect 或 retire 该 entry

## ADDED Requirements

### Requirement: Legacy repository evidence migrates only with a unique Folder owner

升级迁移 SHALL 仅在 Workspace meta 能证明唯一可用 Folder 时，为缺少 `folderId` 的 legacy file/package anchors 与 commit sources补齐该owner。存在多个候选、Workspace/Folder meta损坏或owner不可用时，迁移 SHALL 保留knowledge markdown原文并记录warning，不得使用primary偏好、相对路径命中或文件内容猜测owner。迁移 SHALL 保持幂等并保留未知frontmatter字段。

#### Scenario: Folder Workspace legacy anchor

- **WHEN** Folder Workspace 的legacy knowledge file anchor缺少folderId且唯一Folder可用
- **THEN** migration SHALL为该anchor补齐唯一folderId
- **AND** SHALL保留entry正文与其他frontmatter字段

#### Scenario: Collection legacy anchor is ambiguous

- **WHEN** Collection Workspace包含多个可用Folder且legacy repository anchor缺少owner
- **THEN** migration SHALL保持markdown文件不变并记录warning
- **AND** SHALL NOT通过哪个Folder存在同名file或package来猜测

#### Scenario: Knowledge migration replay

- **WHEN** entry的repository evidence已经包含合法folderId
- **THEN** migration SHALL保持该entry字节内容不变
- **AND** SHALL NOT重复写入warning
