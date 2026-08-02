# Multi-root Workspace 整体规划

创建时间：2026-07-28

状态：参考设计草案

本文档规划 FylloCode 从单一 Project 模型迁移到统一 Workspace 模型后的整体适配方向。它是 `references/` 下的参考设计，不是 OpenSpec proposal，也不是当前行为契约。正式实施会改变 Workspace 元数据、IPC、ACP session、MCP Workspace、proposal identity、lineage schema 和多个用户可见页面，必须拆分为正式 OpenSpec proposals 后逐步落地。

## 1. 结论摘要

Workspace 接管现有 Project 的职责，可以复用行为与流程，但不复用 Project 命名、字段或公开 contract：

- launcher 最近使用列表；
- 窗口唯一性、窗口状态和打开流程；
- 当前 renderer Workspace；
- session、task、knowledge 等“当前工作上下文”的大部分 UI；
- 稳定 ID 作为窗口和运行时隔离 key 的机制，目标字段统一为 `workspaceId`。

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
folderPath         Folder 当前所在的磁盘路径
workspaceDataDir   session/task/knowledge 等 Workspace 数据目录
worktreePath       Git 操作当前实际使用的主工作树或关联工作树路径
cwd                当前 Agent session 的主工作目录
```

推荐方案是：

1. 顶层领域对象只保留 `Workspace`，但持久化区分 `kind: "folder" | "collection"`。
2. “打开文件夹”创建或复用成员不可编辑的 Folder Workspace；“创建 Workspace”始终创建成员可编辑的 Collection Workspace。
3. Workspace 保存 `folderIds` 和 `primaryFolderId`，不保存虚假的 Workspace `path`；Folder Workspace 固定一个 Folder，Collection Workspace 在 v1 包含 1–16 个 Folder。
4. Workspace-scoped 数据按 `workspaceId` 存储；repository-scoped 能力显式携带 `folderId`。
5. Workspace chat 使用 primary `folderPath` 作为 `cwd`，其他有效成员的 `folderPath` 作为 ACP `additionalDirectories`。
6. 只有当本次 Workspace session 的 `additionalDirectories` 非空时，ChatEmpty agent picker 才只允许选择明确支持 `sessionCapabilities.additionalDirectories` 的 Agent。
7. Proposal v1 采用“单一 owner repository”模型，身份为 `{ folderId, changeId }`，linked worktree 创建在该 Folder 对应的 repository。
8. MCP 连接携带固定、受授权的 Workspace Folder 集合；tool call 使用 `folderId` 动态选择成员，不接受任意磁盘路径。
9. Workspace 自身拥有 session、task、knowledge、workflow 和 integration config；repository 中的 specs、guidelines、proposal 和 Git 状态不复制。
10. 实施必须按 foundation/cutover → launcher → ACP → MCP/proposal → Cortex/insight → automation/UX → migration settlement/hardening 分阶段完成。

## 2. 设计目标

### 2.1 用户目标

- launcher 只展示可打开的 Workspace。
- “打开文件夹”创建或复用唯一的 Folder Workspace；“创建 Workspace”创建 Collection Workspace。
- 用户可以创建、编辑、删除 Collection Workspace，并配置 1–16 个 Folder 和一个 primary Folder；Folder Workspace 只允许修改显示名称或重新定位唯一 Folder。
- Workspace chat 中 Agent 能以 primary Folder 为主目录访问所有有效 Folder。
- Agent 创建 OpenSpec proposal 时，proposal 和 linked worktree 落到明确的 owner Folder。
- specs、guidelines、proposal、Git、lineage 等 repository 能力不会错误地默认落到 primary Folder。
- 同一个 Folder 可以被它唯一的 Folder Workspace 和多个 Collection Workspace 引用；各 Workspace 的 session、task、knowledge、workflow 和 integration config 完全隔离。

### 2.2 工程目标

- `kind` 只控制创建入口、成员编辑权限和对应界面；其他 feature 统一消费同一个 Workspace contract。
- 保持 main process 对窗口上下文、路径授权和数据归属的最终所有权。
- 通过现有 main-process upgrade migration 保持 Project 数据和打开行为兼容；只有 required cutover 成功后才进入不含 Project 类型的新运行期。
- 不把用户传入的绝对路径直接当作 MCP 授权依据。
- 允许后续增加 Workspace member reorder、missing path recovery 和更多聚合视图，而不再次改变底层 identity。
- 分阶段只表达依赖与交付顺序；每个阶段直接落到最终命名和 contract，不在 runtime 保留 Project alias、旧协议 adapter、双读双写或待清理 facade。legacy 数据只允许由 upgrade migration 和 repair 路径读取。

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
- 支持同一 canonical path 对应多个 Folder，或同一 Workspace 内的成员路径相互嵌套。v1 中 canonical path 在全局 Folder registry 内必须唯一；嵌套限制只作用于同一 Workspace 的成员集合，避免 owner 推断和路径授权产生歧义。

## 4. 术语与命名

FylloCode 现有代码中已经有多种容易混淆的 “workspace”。本文将 `Workspace` 作为唯一顶层领域词，`Folder` 作为 Workspace 内部成员。`folder` 与 `collection` 是持久化种类；single-root 与 multi-root 只描述本次解析出的有效 Folder 数量，不能替代 `kind`。

| 名称                             | 本文术语                 | 含义                                      |
| -------------------------------- | ------------------------ | ----------------------------------------- |
| launcher 可打开项                | **Workspace**            | 唯一顶层工作单元                          |
| Workspace 内的目录               | **Workspace Folder**     | 可被一个或多个 Workspace 引用的成员目录   |
| “打开文件夹”产生的 Workspace     | **Folder Workspace**     | `kind: "folder"`，固定绑定一个 Folder     |
| “创建 Workspace”产生的 Workspace | **Collection Workspace** | `kind: "collection"`，包含 1–16 个 Folder |
| 一个有效 Folder 的运行状态       | **Single-root**          | 派生能力状态，不决定 Workspace kind       |
| 多个有效 Folder 的运行状态       | **Multi-root**           | 派生能力状态，不决定 Workspace kind       |
| Git 主工作树或关联工作树         | **Worktree**             | repository 操作实际使用的磁盘工作目录     |

正式实现中应避免用裸 `workspacePath` 同时表达当前 Workspace 和 Git worktree。推荐命名：

- `workspaceId`：当前窗口打开的工作单元 ID；
- `workspaceKind`：其他 schema 表示 Workspace kind 时使用，值为 `"folder" | "collection"`；
- `folderId`：Workspace Folder ID；在 repository-owned schema 中自然表示 owner；
- `folderPath`：Folder 当前所在的磁盘路径；
- `worktreePath`：repository 操作当前实际使用的主工作树或关联工作树路径；
- `workspaceDataDir`：当前 Workspace 的 app-data；
- `primaryFolderId`：Workspace 的默认 cwd owner；
- `additionalDirectories`：除 cwd 外传给 ACP 的成员 `folderPath`。

迁移后的公开 contract 不再使用 `workspacePath` / `workspaceMode` 表示 Git worktree。现有 `fyllo-specs` 中的这两个名称只属于 legacy inventory；目标名称固定为 `worktreePath` / `worktreeMode`，避免与顶层 Workspace 混淆。

命名规则：

- `FolderMeta` 自身使用局部字段 `id`、`name`、`path`。
- 其他 schema 扁平化表示 Folder 时使用 `folderId`、`folderName`、`folderPath`。
- 其他 schema 如果直接嵌套完整 `FolderMeta`，不重复增加前缀。
- `folderPath` 已经表达 Folder 的根路径，不再引入 `rootPath`。

目标 IPC、UI、runtime 和持久化 schema 只使用 `workspaceId` 或 `folderId`。`projectId` 仅允许出现在 upgrade migration 对旧数据的读取逻辑和现状 inventory 中，不进入迁移后的 contract。

## 5. 核心不变量

### 5.1 Workspace 与 repository 分离

- 一个打开窗口只绑定一个 `workspaceId`。
- Workspace 至少包含一个 Folder，并且恰好一个 primary。
- v1 的 Workspace 最多包含 16 个 Folder；创建、编辑和 upgrade repair 都必须拒绝超过上限的成员集合，不通过 reminder 分页或静默裁剪绕过该限制。
- Workspace 必须持久化 `kind: "folder" | "collection"`，不能从 Folder 数量推断。
- `kind` 创建后不可修改，不提供 Folder Workspace 与 Collection Workspace 的原地转换。
- Folder Workspace 恰好包含一个 Folder，primary 必须是该 Folder，成员不可编辑。
- Collection Workspace 包含 1–16 个 Folder，primary 必须属于成员集合，成员可以编辑。
- Collection Workspace 即使只有一个 Folder 也不能改写为 Folder Workspace。
- `workspaceId` 不能直接用于推导 repository path。
- repository-owned schema 的 `folderId` 必须属于当前 Workspace 的授权成员集合。

### 5.2 数据归属显式化

- session/task/knowledge 等用户工作历史属于 Workspace。
- specs/guidelines/proposal/Git/worktree 属于 repository。
- apply/archive 属于一个 proposal owner Folder 的具体 worktree。
- 任何同时涉及两类作用域的记录必须同时保存 `workspaceId` 与 `folderId`，不能依赖当前 primary 反推历史归属。

### 5.3 路径不作为公开身份

- UI、IPC 和 MCP tool 优先传稳定 ID。
- 绝对路径只作为 Main/MCP runtime 解析后的执行结果。
- 所有 owner 选择必须经过当前 Workspace 成员白名单校验。
- canonical path 可以作为 Folder registry 的反向查找输入：先查找已存在的稳定 `folderId`，只有不存在时才创建新 Folder。
- 新运行期禁止通过 `encodeProjectPath(path)` 或其他路径编码算法计算、恢复或验证已有 `folderId`；路径不是 ID 的派生规则。
- 同一 canonical path 在全局 Folder registry 中最多对应一个 `folderId`。同一 Workspace 内的成员还必须通过路径包含校验，禁止相互嵌套。
- canonical path 去重、反向解析和路径包含校验由 Main 中的 Folder registry service 统一拥有；MCP shared runtime 只消费已授权的解析结果，不自行建立第二套身份规则。

### 5.4 历史不可随 Workspace 编辑漂移

- Proposal、lineage link、knowledge anchor 和 apply run 保存创建时的 owner Folder。
- 已创建的 chat session 保存自己的目录快照。
- 修改 primary Folder 只影响新 session 和没有固定 owner 的新操作。
- 删除成员前必须处理仍引用该成员的 active session/proposal/run。
- Session snapshot 只冻结本次授权的 identity/path，不永久覆盖 Workspace membership 撤销：非 active Session 引用的成员被移除后，历史内容保留，但该 Session 在成员重新加入前不得恢复 Agent 或重建 MCP/reminder activation。

## 6. 目标领域模型

### 6.1 持久化 Meta

建议将当前 `ProjectMeta` 迁移为版本化 `WorkspaceMeta`，并增加独立的 Folder registry：

```ts
type WorkspaceKind = "folder" | "collection";

interface WorkspaceMeta {
  version: 2;
  id: string;
  name: string;
  kind: WorkspaceKind;
  isDeleted: boolean;
  deletedAt?: string;
  cleanupState?: "restorable" | "purging" | "cleanup-failed";
  legacyAppDataKey?: string;
  folderIds: string[];
  primaryFolderId: string;
  createdAt: string;
  lastOpenedAt: string;
}

interface FolderMeta {
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
- Folder registry 负责稳定的 `folderId → path` 映射和权威的 `canonical path → folderId` 反向解析；同一 Folder 可被多个 Workspace 引用而不复制 path/health。
- `folderIds` 保留顺序，primary 不必固定为数组第一项。
- `kind` 是持久化行为契约；`folderCount` 和 `isMultiRoot` 才是派生值。
- `isDeleted` 是 Workspace tombstone；删除不得移除 meta 或依靠无法重建的不透明 `workspaceId` 留下孤儿 app-data。`isDeleted === false` 时不得保留 deletion fields；为 `true` 时必须有 `deletedAt` 与 `cleanupState`。只有 `restorable` 可以恢复；`purging` / `cleanup-failed` 只允许继续或重试永久清理，避免把已部分清理的数据重新开放为正常 Workspace。
- `legacyAppDataKey` 只由 cutover 在全部 legacy Project 的 `encodeProjectPath(legacyProject.path)` 候选值中确认唯一后持久化，用于迁移保留期内证明某个 legacy source 可归属。`encodeProjectPath` 是有损变换，其候选值不保证全局唯一，不得被用作 Workspace identity、Folder path 或 registry/map key；候选值碰撞的迁移 Workspace 与 fresh Workspace 都不设置该字段。批量 legacy cleanup 成功删除对应 source/record 后必须清除。

Folder registry 的身份与路径规则：

- 新创建的 Folder 分配与路径无关的不透明 `folderId`；由 legacy Project 迁移得到的 Folder 保留 legacy ID。
- 有效 Folder 的 `FolderMeta.path` 保存 canonical absolute path，不保存目录选择器返回的 symlink 表面路径。由 legacy migration 读到的 missing path 暂时保留最后已知绝对路径并标记为 missing，不参与 canonical path 反向索引，直到用户恢复或重新定位。
- registry 以有效 Folder 的 `FolderMeta.path` 建立反向解析；反向索引的具体持久化形式由 proposal 决定，也可以从 Folder meta 重建。
- `resolveOrCreateFolder(path)` 必须先 canonicalize，再按 canonical path 查找现有 Folder；未命中时才分配新 ID。
- `relocateFolder(folderId, path)` 只更新稳定 Folder 的当前路径，不改变 `folderId`，也不创建第二个 Folder Workspace。
- Folder 的解析、新建和重定位是 Main 拥有的原子 registry mutation；并发请求不能让同一 canonical path 产生多个 Folder。
- exact canonical path 冲突在全局 registry 层拒绝。路径嵌套冲突按 Workspace 成员集合校验；重定位时必须检查所有引用该 Folder 的 Workspace，任一 Workspace 会产生重复或嵌套成员时，整次重定位拒绝且不写入。

#### `kind` 决策记录

`WorkspaceMeta.kind` 必须保留，最终取值固定为 `"folder" | "collection"`：

| kind         | 创建入口       | 成员约束                                               | 成员编辑 |
| ------------ | -------------- | ------------------------------------------------------ | -------- |
| `folder`     | 打开文件夹     | 恰好一个 Folder，且 `primaryFolderId === folderIds[0]` | 禁止     |
| `collection` | 创建 Workspace | 1–16 个 Folder，primary 必须属于成员集合               | 允许     |

明确否决“无 kind、根据 Folder 数量推导类型”的方案，原因如下：

1. Collection Workspace 可以暂时只有一个 Folder，Folder 数量不能表达成员是否允许编辑。
2. 如果“打开文件夹”创建的 Workspace 可以添加 Folder，它会变成多根环境；用户再次打开原文件夹时只能新建另一个 Workspace，原有 session 等 Workspace-owned 数据看似丢失。
3. Folder Workspace 必须始终以相同 `workspaceId` 重新打开，保证其 session、task、knowledge、workflow 和 integration config 连续。
4. Folder Workspace 与包含同一 Folder 的 Collection Workspace 必须完全隔离，否则已有 session 的授权目录会随另一个 Workspace 的成员变化而漂移。
5. `"single-root" | "multi-root"` 只描述 `additionalDirectories` 等运行状态，不表达创建语义和成员修改权限，因此不能替代 `kind`。

同样否决把两者拆成 Folder 与 Workspace 两套顶层 contract。两种 kind 共享同一 `WorkspaceMeta`、`workspaceId`、窗口、storage、session、MCP 和 resolver；只有创建、成员变更和界面操作读取 `kind`。这使行为边界明确，同时避免重型归一化。

Folder Workspace 使用确定的一对一身份关系：

```text
workspace.kind = "folder"
workspace.id = workspace.folderIds[0]
workspace.primaryFolderId = workspace.folderIds[0]
```

即 Folder Workspace 的 `workspaceId` 与唯一 `folderId` 在各自命名空间中取相同值。打开文件夹先通过 Folder registry 的 canonical path 反向解析能力获取稳定 `folderId`，再打开同 ID 的 Folder Workspace。这里不增加的是“Folder → 默认 Workspace”绑定表；Folder registry 自身必须提供 path → ID 解析，但其存储形式不属于公开 schema。

旧 Project `meta.json` 不在运行期被长期兼容解析，而是在数据迁移阶段转换为：

```ts
{
  version: 2,
  id: legacyProject.id,
  name: legacyProject.name,
  kind: "folder",
  folderIds: [migratedFolder.id],
  primaryFolderId: migratedFolder.id,
  createdAt: legacyProject.createdAt,
  lastOpenedAt: legacyProject.lastOpenedAt
}
```

升级迁移应保留原 Project ID 作为新的 Workspace ID，从而保持 launcher 顺序、窗口状态、session/task 等 app-data 引用。转换必须通过 `src/main/migrations/scripts/` 中已注册的升级迁移完成，并由现有 `migrations.json` 账本记录结果；初次转换不删除旧文件，legacy cleanup 留给后续版本的新迁移 ID。

### 6.2 运行期解析模型

所有 project-level use case 应先通过一个统一 resolver 获取运行期上下文：

```ts
interface ResolvedWorkspaceFolder {
  folderId: string;
  folderName: string;
  folderPath: string;
  pathMissing: boolean;
}

interface ResolvedWorkspace {
  workspaceId: string;
  workspaceName: string;
  workspaceKind: WorkspaceKind;
  workspaceDataDir: string;
  primaryFolderId: string;
  folders: ResolvedWorkspaceFolder[];
  availableFolders: ResolvedWorkspaceFolder[];
  missingFolders: ResolvedWorkspaceFolder[];
  cwd: string;
  additionalDirectories: string[];
}
```

Folder Workspace 的解析结果：

```text
folders = [primaryFolder]
workspaceKind = "folder"
primaryFolderId = primaryFolder.folderId
cwd = primaryFolder.folderPath
additionalDirectories = []
```

这样 session、window、storage、MCP 和大部分 UI 只消费 `ResolvedWorkspace`。`workspaceKind` 只用于成员 mutation 与对应界面，不产生两套 session/MCP 实现。

### 6.3 Repository target

repository-owned use case 使用更窄的解析结果：

```ts
interface ResolvedRepositoryTarget {
  workspaceId: string;
  folderId: string;
  worktreePath: string;
}
```

解析规则：

1. 校验 window/session 实际绑定的 `workspaceId`。
2. 加载 `ResolvedWorkspace`。
3. 校验 `folderId` 是有效成员，且对应 `folderPath` 是可用的 Git repository。
4. 如果没有指定关联 worktree，则 `worktreePath = folderPath`。
5. 如果指定了关联 worktree，校验 `worktreePath` 属于该 Folder repository 的 registered worktree。

## 7. 存储作用域

### 7.1 推荐矩阵

| 数据                              | Scope                    | 推荐目录/归属                                                          |
| --------------------------------- | ------------------------ | ---------------------------------------------------------------------- |
| launcher meta                     | Workspace                | `<appData>/workspaces/<workspaceId>/meta.json`                         |
| Folder registry                   | Global                   | `<appData>/workspace-folders/<folderId>/meta.json`                     |
| window state                      | Workspace                | `<appData>/window-state/workspaces/<workspaceId>.json`                 |
| sessions/messages/attachments     | Workspace                | `<appData>/workspaces/<workspaceId>/sessions/**`                       |
| plans                             | Workspace + Session      | `<appData>/workspaces/<workspaceId>/sessions/<sessionId>/plans/**`     |
| local tasks                       | Workspace                | `<appData>/workspaces/<workspaceId>/tasks/**`                          |
| custom workflows                  | Workspace                | `<appData>/workspaces/<workspaceId>/workflows/**`                      |
| Workspace integration config      | Workspace                | `<appData>/workspaces/<workspaceId>/integrations/config.json`          |
| durable knowledge                 | Workspace                | `<appData>/workspaces/<workspaceId>/knowledge/**`                      |
| chat lineage subjects             | Workspace                | `<appData>/workspaces/<workspaceId>/lineage/subjects/**`               |
| proposal/commit reverse lineage   | Repository Folder        | `<appData>/workspace-folders/<folderId>/lineage/repository-index.json` |
| MCP events                        | Workspace + Session      | `<appData>/workspaces/<workspaceId>/mcp-events/**`                     |
| apply/archive runs                | Workspace + owner Folder | Workspace 目录存 run，meta 内固定 `folderId + worktreePath`            |
| specs/guidelines/OpenSpec changes | Repository               | `<worktreePath>/**`                                                    |
| linked worktrees                  | Repository               | `<folderPath>/.worktrees/<changeId>`                                   |
| ACP registry/capability cache     | Global                   | 保持现有全局 app-data                                                  |
| provider credentials/connections  | Global                   | 保持现有全局 app-data                                                  |

soft delete 只更新 launcher meta 中的 tombstone，保留表中全部 Workspace-scoped 数据。永久清理删除该 `workspaceId` 的 launcher meta、`<appData>/workspaces/<workspaceId>/**` 与 `<appData>/window-state/workspaces/<workspaceId>.json`；迁移保留期内还必须按 §20.3–§20.4 删除持久化 `legacyAppDataKey` 证明唯一归属的 active legacy source。候选 key 碰撞而未持久化 provenance 的 source 属于无法安全归属的 legacy orphan；不得把它、Folder registry 或 `<appData>/workspace-folders/<folderId>/**` 纳入单个 Workspace 清理。

### 7.2 `projectDir(projectPath)` 的迁移

当前多个 storage helper 使用 `projectPath` 计算：

```text
<appData>/projects/<encodeProjectPath(projectPath)>
```

迁移后的 Workspace 保留 `legacyProject.id` 是为了身份稳定，与该 ID 当前是否等于 `encodeProjectPath(legacyProject.path)` 无关；新运行期不得用两者的等式作为身份或存储前提。cutover 读取 legacy app-data 时，来源 key 必须按旧 helper 的真实调用语义由当前 meta 计算：

```ts
const candidateLegacyAppDataKey = encodeProjectPath(legacyProject.path);
```

不得用 `legacyProject.id` 代替该 source locator。`encodeProjectPath` 是有损变换，`candidateLegacyAppDataKey` 不保证全局唯一；cutover 必须在全部迁移候选上按该值分组，只有恰好命中一个 legacy Project 的候选值才可作为 `WorkspaceMeta.legacyAppDataKey` 持久化。碰撞组仍按既有 helper 指向的 source 完成 cutover，但组内 Workspace 均不持久化 provenance，不得把候选值用作 identity 或 registry/map key。目标 helper 再改为：

```ts
workspaceDataDir(workspaceId);
```

升级迁移负责把 `<appData>/projects/<candidateLegacyAppDataKey>` 复制并转换到新的 `workspaces` namespace。初次 cutover 不移动或删除 `projects` 原目录，也不长期双写；只有必需的 Workspace 迁移在现有账本中记录为 `success` 后，正常 Workspace bootstrap 才能消费新目录。不同 legacy Project 因有损编码共用该目录是 multi-root 之前的既有问题；本设计不尝试拆分或纠正其中数据，只禁止把该共享 source 错认成单一 Workspace 可删除的 provenance。

迁移时需要注意：当前代码允许 Project path 更新但 ID 保持不变。新的稳定规则应明确：

- app-data 永远按稳定 `workspaceId` 定位；
- 修改 Folder path 不移动 Workspace app-data；
- repository path 只从最新 Folder meta 解析；
- cutover 只从当时读取的 legacy Project meta `path` 计算候选 source key；只有该候选在全部迁移 Project 中唯一时才持久化 `legacyAppDataKey`。后续单 Workspace source cleanup 只消费已持久化的 provenance，不从 legacy ID、迁移后的 Folder 当前 path、未持久化的碰撞候选或磁盘候选目录反推；
- 旧 path-based helper 只存在于 migration 输入读取和明确的 upgrade repair 路径，不能成为新运行期 facade。

### 7.3 Workspace 数据不隐式继承

当 Folder A 同时属于 Folder Workspace WA 和 Collection Workspace W 时：

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
  workspaceName: string;
  workspaceKind: WorkspaceKind;
  primaryFolderPath: string;
  folderCount: number;
  folderPaths: string[];
  missingFolderCount: number;
  lastOpenedAt: string;
}
```

其中 `primaryFolderPath` 和 `folderPaths` 只用于展示与修复入口，不作为 Workspace identity、storage key 或 repository owner 参数。Workspace item 至少展示：

- Workspace 名称；
- Folder Workspace：直接展示唯一 Folder 的完整路径，保持当前 Launcher 体验；
- Collection Workspace：展示 primary Folder 完整路径和“共 N 个文件夹”摘要；即使 N 为 1，也保持 Collection Workspace 的视觉和操作语义；
- hover、focus 或详情入口展示所有 Folder 名称与完整路径；
- missing Folder 数量与逐项警告；
- 最近打开时间。

不使用所有 Folder 的公共父目录作为 Workspace path，因为成员可能不共享有意义的祖先目录，该值也会错误暗示 Workspace 归属。v1 不引入 `.fyllo-workspace` 一类实体文件。

launcher 提供：

- 打开文件夹；
- 创建 Workspace；
- 编辑 Collection Workspace；
- 从 Folder Workspace 基于当前 Folder 创建新的 Collection Workspace；
- 打开最近的 Workspace；
- 删除 Workspace（soft delete）；
- 从 launcher 的“已删除的 Workspace”管理入口查看、恢复或永久删除 tombstone。

launcher 默认列表只展示 `isDeleted === false` 的 Workspace。“已删除的 Workspace”是 launcher 中始终可达的次级管理视图，列出 tombstone 的名称、kind、Folder 摘要与 missing 状态，并提供：

- **恢复 Workspace**：只对 `cleanupState === "restorable"` 提供；原子地把 `isDeleted` 置回 `false` 并清除 deletion fields，保留原 `workspaceId`、成员关系与全部 Workspace-owned app-data，再返回默认列表。恢复不自动改写 Folder/path；primary missing 时仍按 §8.3 进入修复入口，而不是伪造可打开状态。
- **永久删除**：只对 `isDeleted === true` 的 Workspace 提供，使用危险操作样式和不可恢复的二次确认；迁移保留期内，确认文案明确当前 Workspace 与可唯一归属的 legacy copy 都会删除。无法安全归属的历史 orphan 不由该动作认领或删除，边界见 §17.3 与 §20.4。

“打开文件夹”若解析到同 ID、但已 tombstone 的 Folder Workspace，不创建重复 Workspace，也不静默恢复；launcher 提示用户恢复该 Workspace 后再打开。Collection Workspace 没有可从磁盘路径重建的入口，始终通过上述“已删除的 Workspace”视图恢复。

### 8.2 Workspace 创建/编辑

“打开文件夹”流程：

1. canonicalize 用户选择的 path。
2. 通过原子的 `resolveOrCreateFolder()` 按 canonical path 解析已有 Folder；只有未命中时才分配新的不透明 `folderId` 并创建 `FolderMeta`。
3. 以 `folderId` 作为 `workspaceId`，创建或复用 `kind: "folder"` 的 active Workspace；新 meta 写入 `isDeleted: false` 且不带 deletion fields，命中 tombstone 时按 §8.1 提示恢复。
4. 校验 `folderIds === [folderId]` 且 `primaryFolderId === folderId`。
5. 打开固定 Workspace，因此重复打开时继续使用原 sessions/tasks/knowledge。

“创建 Workspace”流程：

1. 输入 Workspace 名称。
2. 添加 1–16 个文件夹；Main canonicalize 后创建或复用 Folder registry entry，超过 v1 上限时拒绝保存。
3. 从成员中选择一个 primary Folder。
4. 校验 canonical folder paths 不重复、不嵌套。
5. 保存 `kind: "collection"`、`isDeleted: false` 且不带 deletion fields 的 Workspace meta；即使只有一个 Folder，kind 也不改变。
6. 可选择立即打开。

Folder Workspace：

- 允许修改显示名称和重新定位唯一 Folder。重定位复用原 `folderId`，并更新所有引用该 Folder 的 Workspace 的后续解析结果；各 Workspace-owned 数据保持隔离且不移动。
- 重定位目标 canonical path 已属于其他 Folder 时拒绝，不自动合并、删除或改写任一 Folder。若重定位会让任一引用 Workspace 出现重复或嵌套成员，也整体拒绝。
- 禁止添加、移除、排序成员或修改 primary。
- 需要增加 Folder 时，必须显式创建新的 Collection Workspace，原 Folder Workspace 保持不变。

Collection Workspace 编辑流程允许：

- 修改名称；
- 添加成员；
- 移除成员；
- 调整顺序；
- 修改 primary。

移除成员时，active probe/chat/apply/archive 等引用仍按 §17.3 阻止操作。非 active 但可恢复的 Session 不永久阻止移除；确认界面必须列出这些 Session，并明确说明它们会保留历史内容，但在该 `folderId` 重新加入 Workspace 前不能恢复 Agent、MCP 或发送新的路径相关请求。成员移除不得删除或改写这些 Session 的 snapshot。

系统不提供 Folder Workspace → Collection Workspace 的原地转换，也不根据成员数量在两种 kind 间自动转换。

Folder 重定位是全局 Folder operation，不是 Collection Workspace 的普通成员 mutation。入口可以来自 Folder Workspace，也可以来自任一引用 Workspace 的 missing-member repair；确认界面必须说明受影响的其他 Workspace。即使某个 Folder 还没有对应的 Folder Workspace，Collection Workspace 仍能修复其 missing path。

重定位只更新 Folder registry、各 Workspace 的当前解析结果和后续新建 Session，不改写已有 `SessionWorkspaceSnapshot`。如果仍有 probe/chat/apply/archive Agent runtime 正在使用该 Folder，重定位必须以 `FOLDER_RELOCATION_ACTIVE_RUNTIME` 原子拒绝，返回 Workspace、Session/run 与窗口引用，并引导用户先关闭运行态后重试；只让 MCP grant stale 不能撤回 Agent 已获得的 `cwd/additionalDirectories`。确认界面必须列出非 active 但可恢复的历史 Session，并明确提示：这些 Session 不会切换到新路径，恢复 Agent/MCP 时将进入 `SESSION_FOLDER_RELOCATED`，用户需要新建 Session。v1 不提供 Session 快照原地迁移，也不自动终止共享 Agent 进程。

重定位校验失败统一返回 `FOLDER_RELOCATION_CONFLICT` 和结构化报告，不只返回一条字符串：

```ts
interface FolderRelocationConflictReport {
  folderId: string;
  requestedCanonicalPath: string;
  occupiedByFolder?: {
    folderId: string;
    folderName: string;
    folderPath: string;
  };
  workspaceConflicts: Array<{
    workspaceId: string;
    workspaceName: string;
    conflictingFolderId: string;
    conflictingFolderName: string;
    conflictingFolderPath: string;
    relation: "same" | "ancestor" | "descendant";
  }>;
}
```

- `occupiedByFolder` 表示目标 canonical path 已经属于另一个全局 Folder；系统不得自动合并或删除任一 Folder。
- `workspaceConflicts` 只列出重定位后会产生重复或嵌套成员的引用 Workspace；没有冲突的引用 Workspace 不列入，但整次全局重定位仍不写入。
- UI 必须展示冲突 Workspace、冲突 Folder 和路径关系，并为每个 `workspaceId` 提供打开或聚焦对应 Workspace 编辑界面的操作。用户解除冲突后可使用原目标路径重试。
- v1 不提供强制重定位，不自动移除冲突成员，也不把局部成功写入无冲突 Workspace；这避免一个 Folder 在不同 Workspace 中解析到不同路径。

### 8.3 Missing path

- primary path missing：Workspace 不可进入正常窗口，launcher 提供修复 primary 或重新定位 Folder 的入口。
- secondary path missing：Workspace 可以 degraded mode 打开；该成员不进入 `additionalDirectories`，repository selector 标记不可用。
- 重新定位 missing Folder 时仍按 Folder registry 的全局 exact-path 唯一性和所有引用 Workspace 的成员嵌套约束校验；成功后保留原 `folderId`。
- 从 Collection Workspace 发起 missing-member repair 时，系统必须显示该 Folder 被哪些其他 Workspace 引用；修复结果对所有引用者的 Workspace 当前解析和新 Session 生效，但不会合并或移动它们的 Workspace-owned 数据，也不会改写旧 Session 快照。
- 成员恢复后，新 Session 自动使用恢复后的成员集合；旧 Session 仍使用创建时快照。重定位发生前相关 active runtime 必须已经关闭；此后若快照路径与 Folder registry 当前路径不同，旧 Session 进入 `SESSION_FOLDER_RELOCATED`，只能查看已持久化内容，不能恢复 Agent 或继续使用路径相关 MCP tool；用户必须新建 Session。

### 8.4 Window identity

当前 `ProjectWindowManager` 替换为 `WorkspaceWindowManager`，并以 `workspaceId` 保证一个 Workspace 一个窗口：

- 同一 Workspace 最多一个窗口；
- 引用同一 Folder A 的 Workspace WA 与 Workspace W 可以同时打开；
- runtime registry、stream cancellation 和 window event 以 `workspaceId` 隔离。

`WindowContext` 直接使用 Workspace contract：

```ts
{
  role: "workspace";
  workspaceId: string;
}
```

所有 window IPC sender、decoder、preload API、renderer wrapper 和 store 同步切换为 `workspaceId`。IPC decoder 不接受 `projectId`；旧字段只由启动前 upgrade migration 转换。

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

- Folder Workspace；
- 只有一个 Folder 的 Collection Workspace；
- secondary Folders 当前全部 missing、所以本次解析结果只有一个有效 `folderPath` 的 degraded Collection Workspace。

如果成员之后恢复，新 session 会重新计算 `additionalDirectories` 并重新执行 capability gate；已经创建的 session 继续使用自己的目录快照，不会被热升级为 multi-root。

### 9.2 Session 建立参数

新建 Workspace session：

```ts
connection.newSession({
  cwd: primary.folderPath,
  additionalDirectories: secondaryFolders.map((folder) => folder.folderPath),
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
interface SessionWorkspaceFolderSnapshot {
  folderId: string;
  folderName: string;
  folderPath: string;
}

interface SessionWorkspaceSnapshot {
  workspaceId: string;
  workspaceKind: WorkspaceKind;
  primaryFolderId: string;
  folders: SessionWorkspaceFolderSnapshot[];
  cwd: string;
  additionalDirectories: string[];
}
```

v1 规则：

- 新 Session 固定当前 Workspace Folder identity、显示名称与 paths；`folderName` 是 reminder 的显示快照，`folderId` 与 `folderPath` 才是授权和路径校验字段。
- `folders` 只包含创建 Session 时实际可用并授权给 Agent 的 Folder，missing 成员不进入 snapshot；其中必须恰好包含 `primaryFolderId`。`cwd` 必须等于 primary 的 snapshotted `folderPath`，`additionalDirectories` 必须按 `folders` 顺序等于其他成员路径，不能依靠两个无映射数组按下标猜 `folderId`。
- Collection Workspace 编辑不热修改已有 ACP session；Folder Workspace 不允许编辑成员。
- resume/load 使用持久化 snapshot，而不是当前 Workspace meta。
- resume/load 和路径相关 MCP 调用先以 `folderId` 对照当前 Folder registry；path missing 时进入 `SESSION_FOLDER_PATH_MISSING`，同一 `folderId` 已重定位到其他 path 时进入 `SESSION_FOLDER_RELOCATED`。两种情况都不得静默改写 snapshot 或切换目录，用户修复 Folder 后仍需新建 Session。
- resume/load 还必须校验 snapshot 中每个 `folderId` 仍属于当前 Workspace。成员已移除时进入 `SESSION_FOLDER_REMOVED`，不得依赖 Folder 仍存在于全局 registry 而恢复授权，也不得把 snapshot 静默裁剪为剩余成员；重新加入同一 `folderId` 后仍继续执行 path missing/relocated 校验。
- Chat/probe reminder 的 Workspace 动态数据只能从这个 Session snapshot 投影；不得用当前 Workspace registry 补成员、替换 path 或刷新 `folderName`。stale 检测必须先于 Agent activation 与 reminder 注入；检测到 removed/missing/relocated 时不向 Agent 发送带部分成员或新路径的 reminder，而是拒绝 activation 并沿用上述明确错误。
- Folder Workspace 和单 Folder Collection Workspace 都写入等价的单成员目录 snapshot；`workspaceKind` 保留两者的行为差异。

### 9.4 Apply/Archive Agent scope

Proposal apply/archive 与普通 Workspace chat 不同：

- `cwd` 必须是 owner Folder 的 `folderPath` 或其 registered linked worktree。
- v1 不向 apply/archive Agent 暴露其他成员的可写 `additionalDirectories`。
- apply/archive MCP activation 的 `McpWorkspaceDescriptorV2.folders` 也必须收窄为唯一 owner Folder，`primaryFolderId` 必须等于该 `folderId`；不能只收窄文件系统目录，却继续把完整 Workspace 成员集合授权给 bundled MCP。
- 原因是 v1 proposal 只能原子提交一个 repository；允许编辑其他成员会产生无法被当前 archive/merge 管理的跨仓库修改。
- Chat 阶段仍可访问所有 Workspace members，用于分析跨仓库依赖和选择 owner。

如果未来支持 multi-repo proposal，需要独立设计多 worktree、分布式提交和失败恢复，不应通过放宽 v1 additional directories 实现。

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
  folderName: string;
  folderPath: string;
}

interface McpWorkspaceDescriptorV2 {
  version: 2;
  workspaceId: string;
  workspaceKind: WorkspaceKind;
  primaryFolderId: string;
  folders: McpFolderEntry[];
  workspaceDataDir: string;
  mcpEventDir?: string;
  sessionId?: string;
}
```

该 descriptor 是 Main 为一次 MCP activation 生成的**不可变 Session 快照**，只保存在 Main 的授权 registry，并由 Main proxy 作为可信内部上下文注入 bundled MCP backend；它不作为可由 Agent 提交的请求载荷。`folderPath` 是该 Session 的权威快照路径，不是 Folder registry 当前路径的缓存。Folder 重定位后不得用 registry 新路径替换它；Main 只用当前 registry 检测该快照是否已经 stale，并按 §9.3 返回明确错误。

descriptor 的 Folder 集合按 activation owner 决定，而不是无条件复制当前 Workspace 全部成员：

- 普通 Chat/probe activation 使用对应 Session snapshot 中实际授权的 Folder；
- apply/archive activation 只包含 run meta 固定的 owner Folder，即使来源 Workspace 是 multi-root；
- capability grant 的 `folders` 就是 tool resolver 的完整 allowlist，tool 不能回到 Workspace registry 扩大该集合。

普通 Chat/probe 的 descriptor 只能在 §9.3 的 current membership 与 path stale 检测全部通过后生成。Session snapshot 中已有 Folder 被移出 Workspace 时，不得签发仍含该 Folder 的 grant，也不得通过只删除该 entry 的方式把 activation 降级为部分授权。

MCP server 提供共享 resolver：

```ts
resolveWorkspace();
resolveFolder(folderId);
resolvePrimaryFolder();
validateWorktree(folderId, worktreePath);
```

tool handler 不再直接读取 `getProjectPath()` 并假设它是唯一 `folderPath`。

### 10.3 固定连接不阻碍动态 owner

ACP session 建立时确定的 MCP connection 携带的是该 activation 完整、固定的授权 Folder 集合。普通 Chat 可以包含多个成员，apply/archive 只有 owner。后续 tool call 只需要传 `folderId`：

```text
fixed connection workspace
  └─ folders = [A, B]
       ├─ tool(folderId=A) -> A path
       └─ tool(folderId=B) -> B path
```

因此无需为 proposal owner 切换 MCP connection，也无需重启 ACP session。

### 10.4 HTTP 授权主体绑定

当前 HTTP transport 的 path headers 由 Agent 可见，并且 app-level bearer token 在多个 Session 间共享。multi-root 后不能仅增加一个可篡改的 JSON header，也不能用应用级 token 代表 Session 主体。

v1 固定采用 **per-activation opaque capability token**，不保留签名 claim 作为并列实现选项：

```ts
interface McpAccessGrant {
  tokenHash: string;
  activationId: string;
  fylloSessionId?: string;
  workspaceId: string;
  allowedServerNames: string[];
  descriptor: McpWorkspaceDescriptorV2;
  issuedAt: string;
  expiresAt: string;
}
```

- Main 为每次 draft probe、new/load/resume Session 等 MCP activation 分配独立、不可猜测的短期 bearer token；token 本身就是该 activation 的能力凭据，registry 中的映射才是 Workspace、Session 和 Folder 授权的权威来源。
- Agent 发给 proxy 的请求不能自报或切换 `workspaceId`、`sessionId`、Folder paths。proxy 校验 token、目标 bundled server、有效期与 activation 状态，拒绝或移除所有 caller-supplied `X-Fyllo-*` context headers，再从 `McpAccessGrant.descriptor` 注入可信内部上下文。
- bundled MCP host 仍可保留一个只供 Main proxy → backend 使用的内部 token，但该 token 不进入 Agent MCP spec。proxy 转发时把外部 per-activation token 替换为内部 token；backend 只接受内部 token 与 proxy 注入的上下文。
- token 在 activation 关闭、取消、替换或 Agent runtime invalidation 时立即撤销；host 重启使全部旧 token 失效。token 不持久化、不写日志、不进入 MCP tool output；load/resume 重新签发新 token，不复用历史 token。
- capability token 需要承载多个 MCP 请求，因此不是单次 nonce。在其有效期内可重放，但只能得到同一个不可变 Workspace snapshot 和 server 集合，不能通过替换 claim 切换主体。跨 activation 窃取 token 属于 bearer credential 泄漏，依靠短期有效期和主动撤销缩小窗口。
- v1 信任 ACP Agent runtime 正确隔离不同 ACP Session 的 MCP credentials；LLM 输出与 MCP tool input 不受信任。若要防御已被攻陷的 Agent executable 或同一用户进程直接读取其他 Session 内存，必须引入每 Session Agent 进程或操作系统级隔离，不能仅靠 HMAC、nonce 或 bearer token 解决，不属于本方案范围。

MCP tools 还必须：

- 只接受 `folderId`，不接受任意 owner absolute path；
- 对仍接受 `worktreePath` 的 file/lineage 等 tool，该路径必须等于对应 `folderPath`，或属于该 Folder repository 的 registered worktree；proposal apply/archive 按 §11.3 自行解析，不接受 caller path；
- Workspace member `folderPath` 需要 canonicalize；
- event payload 写入 `workspaceId` 和 `folderId`。

### 10.5 stdio 信任边界

stdio 是不支持 HTTP MCP 的 Agent fallback，不能宣称与 HTTP 具有相同的授权边界：

- Agent runtime 为每个 MCP activation 启动独立 bundled MCP child，并通过 `FYLLO_WORKSPACE_JSON` 传递固定的 `McpWorkspaceDescriptorV2`；child 生命周期不得跨 activation 复用。
- stdio child 把 env 当作启动配置，而不是密码学身份凭据；启动后快照不可变，tool call 仍只接受并校验 snapshot 成员内的 `folderId`，不接受 caller 提供的任意绝对路径。
- v1 信任 Agent runtime 不修改 env、不把一个 activation 的 stdio child 复用于另一个 Session。这个假设可以接受，是因为 Agent runtime 已直接获得该 Session 的 `cwd`/`additionalDirectories`；没有进程或 OS sandbox 时，FylloCode 无法用 env 完整性约束恶意 Agent executable。
- 如果某类 Agent runtime 不能满足该信任契约，multi-root 下不得为它启用 stdio bundled MCP；未来若要收紧边界，env 只传 opaque token，Folder 解析通过 Main-owned local socket 完成。

迁移后的 bundled MCP 不再读取或发送 `FYLLO_PROJECT_*`。

## 11. `fyllo-specs` 适配

### 11.1 Proposal identity

Workspace 内不同成员可以拥有相同 `changeId`，因此全链路使用：

```ts
interface ProposalRef {
  folderId: string;
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

目标 contract：

```ts
createProposal({
  folderId?,
  changeName,
  worktreeMode?
})

explore({
  folderId?,
  changeName?
})

applyChange({
  folderId,
  changeName
})

archiveChange({
  folderId,
  changeName,
  ...
})
```

说明：

- `folderId` 是 repository selector。
- owner Folder 的 `folderPath` 必须是有效 Git repository；普通非 Git Folder 可用于 Chat，但不能成为 proposal/worktree owner。
- `worktreeMode: "main" | "linked"` 只在创建时表达用户选择，默认 `linked`；不再使用容易与顶层 Workspace 混淆的 `workspaceMode`。
- apply/archive 不接受 caller 提交的 `targetPath` 或 `worktreePath`。`ProposalRef` 先解析为实际 proposal target，`worktreePath` 只作为可信解析结果和 run snapshot 返回。
- create/explore 在 activation descriptor 只有一个有效 Folder 时可以省略 `folderId`；存在多个授权 Folder 时，create 必填，explore 的省略语义由 §11.6 定义。

create/apply/archive 的成功 state、explore 的每个 active change 与非空 `currentChange` 都返回或内嵌：

```ts
type ProposalWorktreeMode = "main" | "linked";

interface ResolvedProposalTarget {
  proposalRef: ProposalRef;
  worktreeMode: ProposalWorktreeMode;
  worktreePath: string;
}
```

不再返回或持久化含义含混的 `projectRoot`、`workspacePath`、`workspaceMode`。需要 agent 读取 artifact 时，tool instruction 明确以 `ResolvedProposalTarget.worktreePath` 为根。

### 11.3 Proposal target 解析

`ProposalRef` 是身份，`ResolvedProposalTarget` 是本次执行位置。Main/MCP shared runtime 必须提供统一 resolver：

1. 先按 descriptor allowlist 校验 `folderId`，不得使用 primary 或 caller path 反推 owner。
2. 只在 owner Folder 的 main worktree 和 registered linked worktrees 中查找 `changeId`。
3. 同一 repository 内 main 与一个 linked worktree 同时出现同名 change 时，保持现有实现行为的 linked 优先；该行为目前未写入 OpenSpec，Phase 5 proposal 必须将其固化为明确 requirement。出现多个 linked candidates 时返回 `PROPOSAL_LOCATION_AMBIGUOUS`，不得依赖 `git worktree list` 顺序任取一个。
4. apply run 创建时把 resolver 得到的 `folderId` 与 `worktreePath` 固定到 run meta；所有 stage 和 archive 复用该 snapshot。registered worktree 消失或实际 change 不再位于该 target 时返回明确错误，不回退 main，也不重新选择另一个 worktree。
5. create-proposal 成功后返回新 proposal 的 target；如果同一个 `ProposalRef` 已存在，返回 `PROPOSAL_ALREADY_EXISTS` 与既有 target，不写 created event、不把另一 Workspace/Session 登记为新 origin。后续只有明确的 lineage-linking action 才能按 §12.3 追加 reference。

### 11.4 Owner 选择

Agent 调用 `create-proposal` 前必须确认 proposal owner。选择顺序：

1. 用户明确指定的 Folder；
2. task/integration 已明确绑定的 repository；
3. 本轮讨论明确只涉及一个成员；
4. 否则 Agent 必须向用户询问一次，不得静默使用 primary。

primary 是 cwd 默认值，不是 proposal owner 默认授权。

### 11.5 Linked worktree

linked worktree 始终创建在：

```text
<folderPath>/.worktrees/<changeName>
```

创建、扫描、apply、archive、merge、cleanup 和 branch delete 全部使用同一个 owner Folder。不得使用 Workspace primary 或路径摘要反推 main repository。

### 11.6 Explore

Workspace 中 explore 有两层行为：

- 没有 `folderId`：并行聚合 activation descriptor 中所有授权 Folder 的 active changes；每项返回 `folderId`、`folderName`、`changeId`、`worktreeMode` 与 `worktreePath`。不得扫描 descriptor 之外的当前 Workspace 成员。
- 有 `folderId`：只扫描该成员的 main 与 registered linked worktrees。
- dedupe 只发生在一个 Folder repository 内，key 为 `ProposalRef`；不同 Folder 的同名 change 必须同时保留。
- 单个 Folder 扫描失败以带 `folderId` 的结构化 warning 返回，不隐藏其他 Folder 结果。
- `currentChange` 有显式 `folderId` 时只在该 Folder 内解析；省略 owner 时，只有所有目标 Folder 扫描均成功且恰好匹配一个 `ProposalRef`，才返回该 `currentChange`。
- 如果匹配多个 owner，返回 `PROPOSAL_OWNER_AMBIGUOUS` 和候选 `ProposalRef[]`；如果任一 Folder 扫描失败，唯一性无法证明，返回 `PROPOSAL_OWNER_UNVERIFIED` 并要求 caller 提供 `folderId`。两种情况都不得回退 primary、不得选择第一项。
- Session snapshot 已 removed/missing/relocated 时先服从 §9.3 的 stale 错误；不能通过重新读取当前 Workspace registry 扩大或改写本 activation 的扫描集合。

### 11.7 MCP events

Proposal 创建事件至少包含：

```ts
interface McpProposalCreatedEvent {
  workspaceId: string;
  sessionId: string;
  proposalRef: ProposalRef;
  worktreeMode: ProposalWorktreeMode;
  worktreePath: string;
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
  folderId,
  topic?,
  path?,
  reason?
})
```

其中现有 `path` 继续表示 `guidelines/**/*.md` 的 repository-relative path；它不能承担 Folder 选择。

Workspace system reminder 中的 guideline index 必须按 Folder 分组，并让每条路径能解析到明确的 `folderPath`。apply/archive reminder 只注入 owner `worktreePath` 下的 guidelines。

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
   - proposal ref / commit → 创建来源与后续显式引用关系；
   - 位于 owner Folder app-data。

建议 index v2：

```ts
type RepositoryLineageRelation = {
  workspaceId: string;
  subjectId: string;
  relation: "origin" | "reference";
  linkedAt: string;
};

interface RepositoryLineageIndex {
  version: 2;
  proposals: Record<string, RepositoryLineageRelation[]>;
  commits: Record<string, RepositoryLineageRelation[]>;
}
```

每个 repository 独立存储，因此 key 内可以继续使用 `changeId` 和 commit hash；跨 repository 查询必须先选择 `folderId`。

写入与查询规则：

- `origin` 表示创建该 repository object 的 Workspace subject：创建 proposal 时写 proposal origin；产生 archive/apply commit 时写 commit origin。每个 proposal/commit 最多一个 origin，后续 Workspace 不得覆盖；出现第二个不同 origin 时返回冲突并保留原记录。
- `reference` 只由明确的 lineage-linking action 追加，例如另一 Workspace subject 延续、apply 或 archive 已存在 proposal。普通读取、浏览或仅创建 knowledge anchor 不自动制造 repository lineage；knowledge 自身的 source/anchor 仍保存在所属 Workspace。
- 追加以 `{workspaceId, subjectId, relation}` 幂等；同一 repository object 可以关联多个 Workspace/subject。`trace-proposal` / `trace-commit` 分开返回唯一 origin 与全部 references，不按最后写入者选择 origin。损坏或历史数据无法确定 origin 时返回 `origin: null` 和 warning，不猜测。
- Repository reverse index 使用独立的、按 index file 串行化的 Main mutation boundary，不复用 Folder registry lock。应用单实例是进程级前置条件；同一进程内必须把“读取最新 index—校验 origin—幂等追加—temp file + atomic rename”包含在一次排他事务中，不能只串行化最终 `writeFile`。

Cortex tool：

```ts
lineage({ mode: "trace-proposal", folderId, changeId })
lineage({ mode: "trace-commit", folderId, commitHash })
lineage({ mode: "trace-file", folderId, worktreePath?, filePath, lineRange? })
```

`trace-file` 省略 `worktreePath` 时在 Folder 的 main worktree 执行 Git；提供时必须先通过 §6.3 的 `ResolvedRepositoryTarget` 校验为该 Folder 的 registered linked worktree。`filePath` 始终是相对该 worktree 的 repository-relative path，canonicalize 后不得逃逸 worktree。响应必须包含实际使用的 `folderId` 与 `worktreePath`，避免把 linked worktree 的问题静默回答成 main worktree 历史。

`trace-proposal` 在指定 Folder repository 的 reverse index 中定位 origin Workspace subject 与 references；`trace-file` 对命中的每个 commit 使用相同的多值查询语义。

## 13. Proposal Browser、Specs、Guidelines 与 Overview

### 13.1 Repository browser 通用 projection

Workspace 中以下页面从“单 root reader”升级为“member aggregate reader”：

- `/proposal`
- `/specs`
- `/guidelines`
- repository/Git 部分的 `/overview`

aggregate service 先按 `ResolvedWorkspace.folders` 建立 Folder 结果，再对 available members 并行执行 reader。统一返回结构固定为：

```ts
type RepositoryReadError = {
  code: string;
  message: string;
};

type RepositoryReadResult<T> =
  | {
      status: "ready";
      folderId: string;
      folderName: string;
      folderPath: string;
      data: T;
      warnings: string[];
    }
  | {
      status: "missing";
      folderId: string;
      folderName: string;
      folderPath: string;
    }
  | {
      status: "error";
      folderId: string;
      folderName: string;
      folderPath: string;
      error: RepositoryReadError;
    };

interface RepositoryAggregateResult<T> {
  workspaceId: string;
  repositories: RepositoryReadResult<T>[];
}

interface RepositoryScopedItem<T> {
  folderId: string;
  folderName: string;
  data: T;
}
```

规则：

- `repositories` 按 Workspace 的 Folder 顺序返回，并且包含 missing/error Folder；顶层请求只有 Workspace 不存在、sender 无权访问或 aggregate contract 无法建立时才整体失败。
- available Folder reader 并行执行。一个 Folder 失败不隐藏其他 Folder 的 `ready` data；UI 同时展示该 Folder 的错误状态。
- 通用三态描述的是“该页面的 Folder reader 是否产出了可用数据”，不是声明 Folder 的所有子能力都成功。`ready` data 可以按页面 contract 继续携带子能力状态，例如 Overview 中 Git unavailable/unsupported、Specs 与 Guidelines counts 仍 ready；非致命子能力失败同时进入 `warnings`。只有 reader 无法产出该页面任何可信数据时，才返回 Folder-level `error`。因此 `unsupported` 属于页面数据内的 capability state，不增加为所有 repository reader 共用的第四种顶层状态。
- reader 必须区分“合法空数据”和“读取失败”。不存在的可选 repository 目录可以按页面 contract 返回 ready + empty；permission、I/O、Git 或无法继续解析的错误必须向 aggregate 层传播，不能在 leaf reader 中无条件吞成 `[]`/`0`。
- 单个文档的 parse/read warning 可以保留在 item 或 `warnings` 中，不必把整个 Folder 降为 error；但必须可见，不能静默丢弃文件。
- missing Folder 只产生 Folder-level unavailable state。因为 repository 无法扫描，Proposal 页面不能凭空构造该 Folder 下未知 proposal 的 item-level error card；只有 Session/EventRail 等已经持有明确 ProposalRef 的入口才能展示某个已知 proposal unavailable。

UI 默认展示 All Folders 聚合结果，并提供 Folder filter。列表 item 显示 owner Folder badge；详情读取继续携带 `folderId`。

只有 Workspace 配置本身恰好一个 Folder 时才隐藏 filter 和 owner badge。多个成员但当前只有一个 available 的 degraded Workspace 仍显示 Folder scope、missing/error entry 和 owner badge，不能伪装成 single-folder 页面。

### 13.2 Repository document identity

不同 Folder 可以包含同名 proposal、spec ID 或 guideline relative path。列表、选择、详情读取/投影、Vue key、缓存和 IPC 参数不得只使用 repository-local 字段：

```ts
interface SpecRef {
  folderId: string;
  specId: string;
}

interface GuidelineRef {
  folderId: string;
  path: string;
}
```

Proposal 使用 §11.1 的 `ProposalRef`。Renderer store 保存完整 ref；All Folders 列表的稳定 key 由 ref 的两个字段共同组成；任何 detail query/IPC 也必须携带完整 ref，若详情已内嵌在 aggregate data 中，client-side lookup 仍按完整 ref 匹配。切换 Folder filter 只改变可见集合，不改写已打开 detail 的 owner。相同 `specId`、guideline `path` 或 `changeId` 在不同 Folder 中必须同时展示并分别打开。

### 13.3 Proposal Browser

- list 聚合所有成员 main/archive/linked worktree proposals。
- dedupe key 使用 `{ folderId, changeId }`。
- detail、spec delta、status watcher、apply、archive 都携带 ProposalRef。
- 同名 change 不互相覆盖。
- member missing/error 时保留 Folder-level unavailable/error state，不把整页置为失败；已经由 Session/EventRail 持有的 ProposalRef 可以继续显示只读 unavailable card。

### 13.4 Specs 与 Guidelines

- 数据始终读取 repository，不复制到 Workspace app-data。
- 聚合结果按 Folder 分组或支持 filter。
- spec detail 使用 `SpecRef`，guideline detail 使用 `GuidelineRef`；relative path 只在对应 Folder 内解析并校验不得逃逸。
- 创建/维护行为必须显式选择 owner Folder。
- system reminder 告诉 Agent：修改前读取目标 owner Folder 的 specs/guidelines；跨 Folder 分析时分别遵守每个 repository 的约束。
- 如果多个成员的 guideline 冲突，修改哪个 repository 就以哪个 repository 的 guideline 为强约束；跨仓库变更需要在 proposal 中显式记录冲突处理。

### 13.5 Overview

Overview 不能把当前单 root `getProjectOverview(projectPath)` 对每个 Folder 重复调用。目标 service 分为一次 Workspace reader 与 N 个 repository reader，再由 Workspace-level projector 组合：

```ts
interface WorkspaceOverview {
  workspaceId: string;
  work: WorkspaceWorkOverview;
  repositories: RepositoryReadResult<RepositoryGovernanceOverview>[];
  memberHealth: WorkspaceMemberHealth[];
  aggregate: RepositoryAggregateSummary;
}
```

三类数据：

1. **Workspace work**
   - active sessions/tasks；
   - Workspace lineage；
   - Workspace knowledge。
   - 只从当前 `workspaceDataDir` 读取一次，不能按 Folder 重复计算。
2. **Repository governance aggregate**
   - specs/guidelines/proposals/archive 数量；
   - active proposals；
   - Git activity。
   - 每个 Folder 独立读取并保留 Folder identity/error；aggregate 只汇总 `ready` 结果，同时返回 `complete` 与未计入 Folder 列表。只要存在 missing/error，UI 不得把 partial sum 标成完整 Workspace 总数。
3. **Member health**
   - 每个成员的 path、Git/OpenSpec/guideline 健康；
   - missing/degraded 状态；
   - aggregate summary。

聚合计数必须按 owner Folder 分组后求和，不能把相同 `changeId` 当成重复项。Workspace 自身的 health 不持久化为一个独立 repository score；应从成员健康和 Workspace 配置状态派生。

Repository proposal 可以被多个 Workspace 浏览，但 task/session/knowledge 属于 Workspace。active proposal 的 task title、task ref、recent lineage 等 enrichment 只允许读取当前 `workspaceId` 的 subject/reference；如果当前 Workspace 没有对应 link 就返回 null，不得为了补全卡片而读取 origin Workspace 的 task/session 数据。Repository reverse index 可以说明 origin/reference 关系，但不能成为跨 Workspace 读取 subject 内容的授权。

## 14. Tasks、Workflow 与 Workspace Integration

### 14.1 Tasks

Local task board 属于 Workspace：

- upgrade migration 将旧 Workspace task 的 `projectId` 字段转换为 `workspaceId`；迁移后的 schema 不声明 `projectId`。
- task 可以增加可选 `targetFolderIds`，用于提示可能涉及的 repositories；它不是 proposal owner。字段省略与空数组都表示“没有 repository hint”，ID 去重后保留用户选择顺序。
- `targetFolderIds` 是软引用，不进入 §17.3 的成员移除阻塞检查。移除成员时不改写 task；读取时按当前 Workspace 成员集合投影为 `currentTargetFolderIds` 与 `staleTargetFolderIds`，UI 必须显示失效 target 数量并允许用户编辑，不能静默删除悬空 ID。
- 从 task 创建 proposal 时，只有原始去重后的 `targetFolderIds` 恰好一个、该 ID 仍是当前成员且可作为 proposal owner 时，才可以预选 owner。原始 target 多于一个时，即使过滤后只剩一个有效成员也必须继续确认；成员移除不能静默改变默认 owner。
- legacy task 迁移后省略 `targetFolderIds`，不根据迁移得到的唯一 Folder 猜测 repository hint。

外部 task 的 repository metadata（例如 GitHub repository）可用于建议 owner，但不能绕过 Workspace membership 校验。

### 14.2 Workflow

- built-in workflow 保持 global。
- custom workflow 属于 Workspace。
- apply/archive workflow run 固定 `folderId` 与 `worktreePath`。
- workflow stage 不得在运行中重新按 current primary 解析 owner。
- 未来需要跨 repository workflow 时，使用显式 per-stage repository target，而不是复用 v1 proposal run。

### 14.3 Workspace Integration

“Project Integration” 全量重命名并迁移为 Workspace Integration：

- Workspace 有独立 integration config。
- 不自动继承引用同一 Folder 的其他 Workspace config。
- resource 可以增加可选 `folderId` binding。
- 与 repository 强相关的 source-control/CI resource 应显式绑定成员 Folder。
- task/communication 等 Workspace 级 resource 可以不绑定 repository。

## 15. Local File Preview、Attachments 与路径链接

### 15.1 Window-level local file preview

本地文件 preview 是当前 Renderer Window + 当前 Workspace 的能力，不继承来源 MarkStream 所在 Session 的目录快照。Main 必须从 IPC sender 解析 `workspaceId`，再取得一次当前 `ResolvedWorkspace`；renderer 只提交 `requestedPath` 或 Main 签发的 confirmation ID，不提交 Workspace、Folder 或 sender identity。

service 使用的内部 context 直接表达有效成员集合，不再使用单一 `projectPath`：

```ts
interface LocalFilePreviewWorkspaceContext {
  workspaceId: string;
  availableFolders: Array<{
    folderId: string;
    folderPath: string;
  }>;
  sender: LocalFilePreviewSender;
}
```

每次 `preparePreview` 基于这次解析结果建立 trusted root candidates：

- 每个 `availableFolders` 成员的 canonical `folderPath`；
- 对每个成员并行执行 `git worktree list` 后得到的 registered canonical worktrees；
- missing 成员不进入 `availableFolders`，因此不进入 trusted roots；Folder 恢复、成员编辑或重定位后的下一次请求自然使用新解析结果；
- 某个成员 worktree 枚举失败时，只把该成员 worktrees 视为空并记录 warning；该成员 canonical `folderPath` 仍可信，其他成员不受影响；某成员 `folderPath` 自身无法 canonicalize 时，安全地排除该成员；
- v1 每次请求重新解析，不缓存授权 root 集合。仅由 Folder registry mutation 触发失效的 cache 无法观察用户在 FylloCode 外执行的 `git worktree add/remove`；未来可增加不改变上述实时语义的短 TTL 优化，但不能把 stale cache 当作授权依据。

自动 trusted-root 判定与 remembered grant 是两种不同授权来源：

- member/worktree-derived trust 每次由上述 candidates 判定，**不写入** remembered grants；Folder 重定位后旧 `folderPath` 会自然退出 trusted roots，无需清理一个并不存在的 member grant；
- user-confirmed grant 只表示用户明确选择“在此窗口中信任”的 Workspace 外**精确 canonical file path**，继续按 `webContents.id` 隔离，key 为 `workspaceId + canonicalPath`。它不绑定 `folderId`，也不因无关 Folder 重定位而撤销；sender 销毁或 Workspace context 改变时失效/不命中。

user-confirmed grant 对同一 canonical path 的文件替换是否继续有效，沿用 `local-file-link-preview` 现有契约；若要改成 inode/version-bound grant，应作为独立的 preview 安全契约变更，不借 multi-root 重定位改变。

Window preview 与 Agent Session scope 可以有意不同，但差异必须对用户可见：

- Workspace 新增/恢复成员后，§15.1 的 window preview 可以立即信任新 root；已有 Session snapshot、MCP descriptor 与 reminder 不扩张。Workspace 移除成员后则相反：window preview 立即停止自动信任，旧 Session 按 §9.3 进入 `SESSION_FOLDER_REMOVED`，不能恢复旧授权。
- 从 Chat/Session 界面发起 preview 时，请求必须携带 `sessionId` 作为 scope-comparison context；Main 从 sender 取得 `workspaceId`、校验 Session 归属，再把 member-derived 结果与该 Session snapshot 比较。`sessionId` 不构成 path 授权，实际读取仍只由当前 Window/Workspace trusted roots 或 user-confirmed grant 决定。
- preview 响应增加 `agentScope: "authorized" | "window-only"`。member-derived target 只有在 `folderId` 与 snapshotted `folderPath` 都匹配、且 Session 未 stale 时才是 `authorized`；新增/恢复但未进入旧 snapshot 的 Folder，以及 user-confirmed external target，均为 `window-only`。
- `window-only` preview 继续允许用户查看，但 UI 必须说明“当前 Agent Session 无权访问此文件”，且不得直接持久化为 `WorkspaceFileResourceRef` 或 dispatch 给 Agent。用户可以新建 Session 获得当前成员授权，或显式上传为 §15.3 的 Workspace-owned attachment copy。
- 非 Session 页面发起 preview 时不需要伪造 Agent scope；响应可以省略 `agentScope`。Chat header/Folder scope 以 Session snapshot 展示 Agent 实际授权，并在它与当前 Workspace 成员/primary 不同时显示“Session snapshot”提示，避免 current Workspace UI 被误解为旧 Session 的权限。

### 15.2 Owner projection

trusted root candidate 使用可判别结构：

```ts
type PreviewTrustedRoot =
  | { kind: "folder"; folderId: string; folderPath: string }
  | { kind: "worktree"; folderId: string; worktreePath: string };
```

本地文件 preview 结果对 member-derived target 增加：

```ts
{
  folderId: string;
  worktreePath: string; // main worktree 时等于 folderPath
}
```

user-confirmed external target 不伪造 owner，二者均省略。Main 对 canonical target 执行 **longest canonical root match**，必须按路径分段长度选择最具体 candidate，不能依赖插入顺序或任意首个匹配。原因不是 roots 不嵌套：同一 Workspace 的不同 Folder 互不嵌套，但一个 Folder 的 linked worktree 位于 `<folderPath>/.worktrees/<changeId>`，天然比 Folder root 更具体；跨 Workspace 的嵌套 Folder 不会同时进入当前 window context，不影响本次判定。

### 15.3 Session attachment copies

用户上传的 attachment 是 Workspace-owned Session 数据，不是成员文件的 live reference：

- 文件本体写入 `<workspaceDataDir>/sessions/<sessionId>/attachments`，是上传时刻的独立副本；成员移除、Folder 重定位或磁盘原文件删除都不使副本失效；
- attachment 不参与 trusted roots 或 Folder path 授权。Main 从 IPC sender 取得 `workspaceId`，校验 `sessionId` 属于该 Workspace，再使用不透明 `attachmentId`/storage handle 解析副本；renderer 提交的任意 `file://` URI 不能作为读取授权；
- 持久化 message 保存 attachment handle、文件名和 MIME type，不把绝对 app-data path 当作公开 identity。向 trusted Agent 构造 ACP image/resource link 时，Main 才把 handle 解析为实际副本；
- 删除 Session 时删除其 attachment copies；其他 Workspace 或 Session 不能复用 handle。

### 15.4 Member file resource links

指向成员或 linked worktree 文件的 resource link 是实时引用，与 attachment copy 分开建模：

```ts
interface WorkspaceFileResourceRef {
  folderId: string;
  worktreePath: string;
  repositoryRelativePath: string;
}
```

普通 MarkStream 裸 absolute-path link 继续使用 §15.1 的当前 Window/Workspace preview 语义；只有 Session message 中持久化的结构化 `WorkspaceFileResourceRef` 使用本节的 Session snapshot 语义。实现不得把结构化 ref 退化成裸 path 后绕回 window-level trusted roots。

- `folderId` 表达 repository owner；`worktreePath` 表达捕获时的 main/registered worktree snapshot；`repositoryRelativePath` canonicalize 后不得逃逸该 worktree。不得持久化一个裸 absolute target path 并通过字符串前缀替换推导 owner 或重定位后的新位置。
- 捕获、发送给 Agent、resume/load 或再次 preview 时，Main 都校验 `folderId` 存在于 `SessionWorkspaceSnapshot.folders`，并校验其中的 snapshotted `folderPath` 未进入 `SESSION_FOLDER_PATH_MISSING` / `SESSION_FOLDER_RELOCATED`；linked `worktreePath` 还必须仍属于该 Folder repository 的 registered worktree。
- 上述校验还必须确认 `folderId` 仍属于当前 Workspace；成员已移除时返回 `SESSION_FOLDER_REMOVED`。Window-level `window-only` preview 不能绕过该检查转换为 member file resource link。
- Folder 重定位后，旧 Session resource link 与 I12 一致进入 `SESSION_FOLDER_RELOCATED`，不得用相同 `folderId` 静默改写到新 `folderPath`。新增 Workspace 成员也不进入旧 Session snapshot，不能让旧 link 获得新目录授权。
- worktree 被删除或取消注册时返回明确 unavailable/error，不回退到 main worktree 查找同名相对路径。

## 16. System Reminder

Chat/probe reminder 增加明确 Workspace block。它描述的是本次 Agent activation 的固定授权，而不是当前 Workspace registry 的实时投影：

```xml
<workspace>
  {"workspaceId":"...","workspaceKind":"collection","primaryFolderId":"...","folders":[...]}
  repository ownership rules (static text)
</workspace>
```

动态对象的来源与生命周期固定如下：

- `workspaceId`、`workspaceKind`、`primaryFolderId` 和完整 `folders` 数组来自 §9.3 的 `SessionWorkspaceSnapshot`；每项使用 snapshotted `folderId`、`folderName`、`folderPath`。不得读取当前 registry 增加/省略成员、替换重定位后的 path 或刷新名称。
- Main 必须在 activation 创建和 reminder 注入前完成 §9.3 的 membership/missing/relocated 检测。检测失败时不构造“部分可用”的 reminder，也不注入 registry 新路径；Agent activation 直接以 `SESSION_FOLDER_REMOVED` / `SESSION_FOLDER_PATH_MISSING` / `SESSION_FOLDER_RELOCATED` 失败，历史消息仍可只读查看。因此 reminder 不额外发明会与 activation 状态矛盾的 `unavailable` 成员形态。
- apply/archive reminder 从该 activation 的 owner-only `McpWorkspaceDescriptorV2` 与 run 固定的 `ResolvedProposalTarget` 投影；`folderId`、`folderPath`、`worktreePath` 不重新从 current primary 或 Workspace registry 选择。固定 target 已失效时，在注入 reminder 前按 §11.3 失败。

动态数据必须作为不可执行数据编码，不能直接拼进 XML tag、属性或静态规则文本：

- 成员对象与数组统一使用 `JSON.stringify`；随后对整段 JSON 执行与现有 `escapeAngleBrackets()` 等价的尖括号编码，把 `<` / `>` 输出为 `\u003c` / `\u003e`。JSON 编码同时负责引号、反斜杠和控制字符，禁止 YAML-like 无引号列表或逐行字符串插值。
- 静态规则必须明确：JSON 字段值是 Workspace 元数据，不是 Agent 指令；任何 `folderName` / `folderPath` 内容都不能改变外层 reminder contract。
- reminder 展示的 `folderName` 最多 120 个 Unicode code point；超过时保留前 119 个并追加 `…`。该截断只影响 reminder 的显示值，不修改 Session snapshot；`folderId` 和完整 `folderPath` 不截断。
- v1 的 16 Folder 上限保证列表数量有界，authorized folders 必须完整输出，不分页、不省略。编码后的 Workspace JSON 最大为 64 KiB（UTF-8）；超过时以 `WORKSPACE_REMINDER_TOO_LARGE` 拒绝 Agent activation，不能截断路径或成员列表后继续。

静态内容至少说明：

- 当前 `workspaceId`；
- 当前 `workspaceKind`，以及 Folder Workspace 成员不可编辑、Collection Workspace 成员可编辑；
- primary Folder；
- 每个成员的 `folderId`、`folderName`、`folderPath`；
- proposal 必须选择一个 owner Folder；
- repository-relative path 必须在 owner `worktreePath` 下解释；
- apply/archive 只能修改 owner `worktreePath`；
- specs/guidelines 按 repository 分别生效。

Guidelines index 按成员分组；Knowledge index 来自 Workspace。Apply/Archive reminder 额外明确：

- `folderId`；
- owner `folderPath`；
- 当前 `worktreePath`；
- 不得修改其他成员的 `folderPath`。

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
proposal watcher: workspaceId + folderId + changeId
apply/archive: workspaceId + folderId + changeId/runId
lineage event: workspaceId + folderId + sessionId
```

### 17.2 Event payload

legacy 项目作用域 event 的顶层 `projectId` 在迁移时转换为 `workspaceId`。新 payload 使用 `workspaceId` 与 `folderId`，不能用 `projectPath` 作为 UI identity。

### 17.3 Workspace 编辑、删除与恢复

Folder Workspace 的成员 mutation 直接拒绝。编辑 Collection Workspace 的成员/primary 前 Main 检查：

- active probe/chat session snapshot；
- active proposal create/apply/archive；
- proposal status watchers；
- pending Fyllo Actions；
- active member-file resource links or dispatches。

推荐 v1：

- Collection Workspace 允许增加成员，新 session 生效；
- active session 存在时允许改变 primary，但只影响新 session；
- 存在引用时禁止移除成员，并返回引用摘要；
- 非 active Session snapshot 不永久阻止成员移除，但移除确认必须列出将进入 `SESSION_FOLDER_REMOVED` 的 Session；后续 activation 按 §9.3 拒绝，不得因 Folder 仍存在于全局 registry 而恢复。
- task 的 `targetFolderIds` 是 §14.1 定义的提示性软引用，不属于这里的 active 引用，不阻止成员移除；移除后由 task 读取投影显式呈现 stale target。

Workspace 删除与恢复采用 tombstone，而不是移除 meta：

1. 用户确认删除后，Main 先关闭该 Workspace 窗口并取消 probe/chat/apply/archive、watcher、pending action、preview dispatch 等 Workspace runtime；无法安全停止时拒绝删除。随后原子地写入 `isDeleted: true`、当前 `deletedAt` 与 `cleanupState: "restorable"`，保留原 `workspaceId`、成员关系和全部 Workspace-owned app-data。
2. launcher 默认列表与普通 window open 均排除 tombstone；通过 §8.1 的“已删除的 Workspace”视图可以发现并恢复。恢复只接受 `cleanupState === "restorable"`，把 `isDeleted` 置回 `false` 并清除 deletion fields，不生成新 ID、不搬迁数据、不自动修复 Folder；恢复后仍执行当前 Workspace invariants 与 §8.3 missing-path 检查。
3. v1 不按时间自动清理 tombstone，也不在后台静默 GC。终态清理由用户在“已删除的 Workspace”视图显式触发“永久删除”，并经过不可恢复的二次确认。
4. 永久清理只接受 `isDeleted === true` 且无 active window/runtime 的 Workspace。Main 先持久化 `cleanupState: "purging"`，再删除 §7.1 明确的 Workspace-owned app-data、Workspace window state，以及 §20.4 中由已持久化 `legacyAppDataKey` 证明唯一归属的 active legacy source/record，最后移除 Workspace meta；未持久化 provenance（包括候选 key 碰撞）时跳过 legacy source 删除，不阻止 current Workspace 数据完成永久清理。清理失败时把仍存在的 tombstone 标为 `cleanup-failed`，返回包含失败对象和重试操作的错误，不得报告成功。`purging` / `cleanup-failed` 在重启后只提供继续或重试永久清理，不提供恢复，以免重新开放可能已部分删除的数据。
5. soft delete、恢复与永久清理按 `workspaceId` 串行化。永久清理不得删除或改写任何 `FolderMeta`、canonical path 反向索引、其他 Workspace meta/数据、repository worktree、`<appData>/workspace-folders/<folderId>/**`，或没有当前 legacy meta 明确归属的历史 orphan；即使该 Workspace 是某 Folder 的最后一个引用，Folder 生命周期也不由 Workspace 删除隐式决定。

### 17.4 Folder registry mutation 并发

单实例应用仍可能由多个窗口同时发起“打开文件夹”、添加成员或重新定位请求，因此单实例锁不能替代进程内 Folder registry 并发控制。

Main 中所有会改变 canonical path ↔ `folderId` 关系的操作必须经过同一串行化 mutation boundary：

- 以下列举是当前操作示例，不是封闭清单；未来的 Folder 删除、批量导入或其他会改变 path ↔ ID 关系的操作同样受此边界约束。
- `resolveOrCreateFolder(path)` 的“查找—分配 ID—写入”是一个原子操作；
- `relocateFolder(folderId, path)` 的“校验全局 exact-path 唯一性—校验所有引用 Workspace—更新路径/反向索引”是一个原子操作；
- `relocateFolder()` 还必须在同一 mutation 前置校验中确认没有 probe/chat/apply/archive runtime 正在使用该 Folder；不得先写 registry 再异步关闭 Agent；
- 失败不得留下新 Folder、部分反向索引或只更新部分 Workspace projection；
- reader 只能观察 mutation 前或 mutation 后的完整 registry 状态。

## 18. Renderer 状态与 UI

### 18.1 Store

renderer 直接使用 `useWorkspaceStore`，并将所有消费者一次性切换到 Workspace contract：

```ts
currentWorkspace;
workspaceKind;
resolvedFolders;
primaryFolder;
activeSessionWorkspaceSnapshot;
activeSessionScopeDiff;
isFolderWorkspace;
isCollectionWorkspace;
isMultiRoot;
repositoryFilter;
```

Launcher 路径从 `WorkspaceLauncherItem` 投影读取；组件不得从 `currentWorkspace` 无条件读取 `.path`。

Workspace 全局 UI 使用当前 `ResolvedWorkspace`；Chat 的 Agent scope 使用 `activeSessionWorkspaceSnapshot`。`activeSessionScopeDiff` 至少表达 current-only Folder、snapshot-only Folder、primary 变化和 Folder 显示名称变化，并驱动 §15.1 的 Session snapshot 提示与 `window-only` preview 状态；组件不得用当前 `resolvedFolders` 冒充已有 Agent Session 的授权集合。

### 18.2 Navigation gating

route meta 与 `src/renderer/src/config/activity-bar.ts` 的 `ActivityBarItem` 必须同步迁移到 `requiresWorkspace`，不保留 `requiresProject`。两处使用同一个 Workspace navigation gate evaluator；实施时全仓清点所有 `requiresProject` 读写点，不能只改 route meta。额外增加的 capability gating 也由该 evaluator 统一解释：

- Chat：至少存在一个能满足本次 `additionalDirectories` 需求的 Agent；没有附加目录时沿用当前单根条件；
- specs/guidelines/proposal：至少存在一个有效 member；
- Git/health 页面：按成员部分可用；
- Workspace-owned 页面（task/knowledge/workflow）在 secondary member missing 时仍可用。

Activity bar 的 visible/disabled 状态与路由进入判断必须得到相同结果。task/knowledge/workflow 只要求窗口已绑定有效 Workspace，不以 `availableFolders.length` 或 secondary missing 状态禁用；repository/Git 类入口才消费对应 member capability。

### 18.3 Repository selector

Proposal/specs/guidelines/overview 使用统一的 Folder filter pattern：

- Workspace 配置本身恰好一个 Folder 时不显示 selector。
- Workspace 配置有多个 Folder 时默认 All Folders；missing/error Folder 仍保留在 selector 与 aggregate state 中，即使只有一个 available Folder。
- create/update 等写操作必须选择单个 available Folder。
- detail 保持 owner 不随全局 filter 改变。

Workspace primary 的视觉标记只表达默认 cwd，不暗示所有写操作都属于 primary。

## 19. 错误与边界状态

至少需要标准化以下错误：

| 错误                                                    | 行为                                                                                   |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Workspace 不存在                                        | 页面级 Workspace error，清空旧 session state                                           |
| Workspace 无成员                                        | 阻止保存；legacy corrupt meta 进入 repair state                                        |
| Workspace kind 缺失或未知                               | 阻止打开并进入 repair state                                                            |
| Workspace open · `isDeleted === true`                   | `WORKSPACE_DELETED`；不打开窗口，提供进入“已删除的 Workspace”恢复入口                  |
| Workspace restore · cleanup 非 `restorable`             | 拒绝恢复；`purging` / `cleanup-failed` 只提供继续或重试永久清理                        |
| Workspace permanent delete · 尚未 soft delete           | 拒绝清理；必须先完成关闭 runtime 的 soft delete                                        |
| Workspace permanent delete · provenance source 无法删除 | 保留 `cleanup-failed` tombstone；不得回退 ID/current Folder path 或宣告成功            |
| Workspace permanent delete · 清理失败                   | 保留 tombstone 并标记 `cleanup-failed`；报告失败对象并允许重试，不伪报成功             |
| Folder Workspace 成员数不为 1                           | 阻止打开并进入 repair state                                                            |
| Folder Workspace 的 workspaceId/folderId 不一致         | 阻止打开并进入 repair state                                                            |
| 修改 Folder Workspace 成员                              | Main/IPC 拒绝                                                                          |
| Workspace Folder 数量超过 16                            | 阻止创建、编辑或 repair 保存                                                           |
| primary 不在成员中                                      | 阻止打开并要求修复                                                                     |
| Workspace open · primary path missing                   | 阻止进入正常 Workspace，launcher 提供修复/重定位                                       |
| Workspace open · secondary path missing                 | degraded mode，局部 warning                                                            |
| folder paths 重复或嵌套                                 | 阻止保存                                                                               |
| cutover · legacy ID 与当前 path key 不一致              | 保留 ID；app-data 只读 `encodeProjectPath(legacyProject.path)`，不读 `<projects>/<id>` |
| cutover · 不同 path 的编码后 source key 碰撞            | 完成既有 source 读取，但碰撞组均不持久化 provenance；source 作为无法归属 orphan 保留   |
| cutover · 当前 source 与历史目录并存                    | 只迁移当前 meta 指向的 source；历史目录保持 orphan，不合并、不覆盖                     |
| Workspace permanent delete · 无 provenance              | 只清理 current Workspace 数据；跳过未认领 legacy source，不把候选 key 当作所有权证明   |
| Folder 重定位目标已被其他 Folder 占用                   | 原子拒绝；返回 `occupiedByFolder`，不得自动合并                                        |
| Folder 重定位只与部分引用 Workspace 冲突                | 原子拒绝；返回 `workspaceConflicts`，UI 提供进入对应 Workspace 编辑的操作              |
| Folder 重定位仍有 Agent runtime 使用该 Folder           | `FOLDER_RELOCATION_ACTIVE_RUNTIME`；原子拒绝并引导关闭 Session/run 后重试              |
| `additionalDirectories` 非空且 Agent 不支持             | picker 不允许选择                                                                      |
| `additionalDirectories` 非空且 capability unknown       | 先刷新/探测，不乐观选择                                                                |
| Workspace reminder JSON 超过 64 KiB                     | `WORKSPACE_REMINDER_TOO_LARGE`；拒绝 Agent activation，不截断路径或成员列表            |
| repository-owned schema 的 folderId 非成员              | Main/MCP 拒绝                                                                          |
| proposal changeId 跨成员重名                            | 要求 ProposalRef，不猜 owner                                                           |
| create-proposal 的 ProposalRef 已存在                   | `PROPOSAL_ALREADY_EXISTS` + existing target；不写 event/origin                         |
| explore 无 owner 且匹配多个 Folder                      | `PROPOSAL_OWNER_AMBIGUOUS` + candidates                                                |
| explore 无 owner 且任一目标 Folder 扫描失败             | `PROPOSAL_OWNER_UNVERIFIED`；要求显式 folderId                                         |
| 同一 ProposalRef 出现多个 linked candidates             | `PROPOSAL_LOCATION_AMBIGUOUS`；不得任取一个                                            |
| apply/archive 的已固定 target 消失或不再匹配            | 明确失败；不回退 main 或切换其他 worktree                                              |
| apply/archive MCP 请求其他 Workspace member             | descriptor allowlist 拒绝                                                              |
| tool 接受的 worktreePath 不属于 owner repository        | MCP 拒绝；apply/archive 不接收 caller path                                             |
| Session activation · snapshot member 已移出             | `SESSION_FOLDER_REMOVED`；保留历史但阻止 Agent 恢复，重新加入同一 Folder 后重试        |
| Session activation · snapshot path missing              | `SESSION_FOLDER_PATH_MISSING`；阻止 Agent 恢复，修复 Folder 后新建 Session             |
| Session activation · snapshot path 已重定位             | `SESSION_FOLDER_RELOCATED`；不跟随新路径，只允许查看持久化内容并要求新建 Session       |
| attachment handle 不属于 sender Workspace/Session       | Main 拒绝；不得读取 renderer 提交的任意 `file://` URI                                  |
| member resource link 的 worktree 已移除/取消注册        | 返回 unavailable/error；不得回退 main worktree                                         |
| member 被 active run 引用                               | 阻止移除并返回引用                                                                     |
| task target 已不是 Workspace member                     | 保留 soft ref 并显示 stale target；不得据剩余 target 自动预选 proposal owner           |
| Chat preview target 不在 Session snapshot               | 允许按 Window trust 查看并标为 `window-only`；不得发送为 Agent resource                |
| repository reader 合法无内容                            | `ready` + empty data，不显示错误                                                       |
| 部分 repository reader 失败                             | 返回其他 ready data + 对应 Folder error；不得伪装为空                                  |
| Overview repository 汇总不完整                          | 返回 partial aggregate + 未计入 Folder，不标成完整总数                                 |

## 20. 迁移策略

### 20.1 服从现有升级迁移框架

Workspace 历史数据转换必须复用 `src/main/migrations/**`，不得另建一套业务迁移 runner：

- `bootstrapReady()` 在 `syncShellPath()` 后 `await runAllMigrations()`，并在 bundled MCP host、IPC、窗口和 Agent 预热之前完成迁移。迁移脚本不得依赖这些尚未初始化的能力。
- 脚本位于 `src/main/migrations/scripts/`，使用 `YYYYMMDD_NNN_<description>.ts`，导出异步 `migrate`，并在 `scripts/index.ts` 中按文件名字母序显式注册。
- `getDataSubPath("migrations")/migrations.json` 是唯一执行账本。不得在本功能内另造 migration journal、执行记录或 rollback 状态机。
- 新安装通过 `baselineId` 跳过历史迁移；旧安装执行未被 baseline 或 `executed` 覆盖的迁移。
- `success` 和 `failed` 记录都会让同一迁移 ID 永久跳过，失败不会在后续启动自动重试。
- 单个迁移失败后 runner 继续执行后续迁移，并且不会把错误继续抛给 bootstrap。
- 已发布迁移 ID 与含义不可修改；修正只能新增更晚的迁移。

因此，原方案中的“幂等重试”“失败后自动回滚”“下次启动继续同一迁移”都不是当前能力，不能作为 Workspace cutover 的前提。

### 20.2 Workspace cutover 脚本

Project → Workspace + Folder 的结构转换属于新增持久化 path、JSON key 和 schema，正式实现前必须由 OpenSpec proposal 固定兼容契约。落地时至少有一个已注册的 required cutover migration：

cutover 的进程级前置条件是应用已经通过独立 OpenSpec proposal 建立单实例启动契约：`app.requestSingleInstanceLock()` 必须早于 `app.whenReady()` 和 `runAllMigrations()`；未取得锁的第二实例不得启动 migration 或其他 app-data writer。该前置能力独立交付，Workspace foundation 只依赖并验证它，不在 cutover 脚本内另造跨进程文件锁。

1. 通过 `getDataSubPath()` 定位 `projects`、`workspaces` 和 `workspace-folders`，不得硬编码 app-data 根目录。
2. 只处理能够通过旧 schema 明确认出的 Project；不存在、已转换或不匹配的记录安全 no-op。
3. 先完成旧数据读取、schema 校验、ID 映射和目标冲突检查，再开始写入。
4. 复制并转换到新目录，不在首次 cutover 中移动、覆盖或删除旧 `projects` 数据。
5. 目标已存在时只接受 schema 与 ID 映射一致的数据；不得静默合并同名但内容冲突的目录。
6. 保留所有无关 JSON 字段和非目标文件；只有内容确实变化时才写入。
7. 单个缺失、不可读或不可解析的输入与其他记录隔离；先继续处理可独立转换的记录，再汇总会阻止完整 cutover 的问题并让迁移失败。无法安全转换的数据保持原样，不猜测默认值。
8. 意外写入失败必须抛给 runner 记录为 `failed`，不得吞掉错误并让迁移被记成 `success`。

迁移后的 Folder Workspace 与 Folder 都复用 legacy Project ID：`workspaceId === folderId === legacyProjectId`。这是已确定的身份规则，不在 proposal 中重新选择新 ID，也不引入 legacy Project ID ↔ 新 Workspace/Folder ID 的迁移映射表。该限制不适用于 Folder registry 必需的 canonical path → `folderId` 反向解析能力。

由于 runner 会在前置迁移失败后继续执行后续迁移，不应把相互依赖的 cutover 步骤随意拆成多个“假定前一步成功”的脚本。若必须拆分，每个后续脚本都要独立检查前置目标形态；前置未完成时只能安全 no-op，不能消费半迁移数据。删除 legacy 数据的 cleanup 不与首次 cutover 在同一发布批次注册。

### 20.3 各类历史数据转换

required cutover migration 应覆盖正常 Workspace bootstrap 所需的完整数据形态：

- **Meta**：每个 legacy Project 生成一个同 ID、`kind: "folder"`、`isDeleted: false` 且没有 deletion fields 的 `WorkspaceMeta`，以及一个同 ID 的 `FolderMeta`；`folderIds` 只包含该 ID，primary 也是该 ID。cutover 先为每个 Project 计算 `candidateLegacyAppDataKey = encodeProjectPath(legacyProject.path)`，再对全部候选值分组；只有恰好命中一个 Project 的候选值才作为该 Workspace 的 `legacyAppDataKey` 持久化，直到对应 legacy source/record 被清理，碰撞组内 Workspace 均不设置该字段。有效的 `legacyProject.path` canonicalize 后成为 Folder 当前 path；missing path 保留最后已知绝对路径并等待 repair。`legacyProject.healthScore` 在存在时原样进入 `FolderMeta.healthScore`。即使 `legacyProject.id !== encodeProjectPath(legacyProject.path)`，也保留 legacy ID，并以有效 path 的 canonical 结果建立 Folder registry 反向解析；不得按当前 path 重新计算 ID。新运行期不长期保留 Project union/normalization。
- **App-data**：只把 `<appData>/projects/<candidateLegacyAppDataKey>` 的 Workspace-owned 内容复制到 `<appData>/workspaces/<workspaceId>`；不得用 `legacyProject.id` 或迁移后可能继续变化的 Folder path 定位来源。候选 key 仅是旧 helper 的 source locator，不是全局唯一键；碰撞不改变旧 source 的读取行为，也不授予单 Workspace 删除该 source 的权利。Folder meta 与 repository reverse lineage 写入 `<appData>/workspace-folders/<folderId>`。
- **Session**：legacy `projectId` 转换为 `workspaceId`；没有 Workspace snapshot 时，生成 `workspaceKind: "folder"` 且包含唯一 `{folderId, folderName, folderPath}` 的单成员 snapshot。
- **Task**：legacy `projectId` 转换为 `workspaceId`；`targetFolderIds` 省略，不因 legacy Workspace 只有一个 Folder 而猜测 repository hint。
- **Lineage**：Workspace subjects 进入 Workspace 数据目录；proposal/commit reverse entries 进入对应 Folder index，不跨 Folder 猜测 owner。legacy 单值 reverse entry 转换为单元素 `RepositoryLineageRelation[]`，`relation: "origin"`；`linkedAt` 优先取对应 proposal link 的 `createdAt`，commit 无独立时间时取所属 subject 的 `updatedAt`。无法唯一定位 Folder 或 subject 的条目保留源数据并令 required migration 失败，不以迁移时间或遍历顺序猜测。
- **Knowledge**：缺少 owner 的 legacy file/package anchor 归属迁移得到的唯一 Folder；新 anchor 使用 `folderId`。

每项转换都必须识别“旧形态”“已迁移形态”和“部分目标形态”。部分目标只有在来源与 ID 映射一致时才能补齐；冲突时保留 source 和 target，令 required migration 失败，不得选择一侧覆盖另一侧。

如果多个 legacy Project 使用不同 ID，但有效 path canonicalize 后相同，cutover 不得按最近打开时间等启发式规则选择一个 ID，也不得自动合并两份 Workspace-owned 数据。迁移应保留全部 legacy source、报告冲突的 Project ID/path 并失败；后续显式 repair 必须先确定保留的稳定 Folder ID 和两份 Workspace-owned 数据的处置方式，再由新的迁移 ID 完成修复。

legacy Project 时代已经只剩 `<appData>/projects/**` app-data、但没有对应 Project meta 的孤儿目录不参与本次 cutover：迁移不得猜测 path、Project ID、Workspace owner 或自动删除这些目录，也不得把它们绑定到新 Workspace。它们保持原样，后续若要提供扫描、认领或清理能力，必须由独立 maintenance proposal 定义。

path 曾更新的 legacy Project 可能同时存在当前 active source `<appData>/projects/<encodeProjectPath(legacyProject.path)>` 与基于旧 path 的历史目录。cutover 只迁移当前 meta 明确指向的 active source；即使某个历史目录名恰好等于 `legacyProject.id`，也不得回退读取、合并或覆盖。历史目录按无法安全归属的 legacy orphan 保留，因为旧 path 可能已被其他 Project 复用；后续处置同样属于独立 maintenance proposal。

`candidateLegacyAppDataKey` 的编码后碰撞与 canonical path 碰撞是两类不同情况：前者允许各 Workspace 按旧 helper 的既有 source 完成 cutover，但碰撞组不得持久化 `legacyAppDataKey`，共享 source 作为无法安全归属的 legacy orphan 保留；后者仍按上一段规则令 required cutover 失败。编码碰撞可能使旧目录内既有数据混合是 multi-root 之前的缺陷，不在本设计中拆分、去混或归责。

### 20.4 失败、repair 与 legacy cleanup

现有 runner 的失败语义决定了 Workspace migration 需要额外的启动门控：

- `runAllMigrations()` 返回后，Main 按 runner 的跳过语义检查 required cutover：`executed` 中存在该 ID 时必须为 `success`；不存在执行记录时，只有 `requiredCutoverId <= baselineId` 才视为已满足。`failed` 记录不能被 baseline 条件覆盖。
- required migration 存在 `failed` 记录，或旧安装的 `success` cutover 没有形成完整目标数据时，不启动依赖 Workspace 数据的 bundled MCP、IPC、普通 Launcher 和 Agent 预热；进入明确的升级失败/repair 状态。被 baseline 覆盖的 fresh install 不要求预先存在 Workspace/Folder 记录。
- 该门控不能通过让原迁移 ID重试实现。修复已发布迁移必须提供新的迁移 ID，或另行通过 proposal 设计显式 repair 能力。
- legacy `projects` 数据默认至少保留到 cutover 已稳定的后续版本。批量清理使用新的、更晚迁移 ID，并再次确认新数据完整；不得通过修改旧脚本补做删除。成功清除某个 migrated Workspace 的 legacy source 与同 ID legacy meta record 后，同时清除其 `WorkspaceMeta.legacyAppDataKey`。该字段只在 candidate key 全局分组中恰好命中一个 Project 时持久化；字段存在才是仍需处理且可唯一归属 retained copy 的权威 provenance，原始 `encodeProjectPath` 结果本身不保证全局唯一，也不得作为 map/registry key。
- 用户对单个 migrated Workspace 执行 §17.3 的显式永久删除是上述默认保留策略的例外：在删除 Workspace meta 前，Main 必须仅在该 meta 持有 `legacyAppDataKey` 时删除 `<appData>/projects/<legacyAppDataKey>`，并按稳定 legacy ID 删除对应 legacy Project meta record。不得改用 Workspace ID 作为目录 key、当前 Folder path、未持久化的 candidate key 或扫描候选目录。provenance 存在但来源无法删除，或任一 legacy/current 删除失败时，保留 `cleanup-failed` tombstone 并允许重试，不得报告“永久删除”成功。没有 provenance（包括 fresh Workspace、碰撞组或已由更晚 cleanup migration 清除）时跳过 legacy source 删除，current Workspace 清理仍可幂等成功。
- path 更新遗留、编码碰撞组以及无当前 meta 明确指向的 legacy orphan 不属于单 Workspace 永久删除范围；既不因名称等于旧 ID 或 candidate key 而删除，也不阻止 current Workspace 数据的永久清理。产品文案中的“不可恢复”表示当前 Workspace 及其已持久化 provenance 证明唯一归属的 retained legacy copy 已清除；明确不承诺法证擦除或认领无法安全归属的历史孤儿目录。
- runner、账本 schema、失败后继续/不重试语义保持不变。若决定改变这些框架行为，必须作为独立的 OpenSpec contract 变更并补齐 runner 测试。

升级失败状态是用户可见行为，foundation proposal 必须明确展示、退出、降级或修复路径；参考设计不能只写“可恢复”而不定义产品行为。

### 20.5 Fresh install 与 baseline

- fresh install 会把当前最后一个迁移记为 `baselineId` 并跳过所有历史脚本，因此新 storage/service 必须直接创建最终 Workspace/Folder schema：“打开文件夹”创建 `folder` kind，“创建 Workspace”创建 `collection` kind。
- 当前 runner 通过 `projects` 目录或 `acp/installed.json` 判断旧安装。现有 Project 用户具备 `projects` 标记，可以进入 cutover。
- 切换到 `workspaces` / `workspace-folders` 后，需要重新评估 `isNewInstall`。如果可能存在“有新 Workspace 数据但没有 migration store、projects 或 installed.json”的安装，必须在 proposal 中扩展旧数据标记，并覆盖 fresh-install baseline 与 existing-install 测试。

不得在普通 Workspace migration 脚本中顺带修改 baseline、账本或 runner 语义。

### 20.6 MCP 一次性切换

- Workspace 版本同时升级 HTTP per-activation capability、Main grant registry/proxy 注入、stdio env、shared request context、`fyllo-specs` 和 `fyllo-cortex`，不发布混合协议状态。
- 所有新建、恢复和加载的 Workspace Session 只发送 Workspace v2。HTTP Agent 只收到 opaque capability token，不收到可提交的 descriptor/path headers；stdio 只使用单 activation 的 `FYLLO_WORKSPACE_JSON`，并遵守 §10.5 的不同信任边界。
- Cortex/Specs shared resolver 只消费 Workspace v2，不读取 `FYLLO_PROJECT_*`，也不构造 Project compatibility model。
- `getProjectPath()`、旧 path headers/env 和对应解析逻辑在 MCP Workspace v2 阶段直接删除，不留 runtime fallback。

## 21. 分阶段实施

本章只描述 proposal 之间的依赖、交付顺序和覆盖目标，不是独立的验收权威。每个阶段进入实施前，必须把负责的行为要求、场景、任务和验证命令写入对应 OpenSpec proposal；实现与验收以 OpenSpec 为唯一权威。

### Phase 0：Contract inventory 与回归基线

- 先通过独立 OpenSpec proposal 建立应用单实例启动契约，并验证单实例判定早于 migration runner。
- 建立所有 `projectId/projectPath/projectDir` 调用点清单。
- 标记每个能力属于 Global、Workspace、Repository、Worktree 或 Runtime。
- 为当前单 Project 窗口、session、proposal、lineage、MCP 行为补齐回归测试。
- 冻结现有 app-data path 与 JSON schema fixture。
- 固定当前 migration registry、`migrations.json`、fresh-install baseline 和失败不重试 fixture。

退出条件：单实例启动前置能力已落地；每一个 project-level service 都有明确目标 scope，且 legacy 单 Project contract 有可运行基线。

### Phase 1：Workspace foundation

- 引入 `WorkspaceKind`、含 tombstone fields 的 `WorkspaceMeta`、`FolderMeta` 与完整 kind/deletion invariants。
- 按 `DataMigrations` 规范实现并注册 Project → Workspace + Folder required cutover migration。
- 实现 cutover status 检查与升级失败/repair 启动门控，不改变 runner 的失败不重试语义。
- 实现 `ResolvedWorkspace` / `ResolvedRepositoryTarget`。
- storage helper 从 path identity 转为 Workspace/Folder ID。
- `ProjectWindowManager` 替换为 `WorkspaceWindowManager`，所有方法和 runtime key 使用 Workspace ID。
- 不开放 Workspace 创建 UI。

退出条件：fresh install 直接产生最终 schema；旧 Project 数据在迁移账本记录成功后以 Folder Workspace 打开；迁移失败不会让普通 Workspace runtime 消费半迁移数据。

### Phase 2：Launcher 与 Workspace lifecycle

- 实施与验收由 `add-workspace-launcher-lifecycle` proposal 统一追踪。
- launcher、Collection lifecycle、成员移除引用保护、Folder relocation、soft delete/restore/permanent cleanup 的规范来源分别为该 proposal 下的 `workspace-lifecycle`、`workspace-model` 与 `workspace-window` specs；本设计不再复制第二份验收措辞。
- Phase 3 启用 ACP multi-root session 前，Collection Chat capability 继续保持禁用。

### Phase 3：ACP multi-root session

- Agent capability 三态门控、picker、ACP lifecycle 目录参数、Session snapshot/stale 校验、安全 reminder、附件/member resource 与 apply/archive owner-only 文件系统范围 → `add-acp-multi-root-sessions` proposal / `acp-multi-root-session`、`acp-agent-capability-cache` specs。
- multi-member local preview、owner projection 与 Window trust / Agent Session scope 分离 → `add-acp-multi-root-sessions` proposal / `local-file-link-preview` spec。
- Collection Chat capability 与 Session/current scope UI → `add-acp-multi-root-sessions` proposal / `workspace-window` spec。

退出条件：需要附加目录时只有兼容 Agent 可以创建、恢复 Workspace chat；没有附加目录时不兼容 Agent 仍可按单 root session 使用。

### Phase 4：MCP Workspace v2

- 实现 per-activation opaque capability、Main grant registry、外部/内部 token 分离、proxy 可信上下文注入与撤销生命周期。
- HTTP/stdio Workspace v2。
- 固定 stdio 的 trusted Agent runtime 假设与单 activation child 生命周期；不把 env descriptor 宣称为 HTTP 等价授权凭据。
- shared Workspace/folder/worktree resolver。
- Chat activation descriptor 使用 Session 授权成员；apply/archive activation descriptor 只包含 run owner Folder，MCP allowlist 与文件系统 scope 一致。
- MCP event 增加 workspace/owner。
- 同步删除旧 path headers/env、`getProjectPath()` 和 Project request context。

退出条件：同一 ACP Session 中 MCP 能安全路由到任一授权成员；并存 Session 不能用自己的 token/headers 切换到其他 Workspace snapshot；撤销和 host 重启后旧 token 失效；无法访问非成员 path。

### Phase 5：`fyllo-specs` 与 Proposal lifecycle

- ProposalRef。
- create/explore/apply/archive owner 参数；移除 caller `targetPath/worktreePath`，统一以 ProposalRef 解析实际 target。
- linked worktree 按 owner repository 创建。
- 将“同一 repository 的 main 与单一 linked worktree 同时存在同名 change 时 linked 优先”从现有实现行为固化为 OpenSpec requirement；多个 linked candidates 明确报错。
- explore 按 Folder 聚合、结构化 partial warning，并在 owner 无法证明唯一时拒绝猜测。
- browser/status watcher/run meta/event rail 全链路 owner 化。
- Workspace proposal 聚合和 Folder filter。

退出条件：A/B 同名 proposal 不冲突；在 B 创建的 proposal/worktree/apply/archive 全程只操作 B；apply/archive Agent 的文件系统与 MCP descriptor 都不包含 A；任一 Folder 扫描失败时 explore 不把另一个同名 change 误判为唯一 owner。

### Phase 6：`fyllo-cortex` 与 Insight

- guidelines owner selector。
- Workspace knowledge + folder-qualified anchors。
- lineage Workspace subjects + repository reverse index 多值 origin/reference 关系与并发 mutation boundary。
- specs/guidelines/proposal/overview 聚合 reader。
- aggregate envelope 区分 ready-empty、missing、error 与 item warning；leaf reader 不吞掉影响完整性的错误。
- Overview 拆分 Workspace reader 与 per-Folder repository readers，Workspace work 只读一次，partial totals 标记 completeness。
- ProposalRef、SpecRef、GuidelineRef 贯穿 store selection、Vue key、detail lookup/IPC 与缓存。
- partial failure、missing member 和 owner badge；多成员 degraded Workspace 不隐藏 Folder scope。

退出条件：Cortex 和所有治理页面都能正确解释 Workspace 与 repository scope。

### Phase 7：Automation 与剩余项目级能力

- task/workflow/integration config 使用 Workspace storage。
- task `targetFolderIds` 使用不阻塞成员移除的软引用，并显式投影 stale target；legacy task 不猜测 target。
- repository-bound integration resource 增加 folder binding。
- overview health aggregate。
- local file links、action、plan、spawned session 等剩余调用点复核。

退出条件：scope inventory 中没有仍把 Workspace 当作单一 projectPath 的能力。

### Phase 8：Migration settlement 与 hardening

- 通过新的迁移 ID 修正已发现的历史 cutover 问题，不修改已发布脚本。
- 在后续安全窗口使用独立 cleanup migration 清理已验证无引用的 legacy 数据。
- cutover telemetry、升级失败诊断和 repair 流程。
- 大量成员、missing folder paths、symlink、Windows path 测试。
- 更新 guidelines 与正式 specs。

## 22. OpenSpec Proposal 拆分建议

该能力不适合一个巨型 proposal。建议按依赖关系拆为：

0. `enforce-single-instance-startup`
   - 在 `app.whenReady()` 和 migration runner 前取得单实例锁；定义第二实例的退出/聚焦行为；验证未取得锁的实例不会启动 app-data writer。该 proposal 独立交付，是 Workspace cutover 的前置依赖。
1. `introduce-workspace-model`
   - WorkspaceKind、Workspace/Folder meta、kind invariants、required cutover migration、失败门控、resolver、storage identity、window contract。
2. `add-workspace-launcher-lifecycle`
   - Folder Workspace 复用、Collection Workspace 创建/编辑、kind-specific launcher、primary/member/missing path UX。
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
8. `retire-legacy-project-storage`
   - 后续修正 migration、legacy cleanup、cutover hardening。

每个 proposal 都必须保持前一阶段已迁移的 Folder Workspace 行为可回归，不能要求所有阶段一次合并后才可运行。

创建上述每个 proposal 时，必须同时把它负责的 §23 条目迁入 OpenSpec，并将 README 中对应详细条目改写为 owner proposal/spec 追踪关系，避免临时 inventory 在 proposal 建立后继续成为第二份测试措辞。

## 23. Proposal 覆盖清单（临时）

本章是在 proposal 尚未全部创建时使用的覆盖 inventory，不是独立验收契约，也不得在实现阶段与 OpenSpec 形成两个权威副本：

- 创建每个 proposal 时，必须把其负责的条目转换为精确 requirement/scenario、tasks 和验证命令。
- proposal 建立后，本章对应的详细条目应替换为“条目 → owner proposal/spec”的追踪关系，不继续维护第二份测试措辞。
- 某条目与已批准 OpenSpec 冲突时，以 OpenSpec 为准，并同步修正或移除本章旧条目。
- 所有条目完成归属后，本章只保留跨 proposal 追踪表；不得把这里的清单直接当作 Apply 或 Archive 的通过条件。

### 23.1 Shared/domain

- Workspace/Folder identity、kind、成员数量/primary/tombstone invariants、canonical Folder registry、resolver 与 repository target validation → `introduce-workspace-model` proposal / `workspace-model` spec；
- Project cutover boundary、legacy Session 单 Folder snapshot 与 Workspace-owned schema conversion → `introduce-workspace-model` proposal / `workspace-storage-cutover` spec；
- ProposalRef serialization、repository owner identity 与 resolved target → `make-openspec-proposals-repository-owned` proposal / `repository-owned-proposals` spec；
- knowledge anchor/lineage v2 schema；

### 23.2 Data migrations

- Project → Workspace/Folder required migration、candidate source/provenance、全局 preflight、Workspace-owned 数据转换、ledger/baseline gate 与 legacy source 保留 → `introduce-workspace-model` proposal / `workspace-storage-cutover` spec；
- Workspace/Folder meta、registry 与运行期 storage namespace → `introduce-workspace-model` proposal / `workspace-model` spec。

### 23.3 Main

- 单实例启动前置 → `enforce-single-instance-startup` proposal / `single-instance-startup` spec：锁早于 bootstrap 与 app-data writer，第二实例退出或请求主实例窗口注意力；
- Workspace/launcher window、main-owned context、window state、runtime 隔离与 Folder Workspace 打开 → `introduce-workspace-model` proposal / `workspace-window` spec；
- launcher、Collection 创建/编辑、成员引用保护、Folder relocation、soft delete/restore/permanent cleanup → `add-workspace-launcher-lifecycle` proposal / `workspace-lifecycle`、`workspace-model`、`workspace-window` specs；
- Workspace-owned stable-ID storage 与 cutover bootstrap gate/原生失败对话框 → `introduce-workspace-model` proposal / `workspace-storage-cutover` spec；
- soft delete 关闭窗口并取消 runtime 后只写 tombstone，默认 launcher/open 排除该 Workspace，但 Workspace meta、ID、成员与 app-data 均保留；
- “已删除的 Workspace”视图能发现 `restorable` tombstone；恢复保留原 `workspaceId` 与数据，primary missing 时进入修复而不是伪装可打开；按 Folder path 再次打开 tombstoned Folder Workspace 时提示恢复且不创建重复 Workspace；
- 永久清理只接受 tombstone，先持久化 `purging`，删除该 Workspace-owned app-data/window state；对 `legacyAppDataKey` 存在的 migrated Workspace 还删除该 key 对应 active legacy source 与同 ID legacy meta record，最后删除 Workspace meta；无 provenance 的碰撞组只清理 current Workspace 数据，不删除共享 legacy source；
- 对上述编码碰撞 fixture 永久删除其中一个 Workspace 时，其 current app-data/meta 清理成功，共享 legacy source 保留，另一个 Workspace 不产生悬空 provenance；
- migrated Workspace 永久清理不得用 legacy ID 作为目录 key、当前 Folder path 或目录扫描改选 legacy source；provenance 存在但 source 删除失败时保留 `cleanup-failed`，重启后只允许重试且不伪报成功；更晚 cleanup migration 删除 source/record 并清除 provenance 后，永久清理幂等成功；
- path 更新留下的旧 ID/历史目录不由单 Workspace 永久删除认领；另一个 Project 复用旧 path 时其数据不受影响；
- soft delete、恢复和永久清理均不修改共享 Folder registry、其他 Workspace、worktree 或 repository-scoped lineage；最后一个 Workspace 引用被清理也不隐式删除 Folder；
- 重复/并发“打开文件夹”的 Folder identity 原子复用 → `introduce-workspace-model` proposal / `workspace-model`、`workspace-window` specs；
- Folder 重定位后按新路径打开仍返回原 Folder Workspace 及原 Workspace-owned 数据；
- 没有对应 Folder Workspace 的 Collection member 也能通过 missing-member repair 重定位，并提示所有受影响 Workspace；
- 重定位到其他 Folder 已占用的 canonical path 时拒绝且不修改 registry；
- 重定位会使任一引用 Workspace 出现重复或嵌套成员时拒绝且不产生部分更新；
- F1 被 WA/W1/W2 引用、但新路径只与 W2 的成员冲突时，整次重定位拒绝，结构化报告只列出 W2 及冲突 Folder，并可从 UI 打开或聚焦 W2 编辑；解除冲突后使用同一路径重试成功；
- probe/chat/apply/archive runtime 仍使用 F1 时重定位返回 `FOLDER_RELOCATION_ACTIVE_RUNTIME` 且 registry 不变；关闭引用运行态后重试成功；
- 重定位更新所有引用 Workspace 的后续 Folder 解析，但不改写已有 Session 的目录快照；受影响 Session 的路径能力进入 `SESSION_FOLDER_RELOCATED`，不得静默跟随新路径；
- Folder Workspace 成员 mutation 被拒绝，Collection Workspace 成员 mutation 生效；
- 第 17 个成员被拒绝，现有 16 个成员和 primary 保持不变；
- missing primary/secondary；
- member removal；
- active Session 引用成员时移除被阻止；非 active Session 不阻止移除，但确认界面列出受影响 Session，移除后恢复返回 `SESSION_FOLDER_REMOVED`，重新加入同一 Folder 后才允许继续执行 path stale 检测；
- task target 不阻止成员移除、保留 stale ID 与 owner suggestion 歧义 → `aggregate-workspace-folder-features` proposal / `workspace-automation-storage` spec；
- multi-member local preview、per-member worktree degradation、member-derived trust、external exact-path grant 与 longest owner match → `add-acp-multi-root-sessions` proposal / `local-file-link-preview` spec；
- Workspace watcher/stream/probe key isolation → `introduce-workspace-model` proposal / `workspace-window` spec；
- per-Folder repository scan、ready/missing/error 与 partial envelope → `aggregate-workspace-folder-features` proposal / `repository-browser-aggregation` spec。

### 23.4 ACP

- picker/capability 三态、probe/new/load/resume 目录集合、Session snapshot/stale error、Chat/probe reminder、preview scope、opaque attachment、member file resource 与 apply/archive owner-only Folder paths → `add-acp-multi-root-sessions` proposal / `acp-multi-root-session`、`acp-agent-capability-cache`、`local-file-link-preview`、`workspace-window` specs；
- Session snapshot 到 MCP descriptor、bundled MCP activation allowlist 与 stale grant 的投影 → `add-multi-root-mcp-workspace` proposal / `mcp-workspace-authorization` spec；
- apply/archive reminder 从 run 固定 owner/worktree target 投影且不重选 current primary → `make-openspec-proposals-repository-owned` proposal / `acp-multi-root-session`、`repository-owned-proposals` specs。

### 23.5 MCP

- Folder Workspace 与单 Folder Collection Workspace 的 `workspaceKind` 正确传递；
- multi-root Collection Workspace decode/auth；
- owner member allow/deny；
- arbitrary path injection deny；
- owner worktree validation；
- A/B 同名 change；
- HTTP 并发 Workspace 隔离：每个 activation 获得不同 bearer，自己的 bearer 携带伪造 Workspace/Session/path headers 不能切换到另一 snapshot；
- bearer 对错误 bundled server、过期、撤销、Agent invalidation 和 host restart 均拒绝；load/resume 不复用旧 bearer；
- proxy 移除 caller-supplied `X-Fyllo-*` headers 并注入 grant 中的 descriptor；backend 只接受内部 token；
- Folder 重定位后旧 grant 不解析到新 path，而是返回 `SESSION_FOLDER_RELOCATED`；新 Session/grant 使用新 path；
- multi-root Workspace 的 apply/archive activation descriptor 只包含 owner Folder，且 proposal event 携带并验证 owner → `make-openspec-proposals-repository-owned` proposal / `acp-multi-root-session`、`mcp-workspace-authorization` specs；
- stdio fallback 为每个 activation 启动独立 child、固定 env snapshot、校验成员 `folderId`，并以测试/文档明确其 trusted Agent runtime 假设不等同 HTTP 授权。

### 23.6 Proposal

- ProposalRef、owner repository target resolver、linked-preferred 选址、重复 create 与 deterministic apply/archive target → `make-openspec-proposals-repository-owned` proposal / `repository-owned-proposals` spec；
- descriptor Folder 聚合扫描、per-Folder warning、显式 owner 与省略 owner 时的唯一性证明 → `make-openspec-proposals-repository-owned` proposal / `fyllo-specs-explore` spec；
- apply/archive run snapshot、stale target 拒绝与 owner-only Agent scope → `make-openspec-proposals-repository-owned` proposal / `repository-owned-proposals`、`acp-multi-root-session` specs；
- Proposal list/detail/status watcher 的 composite identity、跨 Folder 同名展示与 owner/linked target 呈现 → `make-openspec-proposals-repository-owned` proposal / `proposal-browser` spec；
- proposal create event 与 lineage consumer 的 Workspace/Folder/target 验证 → `make-openspec-proposals-repository-owned` proposal / `mcp-workspace-authorization`、`repository-owned-proposals` specs。

### 23.7 Cortex/Insight

- guidelines 显式 owner、Chat 聚合 reminder 与 Apply/Archive owner-only reminder → `make-cortex-workspace-aware` proposal / `fyllo-cortex-guidelines`、`mcp-workspace-authorization` specs；
- spec/guideline aggregate 状态、warning 与完整 Ref identity → `aggregate-workspace-folder-features` proposal / `repository-browser-aggregation`、`specs-browser`、`guidelines-browser` specs；
- Workspace knowledge 独立存储、Folder-qualified file/package/commit evidence 与 owner 授权 → `make-cortex-workspace-aware` proposal / `fyllo-cortex-knowledge`、`mcp-workspace-authorization` specs；
- repository-qualified file/commit/proposal trace、main/registered linked worktree target 与逃逸拒绝 → `make-cortex-workspace-aware` proposal / `repository-lineage`、`mcp-workspace-authorization` specs；
- proposal/commit 唯一 origin、多 Workspace 幂等 reference、origin conflict 与并发原子 mutation → `make-cortex-workspace-aware` proposal / `repository-lineage` spec；
- lineage v1 owner-qualified migration、歧义保留与 warning → `make-cortex-workspace-aware` proposal / `repository-lineage`、`fyllo-cortex-knowledge` specs；
- Folder repository reverse index 可从任意授权 Workspace 查询唯一 origin 与全部 references → `make-cortex-workspace-aware` proposal / `repository-lineage` spec；
- aggregate browser partial/degraded 呈现与 ready-only 汇总 → `aggregate-workspace-folder-features` proposal / `repository-browser-aggregation` spec；
- Overview 的 Workspace work 单次读取、per-Folder governance 与 partial totals → `aggregate-workspace-folder-features` proposal / `project-overview` spec；
- Lineage Browser 使用完整 `ProposalRef`、Folder owner metadata 与 composite key，且共享 Folder proposal enrichment 只读取当前 Workspace subject/reference → `make-cortex-workspace-aware` proposal / `lineage-browser`、`repository-lineage` specs；
- Overview 的 owner-qualified active proposal 与跨 repository 同名计数 → `aggregate-workspace-folder-features` proposal / `project-overview` spec。

### 23.8 Renderer

- launcher 区分 Folder Workspace 与 Collection Workspace；
- launcher 默认隐藏 tombstone，并提供可达的“已删除的 Workspace”管理视图、恢复动作和带不可恢复二次确认的永久删除动作；
- “打开文件夹”复用 Folder Workspace，“创建 Workspace”始终创建 Collection Workspace；
- Folder Workspace 隐藏成员编辑并提供“基于此 Folder 创建 Workspace”；
- Collection Workspace 即使只有一个 Folder 也保持 collection UI；
- create/edit primary/member；
- degraded Workspace warning；
- Agent picker gating → `add-acp-multi-root-sessions` proposal / `acp-agent-capability-cache`、`workspace-window` specs；
- route meta 与 activity bar 使用同一 `requiresWorkspace`/capability evaluator；secondary member missing 不禁用 task/knowledge/workflow；
- Chat header 的 Session/current scope diff 与 `window-only` preview 呈现 → `add-acp-multi-root-sessions` proposal / `workspace-window`、`local-file-link-preview` specs；
- Specs、Guidelines、Proposal 的 Folder filter、owner badge 与 per-Folder 状态 → `aggregate-workspace-folder-features` proposal / `specs-browser`、`guidelines-browser`、`proposal-browser` specs；linked target 呈现 → `make-openspec-proposals-repository-owned` proposal / `proposal-browser` spec；
- 同名 proposal detail、status与run state隔离 → `make-openspec-proposals-repository-owned` proposal / `proposal-browser`、`repository-owned-proposals` specs；
- 同名 spec/guideline 的 composite selection 与 Folder-level missing/error/empty state → `aggregate-workspace-folder-features` proposal / `specs-browser`、`guidelines-browser` specs；
- Folder Workspace 不显示成员编辑 UI；
- 窄窗口、键盘焦点、错误和空状态。

### 23.9 跨平台

- macOS/Linux/Windows absolute paths；
- case sensitivity；
- symlink canonicalization；
- drive letter/UNC path；
- Git 与 non-Git member；
- member folder paths 中包含空格和非 ASCII 字符；
- `folderName` / `folderPath` 包含引号、反斜杠、换行与 `</workspace>` 等 reminder 标记字符时仍保持合法 JSON 和外层 tag 边界。

## 24. 验收标准

整体能力完成时应满足：

- 旧 Project 通过已注册的 main-process migration 自动迁移为同 ID Folder 和 `kind: "folder"` 的 Workspace；迁移成功后现有 app-data 可读，用户无需手工转换。
- legacy app-data source 始终由 cutover 时的 `encodeProjectPath(legacyProject.path)` candidate 定位，不由 legacy ID 定位；只有 candidate 在全部迁移 Project 中唯一时才持久化为 `legacyAppDataKey`，编码碰撞组不建立 provenance，path 更新留下的历史目录不参与迁移或合并。
- fresh install 通过 baseline 跳过历史 cutover，并直接创建最终 Workspace/Folder schema。
- required cutover 的结果由现有 `migrations.json` 账本记录；`success` 或无执行记录但被 `baselineId` 覆盖时通过启动门控，`failed` 不自动重试，也不会让普通 Workspace runtime 消费半迁移数据。
- 首次 cutover 保留 legacy source；修正和 cleanup 使用新的迁移 ID，不修改已发布脚本。
- Workspace 有稳定 ID、持久化 `kind`、1–16 个成员和唯一 primary。
- Workspace 删除保留同 ID tombstone 与 Workspace-owned app-data；launcher 默认隐藏但可从“已删除的 Workspace”恢复。v1 只由用户显式永久清理，不按时间自动 GC。
- 永久清理删除目标 Workspace meta、Workspace-owned app-data、window state，以及已持久化 `legacyAppDataKey` 证明唯一归属的 active legacy copy/record；没有 provenance 时跳过 legacy source 并允许 current 清理成功。任何应执行的 current/legacy 清理失败都保留不可恢复但可重试的 cleanup tombstone，不影响共享 Folder registry、其他 Workspace、repository-scoped 数据或无法归属的历史 orphan。
- `kind` 只允许 `folder | collection`，不得从 Folder 数量推导或自动转换。
- Folder Workspace 固定一个同 ID Folder；Collection Workspace 包含 1–16 个 Folder。
- Folder registry 对 canonical path 提供唯一、原子的反向解析；新 Folder ID 与路径无关，已有 Folder ID 不通过当前路径重新计算。
- 重复或并发“打开文件夹”始终返回同一个 Folder Workspace，原 session/task/knowledge 不会因为创建 Collection Workspace 或 Folder 重定位而消失。
- Folder 重定位保留稳定 `folderId`；目标 path 已被占用，或会让任一引用 Workspace 产生重复/嵌套成员时拒绝且不部分写入。
- 重定位因部分引用 Workspace 冲突而拒绝时，返回包含冲突 Workspace、Folder 和路径关系的结构化报告；UI 提供进入对应 Workspace 编辑的操作，v1 不允许强制重定位或自动移除成员。
- Folder 被 Agent runtime 使用时重定位原子拒绝并要求先关闭对应 Session/run；不能只撤销 MCP grant 后放任 ACP runtime 继续持有旧目录。
- 引用同一 Folder 的 Folder Workspace 与 Collection Workspace，其 Workspace-owned 数据完全隔离。
- Launcher 的 Folder Workspace 显示唯一 Folder 完整路径；Collection Workspace 显示 primary path + Folder 数量摘要。
- Workspace Chat 仅在 `additionalDirectories` 非空时限制为支持该 capability 的 Agent；单 root session 保持现有 Agent 可用性。
- ACP 所有 session lifecycle 请求使用一致的 Folder paths snapshot。
- Session snapshot 保存每个授权 `folderId` 对应的 snapshotted `folderName` 与 `folderPath`，不靠并行数组顺序猜测 owner。
- Session snapshot 不覆盖 Workspace membership 撤销；成员移除后旧 Session 历史可读，但 Agent/MCP/reminder/resource activation 在同一 Folder 重新加入前返回 `SESSION_FOLDER_REMOVED`。
- Chat/probe reminder 的 Folder 集合和 paths 只来自 Session snapshot；apply/archive reminder 只来自 run 固定 owner target。stale target 在注入前失败，任何 reminder 都不从当前 registry 静默换 path。
- reminder 的动态 Workspace 数据使用 JSON 与尖括号安全编码，成员列表完整且有数量/字节上限；恶意名称不能闭合外层 contract，超限不能靠截断路径继续 activation。
- local preview 只把当前 Workspace 的 available member roots 与各自 registered worktrees 自动视为可信；missing 成员和探测失败 worktree 不扩大授权，worktree owner 使用 longest canonical root match。
- Chat preview 明确区分 Window trust 与当前 Session Agent scope；新增/恢复成员及 external grant 可以 `window-only` 查看，但不可作为旧 Session 的结构化 resource 或 Agent 输入，界面显示 scope 差异。
- member/worktree-derived preview trust 不持久化为 grant；Folder 重定位后旧 root 自然失去自动信任。用户明确确认的 Workspace 外 exact-path grant 继续遵守窗口级 preview 契约，不与 Folder identity 混合。
- Session attachment 是 Workspace app-data 内的独立副本并通过 opaque handle 访问；member file resource link 是服从 Session snapshot 的实时引用，两者不得共用 raw absolute path 授权模型。
- MCP connection 无需重建即可在同一 Session 授权成员之间按 Folder ID 路由。
- apply/archive activation 的 MCP Folder allowlist 与 owner-only 文件系统 scope 一致，不能借 bundled MCP 访问来源 Workspace 的其他成员。
- HTTP MCP 的 bearer 与不可变 Workspace snapshot 按 activation 绑定；Agent 不能用自报 header/claim 切换 Session 或 Workspace，撤销和 host 重启后旧 bearer 失效。
- stdio MCP 明确处于 trusted Agent runtime 信任域，不把 env descriptor 当作与 HTTP 等价的身份凭据；不满足该假设的 Agent 不启用 multi-root stdio bundled MCP。
- MCP 无法通过伪造 absolute path 访问非成员目录；Folder 重定位后旧 Session 不会静默解析到新目录或后来占用旧 path 的目录。
- proposal、worktree、apply、archive 全程固定 owner Folder。
- ProposalRef 由 runtime 解析为唯一 `ResolvedProposalTarget`；caller 不能用绝对路径改选 worktree，run 创建后所有 stage/archive 固定同一 target。
- 不同成员的同名 `changeId` 不冲突。
- explore 只有在所有目标 Folder 扫描成功且 owner 全局唯一时才允许省略 `folderId`；partial failure 或重名都不猜 primary。
- specs、guidelines、proposal、Git 数据保持 repository-owned。
- session、task、knowledge、workflow、integration config 保持 Workspace-owned；task repository targets 是可显式呈现 stale 状态的软引用，不阻止成员移除，也不因过滤而静默改变 proposal owner 默认值。
- lineage 能从 repository proposal/commit 追溯到唯一创建它的 Workspace subject，并列出其他 Workspace 的显式后续引用；任何后写入者都不能覆盖 origin。
- Workspace 部分成员失败不会让所有 Workspace-owned 功能不可用。
- Repository browser 对每个 Folder 区分 ready-empty、missing 与 error；partial data 保留可用结果但不把不完整汇总标成完整。
- Proposal、Spec 与 Guideline 的 renderer identity 都包含 folderId，同名 repository-local ID/path 不会覆盖、误选或复用错误详情。
- Overview 只读取一次当前 Workspace work；repository governance 按 Folder 聚合，且不会借共享 Folder proposal 读取其他 Workspace 的 task/session/knowledge 内容。
- route meta 与 activity bar 共享 Workspace/capability navigation gate；secondary member missing 不禁用 Workspace-owned 页面。
- 删除、移除成员和修改 primary 不会让 active runtime 静默漂移。
- scope inventory 中不再存在未经解释的 `projectPath` 单 root 假设。

## 25. 已确认的产品决策

### 25.1 已确认

1. `WorkspaceMeta.kind` 必须持久化，最终取值为 `folder | collection`；禁止回退到无 kind 或按 Folder 数量推断。
2. “打开文件夹”通过 Folder registry 按 canonical path 复用稳定 Folder；未命中时分配与路径无关的新 `folderId`，并以同一个 ID 打开其唯一 Folder Workspace。
3. Folder Workspace 固定一个 Folder，禁止成员 mutation；需要增加 Folder 时创建新的 Collection Workspace。
4. “创建 Workspace”始终创建 Collection Workspace；即使只有一个 Folder，也不改变 kind。
5. 引用同一 Folder 的不同 Workspace，其 session、task、knowledge、workflow 和 integration config 完全隔离，不自动继承。
6. Folder 重定位保留原 `folderId` 并影响所有引用 Workspace 的后续解析；exact path 冲突或任一引用 Workspace 的重复/嵌套成员冲突都会拒绝整次重定位。
7. 重定位冲突通过结构化报告引导用户编辑冲突 Workspace 后重试；v1 不提供强制重定位，不自动移除其他 Workspace 的成员。
8. Folder 重定位只影响 Workspace 当前解析与新 Session；存在使用该 Folder 的 active Agent runtime 时先拒绝，关闭后重试；已有 Session 快照不改写，路径能力进入明确错误并要求新建 Session。
9. HTTP bundled MCP 使用 per-activation opaque capability；Main proxy 从 grant registry 注入可信 Workspace 快照，Agent 请求字段不构成授权主体。
10. stdio bundled MCP 采用 trusted Agent runtime 模型，env 是单 activation 启动配置而非密码学身份凭据。
11. Repository lineage index 以多值 `origin | reference` 关系保存；origin 唯一且不可覆盖，reference 幂等追加。
12. local preview 的 member/worktree trust 每次由当前 `ResolvedWorkspace.availableFolders` 实时计算，不写 remembered grant；user-confirmed external grant 仍是 window + Workspace + exact canonical path 授权。
13. Session attachment 是不受 Folder 变更影响的 Workspace-owned copy；renderer 只持有 opaque handle，不以 `file://` URI 作为读取权限。
14. member file resource link 持久化 `folderId + worktreePath + repositoryRelativePath`，并严格服从 Session snapshot，不随 Folder 重定位静默改写。
15. apply/archive 同时收窄 ACP 文件系统目录与 MCP descriptor Folder allowlist，只授权 proposal owner。
16. proposal tool contract 使用 `worktreePath/worktreeMode` 表示 Git target；apply/archive 由 ProposalRef 解析 target，不接受 caller absolute path。
17. explore 的 owner 省略需要在完整成功扫描后证明唯一；partial failure 或跨 Folder 重名时返回结构化错误，不使用 primary 猜测。
18. Repository browser aggregate 以 per-Folder `ready | missing | error` 结果表达完整性；合法空数据与读取失败不可混同。
19. Overview 明确拆分 Workspace work 与 repository governance；共享 Folder 只共享 repository 数据，不授权跨 Workspace 读取 subject/task/session 内容。
20. ProposalRef、SpecRef、GuidelineRef 是 renderer 列表、选择、详情和缓存的完整 identity；Folder filter 不改变 detail owner。
21. primary missing 阻止进入正常 Workspace，并由 launcher 提供修复/重定位；secondary missing 允许 degraded mode。
22. Workspace 删除采用可恢复 tombstone：默认 launcher 隐藏、管理视图可恢复；v1 不自动过期，只允许用户显式永久清理 Workspace-owned 数据及 cutover 确认 candidate key 唯一后持久化的 `legacyAppDataKey` 所证明归属的 retained legacy copy；编码碰撞组不持久化 provenance、不由单 Workspace 删除 legacy source，且清理不影响共享 Folder、repository-scoped 数据或其他无法安全归属的历史 orphan。

## 26. 当前代码影响面索引

以下是正式提案和实施时必须复核的主要入口，不代表完整文件清单：

- Meta/registry：`src/shared/types/project.ts`、`src/main/infra/storage/project-store.ts`
- Workspace storage：`src/main/infra/storage/project-paths.ts`
- Upgrade migrations：`src/main/migrations/**`、`test/main/migrations/**`、`test/main/bootstrap/index.spec.ts`
- Window：`src/shared/types/window.ts`、`src/main/bootstrap/project-window-manager.ts`
- Launcher/store：`src/renderer/src/stores/workspace/project.ts`、`src/renderer/src/components/welcome/**`
- Navigation gating：`src/renderer/src/config/activity-bar.ts`、`src/renderer/src/components/layout/ActivityBar.vue`、route meta/guard consumers
- ACP capabilities：`src/shared/types/acp-agent.ts`、`src/main/infra/storage/agent-capability-store.ts`
- Chat/probe：`src/main/services/session/chat/acp-session.ts`、`session-probe-service.ts`
- Session storage：`src/main/infra/storage/session-store.ts`
- MCP transport/context：`src/main/infra/mcp/bundled-mcp-servers.ts`、`src/mcp-servers/shared/request-context.ts`
- `fyllo-specs`：`src/mcp-servers/fyllo-specs/src/tools/**`、`runtime-workspace/**`
- `fyllo-cortex`：`src/mcp-servers/fyllo-cortex/src/tools/**`、`utils/knowledge.ts`、`utils/lineage-reader.ts`
- Proposal：`src/main/services/proposal/**`、`src/main/infra/proposal/openspec-reader.ts`、`src/renderer/src/stores/proposal/**`、`src/renderer/src/pages/proposal.vue`、`src/renderer/src/composables/useProposalDetailSlideover.ts`
- Insight：`src/main/services/insight/**`、`src/renderer/src/stores/insight/**`、`src/renderer/src/pages/{specs,guidelines,overview}.vue`、`src/renderer/src/components/overview/OverviewActiveChanges.vue`
- Automation：`src/main/services/automation/**`、相关 storage
- Local file preview：`src/main/services/workspace/document/local-file-preview-service.ts`、`src/main/ipc/workspace/document.ts`、`openspec/specs/local-file-link-preview/spec.md`
- Session attachments/resource links：`src/main/infra/storage/attachment-store.ts`、`src/main/ipc/session/chat.ts`、`src/shared/types/chat-prompt.ts`、`src/main/services/session/chat/acp-session.ts`
- System reminder：`src/main/services/session/chat/system-reminder/**`
- Shared contracts：`src/shared/types/{proposal,specs,guidelines,overview,lineage,knowledge,chat,task,workflow,integration}.ts`

正式实施前应重新运行全仓 `projectId/projectPath/projectDir/FYLLO_PROJECT_PATH` inventory；本设计只提供 scope 和目标边界，不能替代当时的代码事实。
