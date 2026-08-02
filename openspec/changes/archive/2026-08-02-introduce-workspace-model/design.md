## Context

当前 `ProjectMeta` 同时保存 ID 与唯一 path，`adoptExistingFolder()` 用 `encodeProjectPath(path)` 生成 ID，`projectDir(projectPath)` 又用相同的有损编码选择 app-data 目录。窗口、IPC、renderer store、session/task/action/knowledge 等 runtime 继续传播 `projectId` 或 `projectPath`。这让“窗口工作上下文”“repository owner”“磁盘路径”和“app-data identity”无法拆开。

现有 migration runner 在 `src/main/migrations/runner.ts` 中执行：fresh install 用最后 migration ID 写 `baselineId`；旧安装执行全部未记账 migration；无论 `success` 还是 `failed` 都永久跳过同一 ID；单项失败会写账本并继续，且不会向 `bootstrapReady()` 抛错。`enforce-single-instance-startup` 已确保只有持锁主实例加载 bootstrap 与 app-data writer，因此可以在此基础上注册 required Workspace cutover，但不能改变 runner 的账本和失败语义。

## Goals / Non-Goals

**Goals:**

- 直接建立最终 `Workspace` / `Folder` identity、schema、storage namespace 和 resolver，不在新运行期保留 Project union、双读双写或 path-derived identity。
- 将所有 legacy Project 转换为同 ID、单 Folder、`kind: "folder"` 的 Workspace，并保留现有 Workspace-owned 数据和现有单根用户行为。
- 让 required cutover 的成功、baseline 覆盖与失败状态可由 bootstrap 明确判断；失败时阻止普通 runtime，并向用户提供可理解的退出和日志入口。
- 把 main-owned window context、公开作用域字段和 runtime key 切换到 `workspaceId`，为后续 Collection Workspace 和 multi-root 能力提供稳定基线。

**Non-Goals:**

- 不开放 Collection Workspace 创建、成员编辑、恢复/永久删除管理 UI；这些属于 `add-workspace-launcher-lifecycle`。
- 不向 ACP 传递 `additionalDirectories`，不增加 Session Workspace snapshot；这些属于 `add-acp-multi-root-sessions`。
- 不升级 MCP Workspace v2，不改变 proposal owner、Cortex lineage 或 repository aggregate reader。
- 不删除 legacy `projects` source，不修复无法安全归属的 orphan，不改变 migration runner 的 baseline、继续执行或失败不重试语义。

## Decisions

### 1. Workspace 与 Folder 使用独立持久化实体

在 `src/shared/types/workspace.ts` 定义最终类型，在 `src/main/domain/workspace/model.ts` 放置纯解析与不变量校验：

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

Workspace meta 存在 `<appData>/workspaces/<workspaceId>/meta.json`，Folder meta 存在 `<appData>/workspace-folders/<folderId>/meta.json`。Folder Workspace 必须满足 `workspace.id === folderIds[0] === primaryFolderId`；Collection Workspace 必须有 1–16 个成员且 primary 属于成员。`kind` 不从成员数量推断。

备选的“Workspace 继续保存一个 path”会让 repository owner 与 Workspace identity 再次耦合；“Folder/Workspace 两套顶层 API”会复制 window/session/storage contract，因此都不采用。

### 2. Folder registry 原子拥有 canonical path 反向解析

新增 `src/main/infra/storage/folder-store.ts` 和 `src/main/services/workspace/folder/folder-registry-service.ts`。有效 path 先通过 `fs.realpath()` canonicalize，再在统一串行 mutation boundary 内执行 `canonical path → folderId` 查找、创建或重定位。新 Folder 使用与路径无关的 `nanoid()` ID；legacy migration 例外地保留 Project ID。

全局 exact canonical path 只能对应一个 Folder；同一 Workspace 的成员 path 还必须拒绝重复、ancestor 和 descendant。missing legacy path 保留最后已知绝对路径但不进入反向索引。`encodeProjectPath()` 只保留给 migration source locator，不能计算、恢复或验证新运行期 `folderId`。

### 3. 统一 resolver 分离 Workspace 与 repository target

新增 `src/main/services/workspace/resolver/workspace-resolver.ts`：

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

interface ResolvedRepositoryTarget {
  workspaceId: string;
  folderId: string;
  worktreePath: string;
}
```

本阶段迁移得到的 Workspace 都是单 Folder，因此 `cwd` 为唯一 Folder path、`additionalDirectories` 为空。resolver 仍实现完整 1–16 成员验证，避免 Phase 2 再改变底层 contract。Repository target 必须校验 folder membership、path 可用、Git repository 和 registered worktree，不接受任意 caller path。

### 4. Workspace-owned storage 只按稳定 ID 定位

将 `src/main/infra/storage/project-paths.ts` 替换为 `workspace-paths.ts`：`workspaceDataDir(workspaceId)`、`sessionsDir(workspaceId)`、`knowledgeDir(workspaceId)`、`tasksDir(workspaceId)`、`lineageSubjectsDir(workspaceId)` 等均位于 `<appData>/workspaces/<workspaceId>`。Repository reverse data 使用 `folderDataDir(folderId)`，repository 内 specs/guidelines/OpenSpec/Git 继续从 resolved `folderPath/worktreePath` 读取。

所有 Workspace-owned store 的函数参数和持久化字段同步改为 `workspaceId`。本阶段只改变 identity/name 和目标 namespace；更深的 multi-root owner schema 由后续 proposal 负责。

### 5. Required cutover 使用一个注册 migration ID

新增 `src/main/migrations/scripts/20260802_001_project-to-workspace.ts`，并在 `scripts/index.ts` 末尾显式注册；同时从 `src/main/migrations/index.ts` 导出 `WORKSPACE_CUTOVER_MIGRATION_ID`。

脚本先读取全部合法 legacy Project meta，计算：

```ts
candidateLegacyAppDataKey = encodeProjectPath(legacyProject.path);
```

然后完成全局预检：schema、目标冲突、candidate key 分组、有效 path canonical 冲突。只有预检通过的记录才写入。每个 legacy Project 生成同 ID Folder 和 `kind: "folder"` Workspace；candidate key 在全部 Project 中唯一时才保存为 `legacyAppDataKey`。编码碰撞组可以复制既有共享 source，但不保存 provenance；不同 legacy ID 指向同一 canonical path 时 migration 必须失败且不得自动合并。

Workspace-owned app-data 从 `<appData>/projects/<candidateLegacyAppDataKey>` 复制到 `<appData>/workspaces/<workspaceId>`；目标 meta、session、task、knowledge 与 lineage JSON 同步把 `projectId` 改为 `workspaceId`，legacy Session 生成唯一 Folder snapshot。无关字段和文件原样保留，source 不移动、不删除。写入失败继续抛给 runner。

### 6. Gate 读取现有 ledger，不改变 runner 语义

`runAllMigrations()` 仍返回 `Promise<void>`。新增只读 `getRequiredMigrationStatus(id)` / `validateWorkspaceCutoverState()`：

- `executed` 中命中 ID：只有 `success` 通过；`failed` 永远失败，不能被 baseline 覆盖。
- `executed` 中未命中：只有 `baselineId >= requiredId` 才通过。
- legacy install 的 `success` 还必须验证 Workspace/Folder 目标形态完整；fresh baseline 不要求预先存在记录。

`isNewInstall` 的 marker 增加 `workspaces` 与 `workspace-folders`，避免已有新数据但账本丢失时被误 baseline。runner 的失败后继续、不重试和逐项落盘保持不变。

### 7. Cutover 失败使用原生阻塞对话框并退出

新增 `src/main/bootstrap/workspace-upgrade-failure.ts`。`bootstrapReady()` 在 migration 后立即执行 gate；失败时不得启动 bundled MCP host、IPC、workflow、窗口或 Agent warmup。主进程使用 `dialog.showMessageBox()` 展示“Workspace 数据升级失败”，说明现有数据未删除、失败 migration ID 与日志位置，并提供：

- “打开日志目录”：调用 `shell.openPath(getLogsPath())` 后退出；
- “退出 FylloCode”：直接退出。

两条路径最终都调用 `app.quit()`；不提供“继续启动”或“重试同一 migration”。备选的 renderer repair 页需要先启动本 proposal 明确禁止的 IPC/window runtime；degraded launcher 会让功能读取半迁移数据，因此不采用。

### 8. Window contract 一次性切换为 Workspace

将 `ProjectWindowManager` 改为 `WorkspaceWindowManager`，将 `WindowContext` 改为 `{ role: "workspace"; workspaceId } | { role: "launcher"; workspaceId: null }`。window registry、event broadcaster、stream cancellation、window state key、preload/renderer wrapper 和 `useWorkspaceStore` 全部使用 `workspaceId`，不保留 `role: "project"` 或 `projectId` decoder。

现有 launcher 的打开文件夹流程通过 Folder registry 解析 legacy/new Folder Workspace；本阶段不创建 Collection Workspace。当前 action、task、knowledge、guidelines 与 preview contract 只把顶层作用域字段切换为 `workspaceId`，仍按唯一 Folder 保持原行为；后续 proposals 再增加成员 selector、snapshot 和 aggregate semantics。

## Risks / Trade-offs

- [Cutover 写入多个目录时进程中断] → 写前完成全局预检，单文件使用 temp + atomic rename；重启时 failed/success ledger 与目标一致性 gate 阻止普通 runtime，修复使用新 migration ID。
- [有损 `encodeProjectPath()` 让多个 Project 共享 source] → 服从旧 helper 的既有读取结果，但碰撞组不保存 `legacyAppDataKey`，不声明单 Workspace 对 source 的删除权。
- [Project 名称全量替换影响面大] → 以全仓 `projectId/projectPath/projectDir/ProjectWindowManager/useProjectStore` inventory 为任务入口，按 shared → storage/migration → main → preload/renderer → tests 顺序切换，不保留双 contract。
- [Foundation 暂时只有 Folder Workspace] → schema/resolver 直接支持 Collection invariants，但创建和成员 mutation API 不在本 proposal 暴露。
- [原生失败对话框信息不足以自行修复] → 提供日志入口并明确数据未删除；自动 repair 必须使用新的 migration ID，由后续 maintenance proposal 定义。

## Migration Plan

1. 先落地 shared types、domain validators、Workspace/Folder stores 和 resolver，不接入正常 bootstrap。
2. 增加完整 migration fixtures 与 required cutover script，验证 fresh baseline、legacy success、碰撞、partial target 和写入失败。
3. 切换 Workspace-owned stores、window/main/preload/renderer contract 与现有单根 feature scope。
4. 在 bootstrap 接入 migration gate 和原生失败对话框；只有 gate 通过才进入原有 MCP/IPC/window/warmup 顺序。
5. 运行全量 typecheck/lint/main/renderer tests，并用临时 app-data 手工验证 fresh install、成功升级和失败对话框。

回滚不得删除新目录或修改已发布 migration。若已发布后发现问题，保留 legacy source并新增更晚 migration ID 修正；旧版本仍可读取保留的 legacy Project 数据。

## Open Questions

无。required cutover 失败采用原生对话框、日志入口和退出，不提供 degraded runtime 或同 ID 自动重试。
