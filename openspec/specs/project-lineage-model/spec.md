# project-lineage-model 规范

## Purpose

定义项目 lineage 持久化模型、subject 聚合根、origin 不变量、任务快照、索引派生自愈和写入/查询 API。
## Requirements
### Requirement: Lineage 持久化布局

系统 SHALL 将项目级 lineage 数据存储在 `projects/<encodedProjectId>/lineage/` 目录下，包含 `subjects/<subjectId>.json`（每条线索一个文件，权威源）与 `index.json`（派生反查索引）。路径 SHALL 通过 `project-paths.ts` 新增的 `lineageDir(projectPath)` 与 `subjectsDir(projectPath)` 生成，不得在 service 或 handler 层手写路径拼接。

#### Scenario: 首次访问空 lineage

- **WHEN** 一个从未写入 lineage 的项目调用查询 API
- **THEN** 系统返回空结果，不抛出异常，不创建多余文件

#### Scenario: subject 与 index 落点

- **WHEN** 系统创建一个 subjectId 为 `subject-1` 的线索
- **THEN** 写入 `lineage/subjects/subject-1.json`
- **AND** 在 `lineage/index.json` 登记对应反查项

### Requirement: Subject 聚合根结构

Subject SHALL 表示一条原始需求线索，结构包含：`id`（经 `infra/ids` 的 `newSubjectId()` 生成）、`origin`、`task`、`links`、`createdAt`、`updatedAt`。`links` SHALL 是 `LineageSessionLink` 列表，每个 link 含 `sessionId`、`createdAt`、`proposals` 与 `plans`。

`proposals` SHALL 是 `LineageProposalLink` 列表，每项含 `changeId`、`createdAt`，并在归档提交 hash 已知时包含可选 `commitHash`。`plans` SHALL 是 `LineagePlanLink` 列表，每项含 `slug` 与 `createdAt`，其中 `slug` 为 session-scoped 完整 plan slug，例如 `2026-06-29-refactor-chat-store`。该结构 SHALL 表达“一条线索下多个 session、每个 session 产出多个 proposal 和多个 plan”的层级关系。每个 Subject SHALL 最多关联一个 task。

`LineageProposalLink.commitHash` SHALL 为可选非空字符串；未知、尚未提交、Git 不可用或查询未命中时 SHALL 保持缺省，不写入 `null`。读取历史 subject 时，缺失 `commitHash` 的 proposal SHALL 被视为 commit hash 未知且仍可正常解析。

读取历史 subject 时，若某个 `LineageSessionLink` 缺失 `plans` 字段，系统 SHALL 将其归一化为 `[]`，不得导致 subject 读取失败。

#### Scenario: 一个 session 拆出多个 proposal

- **WHEN** 某 session 在同一线索下产出 changeId 为 `c1` 与 `c2` 的两个 proposal
- **THEN** 该 session 对应的 link 的 `proposals` 列表同时包含 `c1` 与 `c2`

#### Scenario: 一个 session 创建多个 plan

- **WHEN** 某 session 在同一线索下创建 slug 为 `2026-06-29-plan-a` 与 `2026-06-29-plan-b` 的两个 plan
- **THEN** 该 session 对应的 link 的 `plans` 列表同时包含两个 plan link
- **AND** 每个 plan link 包含 `slug` 与 `createdAt`

#### Scenario: 一条线索下多次讨论

- **WHEN** 同一线索发起了两次 session
- **THEN** Subject 的 `links` 列表包含两个 `LineageSessionLink` 项

#### Scenario: 历史 session link 缺少 plans

- **WHEN** 历史 subject 文件中的 session link 只有 `sessionId`、`createdAt` 与 `proposals`
- **THEN** 系统读取后返回的 `LineageSessionLink.plans` 为 `[]`
- **AND** 不因缺失该字段触发读取失败

#### Scenario: proposal 归档提交 hash 未知

- **WHEN** 某 proposal 尚未获取到归档提交 hash
- **THEN** 对应 `LineageProposalLink` 不包含 `commitHash`
- **AND** 该 Subject 仍可被读取、投影和写回

### Requirement: 起源 origin 不变量

`Subject.origin` SHALL 取值 `"task"` 或 `"chat"`，表示线索的起源。`origin` 一旦创建 SHALL NOT 改变。chat 起源的线索在后续补建本地任务后，`origin` SHALL 保持 `"chat"`。系统 SHALL 以 `origin` 作为判定"task 是否为后补建"的依据。

#### Scenario: chat 起源补建任务后 origin 不翻转

- **WHEN** 一条 `origin="chat"` 的线索在 proposal 创建后补建了本地任务并回填 `task`
- **THEN** 该 Subject 的 `origin` 仍为 `"chat"`
- **AND** 据此可判定其 task 为后补建

#### Scenario: task 起源

- **WHEN** 从一个本地或第三方任务发起讨论创建线索
- **THEN** 该 Subject 的 `origin` 为 `"task"`

### Requirement: Task 快照语义

`Subject.task` SHALL 为 `LineageTaskSnapshot | null`。`LineageTaskSnapshot` SHALL 包含 `ref`（形如 `<source>:<taskId>` 的引用键）、`snapshot`（全量 `TaskItem` 拷贝）、`capturedAt`（ISO 8601 字符串，标记快照时刻）。系统 SHALL 对所有来源的 task 统一存全量快照，不按来源区分。chat 起源在补建 task 前 `task` SHALL 为 `null`。

#### Scenario: 第三方任务快照保留源头

- **WHEN** 从一个 yunxiao 任务发起讨论创建线索
- **THEN** `Subject.task.snapshot` 保存该任务的全量 `TaskItem`
- **AND** 即使该任务后续在云效侧关闭、本地不再可见，仍可从快照读取原始任务信息

#### Scenario: chat 起源建 proposal 前 task 为空

- **WHEN** 一条 chat 起源线索尚未创建任何 proposal
- **THEN** 其 `Subject.task` 为 `null`，且该 Subject 可被正常持久化

### Requirement: Index 派生与自愈

`index.json`（`LineageIndex`）SHALL 包含 `version`、`tasks`（`<ref> → subjectId`）、`sessions`（`sessionId → subjectId`）、`proposals`（`changeId → subjectId`）、`commitHashes`（`commitHash → subjectId`）与 `updatedAt`。`subjects/*.json` SHALL 为权威源，`index.json` SHALL 为可重建派生物。系统 SHALL 提供 `rebuildIndex(projectPath)` 扫描 subjects 目录重建索引。当读取 `index.json` 失败或缺失时，系统 SHALL 自动触发重建而非抛错。

`LineageIndex` SHALL NOT 包含 `plans` 或任何 `planSlug -> subjectId` 反查表。plan 是 session-scoped 轻量记录，查询 SHALL 通过 `{ sessionId, slug }` 完成，而不是通过全局 slug 反查。

读取历史 `index.json` 时，若缺失 `commitHashes` 字段，系统 SHALL 将其归一化为空对象 `{}`，不得导致 lineage 查询失败。`rebuildIndex(projectPath)` SHALL 从所有有效 subject 的 proposal `commitHash` 派生 `commitHashes` 反查表，只登记非空字符串 commit hash。因 index 可重建，其格式变更 SHALL NOT 需要迁移脚本。

#### Scenario: index 缺失时自愈

- **WHEN** `index.json` 不存在但 `subjects/` 目录有有效文件
- **AND** 系统执行一次 lineage 查询
- **THEN** 系统从 subjects 重建 index 并返回正确结果

#### Scenario: 从 subject 重建时不派生 plans

- **WHEN** `subjects/subject-1.json` 中某 session link 包含 plan slug `2026-06-29-plan-a`
- **AND** 系统执行 `rebuildIndex(projectPath)`
- **THEN** 重建后的 `index.json` 不包含 `plans` 字段
- **AND** 不包含 `2026-06-29-plan-a` 的全局反查项

#### Scenario: 二次发起命中既有 subject

- **WHEN** 从一个已存在 lineage 的 task 再次发起讨论
- **THEN** 系统经 `index.tasks` 以 ref 命中既有 subjectId，复用该 Subject 而非新建

### Requirement: 持久化写入可靠性

系统 SHALL 对每个 subject 文件与 `index.json` 使用 per-file 写锁队列串行化写入，使用临时文件加 rename 的原子写。读取 subject 与 index 时 SHALL 做防御性解析，遇损坏文件跳过而非中断整体操作。

#### Scenario: 并发写同一 subject 串行化

- **WHEN** 对同一 subject 发起两次并发写入
- **THEN** 两次写入按队列串行执行，最终文件为有效 JSON，不出现交错损坏

#### Scenario: 损坏文件被跳过

- **WHEN** `subjects/` 中存在一个无法解析的损坏文件
- **AND** 系统执行 `rebuildIndex` 或列举操作
- **THEN** 系统跳过该损坏文件，正常处理其余有效文件

### Requirement: Lineage 写入编排 API

系统 SHALL 在 `services/lineage` 暴露幂等写入 API：`ensureTaskSubject`（task 起源建/复用线索）、`ensureChatSubject`（chat 起源建线索）、`linkSession`（关联 session 到 subject）、`recordProposal`（经 session 反查 subject 后追加 proposal）、`recordPlan`（经 session 反查 subject 后追加 plan）、`recordProposalCommitHash`（经 proposal 反查 subject 后写入 proposal commit hash）、`backfillTask`（chat 起源补建任务后回填 task）。这些 API SHALL 可在任意时机被安全重复调用。

`recordPlan(projectPath, sessionId, slug)` SHALL 只通过 `index.sessions[sessionId]` 定位 subject，不通过 plan slug 全局反查。若 `sessionId` 无法反查到 subject、subject 文件不存在或 subject 内没有该 session link，系统 SHALL 返回 `null` 且不创建 subject。调用方需要兜底创建 chat subject 时，SHALL 在消费编排层调用 `ensureChatSubject` 后重试。

`recordProposalCommitHash(projectPath, changeId, commitHash)` SHALL 只更新已存在的 proposal link：若 `changeId` 无法通过 `index.proposals` 反查到 subject、subject 文件不存在或 subject 内没有该 proposal，系统 SHALL 返回 `null` 且不创建 subject。若 proposal 尚无 `commitHash`，系统 SHALL 写入 `commitHash`，并同步更新 `index.commitHashes[commitHash] = subjectId`。若 proposal 已有相同 `commitHash`，系统 SHALL 保持幂等；若 proposal 已有不同 `commitHash`，系统 SHALL NOT 覆盖既有值。

#### Scenario: recordPlan 经 session 反查

- **WHEN** 对一个已 `linkSession` 的 sessionId 调用 `recordPlan(projectPath, sessionId, "2026-06-29-plan-a")`
- **THEN** 系统经 `index.sessions` 反查到 subjectId，在对应 session link 的 `plans` 中追加该 slug
- **AND** 不修改 `index.json` 增加 plan 反查项

#### Scenario: recordPlan 幂等

- **WHEN** 对同一 `(sessionId, slug)` 重复调用 `recordPlan`
- **THEN** 结果不产生重复 plan link
- **AND** Subject 状态保持一致

#### Scenario: recordPlan 对未知 session 返回 null

- **WHEN** 调用 `recordPlan(projectPath, "missing-session", "2026-06-29-plan-a")`
- **AND** `index.sessions` 中不存在 `"missing-session"`
- **THEN** 系统返回 `null`
- **AND** 不创建新的 subject 或 session link

### Requirement: Lineage 查询投影 API

系统 SHALL 在 `services/lineage` 暴露查询 API：`getByTask`、`getBySession`、`getByProposal`，均经 index 反查 subject 后由 domain 投影函数产出结果，覆盖以下回溯需求。

#### Scenario: 从 task 查下游

- **WHEN** 调用 `getByTask(projectPath, ref)`
- **THEN** 返回该线索下全部 session 及各 session 产出的 proposal

#### Scenario: 从 session 查上游与产出

- **WHEN** 调用 `getBySession(projectPath, sessionId)`
- **THEN** 返回该 session 所属线索的 `origin`（上游来源）与该 session 的 proposal 产出列表

#### Scenario: 从 proposal 查原始任务

- **WHEN** 调用 `getByProposal(projectPath, changeId)`
- **THEN** 返回该 proposal 所属线索的 `task`（原始任务，可能为快照）与 `origin`（据此判定 task 是否后补建）

### Requirement: linkTaskSession 便利写入 API

系统 SHALL 在 `services/lineage`（`src/main/services/lineage/lineage-service.ts`）暴露便利写入 API `linkTaskSession(projectPath, taskRef, sessionId)`，其内部 SHALL 组合现有的 `ensureTaskSubject`（以 taskRef 命中/新建 subject）与 `linkSession`（把 sessionId 关联到该 subject）两步，使调用方仅凭 `taskRef` 与 `sessionId` 即可一次完成"建/复用 task subject 并挂上 session 边"。

该 API SHALL 全程幂等：对同一 `(taskRef, sessionId)` 重复调用 SHALL NOT 产生重复 link 条目，Subject 状态保持一致；与第①步预先调用的 `ensureTaskSubject` 重复 ensure 同一 ref SHALL 无副作用（复用既有 subject）。

`linkTaskSession` 内部调用 `ensureTaskSubject` 时，若调用方未提供完整快照而仅有 `taskRef`，系统 SHALL 复用既有 subject 的 task 快照（命中既有 subject 时不要求重新提供 snapshot）。本 API 的设计前提是：task subject 已由发起讨论的第①步 `ensureTaskSubject(携带完整 LineageTaskSnapshot)` 创建，`linkTaskSession` 在 createSession handler 阶段仅负责挂边。

#### Scenario: linkTaskSession 一次完成建/复用与挂边

- **WHEN** 对一个已由 `ensureTaskSubject` 创建 subject 的 `taskRef` 调用 `linkTaskSession(projectPath, taskRef, sessionId)`
- **THEN** 系统经 `index.tasks` 以 ref 命中既有 subjectId，复用该 Subject
- **AND** 在该 Subject 的 `links` 中追加 `sessionId` 对应的 `LineageSessionLink`
- **AND** 在 `index.sessions` 登记 `sessionId → subjectId`

#### Scenario: linkTaskSession 幂等

- **WHEN** 对同一 `(taskRef, sessionId)` 重复调用 `linkTaskSession`
- **THEN** 结果不产生重复 link 条目
- **AND** Subject 状态保持一致

#### Scenario: ensureTaskSubject 与 linkTaskSession 组合不冲突

- **WHEN** 先以完整快照调用 `ensureTaskSubject(taskRef)`，随后调用 `linkTaskSession(taskRef, sessionId)`
- **THEN** 两次操作命中同一 subjectId
- **AND** 该 subject 同时保有原始 task 快照与新挂的 session 边
