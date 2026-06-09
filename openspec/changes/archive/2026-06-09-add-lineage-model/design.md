## Context

FylloCode 主进程遵循 `bootstrap -> ipc -> services -> domain/infra` 单向依赖（`guidelines/MainProcess.md`，由 `eslint.config.mjs` 的 `no-restricted-imports` 强制）。文件读写归 `infra/storage`，纯逻辑归 `domain`，对外编排归 `services`。

当前三个实体的关联现状（已核对代码）：

- `TaskItem`（`src/shared/types/task.ts:47`）：有 `proposalId?: string`，单向单值。`source: TaskSource = "local" | "yunxiao" | "github"` 表达"任务来自哪个系统"。
- `SessionMeta`（`src/main/infra/storage/session-store.ts:10`）：无任何 task/proposal 引用字段。
- `ProposalMeta`（`src/shared/types/proposal.ts:5`）：无任何 session/task 引用字段。

约束（来自讨论共识）：

1. 来源不混杂——一旦从任务发起讨论，session 即与该 task 关联，起源固定为 task；chat 直发则起源为 chat，可不创建 proposal，一旦创建 proposal 即补建一个本地 task。
2. 不需要 proposal→执行task 的双向边。一个 session 即便创建多个 proposal，最终都归到同一个 task。查询"proposal 来自哪个 task"只需 `changeId → index.proposals → subjectId → subject.task`。
3. 第三方任务（yunxiao/github）当前只拉取已开启状态、不做本地持久化。任务关闭或过滤后将从可见集合消失，因此 lineage 必须存全量 task 快照，否则源头信息丢失、lineage 链断裂。
4. 每个 subject 恒定最多 1 个 task；`index` 是跨 subject 的全局登记表，每个 task key 不重复。单数主体与多键索引在不同维度，不冲突。

## Goals / Non-Goals

**Goals:**

- 定义 Subject/Index 持久化结构与共享类型。
- 交付主进程 lineage 三层基础能力：infra 读写、domain 纯逻辑、service 编排 API。
- service API 覆盖讨论中确认的两张关联拓扑与四个查询需求，供未来链路功能直接调用。

**Non-Goals:**

- 不实现链路接入（从任务发起讨论的自动关联、chat 直发补建任务）——那是调用方，属后续 change。
- 不新增 IPC channel、不做渲染层查询 UI。
- 不修改 `TaskItem` / `SessionMeta` / `ProposalMeta` 现有结构与行为。

## Decisions

### D1. 引入 Subject 聚合根，而非把关系散写进三个实体

**选择**：新增 `Subject` 作为"原始需求线索"聚合根，关系集中存于 `lineage/`。
**理由**：chat 直发场景下 task 尚不存在，关系无处挂载；散写还会让三个实体互相引用、各自维护一致性。聚合根把"一条线索的全部关系"收敛到单一权威文件。
**备选**：扩展 `TaskItem`（`proposalId` 改列表 + 加 `sessionIds`）。否决——无法表达 chat 直发未建 task 的过渡态，且把 lineage 职责耦合进 task 实体。

### D2. `origin` 命名与不变量

**选择**：起源字段命名 `origin: "task" | "chat"`，**创建后永不翻转**。chat 起源补建 task 后 `origin` 仍为 `chat`。
**理由**：(1) 避免与 `TaskItem.source` 撞名撞义——后者表达"任务来自哪个系统"，是不同维度。(2) `origin` 天然带"起源、不可变"语义，是查询"是否后补建 task"的判定依据（`origin=chat` 即后补）。

### D3. `Subject.task` 存全量快照且可空

**选择**：`task: LineageTaskSnapshot | null`。快照含 `ref`（反查键）、`snapshot`（全量 `TaskItem`）、`capturedAt`（ISO，标记快照新鲜度）。chat 起源在 proposal 创建前为 `null`，补建后回填。统一全量快照，不按来源区分（local task 也存快照）。
**理由**：第三方任务无本地持久化（约束3），关闭后只能靠快照保留源头。统一快照避免读取方按来源分支处理；lineage 语义本就是"记录当时发生了什么"，快照与之契合。单机场景冗余成本可忽略。
**备选**：仅存 `ref` 引用，回 task store 取最新。否决——第三方任务回查会得到空，lineage 链断在源头。

### D4. Index 是可重建派生物，subjects 是权威源

**选择**：`subjects/*.json` 为权威源；`index.json` 为派生反查索引。新增 `rebuildIndex(projectPath)` 扫描 subjects 目录重建。读 index 失败时自动 rebuild（类比缓存文件自愈路径）。
**理由**：index 在写路径有真实价值——"从同一 task 二次发起讨论"需先查 subject 是否存在，靠 `index.tasks` 做 O(1) 命中。但双写有漂移风险，故定权威/派生纪律。因 index 可重建，其格式变更**无需迁移脚本**（`guidelines/DataModel.md:48` 缓存类自愈惯例）；仅 subject schema 不兼容变更才需迁移。

### D5. ID 生成走 `infra/ids`，不引入 nanoid

**选择**：`infra/ids/index.ts` 新增 `newSubjectId(): string`，返回 `subject-${Date.now()}`，与现有 `newSessionId`/`newRunId` 风格一致。
**理由**：项目当前**无 nanoid 依赖**（已核对 package.json），且 `infra/ids` 注释明确要求"所有持久化业务对象 ID 经此创建以便集中演进"。方案讨论稿写的 `nanoid(10)` 是草稿用词，落地应对齐既有约定，不为单一字段引入新依赖。

### D6. 持久化可靠性复刻 session-store 已验证模式

**选择**：subject 文件与 `index.json` 各自走 per-file 写锁队列（照搬 `session-store.ts:135` 的 `withWriteLock`）；写入用 tmp+rename 原子写（`session-store.ts:160`）；读取按 `task-store` 的 `normalizeXxx` 风格防御性解析，坏文件跳过不抛错。
**理由**：二次发起、proposal 并发记录会触发对同一 subject/index 的并发写，写锁杜绝脏写；这些模式在 session-store/task-store 已被测试覆盖，复用而非重新发明。

### D7. service API 形态（未来链路调用入口）

写入钩子（幂等）：

| API                                                  | 链路接入点            | 拓扑                                             |
| ---------------------------------------------------- | --------------------- | ------------------------------------------------ |
| `ensureTaskSubject(projectPath, taskSnapshot)`       | 从 task 发起讨论      | 图1起点；查 `index.tasks` 命中即复用             |
| `ensureChatSubject(projectPath, sessionId)`          | chat 直发首条消息     | 图2起点；`origin:chat, task:null`                |
| `linkSession(projectPath, sessionId, subjectId)`     | 会话归属确立          | 写 index.sessions + subject.links                |
| `recordProposal(projectPath, sessionId, changeId)`   | proposal 创建成功     | 经 session 反查 subject 后追加                   |
| `backfillTask(projectPath, subjectId, taskSnapshot)` | chat 起源补建本地任务 | 图2 proposal→task；回填同一 subject，origin 不变 |

查询投影：`getByTask` / `getBySession` / `getByProposal`，经 index 反查 subject 后用 domain 投影函数产出。

写入侧统一内部流程：`读 index → 读/建 subject → domain 纯函数变换 → 写 subject → 派生并写 index`，全程在 infra 写锁内。

## Risks / Trade-offs

- [快照陈旧] Subject.task 快照可能与 task store 当前值不一致 → `capturedAt` 标记新鲜度；查询投影文档注明快照语义，消费方需要最新值时回 task store 按 ref 取。
- [index 与 subjects 漂移] 双写不一致 → 权威/派生纪律 + 读失败自愈重建 + `rebuildIndex` 兜底。
- [并发写 index] 二次发起并发 → per-file 写锁串行化。
- [Subject 边际价值仅在过渡态] chat 起源终态会补建 task → 接受，因为过渡态的关系无处挂载是真实缺口，且统一模型简化调用方。

## Migration Plan

无数据迁移：纯新增资源，旧项目首次读 lineage 返回空。index 读失败走 `rebuildIndex` 自愈。回滚 = 删除 `lineage/` 目录，不影响 task/session/proposal 现有数据。

## Open Questions

- 无阻塞性未决项。链路接入点的精确触发时机（如 `linkSession` 由 createSession 还是首条消息调用）留待调用方 change 决定，本 change 只保证 API 幂等可被任意时机安全调用。
