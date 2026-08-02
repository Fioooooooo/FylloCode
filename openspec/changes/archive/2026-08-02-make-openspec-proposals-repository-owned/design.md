## Context

当前 proposal 的公共身份仍是裸 `changeId`。`fyllo-specs` tools 由 caller 传 `targetPath`，运行期再从 main/linked workspace 中按名称选 change；Main proposal reader、watcher、apply/archive IPC 和 renderer store 也主要以 `workspaceId + changeId` 为 key。Workspace v2 允许 1–16 个 Folder 后，不同 repository 可以合法拥有同名 change，caller absolute path 也不再是可信 owner selector。

前序 `add-multi-root-mcp-workspace` 已提供不可变 `McpWorkspaceDescriptorV2`、`resolveFolder()` / `resolveSingleFolder()` / `validateWorktree()` 和 apply/archive owner-only activation。当前提案在该授权边界内建立 repository-owned proposal identity，并把 target 解析结果冻结到 run，而不重新设计 Workspace/Folder registry、MCP transport 或 lineage v2。

## Goals / Non-Goals

**Goals:**

- 让 `ProposalRef { folderId, changeId }` 成为 tools、Main IPC、run、watcher 和 renderer 的完整 proposal identity。
- 让所有 filesystem/git 操作从授权 Folder 解析 `ResolvedProposalTarget`，而不是信任 caller absolute path。
- 在同一 Folder 内确定性处理 main/linked 重名，在跨 Folder 聚合时保留同名 proposal。
- 让 apply/archive 从 run 创建到归档始终固定同一 `folderId + worktreePath`。
- 对 partial scan、owner 歧义、重复 create、target stale 提供结构化且不猜测的失败结果。

**Non-Goals:**

- 不实现 Cortex guidelines/knowledge/lineage v2；由 `make-cortex-workspace-aware` 承接。
- 不统一 Overview/specs/guidelines/tasks/workflows/integrations 的 aggregate envelope；由 `aggregate-workspace-folder-features` 承接。
- 不改变 linked worktree 的目录或 branch 约定，也不引入非 Git proposal owner。
- 不为历史缺失 `folderId` 的 apply/archive run 猜测 owner；历史内容可读，不能安全恢复时明确失败。

## Decisions

### 1. 身份与执行位置分离

在 `src/shared/types/proposal.ts` 定义 `ProposalRef`、`ProposalWorktreeMode` 和 `ResolvedProposalTarget`。所有持久 identity、IPC selector、Vue key 和 watcher key 使用 `folderId + changeId`；`worktreePath` 只存在于可信 resolver 输出和 run snapshot。

选择该结构而不是把 `worktreePath` 放进 identity，是因为 worktree 可以创建、移除或重注册，而同一 repository 中的 proposal owner 不应随执行位置变化。也不使用复合字符串 ID，避免序列化分隔符和局部拆解重新引入歧义。

### 2. MCP tools 从 descriptor 选择 owner

`create-proposal` 输入改为 `{ folderId?, changeName, worktreeMode? }`，`explore` 改为 `{ folderId?, changeName? }`，`apply-change` / `archive-change` 改为 `{ folderId, changeName, ... }`。单 Folder descriptor 下 create 可以省略 owner；multi-root create 必须显式提供 `folderId`。explore 省略 owner 表示扫描 descriptor allowlist 中所有 Folder。

现有 `targetPath`、`workspaceMode` 和 success state 中的 `projectRoot/workspacePath/workspaceMode` 被移除。`worktreeMode` 只影响 create，agent 读取 artifact 时一律使用返回的 `ResolvedProposalTarget.worktreePath`。

### 3. 每个 Folder repository 独立解析 target

新增 proposal target resolver，复用 descriptor `resolveFolder()` 与 `validateWorktree()`，并通过 `git worktree list --porcelain` 只枚举 owner repository 的 main/registered linked worktrees。解析规则为：

1. 先校验 owner Folder 和 Git repository；
2. 收集实际包含 `openspec/changes/<changeId>` 的 main 与 linked candidates；
3. 有 linked candidate 时忽略 main；唯一 linked 返回 linked，多个 linked 返回 `PROPOSAL_LOCATION_AMBIGUOUS`；
4. 无 linked 且 main 匹配时返回 main；没有匹配时返回 `PROPOSAL_NOT_FOUND`。

该规则保留现有 linked-preferred 行为，但把多 linked 情况从依赖枚举顺序改成显式错误。resolver 返回 typed error code/details，tools 和 Main service 分别映射到结构化 tool state与 IPC error。

### 4. Create 先查重，再准备 target

create 在任何写操作前解析同一 ProposalRef。已存在时返回 `PROPOSAL_ALREADY_EXISTS` 和 existing target，不调用 `createChange()`、不覆盖 metadata、不写 MCP event。不存在时才按 `worktreeMode` 在 owner Folder root 或 `<folderPath>/.worktrees/<changeName>` 创建，并回传 resolved target。

如果 linked 目录已存在，必须先验证它是 owner repository 的 registered worktree；不能因目录名碰巧相同就复用。新建成功事件改为携带 `proposalRef`、`worktreeMode`、`worktreePath`，Main consumer 验证 Folder owner和 target 后再记录来源。

### 5. Explore 区分列表降级与 owner 证明

explore 对 descriptor Folder 并行执行 repository scan。每个 active item包含 owner Folder 展示字段和完整 target；同一 Folder 内按 ProposalRef 去重，跨 Folder不按 `changeId` 去重。扫描失败转换为 `{ folderId, code, message }` warning，成功结果仍返回。

`currentChange` 有 `folderId` 时只解析该 Folder。省略时，只有所有目标 Folder 扫描成功且恰好一个 ProposalRef 匹配才返回；多个匹配返回 `PROPOSAL_OWNER_AMBIGUOUS` 和 candidates，任何扫描失败返回 `PROPOSAL_OWNER_UNVERIFIED`。列表 partial success与授权 owner 决策由此保持不同严格度。

### 6. Main lifecycle 固定 run target

Main proposal reader 以 Workspace resolver 的 available Folder 列表为边界，为 metadata补充 `proposalRef`、`folderName`、`worktreeMode/worktreePath`。browser list保留跨 Folder同名项，detail/spec delta/watch/apply/archive IPC 均显式传 `folderId + changeId`。

`ApplyRunMeta` 和 `ArchiveRunMeta` 持久化完整 `proposalRef` 与固定 `worktreePath`。create run 时解析一次 target；stage/archive 开始前用 Workspace repository target validation检查 Folder仍是成员、worktree仍注册且 change仍在该 target。失败不调用重新发现逻辑。watcher key包含 Workspace + ProposalRef，事件 payload也携带 ProposalRef，防止同名 proposal互相覆盖或取消订阅。

### 7. Renderer 保留页面结构，只升级 identity

proposal list仍是完整列表与现有 slideover，不新建路由。store、API、slideover selection、apply/archive run comparison和 `v-for` key改为 ProposalRef；卡片/详情展示 owner Folder name，并继续用 `ProposalWorktreeBadge` 展示 linked target。Folder filter和统一 aggregate UI留给后续提案。

## Risks / Trade-offs

- [改动同时跨 MCP、Main、preload 和 renderer，类型迁移面较大] → 先落 shared types/resolver，再依次迁移 MCP、Main IPC、renderer；每组完成后运行对应 focused tests 和 typecheck。
- [旧 run.json 没有 folderId，无法安全恢复] → loader保留解析能力但标记 owner unavailable；继续 stage/archive返回明确错误，不从 Workspace primary或 changeId猜测。
- [外部 git 操作可在 run 期间移除 worktree] → 每次 stage/archive activation前验证冻结 target，失败即停止，不自动重选。
- [按 Folder 并行扫描会增加 git/OpenSpec 调用] → descriptor最多16个 Folder；每个 Folder内部一次枚举并并行，当前提案不引入缓存，以免缓存放大 stale authorization。
- [Main browser聚合与后续通用 aggregate reader有临时重复] → 当前只实现 proposal专用结果和 warning；后续提案可迁移到统一 envelope，但不得改变 ProposalRef语义。

## Migration Plan

1. 增加 shared proposal identity/target types、schemas与 resolver tests。
2. 迁移 fyllo-specs create/explore/apply/archive contracts和事件。
3. 迁移 Main reader/browser/watcher/IPC/run meta，拒绝无 owner 的可执行旧 run。
4. 迁移 preload/renderer API、store和页面 identity/display。
5. 更新 reference §23 owner条目为 OpenSpec追踪，并运行 focused tests、`pnpm typecheck`、`pnpm lint` 与格式检查；不执行完整 build或启动 dev。

归档会同步新/修改 spec。若需要回滚，恢复旧工具和IPC schema前必须同时恢复旧调用方；已写入的新 run meta可被旧版本忽略，但不得被旧版本用于继续运行。

## Open Questions

无。owner选择、linked优先、partial failure、run冻结和提案拆分边界均已在 multi-root参考设计中收敛。
