## MODIFIED Requirements

### Requirement: Subject 聚合根结构

Subject SHALL 表示一条原始需求线索，结构包含：`id`（经 `infra/ids` 的 `newSubjectId()` 生成）、`origin`、`task`、`links`、`createdAt`、`updatedAt`。`links` SHALL 是 `LineageSessionLink` 列表，每个 link 含 `sessionId`、`createdAt` 与 `proposals`（`LineageProposalLink` 列表，每项含 `changeId`、`createdAt`，并在归档提交 hash 已知时包含可选 `commitHash`）。该结构 SHALL 表达"一条线索下多个 session、每个 session 产出多个 proposal"的层级关系。每个 Subject SHALL 最多关联一个 task。

`LineageProposalLink.commitHash` SHALL 为可选非空字符串；未知、尚未提交、Git 不可用或查询未命中时 SHALL 保持缺省，不写入 `null`。读取历史 subject 时，缺失 `commitHash` 的 proposal SHALL 被视为 commit hash 未知且仍可正常解析。

#### Scenario: 一个 session 拆出多个 proposal

- **WHEN** 某 session 在同一线索下产出 changeId 为 `c1` 与 `c2` 的两个 proposal
- **THEN** 该 session 对应的 link 的 `proposals` 列表同时包含 `c1` 与 `c2`

#### Scenario: 一条线索下多次讨论

- **WHEN** 同一线索发起了两次 session
- **THEN** Subject 的 `links` 列表包含两个 `LineageSessionLink` 项

#### Scenario: proposal 归档提交 hash 未知

- **WHEN** 某 proposal 尚未获取到归档提交 hash
- **THEN** 对应 `LineageProposalLink` 不包含 `commitHash`
- **AND** 该 Subject 仍可被读取、投影和写回

#### Scenario: proposal 归档提交 hash 已知

- **WHEN** 系统已确认 proposal `add-foo` 对应归档提交 hash 为 `abc123`
- **THEN** 对应 `LineageProposalLink` 包含 `commitHash: "abc123"`

### Requirement: Index 派生与自愈

`index.json`（`LineageIndex`）SHALL 包含 `version`、`tasks`（`<ref> → subjectId`）、`sessions`（`sessionId → subjectId`）、`proposals`（`changeId → subjectId`）、`commitHashes`（`commitHash → subjectId`）与 `updatedAt`。`subjects/*.json` SHALL 为权威源，`index.json` SHALL 为可重建派生物。系统 SHALL 提供 `rebuildIndex(projectPath)` 扫描 subjects 目录重建索引。当读取 `index.json` 失败或缺失时，系统 SHALL 自动触发重建而非抛错。因 index 可重建，其格式变更 SHALL NOT 需要迁移脚本。

读取历史 `index.json` 时，若缺失 `commitHashes` 字段，系统 SHALL 将其归一化为空对象 `{}`，不得导致 lineage 查询失败。`rebuildIndex(projectPath)` SHALL 从所有有效 subject 的 proposal `commitHash` 派生 `commitHashes` 反查表，只登记非空字符串 commit hash。

#### Scenario: index 缺失时自愈

- **WHEN** `index.json` 不存在但 `subjects/` 目录有有效文件
- **AND** 系统执行一次 lineage 查询
- **THEN** 系统从 subjects 重建 index 并返回正确结果

#### Scenario: 二次发起命中既有 subject

- **WHEN** 从一个已存在 lineage 的 task 再次发起讨论
- **THEN** 系统经 `index.tasks` 以 ref 命中既有 subjectId，复用该 Subject 而非新建

#### Scenario: 从 subject 重建 commit hash 反查表

- **WHEN** `subjects/subject-1.json` 中某 proposal 包含 `commitHash: "abc123"`
- **AND** 系统执行 `rebuildIndex(projectPath)`
- **THEN** 重建后的 `index.json` 包含 `commitHashes: { "abc123": "subject-1" }`

#### Scenario: 读取旧 index 缺少 commitHashes

- **WHEN** 历史 `index.json` 仅包含 `tasks`、`sessions`、`proposals` 与 `updatedAt`
- **THEN** 系统读取后返回的 `LineageIndex.commitHashes` 为 `{}`
- **AND** 不因缺失该字段触发读取失败

### Requirement: Lineage 写入编排 API

系统 SHALL 在 `services/lineage` 暴露幂等写入 API：`ensureTaskSubject`（task 起源建/复用线索）、`ensureChatSubject`（chat 起源建线索）、`linkSession`（关联 session 到 subject）、`recordProposal`（经 session 反查 subject 后追加 proposal）、`recordProposalCommitHash`（经 proposal 反查 subject 后写入 proposal commit hash）、`backfillTask`（chat 起源补建任务后回填 task）。这些 API SHALL 可在任意时机被安全重复调用。

`recordProposalCommitHash(projectPath, changeId, commitHash)` SHALL 只更新已存在的 proposal link：若 `changeId` 无法通过 `index.proposals` 反查到 subject、subject 文件不存在或 subject 内没有该 proposal，系统 SHALL 返回 `null` 且不创建 subject。若 proposal 尚无 `commitHash`，系统 SHALL 写入 `commitHash`，并同步更新 `index.commitHashes[commitHash] = subjectId`。若 proposal 已有相同 `commitHash`，系统 SHALL 保持幂等；若 proposal 已有不同 `commitHash`，系统 SHALL NOT 覆盖既有值。

#### Scenario: recordProposal 经 session 反查

- **WHEN** 对一个已 `linkSession` 的 sessionId 调用 `recordProposal(projectPath, sessionId, changeId)`
- **THEN** 系统经 `index.sessions` 反查到 subjectId，在对应 session link 的 `proposals` 中追加该 changeId
- **AND** 在 `index.proposals` 登记 `changeId → subjectId`

#### Scenario: 写入 API 幂等

- **WHEN** 对同一 (sessionId) 重复调用 `linkSession`，或对同一 (sessionId, changeId) 重复调用 `recordProposal`
- **THEN** 结果不产生重复条目，Subject 状态保持一致

#### Scenario: backfill 回填同一线索

- **WHEN** 对一条 chat 起源线索调用 `backfillTask(projectPath, subjectId, taskSnapshot)`
- **THEN** 该 Subject 的 `task` 被回填为快照，`origin` 保持 `"chat"`
- **AND** `index.tasks` 登记新 ref → 同一 subjectId

#### Scenario: recordProposalCommitHash 写入 proposal commit hash

- **WHEN** subject `subject-1` 已包含 proposal `add-foo` 且该 proposal 尚无 `commitHash`
- **AND** 调用 `recordProposalCommitHash(projectPath, "add-foo", "abc123")`
- **THEN** `subjects/subject-1.json` 中该 proposal 包含 `commitHash: "abc123"`
- **AND** `index.json` 包含 `commitHashes: { "abc123": "subject-1" }`

#### Scenario: recordProposalCommitHash 不覆盖既有 hash

- **WHEN** proposal `add-foo` 已包含 `commitHash: "oldhash"`
- **AND** 调用 `recordProposalCommitHash(projectPath, "add-foo", "newhash")`
- **THEN** 该 proposal 的 `commitHash` 仍为 `"oldhash"`
- **AND** 系统不将 `"newhash"` 写入 `index.commitHashes`

#### Scenario: recordProposalCommitHash 对未知 proposal 返回 null

- **WHEN** 调用 `recordProposalCommitHash(projectPath, "missing-change", "abc123")`
- **AND** `index.proposals` 中不存在 `"missing-change"`
- **THEN** 系统返回 `null`
- **AND** 不创建新的 subject 或 proposal link
