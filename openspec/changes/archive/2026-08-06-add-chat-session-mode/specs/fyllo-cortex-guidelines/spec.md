## MODIFIED Requirements

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
