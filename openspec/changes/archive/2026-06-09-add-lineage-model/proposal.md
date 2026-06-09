## Why

FylloCode 的研发主线是 `Task -> Proposal -> Apply -> Archive`，但当前 Task、Session、Proposal 三个实体之间没有持久化的关联：`SessionMeta` 与 `ProposalMeta` 都不记录自己从哪来，`TaskItem.proposalId` 只是单向单值引用。`task-chat-bridge` 的"发起讨论"仅把任务内容拼进 prompt 创建会话，并未把 session 关联回 task。这导致 FylloCode 无法回答"某任务产出了哪些讨论与方案""某方案来自哪次讨论、对应哪个原始任务"等回溯问题。

链路接入功能（从任务发起讨论自动关联、chat 直发后补建任务）即将实现，需要先把 lineage 数据模型与主进程基础能力 API 定稿，避免后续接入时返工。

## What Changes

- 新增项目级 lineage 持久化资源，落在 `projects/<encodedProjectId>/lineage/`：`subjects/<subjectId>.json`（权威源）与 `index.json`（可重建派生索引）。
- 新增共享类型 `src/shared/types/lineage.ts`：`Subject`、`LineageSessionLink`、`LineageProposalLink`、`LineageTaskSnapshot`、`LineageIndex`、`LineageOrigin`。
- 引入 `Subject` 聚合根，表示一条"原始需求线索"，串联其下的 session 与各 session 产出的 proposal。
- 新增主进程三层基础能力（遵循 `bootstrap -> ipc -> services -> domain/infra` 分层）：
  - `infra/storage/lineage-store.ts`：subject 与 index 的读写、写锁、原子写、normalize 容错。
  - `domain/lineage/`：纯函数 subject 构建/合并/索引派生/查询投影，可离线单测。
  - `services/lineage/`：对外编排 API，作为未来链路功能的唯一调用入口。
- 不新增 IPC channel：本 change 只交付主进程基础能力，链路接入（调用方）与渲染层查询为后续 change。

本 change 仅新增、不修改现有实体的行为契约，无 **BREAKING** 变更；`TaskItem.proposalId` 保持原样。

## Capabilities

### New Capabilities

- `project-lineage-model`: 定义 Subject/Index 持久化结构、起源(origin)不变量、task 快照语义、session→proposals 关联结构，以及主进程 lineage 基础能力 API（写入钩子与查询投影）的行为契约。

### Modified Capabilities

<!-- 无：本 change 不改变 task/session/proposal 现有 spec 的任何 SHALL 条款 -->

## Impact

- 新增代码：`src/shared/types/lineage.ts`、`src/main/infra/storage/lineage-store.ts`、`src/main/domain/lineage/**`、`src/main/services/lineage/**`，及对应 `test/` 镜像测试。
- 修改：`src/main/infra/storage/project-paths.ts` 新增 `lineageDir`/`subjectsDir` 路径函数；`src/main/infra/ids/index.ts` 新增 `newSubjectId()`。
- 持久化：新增 `lineage/` 目录布局，需在 `guidelines/DataModel.md` 补充结构描述。index 为可重建派生物（读失败自愈），无需迁移脚本；subject schema 后续不兼容变更才需迁移。
- 依赖：复用现有 `nanoid`（若已有）或 `infra/ids` 约定，不引入新外部依赖。
