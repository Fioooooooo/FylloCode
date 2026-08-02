## 1. Workspace 与 Folder 领域基础

- [x] 1.1 在 `src/shared/types/workspace.ts` 定义 `WorkspaceKind`、版本化 `WorkspaceMeta`、`FolderMeta`、`ResolvedWorkspace`、`ResolvedRepositoryTarget` 与单 Folder Session snapshot 类型，更新 `src/shared/types/index.ts` 并把 `src/shared/types/project.ts` 限定为 migration-only legacy input；补充 shared schema/type tests，验收 folder/collection、1–16 成员、primary 与 tombstone shape。
- [x] 1.2 新建 `src/main/domain/workspace/model.ts` 与结构化错误，集中实现 `validateWorkspaceMeta()`、Folder Workspace 同 ID 单成员、Collection membership、duplicate/nesting path 和 deleted/active invariants；在 `test/main/domain/workspace/model.spec.ts` 覆盖损坏 shape、第 17 个成员、单成员 Collection 不改 kind 与 repair error。
- [x] 1.3 以现有 `src/main/infra/storage/project-store.ts` 的原子 JSON 写入模式为复用点，新建 `workspace-store.ts`、`folder-store.ts` 和 `src/main/services/workspace/folder/folder-registry-service.ts`，让 `resolveOrCreateFolder()` 在统一串行 mutation boundary 内维护 canonical path 唯一索引并为新 Folder 分配 path-independent ID；增加 storage、canonical collision、missing path 与并发同路径测试。
- [x] 1.4 新建 `src/main/services/workspace/resolver/workspace-resolver.ts`，实现 `resolveWorkspace()` 和 `resolveRepositoryTarget()`，校验 Workspace members、primary、available/missing paths、Git repository 与 registered worktree；在 `test/main/services/workspace/resolver/workspace-resolver.spec.ts` 覆盖单 Folder resolution、primary missing、非成员 owner 和非注册 worktree拒绝。

## 2. 稳定 ID 存储命名空间

- [x] 2.1 用 `src/main/infra/storage/workspace-paths.ts` 替代 `project-paths.ts`，提供 `workspaceDataDir(workspaceId)`、sessions/tasks/knowledge/lineage 等 Workspace-owned helper 和 `folderDataDir(folderId)`；迁移 `test/main/infra/storage/project-paths.spec.ts` 为 Workspace/Folder 路径测试，证明路径不参与 ID 推导。
- [x] 2.2 将 `session-store.ts`、`attachment-store.ts`、`task-store.ts`、`lineage-store.ts`、chat/apply/archive ACP session stores、apply run store、workflow 与 integration stores 的入口参数和持久化顶层 scope 一次性改为 `workspaceId`，统一复用 `workspace-paths.ts`；更新对应 main storage tests，验证相同 record ID 在不同 Workspace 中隔离。
- [x] 2.3 将 repository reverse data 和需要 repository path 的 consumers 改为显式 `folderId`/`ResolvedRepositoryTarget`，禁止 Workspace-owned store 接受 `projectPath` 或用 `encodeProjectPath()` 选择目录；增加 inventory assertion，确保正常运行期 storage 没有 `projectDir(projectPath)` 调用。

## 3. Required Project cutover migration

- [x] 3.1 新建 `src/main/migrations/scripts/20260802_001_project-to-workspace.ts`，在 `src/main/migrations/scripts/index.ts` 末尾注册不可变 ID，并从 `src/main/migrations/index.ts` 导出 `WORKSPACE_CUTOVER_MIGRATION_ID`；更新 `test/main/migrations/scripts-index.spec.ts` 验证文件名、唯一 ID 和 registry 顺序。
- [x] 3.2 在 migration 中先读取全部合法 legacy Project meta 并完成全局 preflight：ID/target shape、`encodeProjectPath(meta.path)` candidate 分组、canonical path collision 与 source/target compatibility；fixture 覆盖 `legacy id !== candidate`、两个 ID 同 canonical path、candidate 编码碰撞、一致 partial target 和冲突 target，验收任何全局冲突均在写入前失败。
- [x] 3.3 实现同 ID `FolderMeta`/Folder Workspace 写入和 legacy source 到 `<appData>/workspaces/<workspaceId>` 的保留式复制，转换 session/messages/attachments、plans、tasks、workflows、integration、knowledge、lineage、MCP events/run records 的 `projectId → workspaceId`，为 legacy Session 写唯一 Folder snapshot，且 task 不猜 `targetFolderIds`；测试数据完整、无关字段/文件保留、唯一 candidate 才写 `legacyAppDataKey`、source/orphan 不移动不删除。
- [x] 3.4 扩展 `src/main/migrations/runner.ts` 的 fresh-install markers 以识别 `workspaces`/`workspace-folders`，并新增只读 `getRequiredMigrationStatus()` 与 `validateWorkspaceCutoverState()`；保持 `runAllMigrations(): Promise<void>`、failed 不重试和失败后继续语义，在 `test/main/migrations/runner.spec.ts` 覆盖 fresh baseline、success/failed ledger、baseline 覆盖和 success-target-incomplete。

## 4. Bootstrap gate 与失败体验

- [x] 4.1 新建 `src/main/bootstrap/workspace-upgrade-failure.ts`，使用 Electron `dialog.showMessageBox()` 显示“Workspace 数据升级失败”、数据未删除说明、migration ID 与 `app.getPath("logs")`，实现“打开日志目录”经 `shell.openPath()` 后退出及“退出 FylloCode”直接退出；单元测试按钮、关闭对话框、openPath 失败和最终 `app.quit()`。
- [x] 4.2 在 `src/main/bootstrap/index.ts::bootstrapReady()` 中于 `runAllMigrations()` 后立即执行 required cutover gate，失败时只进入原生失败处理并 return；更新 `test/main/bootstrap/index.spec.ts` 证明 gate 失败前不会启动 bundled MCP、IPC、workflow、Launcher、broadcast 或 Agent warmup，gate 通过时保留原有启动顺序。

## 5. Workspace window 与打开文件夹

- [x] 5.1 将 `src/shared/types/window.ts`、`src/shared/ipc/workspace/window.*` 和 `src/main/bootstrap/project-window-manager.ts` 一次性切换为 `WindowContext` 的 launcher/workspace union 与 `WorkspaceWindowManager`，registry 使用 `workspaceId`；迁移对应 bootstrap、shared IPC 和 preload tests，验证同 Workspace 唯一窗口、共享 Folder 的不同 Workspace 可并存与 main-owned sender context。
- [x] 5.2 将 `src/main/infra/storage/window-state-store.ts` 改为 launcher key 与 `window-state/workspaces/<workspaceId>.json`，保留 legacy main state 只读 fallback；更新 window state tests，证明不同 Workspace bounds 隔离且不再写 project namespace。
- [x] 5.3 将 `src/main/services/workspace/project/project-service.ts` 与 `src/shared/ipc/workspace/project.*` 重命名为 Workspace/Folder 打开 contract，目录选择后调用 `resolveOrCreateFolder()` 并打开同 ID Folder Workspace；更新 `src/main/ipc/workspace/window.ts` 及测试，覆盖重复/并发 canonical path、missing primary 和不创建 Collection UI。
- [x] 5.4 将 probe、proposal watcher、chat/apply/archive stream registry、global Agent event fanout 与 cancellation key 从 Project scope 切换为 `workspaceId` 并接入 `WorkspaceWindowManager`；更新相关 service/IPC tests，验证跨 Workspace 相同 `sessionId`/`runId`/`changeId` 不互相覆盖或取消。

## 6. Main、IPC 与功能作用域切换

- [x] 6.1 对 `src/shared/ipc/**`、`src/shared/fyllo-action/**` 和 `src/shared/types/{chat,task,lineage,knowledge,workflow,integration,proposal}.ts` 执行公开 contract cutover，将 normal-runtime `projectId` 改为 `workspaceId` 并更新 schema tests；不得保留兼容 decoder、双字段或 Renderer 自报 path。
- [x] 6.2 将 `src/main/ipc/**` 与 `src/main/services/{session,automation,proposal,insight}/**` 的 Workspace-owned入口切换为 sender 校验后的 `workspaceId`，repository read 暂经 `resolveWorkspace()` 的唯一 Folder path；重点回归 Fyllo Action registration/transition、task lineage、knowledge browser/delete 与 guidelines browser delta specs。
- [x] 6.3 更新 `src/main/services/workspace/document/local-file-preview-service.ts` 与 `src/main/ipc/workspace/document.ts`：authorization/grant key 使用 `workspaceId`，trusted roots 只取当前 Folder Workspace 的唯一 canonical root 及 registered worktrees，confirm 不接受 caller scope；更新 service/IPC tests覆盖跨 Workspace grant 隔离、symlink、worktree fallback 和 sender 校验。
- [x] 6.4 将 `src/preload/api/**` 和 preload 暴露类型全部切换为 Workspace contract，删除 Project scope 参数；更新 `test/preload/**`，验证 window context、action/task/knowledge/guidelines/preview wrapper 只透传 `workspaceId` 和受控 repository target。

## 7. Renderer 一次性切换

- [x] 7.1 将 `src/renderer/src/stores/workspace/project.ts` 与 `bootstrap/tasks/projects.ts` 重命名为 Workspace store/bootstrap，使用 `workspaceId` 加载 Workspace 和 session list，并保持 launcher context 为空；迁移 store tests并验证 context 与列表加载在同一 bootstrap 流程有序完成。
- [x] 7.2 更新 welcome、header、activity/navigation、chat、proposal、automation 与 insight 页面/组件的 `useProjectStore`、`currentProject`、`projectId/projectPath` consumers 为 Workspace 命名；Folder Workspace UI 保持现有单根行为且不出现 Collection 创建/成员编辑入口，更新相关 renderer component/page tests。
- [x] 7.3 更新 Renderer API wrappers、Fyllo Action registration/execution、task linked conversations、knowledge/guidelines stores 和 local preview integration，使异步请求与 persisted state 绑定当前 `workspaceId`；覆盖跨 Workspace迟到响应、action sender scope、同名 task ref 和 knowledge delete 隔离。

## 8. 回归、文档与收口

- [x] 8.1 更新 `guidelines/Architecture.md`、`DataMigrations.md`、`MainProcess.md`、`RendererProcess.md` 与 `Testing.md`，记录 Workspace/Folder identity、required cutover gate、WorkspaceWindowManager、stable-ID storage 与新测试路径；同步其他描述当前 Project runtime contract 的项目文档，但保留明确标注的 legacy migration 术语。
- [x] 8.2 运行 `rg 'projectId|ProjectMeta|ProjectWindowManager|useProjectStore|projectDir\(|FYLLO_PROJECT_PATH' src test` 并逐项解释或清除命中；验收正常启动源码和公开 schema 只允许 Workspace/Folder identity，`projectId` 仅存在于 20260802 cutover 的 legacy input/fixture 或明确的第三方字段。
- [x] 8.3 先执行 `sh scripts/prepare-worktree-env.sh`，再运行迁移、bootstrap、storage/window、action/task/knowledge/guidelines/preview 的 focused Vitest suites；最后运行 `pnpm typecheck`、`pnpm lint`、`pnpm test` 和 `pnpm build`，修复所有回归并记录因本提案产生的验证结果。
- [x] 8.4 使用临时 app-data 手工验证 fresh install、单 Project 成功升级、candidate collision/required failure 对话框、打开日志后退出、重复打开同 Folder 复用 Workspace 以及两个 Workspace 窗口/session 数据隔离；确认 legacy `projects/**` 保留且失败状态不进入普通 runtime。
