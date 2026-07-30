# Multi-root Workspace 整体规划

创建时间：2026-07-28

状态：参考设计草案

本文档规划 FylloCode 从单一 Project 模型迁移到统一 Workspace 模型后的整体适配方向。它是 `references/` 下的参考设计，不是 OpenSpec proposal，也不是当前行为契约。正式实施会改变 Workspace 元数据、IPC、ACP session、MCP Workspace、proposal identity、lineage schema 和多个用户可见页面，必须拆分为正式 OpenSpec proposals 后逐步落地。

## 1. 结论摘要

Workspace 可以沿用现有 Project 的 launcher entry、meta 和窗口外壳，以复用：

- launcher 最近使用列表；
- 窗口唯一性、窗口状态和打开流程；
- 当前 renderer Workspace；
- session、task、knowledge 等“当前工作上下文”的大部分 UI；
- 现有 `projectId` 作为窗口和运行时隔离 key 的机制，并在迁移后明确改名为 `workspaceId`。

但不能继续把 Workspace 伪装成“有一个特殊 `path` 的普通 Project”。当前代码广泛隐含以下等式：

```text
projectId
  = 打开的用户上下文
  = 唯一 repository
  = ACP cwd
  = MCP projectPath
  = app-data storage key
  = proposal / git / guidelines / specs owner
```

统一 Workspace 模型后这些概念必须拆开：

```text
workspaceId        当前窗口打开的工作单元
folderId           Workspace 内的文件夹成员
workspaceDataDir   session/task/knowledge 等 Workspace 数据目录
repositoryRoot     specs/guidelines/git/proposal 所属仓库
checkoutRoot       main checkout 或某个 linked worktree
cwd                当前 Agent session 的主工作目录
```

推荐方案是：

1. 顶层领域对象只保留 `Workspace`；打开文件夹和创建 Workspace 是两种创建入口，不是两种运行期类型。
2. Workspace 只保存成员 `folderIds` 和 `primaryFolderId`，不保存虚假的 Workspace `path`，也不保存 `single` / `multi` 类型标记。
3. Main 统一解析出 `ResolvedWorkspace`；单根与多根仅由当前有效 `folders` 数量派生。
4. Workspace-scoped 数据按 `workspaceId` 存储；repository-scoped 能力显式携带 `ownerFolderId`。
5. Workspace chat 使用 primary root 作为 `cwd`，其他有效成员作为 ACP `additionalDirectories`。
6. 只有当本次 Workspace session 的 `additionalDirectories` 非空时，ChatEmpty agent picker 才只允许选择明确支持 `sessionCapabilities.additionalDirectories` 的 Agent。
7. Proposal v1 采用“单一 owner repository”模型，身份为 `{ ownerFolderId, changeId }`，linked worktree 创建在 owner folder 对应的 repository。
8. MCP 连接携带固定、受授权的 Workspace Folder 集合；tool call 使用 `ownerFolderId` 动态选择成员，不接受任意磁盘路径。
9. Workspace 自身拥有 session、task、knowledge、workflow 和 integration config；repository 中的 specs、guidelines、proposal 和 Git 状态不复制。
10. 实施必须按 foundation → ACP → MCP/proposal → Cortex/insight → automation/UX → migration/hardening 分阶段完成。

## 2. 设计目标

### 2.1 用户目标

- launcher 只展示可打开的 Workspace。
- “打开文件夹”创建或复用一个单根 Workspace；“创建 Workspace”允许纳入一个或多个 Folder。
- 用户可以创建、编辑、删除 Workspace，并配置多个 Folder 和一个 primary Folder。
- Workspace chat 中 Agent 能以 primary Folder 为主目录访问所有有效 Folder。
- Agent 创建 OpenSpec proposal 时，proposal 和 linked worktree 落到明确的 owner Folder。
- specs、guidelines、proposal、Git、lineage 等 repository 能力不会错误地默认落到 primary Folder。
- 同一个 Folder 可以被一个单根 Workspace 和多个显式 Workspace 引用。

### 2.2 工程目标

- 不在所有 feature 中散布 `if (kind === "workspace")`。
- 保持 main process 对窗口上下文、路径授权和数据归属的最终所有权。
- 通过一次性、可恢复迁移保持现有 Project 数据和打开行为兼容；迁移完成后的运行期不再存在 Project 类型。
- 不把用户传入的绝对路径直接当作 MCP 授权依据。
- 允许后续增加 Workspace member reorder、missing path recovery 和更多聚合视图，而不再次改变底层 identity。

## 3. 非目标与 v1 限制

以下内容不纳入 v1：

- 一个 proposal 同时拥有多个 repository 或自动创建多仓库 worktree。
- 跨 repository 的原子 commit、merge、archive 或回滚。
- 自动根据用户 prompt 猜测 proposal owner 并在无确认时写入仓库。
- 将多个 repository 合并成一个虚拟文件系统目录。
- 当 `additionalDirectories` 非空时，在不支持该 capability 的 Agent 上模拟 multi-root。
- 将 Workspace 配置写入 repository 并进行团队共享。
- 自动合并引用同一 Folder 的不同 Workspace 的 session、task、knowledge 或 integration 配置。
- 在 Workspace 成员变更后热修改已经建立的 ACP session 文件系统权限。
- 支持 canonical path 重复或相互嵌套的 Workspace roots。v1 应拒绝这类配置，避免 owner 推断和路径授权产生歧义。

## 4. 术语与命名

FylloCode 现有代码中已经有多种容易混淆的 “workspace”。本文将 `Workspace` 作为唯一顶层领域词，`Folder` 作为 Workspace 内部成员。单根和多根只是由 Folder 数量派生的描述，不是持久化类型。

| 名称                               | 本文术语                  | 含义                                         |
| ---------------------------------- | ------------------------- | -------------------------------------------- |
| launcher 可打开项                  | **Workspace**             | 唯一顶层工作单元                             |
| Workspace 内的目录                 | **Workspace Folder**      | 可被一个或多个 Workspace 引用的成员目录      |
| 一个 Folder 的 Workspace           | **Single-root Workspace** | 派生描述，不是 `kind`                        |
| 多个 Folder 的 Workspace           | **Multi-root Workspace**  | 派生描述，不是 `kind`                        |
| OpenSpec linked workspace/worktree | **Checkout**              | proposal 的 main checkout 或 linked worktree |

正式实现中应避免用裸 `workspacePath` 同时表达当前 Workspace 和 Git checkout。推荐命名：

- `workspaceId`：当前窗口打开的工作单元 ID；
- `folderId` / `ownerFolderId`：Workspace Folder ID 与 repository owner ID；
- `repositoryRoot`：Folder 对应 repository 的主 checkout；
- `checkoutRoot`：当前实际操作 checkout；
- `workspaceDataDir`：当前 Workspace 的 app-data；
- `primaryFolderId`：Workspace 的默认 cwd owner；
- `additionalDirectories`：除 cwd 外传给 ACP 的成员 roots。

现有 IPC 和 UI 中的 `projectId` 只能在迁移阶段作为 `workspaceId` 的 legacy alias；新建 contract 一律使用 `workspaceId` 或 `folderId`，不得继续扩散 `projectId`。

## 5. 核心不变量

### 5.1 Workspace 与 repository 分离

- 一个打开窗口只绑定一个 `workspaceId`。
- Workspace 至少包含一个 Folder，并且恰好一个 primary。
- 单根与多根状态由解析后可用 Folder 数量派生，不持久化 `kind`。
- `workspaceId` 不能直接用于推导 repository path。
- `ownerFolderId` 必须属于当前 Workspace 的授权成员集合。

### 5.2 数据归属显式化

- session/task/knowledge 等用户工作历史属于 Workspace。
- specs/guidelines/proposal/Git/worktree 属于 repository。
- apply/archive 属于一个 proposal owner repository 的 checkout。
- 任何同时涉及两类作用域的记录必须同时保存 `workspaceId` 与 `ownerFolderId`，不能依赖当前 primary 反推历史归属。

### 5.3 路径不作为公开身份

- UI、IPC 和 MCP tool 优先传稳定 ID。
- 绝对路径只作为 Main/MCP runtime 解析后的执行结果。
- 所有 owner 选择必须经过当前 Workspace 成员白名单校验。
- canonical path 去重和 root containment 校验由 Main 或 MCP shared runtime 统一执行。

### 5.4 历史不可随 Workspace 编辑漂移

- Proposal、lineage link、knowledge anchor 和 apply run 保存创建时的 owner Folder。
- 已创建的 chat session 保存自己的目录快照。
- 修改 primary Folder 只影响新 session 和没有固定 owner 的新操作。
- 删除成员前必须处理仍引用该成员的 active session/proposal/run。

## 6. 目标领域模型

### 6.1 持久化 Meta

建议将当前 `ProjectMeta` 迁移为版本化 `WorkspaceMeta`，并增加独立的 Folder registry：

```ts
interface WorkspaceMeta {
  version: 2;
  id: string;
  name: string;
  folderIds: string[];
  primaryFolderId: string;
  createdAt: string;
  lastOpenedAt: string;
}

interface WorkspaceFolderMeta {
  version: 1;
  id: string;
  name: string;
  path: string;
  healthScore?: number;
}
```

设计理由：

- 所有 launcher entry 都使用同一种 Workspace meta。
- Workspace 不拥有虚假 repository path，迫使 repository 能力做正确的 owner 解析。
- Folder registry 负责稳定的 `folderId → path` 映射；同一 Folder 可被多个 Workspace 引用而不复制 path/health。
- `folderIds` 保留顺序，primary 不必固定为数组第一项。
- `kind`、`folderCount` 和 `isMultiRoot` 都是派生值，不进入持久化 schema。

旧 Project `meta.json` 不在运行期被长期兼容解析，而是在数据迁移阶段转换为：

```ts
{
  version: 2,
  id: legacyProject.id,
  name: legacyProject.name,
  folderIds: [migratedFolder.id],
  primaryFolderId: migratedFolder.id,
  createdAt: legacyProject.createdAt,
  lastOpenedAt: legacyProject.lastOpenedAt
}
```

迁移应保留原 Workspace ID，从而保持 launcher 顺序、窗口状态、session/task 等 app-data 引用；旧文件在完整校验与可回滚备份完成前不得删除。

### 6.2 运行期解析模型

所有 project-level use case 应先通过一个统一 resolver 获取运行期上下文：

```ts
interface ResolvedWorkspaceFolder {
  folderId: string;
  name: string;
  rootPath: string;
  canonicalRoot: string;
  repositoryRoot?: string;
  pathMissing: boolean;
}

interface ResolvedWorkspace {
  workspaceId: string;
  name: string;
  workspaceDataDir: string;
  primaryFolderId: string;
  folders: ResolvedWorkspaceFolder[];
  availableFolders: ResolvedWorkspaceFolder[];
  missingFolders: ResolvedWorkspaceFolder[];
  cwd: string;
  additionalDirectories: string[];
}
```

单根 Workspace 的解析结果：

```text
folders = [primaryFolder]
primaryFolderId = primaryFolder.folderId
cwd = primaryFolder.rootPath
additionalDirectories = []
```

这样 session、window、storage、MCP 和 UI 只消费 `ResolvedWorkspace`，不需要实现 Project/Workspace 或 single/multi 分支。

### 6.3 Repository target

repository-owned use case 使用更窄的解析结果：

```ts
interface ResolvedRepositoryTarget {
  workspaceId: string;
  ownerFolderId: string;
  repositoryRoot: string;
  checkoutRoot: string;
}
```

解析规则：

1. 校验 window/session 实际绑定的 `workspaceId`。
2. 加载 `ResolvedWorkspace`。
3. 校验 `ownerFolderId` 是有效成员且能够解析出 repository root。
4. canonicalize repository root。
5. 如果输入 checkout，校验它是该 repository 注册的 main checkout 或 linked worktree。

## 7. 存储作用域

### 7.1 推荐矩阵

| 数据                              | Scope                    | 推荐目录/归属                                                               |
| --------------------------------- | ------------------------ | --------------------------------------------------------------------------- |
| launcher meta                     | Workspace                | `<appData>/workspaces/<workspaceId>/meta.json`                              |
| Folder registry                   | Global                   | `<appData>/workspace-folders/<folderId>/meta.json`                          |
| window state                      | Workspace                | `<appData>/window-state/workspaces/<workspaceId>.json`                      |
| sessions/messages/attachments     | Workspace                | `<appData>/workspaces/<workspaceId>/sessions/**`                            |
| plans                             | Workspace + Session      | `<appData>/workspaces/<workspaceId>/sessions/<sessionId>/plans/**`          |
| local tasks                       | Workspace                | `<appData>/workspaces/<workspaceId>/tasks/**`                               |
| custom workflows                  | Workspace                | `<appData>/workspaces/<workspaceId>/workflows/**`                           |
| Workspace integration config      | Workspace                | `<appData>/workspaces/<workspaceId>/integrations/config.json`               |
| durable knowledge                 | Workspace                | `<appData>/workspaces/<workspaceId>/knowledge/**`                           |
| chat lineage subjects             | Workspace                | `<appData>/workspaces/<workspaceId>/lineage/subjects/**`                    |
| proposal/commit reverse lineage   | Repository Folder        | `<appData>/workspace-folders/<ownerFolderId>/lineage/repository-index.json` |
| MCP events                        | Workspace + Session      | `<appData>/workspaces/<workspaceId>/mcp-events/**`                          |
| apply/archive runs                | Workspace + owner Folder | Workspace 目录存 run，meta 内固定 `ownerFolderId`                           |
| specs/guidelines/OpenSpec changes | Repository               | `<repositoryRoot>/**`                                                       |
| linked worktrees                  | Repository               | `<repositoryRoot>/.worktrees/<changeId>`                                    |
| ACP registry/capability cache     | Global                   | 保持现有全局 app-data                                                       |
| provider credentials/connections  | Global                   | 保持现有全局 app-data                                                       |

### 7.2 `projectDir(projectPath)` 的迁移

当前多个 storage helper 使用 `projectPath` 计算：

```text
<appData>/projects/<encodeProjectPath(projectPath)>
```

现有 Project 的 `id` 本身就是 encoded path，因此迁移后的 Workspace 可保留该 ID，再把 helper 语义改为：

```ts
workspaceDataDir(workspaceId);
```

数据迁移负责把旧目录复制或原子移动到新的 `workspaces` namespace；运行期不长期维持双写。

迁移时需要注意：当前代码允许 Project path 更新但 ID 保持不变。新的稳定规则应明确：

- app-data 永远按稳定 `workspaceId` 定位；
- 修改 Folder path 不移动 Workspace app-data；
- repository path 只从最新 Folder meta 解析；
- 旧 path-based helper 只存在于 migration/rollback code，不能成为新运行期 facade。

### 7.3 Workspace 数据不隐式继承

当 Folder A 同时属于单根 Workspace WA 和显式 Workspace W 时：

- WA 与 W 拥有独立 sessions、tasks、knowledge、workflow 和 integration config。
- Workspace W 不自动复制或合并 WA 的 Workspace 数据。
- repository 内的 specs、guidelines、proposal 和 Git 历史天然共享，因为它们属于同一个 repository。

这一边界可以避免同一条 session/task 在多个上下文重复出现或被双向修改。

## 8. Launcher、Workspace 管理与窗口

### 8.1 Launcher

launcher list 只包含 Workspace，并沿用现有排序和最近打开模型。展示层使用以下投影：

```ts
interface WorkspaceLauncherItem {
  workspaceId: string;
  name: string;
  primaryFolderPath: string;
  folderCount: number;
  folderPaths: string[];
  missingFolderCount: number;
  lastOpenedAt: string;
}
```

其中 `primaryFolderPath` 和 `folderPaths` 只用于展示与修复入口，不作为 Workspace identity、storage key 或 repository owner 参数。Workspace item 至少展示：

- Workspace 名称；
- 单根 Workspace：直接展示唯一 Folder 的完整路径，保持当前 Launcher 体验；
- 多根 Workspace：展示 primary Folder 完整路径和“共 N 个文件夹”摘要；
- hover、focus 或详情入口展示所有 Folder 名称与完整路径；
- missing Folder 数量与逐项警告；
- 最近打开时间。

不使用所有 Folder 的公共父目录作为 Workspace path，因为成员可能不共享有意义的祖先目录，该值也会错误暗示 Workspace 归属。v1 不引入 `.fyllo-workspace` 一类实体文件。

launcher 提供：

- 打开文件夹；
- 创建 Workspace；
- 编辑 Workspace；
- 打开最近的 Workspace；
- 从最近列表移除。

### 8.2 Workspace 创建/编辑

v1 创建流程：

1. 输入 Workspace 名称。
2. 添加至少一个文件夹；Main canonicalize 后创建或复用 Folder registry entry。
3. 从成员中选择一个 primary Folder。
4. 校验 canonical roots 不重复、不嵌套。
5. 保存 Workspace meta。
6. 可选择立即打开。

编辑流程允许：

- 修改名称；
- 添加成员；
- 移除无 active reference 的成员；
- 调整顺序；
- 修改 primary。

### 8.3 Missing path

- primary path missing：Workspace 不可进入正常窗口，launcher 提供修复 primary 或重新定位 Folder 的入口。
- secondary path missing：Workspace 可以 degraded mode 打开；该成员不进入 `additionalDirectories`，repository selector 标记不可用。
- 成员恢复后，新 session 自动使用恢复后的成员集合；旧 session 仍使用创建时快照。

### 8.4 Window identity

`ProjectWindowManager` 当前以 `projectId` 保证一个项目一个窗口。该 key 应迁移为 `workspaceId`：

- 同一 Workspace 最多一个窗口；
- 引用同一 Folder A 的 Workspace WA 与 Workspace W 可以同时打开；
- runtime registry、stream cancellation 和 window event 以 `workspaceId` 隔离。

`WindowContext.role` 可以暂时保留 `"project"` 以降低迁移量，但更清晰的长期命名是：

```ts
{
  role: "workspace";
  workspaceId: string;
}
```

迁移阶段可在 IPC decoder 接受 legacy `projectId`，但新发送方和运行期类型应只产生 `workspaceId`，避免“兼容字段”永久化。

## 9. ACP Agent 与 Chat

### 9.1 Agent 可用性

能力门控不由持久化类型或配置中的 Folder 数量直接决定，而由本次 session 是否真的需要附加目录决定：

```ts
const requiresAdditionalDirectories = resolvedWorkspace.additionalDirectories.length > 0;

const agentCanStartSession =
  !requiresAdditionalDirectories || capabilities.sessionCapabilities?.additionalDirectories != null;
```

推荐 UI 行为：

- `additionalDirectories` 为空：沿用当前单根对话的 Agent 选择逻辑，不要求 Agent 支持该 capability；
- `additionalDirectories` 非空且 Agent 明确支持：可选择；
- `additionalDirectories` 非空且能力已知但不支持：不进入主可选列表，或 disabled 并说明“不支持当前 Multi-root Workspace”；
- `additionalDirectories` 非空且能力未知：先触发已有 capability ensure/probe，确认前不可选择。

因此以下情况都允许使用不支持 `additionalDirectories` 的 Agent：

- 单根 Workspace；
- 配置了多个 Folder，但当前只保留一个 Folder 的 Workspace；
- secondary Folders 当前全部 missing、所以本次解析结果只有一个有效 root 的 degraded Workspace。

如果成员之后恢复，新 session 会重新计算 `additionalDirectories` 并重新执行 capability gate；已经创建的 session 继续使用自己的目录快照，不会被热升级为 multi-root。

### 9.2 Session 建立参数

新建 Workspace session：

```ts
connection.newSession({
  cwd: primary.rootPath,
  additionalDirectories: secondaryFolders.map((folder) => folder.rootPath),
  mcpServers,
});
```

同样的目录集合必须用于：

- draft probe 的 `newSession`；
- chat `newSession`；
- `resumeSession`；
- `loadSession`；
- 未来支持的 `forkSession`。

ACP 0.25.1 已在这些 lifecycle request 中提供 `additionalDirectories`；不能只在首次 `newSession` 传递。

### 9.3 Session 目录快照

建议在 `SessionMeta` 增加：

```ts
interface SessionWorkspaceSnapshot {
  workspaceId: string;
  primaryFolderId: string;
  folderIds: string[];
  cwd: string;
  additionalDirectories: string[];
}
```

v1 规则：

- 新 Session 固定当前 Workspace roots。
- Workspace 编辑不热修改已有 ACP session。
- resume/load 使用持久化 snapshot，而不是当前 Workspace meta。
- snapshot 中路径失效时进入明确错误状态，提示用户新建 session 或修复成员。
- 单根 Workspace 也写入等价的单成员 snapshot，减少恢复分支。

### 9.4 Apply/Archive Agent scope

Proposal apply/archive 与普通 Workspace chat 不同：

- `cwd` 必须是 owner Folder 的 main checkout 或 linked worktree。
- v1 不向 apply/archive Agent 暴露其他成员的可写 `additionalDirectories`。
- 原因是 v1 proposal 只能原子提交一个 repository；允许编辑其他成员会产生无法被当前 archive/merge 管理的跨仓库修改。
- Chat 阶段仍可访问所有 Workspace members，用于分析跨仓库依赖和选择 owner。

如果未来支持 multi-repo proposal，需要独立设计多 checkout、分布式提交和失败恢复，不应通过放宽 v1 additional directories 实现。

## 10. MCP Workspace 总体设计

### 10.1 当前问题

当前 bundled MCP Workspace 信息只有：

```ts
{
  (projectPath, projectDataDir, mcpEventDir, sessionId);
}
```

这不足以同时表达当前 Workspace、primary repository、多个授权成员和 repository owner。

### 10.2 Workspace v2

推荐统一结构：

```ts
interface McpFolderEntry {
  folderId: string;
  name: string;
  rootPath: string;
  repositoryRoot?: string;
}

interface McpWorkspaceDescriptorV2 {
  version: 2;
  workspaceId: string;
  primaryFolderId: string;
  folders: McpFolderEntry[];
  workspaceDataDir: string;
  mcpEventDir?: string;
  sessionId?: string;
}
```

MCP server 提供共享 resolver：

```ts
resolveWorkspace();
resolveFolder(folderId);
resolvePrimaryFolder();
validateCheckout(folderId, checkoutPath);
```

tool handler 不再直接读取 `getProjectPath()` 并假设它是唯一 root。

### 10.3 固定连接不阻碍动态 owner

ACP session 建立时确定的 MCP connection 携带的是完整、固定的授权 Folder 集合。后续 tool call 只需要传 `ownerFolderId`：

```text
fixed connection workspace
  └─ folders = [A, B]
       ├─ tool(ownerFolderId=A) -> A root
       └─ tool(ownerFolderId=B) -> B root
```

因此无需为 proposal owner 切换 MCP connection，也无需重启 ACP session。

### 10.4 安全

当前 HTTP transport 的 path headers 由 Agent 可见，并且 app-level bearer token 在多个 session 间共享。multi-root 后不能仅增加一个可篡改的 JSON header。

推荐二选一：

1. **首选：opaque workspace token**
   - Main 为 ACP session 注册一次 Workspace snapshot。
   - MCP spec 只暴露不可猜测的短期 workspace token。
   - proxy/backend 通过受控 registry 解析完整 roots。
2. **兼容方案：签名 workspace claim**
   - Main 发送 base64url JSON Workspace。
   - 同时用应用级 secret 生成 HMAC。
   - backend 校验签名、版本、session 和过期时间。

无论采用哪种方式，MCP tools 都必须：

- 只接受 `folderId`，不接受任意 owner absolute path；
- checkout path 必须属于对应 repository 的 registered worktree；
- Workspace member roots 需要 canonicalize；
- event payload 写入 `workspaceId` 和 `ownerFolderId`。

stdio fallback 可以通过单 session 的 `FYLLO_WORKSPACE_JSON` 传递同一快照；旧 `FYLLO_PROJECT_*` env 只由迁移期 adapter 读取，不进入新 contract。

## 11. `fyllo-specs` 适配

### 11.1 Proposal identity

Workspace 内不同成员可以拥有相同 `changeId`，因此全链路使用：

```ts
interface ProposalRef {
  ownerFolderId: string;
  changeId: string;
}
```

以下位置都需要升级：

- MCP tool input/output；
- Fyllo Action / proposal event；
- proposal browser route/store；
- status watcher；
- apply/archive run meta；
- lineage link/index；
- overview active changes；
- task/session downstream projection。

UI 可以继续主要展示 `changeId`，但必须同时展示或 tooltip 标明 owner Folder。

### 11.2 Tool 参数

推荐 contract：

```ts
createProposal({
  ownerFolderId,
  changeName,
  workspaceMode
})

explore({
  ownerFolderId?,
  changeName?
})

applyChange({
  ownerFolderId,
  changeName,
  checkoutPath
})

archiveChange({
  ownerFolderId,
  changeName,
  checkoutPath,
  ...
})
```

说明：

- `ownerFolderId` 是 repository selector。
- owner Folder 必须具备有效 repository root；普通非 Git Folder 可用于 Chat，但不能成为 proposal/worktree owner。
- `checkoutPath` 只用于在 owner repository 内区分 main/linked checkout。
- 不再让 caller 用 `targetPath` 同时表达 owner repository 和 checkout。
- 解析后只有一个有效 Folder 时可以省略 `ownerFolderId`，runtime 自动选择唯一成员；存在多个有效 Folder 时必填。

### 11.3 Owner 选择

Agent 调用 `create-proposal` 前必须确认 proposal owner。选择顺序：

1. 用户明确指定的 Folder；
2. task/integration 已明确绑定的 repository；
3. 本轮讨论明确只涉及一个成员；
4. 否则 Agent 必须向用户询问一次，不得静默使用 primary。

primary 是 cwd 默认值，不是 proposal owner 默认授权。

### 11.4 Linked worktree

linked worktree 始终创建在：

```text
<ownerRepositoryRoot>/.worktrees/<changeName>
```

创建、扫描、apply、archive、merge、cleanup 和 branch delete 全部使用同一个 owner Folder。不得使用 Workspace primary 或路径摘要反推 main repository。

### 11.5 Explore

Workspace 中 explore 有两层行为：

- 没有 `ownerFolderId`：聚合所有成员的 active changes，并为每项返回 owner Folder。
- 有 `ownerFolderId`：只扫描该成员的 main/linked checkouts。
- `currentChange` 解析使用完整 `ProposalRef`；只有 changeName 在所有成员中唯一时才允许省略 owner。
- 单个成员扫描失败以 warning 返回，不隐藏其他成员结果。

### 11.6 MCP events

Proposal 创建事件至少包含：

```ts
{
  (workspaceId, sessionId, ownerFolderId, changeId, checkoutPath, workspaceMode);
}
```

Main consumer 使用该数据更新：

- Workspace-scoped session lineage；
- owner repository 的 proposal reverse lineage；
- Workspace window 的 proposal event rail/status watcher。

## 12. `fyllo-cortex` 适配

### 12.1 Guidelines

Guidelines 属于 repository：

```ts
guidelines({
  mode,
  ownerFolderId,
  topic?,
  path?,
  reason?
})
```

其中现有 `path` 继续表示 `guidelines/**/*.md` 的 repository-relative path；它不能承担 Folder 选择。

Workspace system reminder 中的 guideline index 必须按 Folder 分组，并让每条路径能解析到明确的 owner root。apply/archive reminder 只注入 owner checkout 的 guidelines。

### 12.2 Knowledge

Knowledge 属于 Workspace：

- Workspace capture/update/retire 写入当前 `workspaceDataDir/knowledge`。
- 每个 Workspace 只读写自己的 knowledge。
- 引用同一 Folder 的其他 Workspace 不隐式继承或合并 knowledge。

但 repository anchor 必须带 owner：

```ts
type KnowledgeFileAnchor = {
  kind: "file";
  folderId: string;
  file: string;
  hash: string;
};

type KnowledgePackageAnchor = {
  kind: "package";
  folderId: string;
  package: string;
  version: string;
  resolutionDigest: string;
};
```

commit/proposal source 同样增加 Folder：

```ts
{ kind: "commit", folderId, commitHash }
{ kind: "lineage", folderId?, proposalRef?, commitHash? }
```

URL anchor 不需要 Folder。

### 12.3 Lineage

Lineage 同时跨 Workspace 与 repository，建议拆成：

1. **Workspace subject store**
   - 保存 task/chat/session/plan 关系；
   - 位于 `<workspaceDataDir>/lineage/subjects`。
2. **Repository reverse index**
   - proposal ref / commit → `{ workspaceId, subjectId }`；
   - 位于 owner Folder app-data。

建议 index v2：

```ts
interface RepositoryLineageIndex {
  version: 2;
  proposals: Record<string, { workspaceId: string; subjectId: string }>;
  commits: Record<string, { workspaceId: string; subjectId: string }>;
}
```

每个 repository 独立存储，因此 key 内可以继续使用 `changeId` 和 commit hash；跨 repository 查询必须先选择 `folderId`。

Cortex tool：

```ts
lineage({ mode: "trace-proposal", folderId, changeId })
lineage({ mode: "trace-commit", folderId, commitHash })
lineage({ mode: "trace-file", folderId, filePath, lineRange? })
```

`trace-file` 在指定 repository root 执行 Git；`trace-proposal` 在指定 repository 的 reverse index 中定位 origin Workspace subject。

## 13. Proposal Browser、Specs、Guidelines 与 Overview

### 13.1 Repository browser 通用 projection

Workspace 中以下页面从“单 root reader”升级为“member aggregate reader”：

- `/proposal`
- `/specs`
- `/guidelines`
- repository/Git 部分的 `/overview`

统一返回结构应包含：

```ts
interface RepositoryScopedItem<T> {
  folderId: string;
  folderName: string;
  data: T;
}
```

UI 默认展示 All Folders 聚合结果，并提供 Folder filter。列表 item 显示 owner Folder badge；详情读取继续携带 `folderId`。

解析后只有一个有效 Folder 时自动隐藏 filter 和 owner badge，保持当前体验。

### 13.2 Proposal Browser

- list 聚合所有成员 main/archive/linked worktree proposals。
- dedupe key 使用 `{ ownerFolderId, changeId }`。
- detail、spec delta、status watcher、apply、archive 都携带 ProposalRef。
- 同名 change 不互相覆盖。
- owner member missing 时保留只读错误卡片，不把整页置为失败。

### 13.3 Specs 与 Guidelines

- 数据始终读取 repository，不复制到 Workspace app-data。
- 聚合结果按 Folder 分组或支持 filter。
- 创建/维护行为必须显式选择 owner Folder。
- system reminder 告诉 Agent：修改前读取目标 owner Folder 的 specs/guidelines；跨 Folder 分析时分别遵守每个 repository 的约束。
- 如果多个成员的 guideline 冲突，修改哪个 repository 就以哪个 repository 的 guideline 为强约束；跨仓库变更需要在 proposal 中显式记录冲突处理。

### 13.4 Overview

Workspace overview 推荐分三类：

1. **Workspace work**
   - active sessions/tasks；
   - Workspace lineage；
   - Workspace knowledge。
2. **Repository governance aggregate**
   - specs/guidelines/proposals/archive 数量；
   - active proposals；
   - Git activity。
3. **Member health**
   - 每个成员的 path、Git/OpenSpec/guideline 健康；
   - missing/degraded 状态；
   - aggregate summary。

聚合计数必须按 owner Folder 分组后求和，不能把相同 `changeId` 当成重复项。Workspace 自身的 health 不持久化为一个独立 repository score；应从成员健康和 Workspace 配置状态派生。

## 14. Tasks、Workflow 与 Workspace Integration

### 14.1 Tasks

Local task board 属于 Workspace：

- legacy Workspace task 的 `projectId` 字段在迁移时转换为 `workspaceId`，新 schema 不保留该 alias。
- task 可以增加可选 `targetFolderIds`，用于提示可能涉及的 repositories；它不是 proposal owner。
- 从 task 创建 proposal 时，如果 `targetFolderIds` 只有一个，可以预选 owner；否则仍需确认。

外部 task 的 repository metadata（例如 GitHub repository）可用于建议 owner，但不能绕过 Workspace membership 校验。

### 14.2 Workflow

- built-in workflow 保持 global。
- custom workflow 属于 Workspace。
- apply/archive workflow run 固定 `ownerFolderId` 与 `checkoutRoot`。
- workflow stage 不得在运行中重新按 current primary 解析 owner。
- 未来需要跨 repository workflow 时，使用显式 per-stage repository target，而不是复用 v1 proposal run。

### 14.3 Workspace Integration

现有 “Project Integration” 在统一模型中解释为 Workspace Integration：

- Workspace 有独立 integration config。
- 不自动继承引用同一 Folder 的其他 Workspace config。
- resource 可以增加可选 `folderId` binding。
- 与 repository 强相关的 source-control/CI resource 应显式绑定成员 Folder。
- task/communication 等 Workspace 级 resource 可以不绑定 repository。

## 15. Local File Preview、Attachments 与路径链接

### 15.1 Trusted roots

Workspace window 的自动信任 roots 包含：

- 所有有效成员 canonical roots；
- 每个成员的 registered linked worktrees。

授权 grant key 使用：

```text
workspaceId + canonicalPath
```

不能只使用 primary Folder 的 worktree list。

### 15.2 Owner projection

本地文件 preview 结果建议增加可选：

```ts
{
  folderId?: string;
  checkoutPath?: string;
}
```

Main 使用 longest canonical root match 判断文件属于哪个成员或 worktree。由于 v1 禁止嵌套成员 roots，该判断没有歧义。

### 15.3 Attachments

- attachment 文件本体属于 Workspace session。
- resource link 指向成员文件时保存 canonical path 和 owner Folder。
- session 恢复时校验路径仍属于 session workspace snapshot。
- 不允许 Workspace 编辑后借旧 session attachment grant 访问新加入的目录。

## 16. System Reminder

Chat reminder 增加明确 Workspace block：

```xml
<workspace>
  primary folder
  authorized folders
  repository ownership rules
</workspace>
```

内容至少说明：

- 当前 `workspaceId`；
- primary Folder；
- 每个成员的 ID/name/root；
- proposal 必须选择一个 owner Folder；
- repository-relative path 必须在 owner root 下解释；
- apply/archive 只能修改 owner checkout；
- specs/guidelines 按 repository 分别生效。

Guidelines index 按成员分组；Knowledge index 来自 Workspace。Apply/Archive reminder 额外明确：

- `ownerFolderId`；
- main repository root；
- current checkout/worktree root；
- 不得修改其他 member roots。

## 17. Runtime、事件与并发隔离

### 17.1 Runtime key

以下 registry/watch key 继续以 Workspace 隔离：

```text
chat/probe: workspaceId + agentId
chat stream: workspaceId + sessionId
action: workspaceId + sessionId + actionId
```

repository-owned runtime 增加 owner：

```text
proposal watcher: workspaceId + ownerFolderId + changeId
apply/archive: workspaceId + ownerFolderId + changeId/runId
lineage event: workspaceId + ownerFolderId + sessionId
```

### 17.2 Event payload

legacy 项目作用域 event 的顶层 `projectId` 在迁移时转换为 `workspaceId`。新 payload 使用 `workspaceId` 与 `ownerFolderId`，不能用 `projectPath` 作为 UI identity。

### 17.3 Workspace 编辑并发

编辑成员/primary 前 Main 检查：

- active probe/chat session snapshot；
- active proposal create/apply/archive；
- proposal status watchers；
- pending Fyllo Actions；
- local file preview grants。

推荐 v1：

- 允许增加成员，新 session 生效；
- active session 存在时允许改变 primary，但只影响新 session；
- 存在引用时禁止移除成员，并返回引用摘要；
- 删除 Workspace 前关闭窗口、取消 runtime；app-data 延续当前保守策略，不自动递归删除。

## 18. Renderer 状态与 UI

### 18.1 Store

`useProjectStore` 应迁移为 Workspace store。内部过渡 adapter 可以短期存在，但新组件和 contract 不继续使用 Project 命名。推荐暴露：

```ts
currentWorkspace;
resolvedFolders;
primaryFolder;
isMultiRoot;
repositoryFilter;
```

Launcher 路径从 `WorkspaceLauncherItem` 投影读取；组件不得从 `currentWorkspace` 无条件读取 `.path`。

### 18.2 Navigation gating

现有 `requiresProject` 可以解释为 `requiresWorkspace`，保持 route 行为。额外增加 capability gating：

- Chat：至少存在一个能满足本次 `additionalDirectories` 需求的 Agent；没有附加目录时沿用当前单根条件；
- specs/guidelines/proposal：至少存在一个有效 member；
- Git/health 页面：按成员部分可用；
- Workspace-owned 页面（task/knowledge/workflow）在 secondary member missing 时仍可用。

### 18.3 Repository selector

Proposal/specs/guidelines/overview 使用统一的 Folder filter pattern：

- 解析后只有一个有效 Folder 时不显示 selector。
- 多个有效 Folder 时默认 All Folders。
- create/update 等写操作必须选择单个 Folder。
- detail 保持 owner 不随全局 filter 改变。

Workspace primary 的视觉标记只表达默认 cwd，不暗示所有写操作都属于 primary。

## 19. 错误与边界状态

至少需要标准化以下错误：

| 错误                                              | 行为                                            |
| ------------------------------------------------- | ----------------------------------------------- |
| Workspace 不存在                                  | 页面级 Workspace error，清空旧 session state    |
| Workspace 无成员                                  | 阻止保存；legacy corrupt meta 进入 repair state |
| primary 不在成员中                                | 阻止打开并要求修复                              |
| primary path missing                              | 阻止进入正常 Workspace                          |
| secondary path missing                            | degraded mode，局部 warning                     |
| roots 重复或嵌套                                  | 阻止保存                                        |
| `additionalDirectories` 非空且 Agent 不支持       | picker 不允许选择                               |
| `additionalDirectories` 非空且 capability unknown | 先刷新/探测，不乐观选择                         |
| ownerFolderId 非成员                              | Main/MCP 拒绝                                   |
| proposal changeId 跨成员重名                      | 要求 ProposalRef，不猜 owner                    |
| linked checkout 不属于 owner repo                 | MCP/Apply/Archive 拒绝                          |
| session snapshot path missing                     | 阻止恢复并建议新建或修复                        |
| member 被 active run 引用                         | 阻止移除并返回引用                              |
| 部分 repository reader 失败                       | 返回 partial data + per-folder warning          |

## 20. 迁移策略

### 20.1 Meta

- 首次进入新版本时扫描 legacy Project meta，并为每个 Project 创建一个 Folder registry entry 和一个单根 Workspace。
- 迁移后的 Workspace 保留 legacy Project ID；Folder 获得独立稳定 ID。
- 新运行期只读写 Workspace v2 与 Folder v1，不长期保留 Project v1 union/normalization。
- parser 必须 schema validate，不能继续直接 `JSON.parse(...) as ProjectMeta`。
- 迁移必须有 journal、幂等重试和回滚备份；全部引用校验通过前不删除 legacy meta。

### 20.2 App-data

- 现有 Project ID 直接成为迁移后 `workspaceId`，以保持 window/session/task 等引用稳定。
- 旧 `<appData>/projects/<id>` 迁移到 `<appData>/workspaces/<workspaceId>`；Folder path/meta 迁移到 `<appData>/workspace-folders/<folderId>`。
- migration journal 逐项记录 source、destination、checksum/schema validation 与 rollback state。
- 如果检测到 path-based 与 id-based 目录不同，停止该项并进入 repair state，不能静默合并覆盖。
- 新运行期不对 `projects` 与 `workspaces` 双写；legacy 目录仅作为迁移备份读取。

### 20.3 Session

- legacy session 没有 workspace snapshot 时，按迁移后所属单根 Workspace 生成单成员 snapshot。
- Workspace session 从创建开始必须有 snapshot。
- session schema 将 legacy `projectId` 一次性迁移为 `workspaceId`。

### 20.4 Lineage

- legacy lineage index v1 属于一个旧 Project，可按其迁移得到的 Workspace/Folder 映射转换为：
  - Workspace subjects 保持原位置；
  - proposal/commit entries 写入对应 Folder 的 repository index v2。
- migration 必须幂等，保留原文件直到 v2 验证完成。
- 新建的多根 Workspace 没有 legacy lineage；迁移只处理由旧 Project 得到的单根 Workspace，不跨 Folder 猜测 owner。

### 20.5 Knowledge

- legacy Project knowledge anchor 无 owner 时默认归属迁移得到的唯一 Folder。
- Workspace 新 knowledge 的 file/package anchor 强制 `folderId`。
- 不把成员已有 knowledge 自动复制到 Workspace。

### 20.6 MCP compatibility

- 迁移期 adapter 可为尚未升级的 bundled MCP 发送 v1 headers/env，但只接受单根 Workspace。
- 升级后的 Workspace session 统一使用 v2。
- Cortex/Specs shared resolver 只消费 v2；legacy 输入转换发生在 Main adapter，不在每个 server 内构造 Project compatibility model。
- 所有 bundled MCP 完成切换后移除 direct `getProjectPath()` 依赖与 v1 adapter。

## 21. 分阶段实施

### Phase 0：Contract inventory 与回归基线

- 建立所有 `projectId/projectPath/projectDir` 调用点清单。
- 标记每个能力属于 Global、Workspace、Repository、Checkout 或 Runtime。
- 为当前单 Project 窗口、session、proposal、lineage、MCP 行为补齐回归测试。
- 冻结现有 app-data path 与 JSON schema fixture。

退出条件：每一个 project-level service 都有明确目标 scope，且 legacy 单 Project contract 有可运行基线。

### Phase 1：Workspace foundation

- 引入 `WorkspaceMeta`、`WorkspaceFolderMeta` 与 schema parser。
- 实现 Project → Workspace + Folder 的 migration journal、校验与回滚。
- 实现 `ResolvedWorkspace` / `ResolvedRepositoryTarget`。
- storage helper 从 path identity 转为 Workspace/Folder ID。
- window manager 将 key 语义升级为 Workspace ID。
- 不开放 Workspace 创建 UI。

退出条件：现有 Project 数据全部迁移为单根 Workspace，业务运行期不再加载 Project 类型，用户行为与数据内容不变。

### Phase 2：Launcher 与 Workspace lifecycle

- 创建/编辑 Workspace IPC、service、preload、renderer API。
- launcher 只展示 Workspace item，并按单根/多根规则展示路径摘要。
- primary、成员、missing path、重复/嵌套 root 校验。
- Workspace window bootstrap 和 window state。
- 删除/移除引用保护。

退出条件：Workspace 可以安全创建、打开和编辑；Workspace Chat 在 Phase 3 完成前保持不可用。

### Phase 3：ACP multi-root session

- capability cache/selectors 支持 additionalDirectories。
- ChatEmpty picker 过滤和说明状态。
- probe/new/load/resume lifecycle 传递 roots。
- SessionWorkspaceSnapshot 持久化。
- attachments/local preview 使用 Workspace roots。
- system reminder 注入 Workspace。

退出条件：需要附加目录时只有兼容 Agent 可以创建、恢复 Workspace chat；没有附加目录时不兼容 Agent 仍可按单 root session 使用。

### Phase 4：MCP Workspace v2

- 设计并实现 opaque token 或 signed claim。
- HTTP/stdio Workspace v2。
- shared Workspace/folder/checkout resolver。
- MCP event 增加 workspace/owner。
- 保留受限、可移除的单根 v1 transport adapter。

退出条件：同一 ACP session 中 MCP 能安全路由到任一授权成员，无法访问非成员 path。

### Phase 5：`fyllo-specs` 与 Proposal lifecycle

- ProposalRef。
- create/explore/apply/archive owner 参数。
- linked worktree 按 owner repository 创建。
- browser/status watcher/run meta/event rail 全链路 owner 化。
- Workspace proposal 聚合和 Folder filter。

退出条件：A/B 同名 proposal 不冲突；在 B 创建的 proposal/worktree/apply/archive 全程只操作 B。

### Phase 6：`fyllo-cortex` 与 Insight

- guidelines owner selector。
- Workspace knowledge + folder-qualified anchors。
- lineage Workspace subjects + repository reverse index。
- specs/guidelines/proposal/overview 聚合 reader。
- partial failure、missing member 和 owner badge。

退出条件：Cortex 和所有治理页面都能正确解释 Workspace 与 repository scope。

### Phase 7：Automation 与剩余项目级能力

- task/workflow/integration config 使用 Workspace storage。
- repository-bound integration resource 增加 folder binding。
- overview health aggregate。
- local file links、action、plan、spawned session 等剩余调用点复核。

退出条件：scope inventory 中没有仍把 Workspace 当作单一 projectPath 的能力。

### Phase 8：Migration settlement 与 hardening

- lineage v1 → v2 migration。
- 校验 migration journal，处理 repair case，并在安全窗口后清理 legacy 备份。
- compatibility telemetry 和失败恢复。
- 大量成员、missing roots、symlink、Windows path 测试。
- 移除不再需要的 v1 MCP/path facade。
- 更新 guidelines 与正式 specs。

## 22. OpenSpec Proposal 拆分建议

该能力不适合一个巨型 proposal。建议按依赖关系拆为：

1. `introduce-workspace-model`
   - Workspace/Folder meta、Project migration、resolver、storage identity、window contract。
2. `add-multi-root-workspace-lifecycle`
   - launcher create/edit/open、primary/member/missing path UX。
3. `add-acp-multi-root-sessions`
   - Agent gating、additionalDirectories、session snapshot、reminder。
4. `add-multi-root-mcp-workspace`
   - Workspace v2、安全授权、shared resolver、event owner。
5. `make-openspec-proposals-repository-owned`
   - ProposalRef、owner routing、linked worktree、apply/archive/browser。
6. `make-cortex-workspace-aware`
   - guidelines、knowledge anchors、lineage dual scope。
7. `aggregate-workspace-folder-features`
   - overview/specs/guidelines/proposal readers、tasks/workflows/integrations。
8. `migrate-project-scoped-app-data`
   - lineage/meta compatibility、hardening 和 cleanup。

每个 proposal 都必须保持前一阶段已迁移的单根 Workspace 行为可回归，不能要求所有阶段一次合并后才可运行。

## 23. 测试矩阵

### 23.1 Shared/domain

- legacy Project migration 与 Workspace/Folder meta parsing；
- Workspace meta invariants；
- Workspace resolution 与派生 single/multi-root 状态；
- member/owner validation；
- canonical root duplicate/nesting；
- ProposalRef serialization；
- knowledge anchor/lineage v2 schema；
- legacy compatibility。

### 23.2 Main

- Workspace window 唯一性；
- 引用同一 Folder A 的 Workspace WA 与 Workspace W 窗口并存；
- Workspace storage isolation；
- missing primary/secondary；
- active reference member removal；
- trusted roots 与 worktrees；
- watcher/stream/probe key isolation；
- partial repository scan。

### 23.3 ACP

- 无附加目录时的普通 picker，以及有附加目录时 compatible/incompatible/unknown capability picker；
- probe/new/load/resume 的 cwd/additionalDirectories；
- session snapshot 不随 Workspace 编辑变化；
- primary change 只影响新 session；
- missing snapshot root 恢复错误；
- apply/archive 不获得其他 member roots。

### 23.4 MCP

- single-root Workspace compatibility；
- multi-root Workspace decode/auth；
- owner member allow/deny；
- arbitrary path injection deny；
- owner worktree validation；
- A/B 同名 change；
- HTTP 并发 Workspace 隔离；
- stdio fallback；
- Workspace token/claim 过期和篡改。

### 23.5 Proposal

- A/B 各自 create linked worktree；
- aggregated explore；
- duplicate change ID；
- detail/status/apply/archive 使用正确 owner；
- archive 只 merge/cleanup owner repository；
- event/lineage 保存 owner。

### 23.6 Cortex/Insight

- guidelines 按 owner；
- Workspace knowledge 独立存储；
- file/package anchor 按 member 校验；
- trace file/commit/proposal 按 repository；
- 单根 Workspace 能通过 Folder repository reverse index 追踪来自其他 Workspace 的 proposal；
- aggregate browser partial error；
- overview 计数不按 changeId 跨 repo dedupe。

### 23.7 Renderer

- launcher Workspace item 与单根/多根路径摘要；
- create/edit primary/member；
- degraded Workspace warning；
- Agent picker gating；
- repository filter 和 owner badge；
- 同名 proposal detail；
- 单根 Workspace 不显示多余 multi-root UI；
- 窄窗口、键盘焦点、错误和空状态。

### 23.8 跨平台

- macOS/Linux/Windows absolute paths；
- case sensitivity；
- symlink canonicalization；
- drive letter/UNC path；
- Git 与 non-Git member；
- member roots 中包含空格和非 ASCII 字符。

## 24. 验收标准

整体能力完成时应满足：

- 旧 Project 由应用自动、可恢复地迁移为单根 Workspace，用户无需手工操作且现有 app-data 可读。
- Workspace 有稳定 ID、成员集合和唯一 primary。
- 运行期只存在 Workspace，单根与多根由 Folder 数量派生。
- Launcher 单根 Workspace 显示唯一 Folder 完整路径；多根 Workspace 显示 primary path + Folder 数量摘要。
- Workspace Chat 仅在 `additionalDirectories` 非空时限制为支持该 capability 的 Agent；单 root session 保持现有 Agent 可用性。
- ACP 所有 session lifecycle 请求使用一致的 roots snapshot。
- MCP connection 无需重建即可在授权成员之间按 Folder ID 路由。
- MCP 无法通过伪造 absolute path 访问非成员目录。
- proposal、worktree、apply、archive 全程固定 owner Folder。
- 不同成员的同名 `changeId` 不冲突。
- specs、guidelines、proposal、Git 数据保持 repository-owned。
- session、task、knowledge、workflow、integration config 保持 Workspace-owned。
- lineage 能从 repository proposal/commit 追溯到创建它的 Workspace session。
- Workspace 部分成员失败不会让所有 Workspace-owned 功能不可用。
- 删除、移除成员和修改 primary 不会让 active runtime 静默漂移。
- scope inventory 中不再存在未经解释的 `projectPath` 单 root 假设。

## 25. 实施前仍需确认的产品决策

本文采用以下推荐默认值，正式 proposal 前需要逐项确认：

1. 引用同一 Folder 的不同 Workspace，其 knowledge/task/integration config 相互隔离，不自动继承。
2. 已有 session 冻结创建时 roots，不随 Workspace 编辑热更新。
3. primary missing 阻止打开；secondary missing 允许 degraded mode。
4. v1 禁止重复或嵌套 member roots。
5. v1 proposal 只有一个 owner repository。
6. apply/archive Agent 只获得 owner checkout，不获得其他成员可写目录。
7. Workspace repository 页面默认 All Folders，并提供 filter。
8. Workspace 删除默认不递归删除 app-data，与现有保守删除语义一致。
9. “打开文件夹”按 canonical path 复用既有单根 Workspace，还是每次允许创建新的单根 Workspace。

这些决定中，1、2、5、6 会直接影响持久化和执行安全，应在最早的 foundation/ACP/proposal specs 中固定下来。

## 26. 当前代码影响面索引

以下是正式提案和实施时必须复核的主要入口，不代表完整文件清单：

- Meta/registry：`src/shared/types/project.ts`、`src/main/infra/storage/project-store.ts`
- Workspace storage：`src/main/infra/storage/project-paths.ts`
- Window：`src/shared/types/window.ts`、`src/main/bootstrap/project-window-manager.ts`
- Launcher/store：`src/renderer/src/stores/workspace/project.ts`、`src/renderer/src/components/welcome/**`
- ACP capabilities：`src/shared/types/acp-agent.ts`、`src/main/infra/storage/agent-capability-store.ts`
- Chat/probe：`src/main/services/session/chat/acp-session.ts`、`session-probe-service.ts`
- Session storage：`src/main/infra/storage/session-store.ts`
- MCP transport/context：`src/main/infra/mcp/bundled-mcp-servers.ts`、`src/mcp-servers/shared/request-context.ts`
- `fyllo-specs`：`src/mcp-servers/fyllo-specs/src/tools/**`、`runtime-workspace/**`
- `fyllo-cortex`：`src/mcp-servers/fyllo-cortex/src/tools/**`、`utils/knowledge.ts`、`utils/lineage-reader.ts`
- Proposal：`src/main/services/proposal/**`、`src/main/infra/proposal/openspec-reader.ts`
- Insight：`src/main/services/insight/**`
- Automation：`src/main/services/automation/**`、相关 storage
- Local file preview：`src/main/services/workspace/document/local-file-preview-service.ts`
- System reminder：`src/main/services/session/chat/system-reminder/**`
- Shared contracts：`src/shared/types/{proposal,lineage,knowledge,chat,task,workflow,integration}.ts`

正式实施前应重新运行全仓 `projectId/projectPath/projectDir/FYLLO_PROJECT_PATH` inventory；本设计只提供 scope 和目标边界，不能替代当时的代码事实。
