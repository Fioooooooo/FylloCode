## Why

Workspace v2 已允许一个窗口授权多个 Folder，但 proposal 生命周期仍以 `changeId` 和 caller 提交的绝对 `targetPath` 定位 repository。跨 Folder 同名 change、linked worktree 重名以及 apply/archive 重启后重新选址都会让 owner 发生歧义，甚至把操作路由到错误 repository。需要先把 proposal 身份、owner 解析和 run target 固定为 repository-owned contract，后续 Cortex 与聚合页面才能安全复用。

## What Changes

- 新增 `ProposalRef { folderId, changeId }` 与 `ResolvedProposalTarget { proposalRef, worktreeMode, worktreePath }`，作为 MCP、Main IPC、run meta、status watcher 与 renderer proposal state 的完整身份和执行位置。
- 将 `create-proposal`、`explore`、`apply-change`、`archive-change` 改为由 activation descriptor 中的 `folderId` 选择 owner；create 的 `workspaceMode` 更名为 `worktreeMode`，apply/archive 移除 caller `targetPath`/`worktreePath`。
- 增加共享 proposal target resolver：只扫描 owner Folder 的 main 与 registered linked worktrees；main 与唯一 linked 同名时 linked 优先，多个 linked 候选明确失败。
- create 在同一 `ProposalRef` 已存在时返回 `PROPOSAL_ALREADY_EXISTS` 和既有 target，不覆盖 change、不写第二个 created event；新事件携带完整 ProposalRef 与 resolved target。
- explore 支持按 Folder 扫描或聚合 descriptor 中全部授权 Folder，跨 Folder 保留同名 proposal，返回结构化 per-Folder warning；省略 owner 的 `currentChange` 只有在所有扫描成功且唯一匹配时才能解析。
- apply run 创建时固定 `folderId + worktreePath`；后续 stage/archive 只复用该 snapshot，并在 target 消失、未注册或不再包含 change 时失败，不回退 main、不另选 worktree。
- Proposal browser、detail、status watcher、apply/archive IPC 与 renderer selection 使用 ProposalRef，展示 owner Folder，并让跨 Folder 同名 proposal 可同时存在和分别打开。
- 将参考设计 §23 中由本提案承接的 proposal lifecycle 验收条目改为指向正式 OpenSpec capability，避免继续维护第二份行为契约。

## Capabilities

### New Capabilities

- `repository-owned-proposals`: 定义 ProposalRef、resolved target、create/apply/archive owner routing、固定 run target、事件身份和失败语义。

### Modified Capabilities

- `fyllo-specs-explore`: 将单 repository workspace 扫描升级为 descriptor Folder 聚合、ProposalRef 去重、结构化 partial warning 与可证明的 currentChange owner resolution，并统一 `worktreePath/worktreeMode` 命名。
- `proposal-browser`: 将 proposal list/detail/status/apply/archive 的身份、选择和展示升级为 Folder-qualified ProposalRef，支持跨 Folder 同名 change。
- `acp-multi-root-session`: 明确 apply/archive run meta 固定 owner Folder 与 worktree target，所有 stage 和 archive activation 复用该 snapshot。
- `mcp-workspace-authorization`: proposal created event 携带 ProposalRef 与 resolved target，并禁止重复 create 产生第二个 event/origin。

## Impact

- MCP：`src/mcp-servers/fyllo-specs/src/tools/**`、`runtime-workspace/**`、`runtime-openspec/**` 与 shared workspace resolver。
- Main/shared：proposal types、IPC schemas/preload API、proposal reader/browser/status services、apply/archive run store 与 handlers、MCP event consumer。
- Renderer：proposal store、list/detail slideover、apply/archive run store/API，以及 owner Folder badge和稳定 key。
- Tests：fyllo-specs tool/runtime、proposal reader/browser/status、apply/archive IPC/run、preload 与 renderer proposal tests；只运行相关 typecheck/lint/format/focused Vitest，不执行完整 `pnpm build`，不启动 dev server。
- 兼容性：这是 public tool/IPC 和持久化 run meta 的 contract 变更；旧的 caller path 参数与 `workspacePath/workspaceMode/projectRoot` proposal state 将从新运行期移除，历史 run 的无 owner 记录只读或明确不可恢复，不猜测 owner。
