## Context

`create-plan` 的输入 schema 是严格的 `{ goal, slug }`，工具说明和 Plan 文件布局都把它定义为 session-scoped。`createPlanTool()` 已使用 descriptor 的 `workspaceDataDir` 与 `sessionId` 生成 `<workspaceDataDir>/sessions/<sessionId>/plans/<fullSlug>.md`，但在写入前仍调用 `resolveSingleFolder()`；`writePlanEvent()` 也为了填充 `McpPlanEvent.folderId` 再次调用该 resolver。multi-root descriptor 无法提供唯一 Folder，且 schema 不允许调用方传入 `folderId`，所以工具在任何文件 IO 前稳定失败。

Folder owner 依赖来自 `mcp-workspace-authorization` 早期切换 Workspace v2 context 时对 proposal/plan event 的统一处理。当前代码已经显示两者语义不同：Proposal 使用 repository-owned `ProposalRef` 与 worktree target，Plan 只通过 Workspace Session lineage 关联；`LineagePlanLink.folderId` 是可选字段，`lineage-store.ts#normalizePlanLink()` 读取时也不会保留它。因此修复需要同时纠正 tool、event、consumer、lineage type 与 OpenSpec requirement，不能只删除入口处的一次 resolver 调用。

约束：

- `create-plan` 继续只接受 `goal` 和不带日期的 kebab-case `slug`，不得新增 `folderId`。
- Plan 文件路径、YAML frontmatter、固定章节、`state.planPath` 与 `plan.create` Action payload 保持不变。
- Proposal 创建、apply/archive、proposal event 与其他 repository-scoped MCP 操作继续要求可证明的 Folder owner。
- MCP event directory 与 Plan storage 都是 Workspace-owned app data；不得从 repository path、primary Folder 或 cwd 推导 namespace。

## Goals / Non-Goals

**Goals:**

- 让 single-root 与 multi-root activation 都能仅凭 `{ goal, slug }` 创建 session-scoped Plan。
- 让 Plan event 与 lineage 明确只携带 Workspace/Session identity，不再产生或消费虚假的 repository owner。
- 保持相同 Workspace/Session 内的 slug 冲突不覆盖文件，并保持不同 Workspace 或 Session 的同名 slug 相互隔离。
- 用 focused tests 固定非法 slug、目录写入错误和 best-effort event 写入的结构化结果。

**Non-Goals:**

- 不允许 Plan 选择、绑定或推断某个 Folder，也不为 Plan 增加跨 repository owner 元数据。
- 不改变 ProposalRef、repository resolver、Workspace descriptor、Plan review/approval UI 或 Plan Markdown schema。
- 不迁移或重写既有 Plan 文档与 lineage subject 文件。
- 不改变 `explore` 对 multi-root Folder 的聚合行为。

## Decisions

### 1. `create-plan` 直接使用 Workspace/Session context，不解析 Folder

从 `src/mcp-servers/fyllo-specs/src/tools/create-plan.ts#createPlanTool` 删除 `resolveSingleFolder()` 前置调用，并让 `writePlanEvent()` 只通过 `resolveWorkspace()` 取得 `workspaceId`。Plan 路径继续由 `getWorkspaceDataDir()`、`requireSessionId()`、`plansDir` 和 `fullSlug` 组成。

选择该方案而不是给 schema 增加 `folderId`，因为 Plan 可以描述跨多个 Folder 的实现工作，其生命周期跟随 Chat Session；强制 Folder 会改变现有 session-scoped 语义，且无法解释跨仓库 Plan 的 owner。

### 2. Proposal event 与 Plan event 按所有权拆分

`src/shared/types/mcp-event.ts#McpPlanEvent` 移除 `folderId`，保留 `workspaceId`、`sessionId`、`planSlug` 与审计时间。`McpProposalEvent` 不变，继续携带完整 `ProposalRef`、worktree mode/path，并由 consumer 做 Folder membership 与 registered worktree 校验。

选择拆分事件契约而不是给 Plan 随意写入 primary Folder，是因为 primary 只是 Workspace 展示/默认顺序，不代表 Plan repository owner；静默选择它会制造错误 lineage，并违反 resolver 的 no-fallback 安全边界。

### 3. Consumer 在识别事件类型后选择校验路径

`src/main/services/insight/lineage/mcp-event-consumer.ts#consumeEventFile` 先执行通用 event shape 与 `workspaceId` 校验，然后分支：

- proposal event：维持 `getRequiredWorkspaceInfo()`、owner membership、`resolveRepositoryTarget()` 与 worktree mode 校验；
- plan event：直接调用 `recordPlan(workspaceId, sessionId, planSlug)`，缺少 subject 时沿用 `ensureChatSubject()` 后重试，不读取或校验 Folder membership。

Plan type guard 不要求 `folderId`。解析仍允许 JSON 含额外字段，使切换前遗留的 Plan event 可被消费，但 consumer 忽略该字段；无需 event migration。

### 4. Lineage Plan link 删除未持久化的 owner 参数

从 `LineagePlanLink`、`appendPlan()` 与 `recordPlan()` 删除可选 `folderId`。`normalizePlanLink()` 当前本就只返回 `slug` 和 `createdAt`，所以磁盘读取行为不变；旧 subject 中的额外 `folderId` 会继续被安全忽略，新写入 subject 不再产生该字段。

选择清理完整传递链而不是仅在 consumer 丢弃 owner，可以防止后续代码误把 Plan 当作 repository-owned object，也让类型契约与实际持久化格式一致。

### 5. 保持现有路径隔离、冲突与错误封装

继续使用 `fs.writeFile(..., { flag: "wx" })`：同一 Workspace/Session、同一天和同一 slug 的第二次创建返回包含 `EEXIST` 的 `runTool()` 结构化错误且不覆盖原文件。Workspace data root 与 Session 子目录保证不同 Workspace/Session 使用相同 slug 时路径不同。`assertAgentSlug()` 继续在 IO 前拒绝非法或带日期前缀的 slug；目录创建/文件写入错误继续由 `runTool()` 转换为 `errors[]`。

事件写入保持 best-effort：Plan 文件成功后，event directory 不存在时创建；event 写入失败时清理临时文件并记录 warning，但不撤销已创建 Plan。这样 lineage sidecar 故障不会破坏用户已经获得的 `state.planPath`。

## Risks / Trade-offs

- [切换前已落盘的 Plan event 含 `folderId`] → type guard 容忍额外字段并忽略 owner，消费后正常删除 event 文件。
- [consumer 分支重构意外放宽 Proposal 校验] → 保留 proposal 专属 membership/worktree 测试，并新增断言 Plan 路径不会调用 repository resolver。
- [Plan 文件成功但 event 写入失败导致暂时缺少 lineage] → 延续既有 best-effort 策略并记录 warning；不以辅助 lineage 可用性阻断 Plan 创建。
- [清理 `LineagePlanLink.folderId` 看似持久化变更] → reader 已经丢弃该字段，不需要 migration；测试覆盖旧额外字段仍可读取且新 subject 不再写入。
- [相同 slug 在同一天重复创建] → 保持 `wx` 明确拒绝和不覆盖语义；调用方可选择新 slug，不引入隐式编号或覆盖行为。

## Migration Plan

1. 先更新 shared event/lineage 类型与 domain/service 签名，使编译器暴露全部 owner 传递点。
2. 修改 `create-plan` writer 与 Main consumer 分支，保持 Proposal 校验路径原样。
3. 更新 focused MCP、lineage domain/service 与 event consumer tests，再同步 README/CHANGELOG。
4. 运行 main-project focused Vitest、Node typecheck、lint 与改动文件 Prettier check。

回滚时可整体还原代码与 spec delta；Plan 文档格式未变化，无需数据回滚。切换期间遗留的带 `folderId` Plan event 仍可由新 consumer 读取。

## Open Questions

无。Plan 继续采用 Workspace/Session scope；不会通过新增 `folderId` 或 primary fallback 改变其产品语义。
