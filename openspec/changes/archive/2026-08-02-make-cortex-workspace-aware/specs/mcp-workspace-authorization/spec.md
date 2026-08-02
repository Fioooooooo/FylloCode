## ADDED Requirements

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
