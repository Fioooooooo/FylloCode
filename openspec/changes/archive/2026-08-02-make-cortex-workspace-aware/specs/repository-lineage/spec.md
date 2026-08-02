## ADDED Requirements

### Requirement: Lineage separates Workspace subjects from repository reverse relations

The system SHALL store task/chat/session/plan subjects under the owning Workspace data directory and SHALL store proposal/commit reverse relations under the owning Folder data directory. Repository relations SHALL use a version 2 index whose proposal keys are repository-local `changeId` values and whose commit keys are hashes; cross-repository queries SHALL select `folderId` before using either key.

Each relation SHALL contain `workspaceId`, `subjectId`, `relation: origin | reference`, and `linkedAt`. A proposal or commit SHALL have at most one origin and MAY have multiple references.

#### Scenario: Collection creates a proposal in a shared Folder

- **WHEN** a Collection Workspace subject creates a proposal in member Folder B
- **THEN** the subject link SHALL remain under that Collection Workspace
- **AND** Folder B reverse index SHALL contain one origin relation pointing to that Workspace and subject
- **AND** a Folder Workspace that also references B SHALL be able to query the repository relation without owning the subject

#### Scenario: Another Workspace explicitly continues the proposal

- **WHEN** a different Workspace subject starts Apply or Archive for the existing ProposalRef
- **THEN** Folder reverse index SHALL append a reference relation for that Workspace and subject
- **AND** the original origin SHALL remain unchanged

#### Scenario: Passive reads do not create relations

- **WHEN** another Workspace only browses or traces a proposal, or creates a knowledge anchor to it
- **THEN** no repository reference relation SHALL be appended

### Requirement: Repository relations enforce unique origin and idempotent references

Repository lineage mutation SHALL reject a second origin from a different `{workspaceId, subjectId}` while retaining the existing origin. Reference append SHALL be idempotent by `{workspaceId, subjectId, relation}` and SHALL retain references from all Workspaces.

#### Scenario: Conflicting second origin

- **WHEN** an object already has an origin and a different subject attempts to record another origin
- **THEN** mutation SHALL return an origin-conflict error containing the existing relation
- **AND** SHALL NOT overwrite or append the new origin

#### Scenario: Duplicate reference replay

- **WHEN** the same Workspace subject reference is recorded more than once
- **THEN** the index SHALL contain one matching reference relation
- **AND** the replay SHALL succeed as an idempotent no-op

### Requirement: Repository reverse index mutation is transactionally serialized

Main SHALL serialize mutations per Folder reverse index file. The exclusive transaction SHALL include reading the latest file, validating origin rules, merging the relation, writing a unique temporary file, and atomic rename. Serializing only final writes SHALL NOT satisfy this requirement.

#### Scenario: Concurrent references target one proposal

- **WHEN** two Workspace windows concurrently append distinct references to the same Folder proposal
- **THEN** the final index SHALL contain both references exactly once
- **AND** neither read-modify-write sequence SHALL overwrite the other

#### Scenario: Atomic write fails

- **WHEN** writing or renaming the replacement index fails
- **THEN** the mutation SHALL report failure
- **AND** readers SHALL continue to observe either the previous valid file or the complete replacement, never partial JSON

### Requirement: Cortex lineage trace is owner-qualified and target-explicit

`fyllo-cortex lineage` SHALL require `folderId` for `trace-proposal`, `trace-commit`, and `trace-file`. Proposal and commit traces SHALL query only that Folder reverse index. File trace SHALL use the Folder main root when `worktreePath` is omitted; when supplied, the path SHALL pass the shared registered-worktree validator. `filePath` SHALL be repository-relative and its canonical target SHALL remain inside the resolved worktree.

Every trace response SHALL include the resolved `folderId` and actual `worktreePath`. It SHALL return the unique origin (or `null` with warnings) and all references rather than selecting the last relation.

#### Scenario: Trace a linked worktree file

- **WHEN** trace-file supplies a Folder owner, a registered linked worktree, and a safe repository-relative file path
- **THEN** Git history SHALL execute in that linked worktree
- **AND** the response SHALL identify that Folder and linked worktree
- **AND** matching commits SHALL use multi-value repository relation lookup

#### Scenario: Trace target is unauthorized or escapes

- **WHEN** Folder is outside the descriptor, worktree is unregistered, or canonical file target escapes the worktree
- **THEN** the tool SHALL return a structured target error
- **AND** SHALL NOT fall back to primary, main worktree, or process cwd

#### Scenario: Reverse relation belongs to another Workspace

- **WHEN** a trace result includes a relation whose `workspaceId` differs from the active descriptor Workspace
- **THEN** the response MAY expose relation identity and timestamps
- **AND** SHALL NOT read or return that other Workspace's task, session, or knowledge content

### Requirement: Lineage v1 migrates only provable repository ownership

An upgrade migration SHALL rebuild Workspace lineage index v2 and Folder reverse indexes from existing Workspace subjects. It SHALL migrate a proposal only when its subject link contains `folderId`, and SHALL migrate its commit only when the owning Folder can be proven from that link. Missing owner, invalid subject, or conflicting origin SHALL remain unguessed and SHALL produce a persisted migration warning while preserving source files.

The migration SHALL be idempotent and SHALL NOT modify the already released Workspace cutover migration.

#### Scenario: V1 subject has an owner-qualified proposal

- **WHEN** a legacy subject link contains `folderId`, `changeId`, and a commit hash
- **THEN** migration SHALL create owner-qualified Workspace index entries
- **AND** SHALL append single-element origin relations for that proposal and commit to the Folder reverse index

#### Scenario: V1 subject lacks proposal owner

- **WHEN** a legacy proposal link has no `folderId`
- **THEN** migration SHALL preserve the subject and exclude that proposal/commit from owner-qualified indexes
- **AND** SHALL persist a warning describing why owner could not be determined
- **AND** SHALL NOT use Workspace primary or a repository path to guess

#### Scenario: Migration is replayed

- **WHEN** migration encounters v2 indexes and relations already produced by an earlier complete run
- **THEN** it SHALL make no duplicate relations
- **AND** unrelated fields and subject files SHALL remain unchanged
