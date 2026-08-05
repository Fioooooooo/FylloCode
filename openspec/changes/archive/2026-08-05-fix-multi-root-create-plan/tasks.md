## 1. 收敛 Plan 事件与 lineage 类型

- [x] 1.1 修改 `src/shared/types/mcp-event.ts#McpPlanEvent`，删除 `folderId`，保留 `workspaceId`、`sessionId` 与 `planSlug`；确认 `McpProposalEvent` 的 `ProposalRef`、`worktreeMode` 和 `worktreePath` 不变。
- [x] 1.2 修改 `src/shared/types/lineage.ts#LineagePlanLink`、`src/main/domain/insight/lineage/subject.ts#appendPlan` 与 `src/main/services/insight/lineage/lineage-service.ts#recordPlan`，删除可选 Folder owner 参数；扩展对应 domain/service 或 storage focused tests，证明新 Plan link 只写入 `slug/createdAt`，且既有 subject 中多余的 `folderId` 仍由 `normalizePlanLink()` 安全忽略。

## 2. 修复 create-plan 的 multi-root 执行路径

- [x] 2.1 修改 `src/mcp-servers/fyllo-specs/src/tools/create-plan.ts#createPlanTool` 与 `writePlanEvent`：移除全部 `resolveSingleFolder()` 调用和 import，只从 Workspace descriptor 读取 `workspaceDataDir`、`sessionId`、`workspaceId` 与 event directory；保持 `planSkeleton()`、日期前缀、`flag: "wx"`、返回 `{ planPath }` 和 best-effort event 写入不变。
- [x] 2.2 重构 `test/mcp-servers/fyllo-specs/workspace-scope.spec.ts` 的 descriptor fixture，使其可注入独立 `workspaceDataDir`、`mcpEventDir` 与 `sessionId`；将当前“multi-root 拒绝 Plan”断言替换为 single-root/multi-root 成功用例，并校验生成文件的 YAML frontmatter、固定章节、可读写 `planPath` 以及不含 `folderId` 的 Plan event。
- [x] 2.3 在 `test/mcp-servers/fyllo-specs/workspace-scope.spec.ts` 增加 Plan 隔离与错误回归：不同 Workspace/Session 相同 slug 生成不同路径；同一 Workspace/Session 同日重复 slug 返回 `EEXIST` 且不覆盖原文件；非法/带日期 slug 在 IO 前返回结构化错误；不可写的 data root 返回结构化文件系统错误；multi-root Folder 为非 Git、缺少 `openspec/changes` 或存在多个 active Proposal 时均不参与 Plan 创建。

## 3. 按事件所有权分流 Main consumer

- [x] 3.1 修改 `src/main/services/insight/lineage/mcp-event-consumer.ts#isMcpPlanEvent` 与 `consumeEventFile`：Plan event 不再要求 `folderId`，在通用 shape/`workspaceId` 校验后直接调用 `recordPlan(workspaceId, sessionId, planSlug)`；仅 Proposal 分支调用 `getRequiredWorkspaceInfo()`、校验 Folder membership 并调用 `resolveRepositoryTarget()`。
- [x] 3.2 更新 `test/main/services/insight/lineage/mcp-event-consumer.spec.ts` 的 `planEvent()` fixture 和断言，覆盖无 `folderId` 的 Plan 正常关联、缺少 subject 时创建并重试、旧 event 额外 `folderId` 被忽略，以及 Plan 消费不调用 Workspace repository resolver；保留并通过 workspace mismatch、unauthorized Proposal Folder、未注册 worktree 和 worktree mode 的现有 Proposal 防回归用例。

## 4. 文档与验证

- [x] 4.1 更新 `src/mcp-servers/fyllo-specs/README.md`，明确 `create-plan` 是不解析 Folder owner 的 Workspace/Session-scoped 特例，而 repository-scoped OpenSpec 操作仍通过 owner-qualified resolver；在 `src/mcp-servers/fyllo-specs/CHANGELOG.md` 的当前未发布版本记录 multi-root Plan 修复与 Plan event 契约收敛。
- [x] 4.2 首次运行项目命令前执行 `sh scripts/prepare-worktree-env.sh`，随后运行 `pnpm exec vitest run --project main test/mcp-servers/fyllo-specs/workspace-scope.spec.ts test/main/services/insight/lineage/mcp-event-consumer.spec.ts test/main/services/insight/lineage/lineage-service.spec.ts`、`pnpm typecheck:node`、`pnpm lint` 与改动文件的 `pnpm exec prettier --check`；修复全部失败。不得在没有用户明确许可时运行 `pnpm build`。
