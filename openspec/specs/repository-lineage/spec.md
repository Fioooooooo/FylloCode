# repository-lineage Specification

## Purpose

定义 lineage 在 Workspace-owned subjects 与 Folder-owned repository reverse relations 之间的持久化和查询边界。主契约涵盖 owner-qualified keys、唯一 origin 与幂等 references、并发原子更新、Cortex trace 授权以及 legacy v1 migration。

## Requirements

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

升级迁移 SHALL 从现有 Workspace subjects 重建 Workspace lineage v2 index 与 Folder reverse indexes。legacy proposal link 已包含有效 `folderId` 时，迁移 SHALL 保留该 owner。ownerless proposal link 位于恰有一个可用成员的 Folder Workspace 时，迁移 SHALL 采用该成员作为可证明 owner；位于 Collection Workspace 时，只有 active 或 archived proposal repository evidence 恰好唯一命中一个可用成员 Folder，迁移才 SHALL 采用该 owner。迁移 SHALL 在派生 owner-qualified proposal 与 commit index entries 前把已证明的 `folderId` 写回 subject。

owner evidence 零命中或多命中、subject 数据无效、repository origin 冲突时，迁移 SHALL NOT 猜测 owner，SHALL 持久化 migration warning，并且 SHALL NOT 选择 Workspace primary Folder。迁移 SHALL 幂等，且 SHALL NOT 修改已发布的 Workspace cutover/retirement migrations、migration ledger schema 或运行期 `ProposalRef` 要求。

#### Scenario: V1 subject has an owner-qualified proposal

- **WHEN** legacy subject link 包含有效的 `folderId`、`changeId` 与 commit hash 字段
- **THEN** 迁移 SHALL 保留 subject 的现有 Folder owner
- **AND** SHALL 创建 owner-qualified Workspace proposal 与 commit index entries
- **AND** SHALL 向该 Folder reverse index 幂等追加 origin relations

#### Scenario: Folder Workspace proves an ownerless proposal owner

- **WHEN** Folder Workspace 恰有一个可用成员，且其 legacy subject 包含有 `changeId` 但无 `folderId` 的 proposal link
- **THEN** 迁移 SHALL 把唯一成员的 `folderId` 写入该 proposal link，并保留全部无关 subject 字段
- **AND** SHALL 把 proposal 与任何已持久化 commit hash 纳入 Workspace composite index
- **AND** SHALL 向唯一成员的 Folder reverse index 幂等追加 origin relations

#### Scenario: Collection Workspace has unique repository evidence

- **WHEN** Collection Workspace 的 legacy proposal link 没有 `folderId`
- **AND** canonical `changeId` 作为 active、archived 或 linked-worktree proposal 恰好在一个可用成员 Folder 中解析成功
- **THEN** 迁移 SHALL 把该 Folder 的 `folderId` 写入 proposal link
- **AND** SHALL 从补全后的 link 派生 Workspace 与 Folder lineage indexes

#### Scenario: Collection Workspace owner remains ambiguous

- **WHEN** ownerless legacy proposal 在零个可用成员 Folder 或多个可用成员 Folder 中解析成功
- **THEN** 迁移 SHALL 保留 ownerless proposal link，并从 owner-qualified indexes 排除该 link 与其 commit
- **AND** SHALL 持久化说明 owner evidence 缺失或歧义的 warning
- **AND** SHALL NOT 使用 Workspace primary Folder、扫描顺序、path encoding 或 Workspace 名称猜测

#### Scenario: Repository origin conflicts during migration

- **WHEN** 已证明 owner 的 Folder reverse index 已为同一 proposal 或 commit 包含不同 origin
- **THEN** 迁移 SHALL 保留现有 origin 并持久化 conflict warning
- **AND** SHALL NOT 覆盖该 origin 或选择不同 Folder owner

#### Scenario: Migration is replayed

- **WHEN** 迁移遇到先前完整或部分执行已经生成的 subjects 与 v2 indexes
- **THEN** SHALL NOT 产生重复 relations 或重复 subject 变更
- **AND** SHALL 从已补全 subjects 重建缺失的派生 index entries
- **AND** 无关字段与未发生目标变化的 subject files SHALL 保持不变
