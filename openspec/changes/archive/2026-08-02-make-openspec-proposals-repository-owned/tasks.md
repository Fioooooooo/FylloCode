## 1. Shared proposal identity 与 target resolver

- [x] 1.1 在 `src/shared/types/proposal.ts` 与 `src/shared/ipc/proposal/*.schemas.ts` 定义并贯穿 `ProposalRef`、`ProposalWorktreeMode`、`ResolvedProposalTarget`，把 browser/detail/watch/apply/archive selector 和 run meta 从裸 `changeId` 升级为 Folder-qualified identity；补充 shared/schema 与 preload contract tests，验收为跨进程类型不再用 caller path 或裸 changeId 作为可执行 proposal selector。
- [x] 1.2 在 `src/mcp-servers/fyllo-specs/src/runtime-workspace/` 新增 owner repository proposal target resolver，复用 `resolveFolder()`、`validateWorktree()`、`runGit()` 与 `changeDir()`，实现 linked-preferred、多个 linked 返回 `PROPOSAL_LOCATION_AMBIGUOUS`、非成员/未注册/不存在明确失败；在 `test/mcp-servers/fyllo-specs/` 覆盖 main、唯一 linked、多 linked、非 Git与stale target。

## 2. fyllo-specs tool contract

- [x] 2.1 修改 `src/mcp-servers/fyllo-specs/src/tools/create-proposal.ts` 与 `runtime-workspace/prepare-proposal-workspace.ts`：输入使用 `folderId? + changeName + worktreeMode?`，只在owner Folder创建main/linked target，写入前检查ProposalRef；重复时返回`PROPOSAL_ALREADY_EXISTS + existing target`且无change/event副作用，并更新create instruction与focused tests。
- [x] 2.2 重构 `src/mcp-servers/fyllo-specs/src/runtime-openspec/list-workspace-changes.ts` 和 `tools/explore.ts`：按descriptor Folder并行扫描、返回owner-qualified items和结构化warning、仅在完整扫描且唯一匹配时解析无owner currentChange；覆盖跨Folder同名、显式owner、partial list、`PROPOSAL_OWNER_AMBIGUOUS`与`PROPOSAL_OWNER_UNVERIFIED`测试，并更新explore instruction。
- [x] 2.3 修改 `src/mcp-servers/fyllo-specs/src/tools/apply-change.ts`、`archive-change.ts`、归档finalizer与对应instructions：tool input只接受`folderId + changeName`，每次从ProposalRef解析target并返回`ResolvedProposalTarget`，移除`targetPath/workspacePath/workspaceMode/projectRoot` proposal state；覆盖main/linked成功、ambiguous与stale target不回退测试。
- [x] 2.4 升级 `src/shared/types/mcp-event.ts`、`create-proposal.ts#writeProposalEvent` 和 `src/main/services/insight/lineage/mcp-event-consumer.ts`，让新proposal event携带并验证ProposalRef和resolved target；测试重复create不写event、Workspace/Folder/worktree不匹配被拒绝，plan event现有行为保持。

## 3. Main proposal browser 与 lifecycle

- [x] 3.1 重构 `src/main/infra/proposal/openspec-reader.ts` 与 `src/main/services/proposal/browser/{proposal-service,proposal-spec-delta-service,proposal-status-service}.ts`，从resolved Workspace available Folders聚合proposal，保留跨Folder同名项，并让read/detail/spec delta/watch key和status payload使用ProposalRef；扩展reader/browser/status focused tests覆盖owner隔离和单owner移除。
- [x] 3.2 修改 `src/main/services/proposal/runtime/apply-run-service.ts`、`src/main/infra/storage/apply-run-store.ts`、`src/main/ipc/proposal/{apply,archive}.ts`：创建run时解析并持久化ProposalRef与固定worktreePath，每个stage/archive activation前验证同一snapshot，历史无owner run只读且执行失败；IPC tests覆盖secondary owner、固定target消失及MCP descriptor只含owner。

## 4. Preload 与 renderer identity

- [x] 4.1 更新 `src/preload/api/proposal/**`、`src/preload/index.d.ts`、`src/renderer/src/api/proposal/**`、proposal stores/composable/components/page与EventRail integration，使list key、detail selection、watch、apply/archive run comparison全部使用ProposalRef，并展示owner Folder与linked target；renderer/preload focused tests覆盖跨Folder同名项分别打开、更新和取消watch。

## 5. 文档与验证

- [x] 5.1 将 `references/designs/multi-root-workspace/README.md` 中本提案承接的§23 proposal错误/边界条目改为指向`repository-owned-proposals`、`fyllo-specs-explore`、`proposal-browser`等正式spec；通过guidelines维护流程同步`guidelines/MainProcess.md`和`guidelines/RendererProcess.md`中ProposalRef、resolver/run snapshot与renderer identity约定。
- [x] 5.2 运行受影响的main/MCP/preload/renderer focused Vitest、`pnpm typecheck`、`pnpm lint`、Prettier检查与`git diff --check`，修复失败并记录结果；不得执行完整`pnpm build`，不得启动`pnpm dev`。
