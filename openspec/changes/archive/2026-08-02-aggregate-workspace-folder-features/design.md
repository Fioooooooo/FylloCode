## Context

Workspace model、multi-root ACP/MCP、repository-owned proposal 和 Cortex dual-scope lineage 已经完成。当前剩余不一致集中在两条路径：

1. `src/main/ipc/insight/{specs,guidelines,overview}.ts` 仍通过 `resolveWorkspaceCwd()` 或 `ResolvedWorkspace.cwd` 只读取 primary repository；leaf readers 将目录缺失、I/O 失败和单项解析失败折叠成空列表，renderer 也只用裸 `id` / `path` 选择详情。
2. Task、Workflow、Integration config 已存入 `workspaceDataDir(workspaceId)`，但 Task 没有 repository hint，Integration 仍以 Project 命名且 repository-bound resource 没有 Folder binding；成员移除后的 stale 关系无法呈现。

本提案跨 shared contract、Main、Preload 和多个 renderer 页面。必须保持 Workspace-owned data 与 repository-owned governance 的所有权分离，并复用 `ResolvedWorkspace.folders` 提供的稳定 Folder identity。实现期间不引入新依赖，不修改已发布 cutover migration，也不把这些单页面 reader 包装为 renderer feature。

## Goals / Non-Goals

**Goals:**

- 为 repository browser 建立可复用、owner-qualified、可表达 partial result 的 aggregate contract。
- 让 Specs、Guidelines、Proposal 与 Overview 在 multi-root/degraded Workspace 中保留所有可读 Folder 结果，并准确呈现 missing/error/empty。
- 让 renderer 使用 `SpecRef`、`GuidelineRef`、`ProposalRef` 作为对象 identity，Folder filter 只影响可见集合，不改写选择对象的 owner。
- 让 Overview 只读取一次当前 Workspace subjects，同时按 Folder 聚合 repository governance 并标注不完整统计。
- 固化 Task、Workflow、Integration config 的 Workspace ownership；实现 task target 软引用和 integration Folder binding/stale projection。
- 清除本范围内残留的单 `projectPath`/primary fallback，并用聚焦测试覆盖跨 Folder 同名、partial failure、Workspace 切换和 legacy 数据兼容。

**Non-Goals:**

- 不改变 proposal create/apply/archive 的 owner routing、worktree 选址或 MCP 授权。
- 不让 task target 变成 proposal owner 或成员移除阻塞引用。
- 不实现跨 repository workflow stage；proposal workflow run 继续使用既有固定 `ProposalRef` / `worktreePath`。
- 不迁移 global provider credentials，也不让不同 Workspace 因共享 Folder 自动继承 integration config。
- 不执行 Phase 8 的 legacy source cleanup、cutover repair 或 telemetry hardening。
- 不运行完整 `pnpm build`，不启动 `pnpm dev`。

## Decisions

### 1. 共享 per-Folder aggregate envelope，leaf reader 保留错误语义

在 `src/shared/types/repository-browser.ts` 增加通用契约：

- `RepositoryFolderStatus = "ready" | "missing" | "error"`；
- `RepositoryFolderResult<T>` 包含 `folderId`、`folderName`、`folderPath`、`isPrimary`、`status`、`items`、`warnings`，error 状态另含稳定错误信息；
- `RepositoryAggregate<T>` 包含按 Workspace member 顺序排列的 `folders`、扁平 `items`、`completeness: "complete" | "partial"` 和未计入的 `folderIds`。

`ready` 可以携带空 `items`，因此合法空目录不会伪装为 missing/error。`missing` 只表示 resolver 已知 Folder 但 path 不可用；可用 path 上的权限、I/O、Git 或顶层解析失败为 `error`；单项 parse/read 问题进入该 Folder `warnings`，同时保留其他 items。

Main 新增 `src/main/services/insight/repository-browser/aggregate.ts`，接收完整 `ResolvedWorkspace.folders` 和 leaf reader，负责稳定顺序、状态转换与 flatten。Specs/Guidelines/Proposal/Overview 复用此 helper，但各自 leaf reader仍拥有领域解析逻辑。

替代方案是每个页面自定义 `{items, errors}`。这会重复 completeness 规则并使 UI 对 missing/error 的解释漂移，因此不采用。

### 2. Repository object identity 始终带 Folder owner

在 shared types 中新增：

- `SpecRef { folderId, specId }` 与 `specRefKey()`；
- `GuidelineRef { folderId, path }` 与 `guidelineRefKey()`。

`SpecBrowserItem` / `GuidelineBrowserItem` 增加 `ref`、`folderName`；原 `id` / `path` 保留为 repository-local display value。Proposal 继续复用现有 `ProposalRef` 和 `proposalRefKey()`。Renderer store 与页面的 selected state、Vue key、详情 lookup 和 Workspace 切换清理只使用完整 ref/key，不用字符串拼接或裸 local ID。

Folder filter 存在于对应 renderer store/page，仅控制当前可见列表。若已选对象因 filter 被隐藏，页面选择过滤结果的首项或显示过滤空态；清除 filter 后仍从完整 aggregate 重新选择，任何 detail action 都携带原 ref，不以当前 filter 重新推导 owner。

替代方案是给同名对象生成 display-only composite string。它无法在 IPC/schema 层验证 owner，也容易被拆回裸 ID，因此不采用。

### 3. Overview 分成 Workspace reader 与 repository reader

`getProjectOverview()` 改为接收 `workspaceId` 并自行调用 `resolveWorkspace()`：

- Workspace work reader 只以 `workspaceId` 调用 `listSubjects()` / `listRecentSubjects()` 一次，计算 `taskLinkedRatio`、`totalSubjects` 和 recent lineage；
- 每个 Folder repository reader独立计算 proposals、specs、archives、guidelines 与 Git governance；active proposal 使用完整 `ProposalRef`，只通过当前 Workspace 的 subject/reference 做 task enrichment；
- 汇总数值只累加 `ready` Folder，返回 `repositoryCompleteness`、per-Folder health 和 `excludedFolderIds`；跨 Folder 同名 change/spec 不去重；趋势数据保留 Folder owner，renderer 不把 partial total 标为完整总数。

共享 Folder 的 repository metadata 可以展示，但不得读取其他 Workspace 的 subject/task/session/knowledge 内容。被动 Overview read 不写 lineage relation。

替代方案是分别调用现有 Specs/Guidelines/Proposal IPC 再由 renderer 拼装。这样会产生多次 Workspace 解析、竞态和不一致快照，也无法保证 Workspace subjects 只读一次，因此由 Main 统一编排。

### 4. Task target 是持久化软引用，读取时生成 resolution projection

`TaskItem` 增加可选 `targetFolderIds?: string[]`，持久化时去重并保留首次出现顺序；省略和空数组均表示没有 repository hint。`CreateLocalTaskInput` / `UpdateTaskInput` 接受该字段。Task list/get 返回额外 projection：

- `currentTargetFolderIds`：仍属于当前 Workspace 的原始 targets；
- `staleTargetFolderIds`：已不属于当前 Workspace 的原始 targets。

Task store 继续是 Workspace-owned `tasks/tasks.json`。读取旧数据时不补写 target，不根据 Folder Workspace 或 primary 猜测。成员移除检查不纳入 task targets，删除成员也不改写 tasks。

从 task 发起 proposal 时，只有“原始去重 target 恰好一个，且该 ID 当前有效”才能作为 owner picker 的预选值；原始多个 target 即使只剩一个 current 也必须继续确认。外部 task repository metadata 只能作为建议并接受同一 membership 校验。

替代方案是只存有效 targets。它会在成员移除时丢失用户意图，并可能把多 target 静默降为单 owner，因此不采用。

### 5. Workflow 保持 Workspace-owned；Integration 完成 Workspace 命名与 Folder binding

Workflow 的 built-in template 继续 global，custom template 继续写入 `workflowsDir(workspaceId)`。IPC schemas 中 mutation 必须要求 `workspaceId`；list 在 launcher/global 场景仍可只返回 built-in，但 Workspace 页面必须传当前 ID。Apply/Archive run 继续使用已有固定 target，不在 stage 执行时解析 primary。

将 `project-integration` 模块、IPC/channel/API/store symbols 迁为 `workspace-integration`，renderer 外部只使用 `window.api.automation.workspaceIntegration`。`WorkspaceIntegrationEntry` 增加可选 `folderId`；source-control 与 ci-cd 中 repository-bound resource 写入时必须提供当前 Workspace member Folder，Workspace-level resource 可省略。读取配置时保留不再属于 Workspace 的 binding，并返回 current/stale resolution；不自动改写或绑定 primary。

现有 config 通过 normalize-on-read 保持可读：缺少 `folderId` 的旧 entry 保持 unbound。首次 mutation 以现有 atomic writer 保存新形态，不新增 migration ID。

替代方案是保留 Project 命名兼容 alias。它会让新的 public contract 长期携带已废弃 ownership 术语；本次在同一跨进程切片内更新所有消费者和测试，因此直接完成 rename。

### 6. Renderer 保持现有 page/store 架构

Specs、Guidelines、Proposal、Overview、Task、Workflow、Integration 都是现有单页面能力，不满足新建 `features/**` 的复杂编排准入条件。实现继续使用：

- `src/renderer/src/api/<domain>/<area>.ts` wrapper；
- `src/renderer/src/stores/<domain>/` Pinia store；
- `src/renderer/src/pages/*.vue` route 页面；
- `PageHeader`、`UiSurface`、`AppEmptyState` 和 Nuxt UI badge/alert/filter controls。

Folder filter 采用 owner badge 和可键盘操作的选择控件；missing/error/partial 不只靠颜色表达。异步 store 继续绑定请求时 `workspaceId` 与 generation，迟到结果不得覆盖新 Workspace。

### 7. 单根假设审计与 repository-local path 清单

对 local file preview、Fyllo Action、plan event、task-spawned Session、Workflow、Task、Workspace Integration、Specs、Guidelines、Proposal 与 Overview 调用点执行了 `projectPath`、`projectId`、`resolveWorkspaceCwd`、primary fallback 和 app-data path 审计。Workspace-owned 数据均以 `workspaceId` 进入 `workspaceDataDir(workspaceId)`；repository-owned browser 先接收 `ResolvedWorkspace` 或 owner-qualified Ref，再把下列路径限制在 leaf reader 或已验证 target 内：

- `folderPath`：仅供 Specs、Guidelines、Overview、local preview 等单 Folder leaf reader 访问 repository；Folder owner 来自 `ResolvedWorkspace.folders`，不是 caller path。
- `worktreePath`：仅供 Proposal detail/status/apply/archive 与 local preview 访问由 `ProposalRef` + `resolveRepositoryTarget()` 或 registered worktree 校验得到的固定 target。
- `projectPath`：仅保留在 Git/OpenSpec leaf helper 与 Apply/Archive reminder context 中作为 repository-local 参数名；调用者已先按 Folder owner 解析 target，不用它选择 Workspace app-data namespace。

会话列表原先仅为验证 Workspace 而调用 `resolveWorkspaceCwd(workspaceId)`；现改为显式 `resolveWorkspace(workspaceId)`，并删除 chat 与 proposal runtime 中未再需要的同名 helper。内置 Workflow fallback 的 `getDataSubPath("workflows")` 是 global built-in template 来源；custom Workflow 仍只写入 `workflowsDir(workspaceId)`。

## Risks / Trade-offs

- [Risk] 通用 aggregate 类型过度抽象，掩盖各 reader 的错误差异 → helper 只负责 Folder envelope 与稳定排序，领域 leaf reader 明确返回 items/warnings 或抛出顶层错误。
- [Risk] Overview 多 Folder Git 查询增加延迟 → Folder readers 并发执行并沿用每个 repository path 的 governance cache；partial failure 不阻塞 ready 结果。
- [Risk] Integration API rename 造成 preload/renderer 漏改 → 同一 task 同步 shared channels、Main registration、preload declaration、renderer wrapper/store 和 focused IPC/preload tests，不保留双入口。
- [Risk] stale task/integration ID 无法显示名称 → UI 至少显示保留的 `folderId` 与失效数量；不读取全局 Folder registry 来恢复非成员详情，以免扩大 Workspace 可见范围。
- [Risk] filter 后自动选择被误解为 owner 变化 → store 的 selected ref 始终来自 item，所有 operation 传完整 ref；测试覆盖跨 Folder 同名和 filter 切换。
- [Risk] normalize-on-read 的旧 integration unbound entry 可能不满足新的 repository binding → 旧数据只读保留并标为 unbound/需确认；下一次用户保存 repository-bound stage 时强制补齐 binding，不猜 primary。

## Migration Plan

1. 先增加 shared aggregate/ref/automation contracts 与兼容 normalization tests。
2. 将 Main Specs/Guidelines/Proposal/Overview readers 改为按 `ResolvedWorkspace.folders` 聚合，再更新 IPC/Preload。
3. 更新 renderer stores/pages 的完整 identity、Folder filter 和 partial state。
4. 增加 task target projection，完成 workflow scope 审计和 Workspace Integration rename/binding。
5. 清点剩余单-root 调用点，更新设计 inventory 与 guidelines，执行聚焦验证。

持久化回滚依赖向后兼容字段：Task 的 `targetFolderIds` 和 Integration 的 `folderId` 都是可选字段，旧版本会忽略未知字段；本版本不会删除旧配置或根据成员状态改写 targets。若实现中发现必须改变现有 store version 或无法保持旧读兼容，停止 Apply 并另行升级 migration contract。

## Open Questions

无。owner identity、partial aggregate、task soft reference 与 integration binding 语义均已由 multi-root 设计确认。
