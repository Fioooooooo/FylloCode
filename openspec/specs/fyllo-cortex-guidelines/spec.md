# fyllo-cortex-guidelines Specification

## Purpose

定义 `fyllo-cortex` 在 multi-root Workspace 中维护和注入 repository guidelines 时的 Folder 所有权与授权边界。主契约要求维护操作显式选择 owner，Chat 按授权 Folder 分组，Apply/Archive 仅使用固定 proposal owner。

## Requirements

### Requirement: Guidelines maintenance uses an explicit repository owner

`fyllo-cortex` guidelines tool SHALL accept `folderId` as the repository owner selector for `init`, `create`, and `update`. The tool SHALL resolve that Folder only from the current immutable MCP Workspace descriptor. Existing `path` SHALL remain a repository-relative `guidelines/**/*.md` path and SHALL NOT be interpreted as a Folder selector.

When a descriptor has exactly one Folder, the tool MAY infer that Folder for backward-compatible single-root calls. When multiple Folders are authorized and `folderId` is absent, it SHALL return an owner-required error and SHALL NOT select primary or the first member.

#### Scenario: Maintain guidelines in a secondary Folder

- **WHEN** a Collection Workspace activation calls guidelines update with a secondary member `folderId` and `path: guidelines/Testing.md`
- **THEN** the tool SHALL read state from that Folder repository
- **AND** returned state SHALL include the resolved `folderId`, `folderPath`, and repository-relative target path
- **AND** it SHALL NOT read or modify the primary Folder guideline with the same relative path

#### Scenario: Multi-root call omits owner

- **WHEN** the descriptor contains multiple Folders and a guidelines call omits `folderId`
- **THEN** the tool SHALL return a structured owner-required error
- **AND** it SHALL NOT scan any Folder as an inferred maintenance target

#### Scenario: Guideline path escapes repository

- **WHEN** a caller supplies an absolute path or a relative path escaping `guidelines/`
- **THEN** schema or target validation SHALL reject the call
- **AND** no repository file SHALL be read or written through that target

### Requirement: Chat reminders group guidelines by authorized Folder

`fyllocode` Chat system reminders SHALL scan guidelines from every Folder in the validated `SessionWorkspaceSnapshot` and SHALL group entries by `folderId`, `folderName`, and snapshot `folderPath`. Each guideline path SHALL remain relative to its owning Folder. A missing guidelines directory SHALL produce an empty Folder group; a scan or parse problem SHALL be attached to that Folder without suppressing readable groups. `native` Chat SHALL NOT build or inject a guidelines reminder.

Apply and Archive reminders SHALL scan only the proposal run's fixed owner `worktreePath` and SHALL NOT inject guidelines from other Workspace members;该行为 SHALL NOT受 Chat Session mode影响。

#### Scenario: Two Folders contain the same guideline path

- **WHEN** a `fyllocode` Session snapshot contains two authorized Folders that both have `guidelines/Testing.md`
- **THEN** the reminder SHALL include both entries under their respective Folder groups
- **AND** the reminder SHALL instruct the Agent to resolve each path against that group's `folderPath`

#### Scenario: One Folder guideline scan fails

- **WHEN** one snapshot Folder cannot be scanned and another Folder has readable guidelines in a `fyllocode` Chat
- **THEN** the reminder SHALL retain the readable Folder group
- **AND** SHALL include a warning identifying the failed `folderId`
- **AND** SHALL NOT present the remaining Folder as the only Workspace repository

#### Scenario: Native Chat skips guideline reminder

- **WHEN** a `native` Chat sends its first prompt on a brand-new ACP session
- **THEN** Main SHALL NOT scan guidelines for prompt injection
- **AND** the Agent prompt SHALL NOT contain a FylloCode guidelines index

#### Scenario: Apply reminder remains owner-only

- **WHEN** an Apply activation belongs to one proposal owner in a multi-root Workspace
- **THEN** its guideline index SHALL come only from the fixed owner worktree
- **AND** the reminder SHALL NOT include guidelines from secondary or primary Workspace members that do not own the proposal
