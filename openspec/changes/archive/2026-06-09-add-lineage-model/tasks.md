## 1. 共享类型

- [x] 1.1 创建 `src/shared/types/lineage.ts`，定义并导出：`LineageOrigin = "task" | "chat"`；`LineageTaskRef`（模板字面量 `${TaskSource}:${string}`，从 `@shared/types/task` 引入 `TaskSource`）；`LineageTaskSnapshot { ref; snapshot: TaskItem; capturedAt: string }`；`LineageProposalLink { changeId: string; createdAt: string }`；`LineageSessionLink { sessionId: string; createdAt: string; proposals: LineageProposalLink[] }`；`Subject { id: string; origin: LineageOrigin; task: LineageTaskSnapshot | null; links: LineageSessionLink[]; createdAt: string; updatedAt: string }`；`LineageIndex { version: 1; tasks: Record<string, string>; sessions: Record<string, string>; proposals: Record<string, string>; updatedAt: string }`。验收：`pnpm typecheck` 通过，类型从 `src/shared/types/index.ts` 导出（若该文件做 barrel 导出）。

## 2. 基础设施（infra）

- [x] 2.1 在 `src/main/infra/ids/index.ts` 新增 `newSubjectId(): string`，返回 `subject-${Date.now()}`，与现有 `newSessionId`/`newRunId` 风格一致。验收：函数导出且返回字符串以 `subject-` 开头。
- [x] 2.2 在 `src/main/infra/storage/project-paths.ts` 新增 `lineageDir(projectPath)` 返回 `join(projectDir(projectPath), "lineage")`，`subjectsDir(projectPath)` 返回 `join(lineageDir(projectPath), "subjects")`。复用现有 `projectDir`。验收：路径函数导出，无手写 `getDataSubPath` 直拼。
- [x] 2.3 创建 `src/main/infra/storage/lineage-store.ts`，复刻 `session-store.ts` 的可靠性模式实现纯 IO：`readSubject(projectPath, subjectId): Promise<Subject | null>`、`writeSubject(projectPath, subject)`、`listSubjects(projectPath): Promise<Subject[]>`、`readIndex(projectPath): Promise<LineageIndex | null>`、`writeIndex(projectPath, index)`。要求：(a) 每个 subject 文件与 `index.json` 各自走 per-file 写锁队列，照搬 `session-store.ts:135` 的 `withSessionMetaWriteLock` 写法；(b) tmp+rename 原子写，照搬 `session-store.ts:160` 的 `writeSessionMetaFile`；(c) 读取做防御性 `normalize`，损坏文件返回 null/跳过，参照 `task-store.ts` 的 `normalizeXxx`。`indexPath` 指向 `lineage/index.json`。验收：单测覆盖并发写串行化、原子写、损坏文件跳过。

## 3. 领域纯逻辑（domain）

- [x] 3.1 创建 `src/main/domain/lineage/subject.ts`，导出纯函数（不依赖 fs/Electron，可离线单测）：`buildSubject(origin, task, now): Subject`、`upsertSessionLink(subject, sessionId, now): Subject`（已存在则幂等返回原值）、`appendProposal(subject, sessionId, changeId, now): Subject`（追加到对应 session link 的 proposals，重复 changeId 幂等）、`attachTask(subject, taskSnapshot): Subject`（回填 task，origin 不变）。`now` 由调用方传入 ISO 字符串以保持可测。验收：单测覆盖幂等、origin 不翻转、多 session/多 proposal 结构。
- [x] 3.2 创建 `src/main/domain/lineage/index-derive.ts`，导出 `deriveIndexEntries(subject): { tasks: Record<string,string>; sessions: Record<string,string>; proposals: Record<string,string> }` 与 `buildIndexFromSubjects(subjects: Subject[]): LineageIndex`。验收：单测验证从一组 subject 重建 index 的正确性，含 task=null 的 subject 不产生 tasks 项。
- [x] 3.3 创建 `src/main/domain/lineage/projection.ts`，导出查询投影纯函数：`projectTaskDownstream(subject)`、`projectSessionLineage(subject, sessionId)`、`projectProposalOrigin(subject, changeId)`，分别对应"task→下游""session→上游+产出""proposal→原始任务+origin"。验收：单测覆盖三种投影输出形状。

## 4. 服务编排（services）

- [x] 4.1 创建 `src/main/services/lineage/lineage-service.ts`，实现写入 API：`ensureTaskSubject(projectPath, taskSnapshot)`（先 `readIndex` 经 `tasks[ref]` 命中则复用，否则 `buildSubject("task", ...)` + `writeSubject` + 更新 index）、`ensureChatSubject(projectPath, sessionId)`（`buildSubject("chat", null)`）、`linkSession(projectPath, sessionId, subjectId)`、`recordProposal(projectPath, sessionId, changeId)`（经 `index.sessions` 反查 subjectId 后 `appendProposal`）、`backfillTask(projectPath, subjectId, taskSnapshot)`。统一内部流程：读 index → 读/建 subject → domain 变换 → writeSubject → 派生写 index，全程在 infra 写锁内。验收：单测覆盖幂等、二次发起命中、recordProposal 反查、backfill 后 origin 不变。
- [x] 4.2 在 `lineage-service.ts` 实现查询 API：`getByTask(projectPath, ref)`、`getBySession(projectPath, sessionId)`、`getByProposal(projectPath, changeId)`，经 `readIndex` 反查 subjectId（缺失/失败时调用 `rebuildIndex` 自愈）→ `readSubject` → 调用 domain 投影函数。验收：单测覆盖三个查询及 index 缺失自愈路径。
- [x] 4.3 实现 `rebuildIndex(projectPath)`：`listSubjects` → `buildIndexFromSubjects` → `writeIndex`。在 `readIndex` 返回 null 时由查询路径调用。验收：单测验证从 subjects 目录重建 index，且损坏 subject 文件被跳过。

## 5. 测试

- [x] 5.1 创建 `test/main/infra/storage/lineage-store.spec.ts`，覆盖任务 2.3 验收点。
- [x] 5.2 创建 `test/main/domain/lineage/*.spec.ts`，覆盖任务 3.1–3.3 验收点（纯函数离线单测）。
- [x] 5.3 创建 `test/main/services/lineage/lineage-service.spec.ts`，覆盖任务 4.1–4.3 验收点，含两张关联拓扑（task→多session→多proposal；chat直发→拆proposal→backfill task）与四个查询的端到端验证。

## 6. 文档

- [x] 6.1 更新 `guidelines/DataModel.md`：在持久化结构章节新增 `lineage/` 目录布局描述（`subjects/<subjectId>.json` 权威源、`index.json` 派生自愈、origin 不变量、task 快照语义），并在 Sources of Truth 列入新 spec `project-lineage-model`。说明 index 变更无需迁移脚本、subject schema 不兼容变更才需迁移。
- [x] 6.2 验证全链路：`pnpm typecheck`、`pnpm lint`、`pnpm vitest run test/main/**/*.spec.ts test/shared/**/*.spec.ts` 全部通过。
