## Why

FylloCode 当前把 Project ID、单一 repository path、窗口身份和 app-data storage key 隐式绑定，无法在不破坏数据归属的前提下承载 Multi-root Workspace。单实例启动前置已经落地，现在需要先完成 Workspace/Folder 基础模型和旧数据 cutover，让后续 Launcher、ACP、MCP 与 repository-owned proposal 能建立在稳定身份上。

## What Changes

- **BREAKING**：顶层运行时领域对象从 `Project` 切换为 `Workspace`，窗口、IPC、preload、renderer store、事件与当前上下文只使用 `workspaceId`；`projectId` 只允许出现在 upgrade migration 的旧数据读取逻辑。
- 引入持久化 `WorkspaceKind = "folder" | "collection"`、版本化 `WorkspaceMeta`、全局 `FolderMeta` registry、tombstone 字段，以及 1–16 成员、唯一 primary、Folder Workspace 同 ID 单成员等领域不变量。
- 引入 `ResolvedWorkspace` 与 `ResolvedRepositoryTarget`，显式区分 `workspaceId`、`folderId`、`folderPath`、`workspaceDataDir` 与 `worktreePath`；路径不再派生 Workspace/Folder identity。
- 将 Workspace-owned app-data helper 从 `projectDir(projectPath)` 切换为稳定的 `workspaceDataDir(workspaceId)`，Folder registry 与 repository reverse data 使用独立 `folderDataDir(folderId)`。
- 注册 Project → Folder Workspace required cutover migration：保留 legacy Project ID，生成同 ID Workspace/Folder，复制并转换当前 meta 指向的 app-data，保留 legacy source，并遵守现有 migration ledger、baseline 和失败不重试语义。
- 在 bootstrap 中校验 required cutover 结果；失败或目标数据不完整时，不启动 MCP、IPC、Launcher、workflow 或 Agent，而是展示原生阻塞错误对话框，允许打开日志目录并退出 FylloCode。
- 将 `ProjectWindowManager`、`WindowContext`、window state 与 project window lifecycle 一次性切换为 Workspace 命名和身份；本阶段只迁移现有 Project 为 Folder Workspace，不开放 Collection Workspace 创建/编辑 UI。
- 保持现有 Folder Workspace 的 session、task、knowledge、guidelines、proposal、preview 与 action 行为可回归；相关公开 contract 的作用域字段同步从 `projectId` 改为 `workspaceId`，Multi-root 聚合与成员编辑行为留给后续 proposals。

## Capabilities

### New Capabilities

- `workspace-model`: 定义 Workspace/Folder 持久化模型、稳定身份、领域不变量、解析结果和 repository target 校验。
- `workspace-storage-cutover`: 定义 legacy Project 数据转换、Workspace/Folder app-data namespace、required migration gate、失败对话框和 legacy 保留边界。
- `workspace-window`: 定义 launcher/workspace window 生命周期、main-owned `workspaceId` context、事件隔离、window state 与 Folder Workspace 打开行为。

### Modified Capabilities

- `project-window`: 移除 Project window contract，由 `workspace-window` 完整替代。
- `fyllo-action-registration`: action 注册作用域和 sender 校验从 `projectId` 切换为 `workspaceId`。
- `fyllo-action-transition`: action transition 与批量 transition 的作用域字段从 `projectId` 切换为 `workspaceId`。
- `task-linked-conversations`: task lineage 查询使用 `workspaceId` 定位 Workspace-owned subject 数据。
- `guidelines-browser`: 当前浏览上下文改为 Workspace；本阶段 Folder Workspace 仍从其唯一 Folder repository 读取 guidelines。
- `knowledge-browser`: durable knowledge 改为 Workspace-owned storage，并通过 `workspaceId` 隔离读取、详情和删除。
- `local-file-link-preview`: sender scope、pending authorization 与 remembered grant 改用 `workspaceId`；本阶段 Folder Workspace 仍只有一个 trusted Folder root，多成员实时 trust 留给 ACP multi-root proposal。

## Impact

- Shared/public contracts：`src/shared/types/{project,window,chat,task,lineage,knowledge}.ts`、`src/shared/ipc/**`、preload API 与 renderer wrappers/store。
- Main：`src/main/bootstrap/project-window-manager.ts`、`src/main/bootstrap/index.ts`、`src/main/services/workspace/**`、相关 IPC/services/runtime registry，以及使用 Project identity 的 storage consumers。
- Storage/migration：`src/main/infra/storage/{project-store,project-paths,window-state-store}.ts`、所有 Workspace-owned store、`src/main/migrations/**` 和对应 fixtures/tests。
- Renderer：现有 Project store/bootstrap/navigation consumer 改为 Workspace naming；不增加 Collection Workspace 管理界面。
- Specs/guidelines：新增 Workspace foundation specs，退役 `project-window` requirements，并更新 Architecture、DataMigrations、MainProcess、RendererProcess 与 Testing 中的已采纳命名和约束。
- 不包含：Collection Workspace lifecycle、ACP `additionalDirectories`、MCP Workspace v2、ProposalRef/repository owner、Cortex 双重作用域、repository aggregate UI 或 legacy cleanup。
