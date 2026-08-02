## Context

Workspace cutover 已将 subjects、knowledge 和 MCP events 放入 `workspaces/<workspaceId>`，并提供 `folderDataDir(folderId)` 作为 repository reverse data 的归属位置；shared MCP resolver 也已能从不可变 Workspace descriptor 解析 Folder 和 registered worktree。当前 Cortex 仍通过 `resolveProjectRoot()` 要求唯一 root，knowledge file/package anchor 没有 owner，lineage `index.json` 仍以裸 `changeId`/commit hash 映射单个 subject。因此同一 Workspace 的跨 Folder 同名 proposal 会冲突，多个 Workspace 引用同一 repository object 时后写者可能替换来源。

本提案必须在 main worktree 串行交付，并保持 Folder Workspace 的既有单根行为。后续 `aggregate-workspace-folder-features` 才负责 Specs/Guidelines/Overview 等页面的 per-Folder aggregate envelope；本提案只建立 Cortex、reminder 和 lineage 所需的作用域基础。

## Goals / Non-Goals

**Goals:**

- 让 guidelines 与所有 repository evidence 操作显式绑定 descriptor 内的 Folder，并验证可选 worktree。
- 让 knowledge 文档继续严格隔离在当前 Workspace，同时让 repository anchors/sources 可无歧义验证。
- 建立 Workspace subject/index v2 与 Folder repository reverse index v2，支持唯一 origin、多 reference、幂等追加和并发安全。
- 迁移能够证明 owner 的 v1 lineage，无法证明时保留源数据并以 warning 降级，不猜测 primary。
- 让 Cortex trace 返回实际 repository target，并阻止 reverse index 越权读取其他 Workspace 的 subject 内容。

**Non-Goals:**

- 不实现 Specs、Guidelines、Proposal、Overview 页面统一聚合与 Folder filter；由下一提案处理。
- 不迁移 tasks/workflows/integrations 或清理其他 legacy Project storage；由后续提案处理。
- 不改变 URL anchor、Session source 或 knowledge capture/review 的用户流程。
- 不运行完整 `pnpm build`，也不启动 `pnpm dev`。

## Decisions

### 1. Repository selector 与相对路径保持正交

`guidelines` 输入新增 `folderId`；`path` 继续只接受 `guidelines/**/*.md` repository-relative path。`lineage` 三种 mode 均要求 `folderId`，只有 `trace-file` 可选 `worktreePath`。Cortex 直接复用 `src/mcp-servers/shared/workspace-resolver.ts` 的 `resolveFolder()` / `validateWorktree()`，不保留 `resolveProjectRoot()` 的 multi-root unique-owner fallback。

选择显式 selector 而不是在多 Folder 时使用 primary，是因为 primary 是 Workspace 导航偏好，不是 repository object 的所有权证明；选择 `folderId` 与 relative path 分离，是为了避免现有 `path` 同时承担授权和文件定位。

### 2. Reminder 按 activation scope 投影 guidelines

Chat reminder 从已经 stale 校验通过的 `SessionWorkspaceSnapshot.folders` 并行扫描每个 Folder root，输出以 `folderId/folderName/folderPath` 分组的 guideline index和逐 Folder warning。Apply/Archive activation 的 descriptor 和 reminder 已固定为单 owner，provider 使用固定 `worktreePath` 扫描该 target，不重新加入 Workspace 的其他成员。合法空目录产生空分组；扫描失败只影响该 Folder，不丢弃其他分组。

该设计复用 Session snapshot 而不是读取实时 Workspace registry，保证 reminder 与 ACP/MCP 的授权集合一致。

### 3. Knowledge root 与 evidence roots 分开传递

knowledge markdown 永远从 descriptor `workspaceDataDir/knowledge` 读取和写入；scanner 改为接收 `{ workspaceRoot, folders }` evidence context。`file`/`package` anchor 必须有 `folderId`，并只在对应 Folder main root 验证；`commit` source 必须有 `folderId`；`lineage` source使用可选 `folderId`、`proposalRef` 或 Folder-qualified commit。URL anchor 和 Session source 不携带 Folder。

不把 knowledge 按 Folder 拆目录，因为知识属于用户当前 Workspace 的工作上下文；Folder 只限定可验证的 repository evidence。

### 4. Workspace index v2 与 Folder reverse index v2 分担不同查询

`LineageIndex` 升级为 v2：tasks/sessions 仍映射到当前 Workspace subject；proposal 与 commit key 使用 `ProposalRef` / `folderId + commitHash` 的稳定编码，避免同 Workspace 跨 Folder 重名。subjects 仍位于 `workspaces/<workspaceId>/lineage/subjects`。

新增 `RepositoryLineageIndex`，位于 `workspace-folders/<folderId>/lineage/index.json`：

- `proposals[changeId]` 与 `commits[commitHash]` 保存 `RepositoryLineageRelation[]`；
- relation 包含 `workspaceId`、`subjectId`、`relation: origin | reference` 与 `linkedAt`；
- 同一 object 最多一个 origin；第二个不同 origin 返回结构化冲突且不改写原值；
- reference 以 `{workspaceId, subjectId, relation}` 幂等，可跨 Workspace 多值追加。

Workspace index服务当前 Workspace 用例，Folder reverse index服务 repository trace；两者不互相替代。

### 5. Reverse index mutation 包含完整事务

在 `src/main/infra/storage/repository-lineage-store.ts` 建立按 index file 的 Promise queue。排他区间包含读取最新 JSON、schema normalization、origin conflict检查、幂等 merge、写唯一 temp file 和 atomic rename，而不是只锁最终 write。应用单实例门负责进程级前置条件，该 store 不引入持久化锁文件。

MCP Cortex 是独立进程且只读 reverse index；所有 mutation 由 Main service完成，避免多个 bundled MCP child参与写竞争。

### 6. Origin 与 reference 由显式生命周期事件写入

新 proposal create event在验证 Workspace/Folder/target后同时更新当前 Workspace subject和 repository proposal origin。另一 Workspace开始 apply/archive 已存在 proposal时追加 reference；只读 browser/trace/knowledge anchor不追加。归档获得 commit hash后，将 commit origin绑定到完成归档的当前 subject；若该 subject只是引用 proposal，commit仍可拥有自己的唯一 origin。

reverse index relation仅授权返回关系 identity。Cortex trace可以读取当前 descriptor `workspaceId` 的 subject详情；对其他 Workspace只返回 `{workspaceId, subjectId, relation, linkedAt}`，不得借 Folder共享读取其 task/session正文。

### 7. 通过独立升级迁移转换可证明的 v1 数据

新增 `20260803_001_cortex-workspace-scope.ts` 并按 DataMigrations guideline注册。迁移先读取Workspace meta/Folder membership，再扫描 `workspaces/*/knowledge/*.md` 与 `workspaces/*/lineage/subjects/*.json`：

- Folder Workspace或只有一个可用成员的legacy knowledge file/package anchor、commit source补齐唯一`folderId`；Collection存在多个候选时保留markdown原文并记录warning；

- 保留可解析 subjects，重建该 Workspace v2 index；
- 仅当 proposal link含 `folderId` 时写入对应 Folder reverse index origin；commit 只有在所属 proposal也能确定 Folder 时迁移；
- 相同 repository object出现不同 origin时保留先按稳定 Workspace/subject排序选定的原 origin，记录冲突 warning，不覆盖；
- 缺 owner、subject损坏或 Folder storage identity非法时不猜测，保留原文件，并将 warning写入 `workspaces/<workspaceId>/migration-warnings/cortex-workspace-scope.json`；
- 已是 v2或目标 relation已存在时幂等 no-op。

迁移不删除 v1 subject文件；回滚可恢复旧版本二进制并忽略新 index。迁移写失败继续抛给 runner记录失败，不伪装成功。

### 8. Browser 只投影当前 Workspace

Lineage Browser 从当前 Workspace subjects和v2 index构造投影；proposal link/DTO使用 `ProposalRef`，metadata/detail lookup按完整 ref。Folder reverse index只用于显示当前 link的 origin/reference摘要，不能扩大 browser的 subject集合。跨 Folder同名 proposal可同时存在并分别打开。

## Risks / Trade-offs

- [旧 lineage link缺少 Folder owner，无法进入 repository trace] → 迁移保留 source并写 warning；UI/工具返回 `origin: null`，不使用 primary猜测。
- [Main subject写入成功但 reverse index写入失败，两个投影短暂不一致] → subject保持事实源；service返回明确失败，后续 repair/rebuild可从带 Folder的subjects幂等重放，不回滚已持久化subject。
- [多 Folder reminder扫描增加启动延迟] → 并行扫描，按 Folder隔离失败，并只注入 frontmatter摘要；不读取正文。
- [Reverse index暴露其他 Workspace identity] → 只返回 relation identity，不读取其他 Workspace task/session/knowledge内容。
- [Migration数量较大时启动耗时] → 按 Workspace/subject流式处理并仅在内容变化时写入；本提案使用聚焦 fixtures验证大量与损坏输入，但不改变 migration runner语义。

## Migration Plan

1. 先落 shared v2 types、Folder reverse store和聚焦测试。
2. 注册独立 Cortex scope migration并验证legacy knowledge、lineage旧形态、幂等、冲突、缺owner和写失败。
3. 切换 Main lineage writers/readers及Cortex只读 trace到v2。
4. 切换 guidelines/knowledge/reminder contracts，并更新 tool instructions/README。
5. 更新 Lineage Browser ProposalRef投影和测试；运行聚焦 Vitest、`pnpm typecheck`、`pnpm lint`、Prettier与`git diff --check`。

## Open Questions

无。Folder selector、reverse index位置、跨 Workspace内容授权和v1降级策略均由 multi-root设计确定。
