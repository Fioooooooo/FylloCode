## MODIFIED Requirements

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
