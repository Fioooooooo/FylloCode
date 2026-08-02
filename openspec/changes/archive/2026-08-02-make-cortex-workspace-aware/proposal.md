## Why

Workspace v2 已经把运行上下文拆成 Workspace-owned 数据与 repository-owned Folder，但 `fyllo-cortex` 和 lineage 仍依赖“唯一项目根目录”与 Workspace 内单值 proposal/commit 索引；在 Collection Workspace 或多个 Workspace 共享同一 Folder 时，这会造成 guidelines owner 不明确、knowledge anchor 验证落错仓库，以及 proposal/commit 来源被后续 Workspace 覆盖。

## What Changes

- 让 `fyllo-cortex guidelines` 使用显式 `folderId` 选择 repository owner，保持 `path` 仅表示 repository-relative guideline 路径；Chat reminder 按 Session 授权 Folder 分组注入 guideline index，Apply/Archive 仍只注入已固定 proposal owner worktree 的 guidelines。
- 保持 knowledge 文件严格归当前 Workspace 的 `workspaceDataDir/knowledge` 所有，并让 file/package anchor 与 commit/lineage source 使用 Folder-qualified repository identity；URL anchor 与 Session source 继续不需要 Folder。
- 将 lineage 拆为 Workspace subject/index 与 Folder-owned repository reverse index v2：proposal/commit 各保留最多一个 `origin`，允许多个幂等 `reference`，并以完整 read-modify-write 排他事务和原子 rename 防止并发丢失。
- 将 `fyllo-cortex lineage` 的 proposal/commit/file trace 全部改为显式 `folderId`；`trace-file` 可选 `worktreePath`，但只能使用 owner Folder main 或 registered linked worktree，并返回实际解析的 target。
- 增加兼容迁移：为只有唯一可证明 Folder 的 legacy knowledge file/package anchor 与 commit source补齐owner，并将能够由现有`folderId`证明owner的lineage v1 proposal/commit迁入v2；无法证明时保留原数据并报告warning，不通过primary/path猜测。
- 让 Lineage Browser 继续只读取当前 Workspace subjects，并使用 `ProposalRef` 补充/打开 proposal；repository reverse index 只提供 origin/reference 关系，不授权读取其他 Workspace 的 task/session 内容。

## Capabilities

### New Capabilities

- `fyllo-cortex-guidelines`: 定义 Cortex guidelines tool 的 Folder owner 选择、repository-relative path 约束与多 Folder reminder 投影。
- `repository-lineage`: 定义 Folder-owned reverse index v2、origin/reference 语义、并发 mutation、迁移和 owner-qualified trace 行为。

### Modified Capabilities

- `fyllo-cortex-knowledge`: 将 knowledge 根目录明确为 Workspace-owned，并为 repository file/package anchors 与 commit/lineage sources 增加 Folder owner 及验证规则。
- `lineage-browser`: 将 browser 数据明确绑定当前 Workspace subjects，以 ProposalRef 补充和打开 repository proposal，并禁止 reverse index 越权读取其他 Workspace subject 内容。
- `mcp-workspace-authorization`: 明确 Cortex repository 操作必须使用 descriptor Folder selector 和 shared worktree validator，而 Workspace knowledge 继续只使用 descriptor 的 Workspace data scope。

## Impact

- Shared contracts：`src/shared/types/{knowledge,lineage}.ts` 及对应 schema/serialization。
- Cortex MCP：`src/mcp-servers/fyllo-cortex/src/tools/{guidelines,knowledge,lineage}.ts`、`utils/{knowledge,lineage-reader,project-root}.ts`、tool instructions 与 README。
- Main/infra：system reminder guideline/knowledge providers、lineage domain/service/store/event consumer、Folder data path，以及 lineage v1→v2 migration。
- Renderer/IPC：Lineage Browser 的 ProposalRef detail 入口与 owner 展示所需的既有 contract 调整；不包含 specs/guidelines/overview 聚合页面，该范围由后续 `aggregate-workspace-folder-features` 承接。
- 测试：Cortex owner/anchor/trace、repository reverse index 并发与迁移、reminder grouping、Lineage Browser Workspace 隔离和同名 proposal owner。
