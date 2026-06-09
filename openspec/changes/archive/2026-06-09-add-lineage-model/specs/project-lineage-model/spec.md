## ADDED Requirements

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

Subject SHALL 表示一条原始需求线索，结构包含：`id`（经 `infra/ids` 的 `newSubjectId()` 生成）、`origin`、`task`、`links`、`createdAt`、`updatedAt`。`links` SHALL 是 `LineageSessionLink` 列表，每个 link 含 `sessionId`、`createdAt` 与 `proposals`（`LineageProposalLink` 列表，每项含 `changeId`、`createdAt`）。该结构 SHALL 表达"一条线索下多个 session、每个 session 产出多个 proposal"的层级关系。每个 Subject SHALL 最多关联一个 task。

#### Scenario: 一个 session 拆出多个 proposal

- **WHEN** 某 session 在同一线索下产出 changeId 为 `c1` 与 `c2` 的两个 proposal
- **THEN** 该 session 对应的 link 的 `proposals` 列表同时包含 `c1` 与 `c2`

#### Scenario: 一条线索下多次讨论

- **WHEN** 同一线索发起了两次 session
- **THEN** Subject 的 `links` 列表包含两个 `LineageSessionLink` 项

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

`index.json`（`LineageIndex`）SHALL 包含 `version`、`tasks`（`<ref> → subjectId`）、`sessions`（`sessionId → subjectId`）、`proposals`（`changeId → subjectId`）与 `updatedAt`。`subjects/*.json` SHALL 为权威源，`index.json` SHALL 为可重建派生物。系统 SHALL 提供 `rebuildIndex(projectPath)` 扫描 subjects 目录重建索引。当读取 `index.json` 失败或缺失时，系统 SHALL 自动触发重建而非抛错。因 index 可重建，其格式变更 SHALL NOT 需要迁移脚本。

#### Scenario: index 缺失时自愈

- **WHEN** `index.json` 不存在但 `subjects/` 目录有有效文件
- **AND** 系统执行一次 lineage 查询
- **THEN** 系统从 subjects 重建 index 并返回正确结果

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

系统 SHALL 在 `services/lineage` 暴露幂等写入 API：`ensureTaskSubject`（task 起源建/复用线索）、`ensureChatSubject`（chat 起源建线索）、`linkSession`（关联 session 到 subject）、`recordProposal`（经 session 反查 subject 后追加 proposal）、`backfillTask`（chat 起源补建任务后回填 task）。这些 API SHALL 可在任意时机被安全重复调用。

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
