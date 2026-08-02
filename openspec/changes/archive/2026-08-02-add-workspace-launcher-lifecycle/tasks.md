## 1. Shared contracts 与纯领域规则

- [x] 1.1 扩展 `src/shared/types/workspace.ts`：新增 `WorkspaceFolderInfo`、`WorkspaceLauncherItem`、完整成员版 `WorkspaceInfo`、Collection create/update input、member impact、`FolderRelocationConflictReport`、runtime/session reference、cleanup failure DTO；保持 `WorkspaceMeta`/`FolderMeta` 持久化 schema 和 1–16 成员上限不变，并在 `test/shared/types/workspace.spec.ts` 覆盖 active/deleted、single-member collection、missing projection 与 strict schema。
- [x] 1.2 在 `src/shared/constants/error-codes.ts` 注册 `WORKSPACE_DELETED`、`WORKSPACE_MEMBER_MUTATION_FORBIDDEN`、`WORKSPACE_MEMBER_ACTIVE_REFERENCE`、`WORKSPACE_MEMBER_REMOVAL_CONFIRMATION_REQUIRED`、`FOLDER_RELOCATION_CONFLICT`、`FOLDER_RELOCATION_ACTIVE_RUNTIME`、`FOLDER_RELOCATION_CONFIRMATION_REQUIRED`、`WORKSPACE_CLEANUP_FAILED` 等结构化错误，确保 `wrapHandler` 不把预期生命周期失败归一化为 `UNKNOWN_ERROR`。
- [x] 1.3 扩展 `src/main/domain/workspace/model.ts`：增加 Collection create/update 的纯校验与 Folder relocation path relation projector，复用 `validateWorkspaceMeta()`、`validateWorkspaceFolderPaths()` 和 `assertWorkspaceRestorable()`；在 `test/main/domain/workspace/model.spec.ts` 覆盖 Folder Workspace mutation 拒绝、primary/member/order、不重复/不嵌套和 relocation conflict relation。

## 2. Storage、查询投影与永久清理基础设施

- [x] 2.1 扩展 `src/main/infra/storage/workspace-store.ts`，提供 `deleteWorkspaceDataExceptMeta(workspaceId)` 与 `deleteWorkspaceMeta(workspaceId)` 等幂等 helper；只允许显式 workspaceId，ENOENT 视为完成，且不得触碰 `workspace-folders/**`。在 `test/main/infra/storage/workspace-folder-stores.spec.ts` 验证 meta-last 删除与其他 Workspace/Folder 隔离。
- [x] 2.2 扩展 `src/main/infra/storage/window-state-store.ts`，提供按 workspaceId 幂等删除 `window-state/workspaces/<workspaceId>.json` 的 helper，并在 `test/main/infra/storage/window-state-store.spec.ts` 覆盖 launcher/其他 Workspace state 不受影响。
- [x] 2.3 在 `src/main/migrations/legacy-project-path.ts` 与 `src/main/migrations/legacy-project-store.ts` 增加仅供已持久化 `legacyAppDataKey`/稳定 legacy ID 调用的幂等删除接口；禁止由当前 Folder path、workspaceId 目录猜测或扫描候选 source，并在 `test/main/migrations/legacy-project-path.spec.ts` 和新增聚焦 store 测试中覆盖 provenance、ENOENT、path-update orphan 与编码碰撞不误删。
- [x] 2.4 重构 `src/main/services/workspace/workspace/workspace-service.ts` 的 `toWorkspaceInfo()`、`listWorkspaceInfos()` 和 deleted list 查询：加载全部成员、计算 available/missing/primary 和 `WorkspaceLauncherItem`，active list 排除 tombstone、deleted list保留 cleanup state；在 `test/main/services/workspace/workspace/workspace-service.spec.ts` 覆盖 Folder/Collection、secondary missing、损坏 member 和排序。

## 3. Folder registry 原子重定位

- [x] 3.1 扩展 `src/main/services/workspace/folder/folder-registry-service.ts` 的 dependencies 与 `relocateFolder(folderId, requestedPath, options)`，让它与 `resolveOrCreateFolder()` 共享 `mutationTail`，在写入前加载全部 Folder/Workspace、canonicalize、检查 exact-path 占用和所有引用 Workspace 的 duplicate/ancestor/descendant 冲突，成功仅保存同 ID `FolderMeta`。
- [x] 3.2 让 `relocateFolder()` 返回/抛出规范化 `FOLDER_RELOCATION_CONFLICT`、`FOLDER_RELOCATION_ACTIVE_RUNTIME`、`FOLDER_RELOCATION_CONFIRMATION_REQUIRED` details；结构化报告只列实际冲突 Workspace，并支持历史 Session 确认后在同一锁内重新扫描。
- [x] 3.3 扩展 `test/main/services/workspace/folder/folder-registry-service.spec.ts`：覆盖 exact conflict、仅一个引用 Workspace 冲突但全局拒绝、解除冲突后重试、active runtime、historical confirmation、missing member 修复、并发 resolve/relocate 与失败零写入。

## 4. 跨 domain 引用检查

- [x] 4.1 在 `src/main/services/session/_public/index.ts` 暴露窄的 Workspace/Folder reference inspector；扩展 `src/main/services/session/chat/session-registry.ts` 和 `src/main/infra/storage/session-store.ts`，区分 active probe/chat 与非 active `SessionWorkspaceSnapshot` 引用，并在对应 `test/main/services/session/**`、`test/main/infra/storage/session-store.spec.ts` 覆盖相同 folderId 的 active/historical 结果。
- [x] 4.2 在 `src/main/services/proposal/_public/index.ts` 为 create/apply/archive runtime 与 `proposalStatusService` watcher 暴露只读引用摘要；在 `src/main/services/automation/_public/index.ts` 和现有 action registry、`src/main/services/workspace/document/local-file-preview-service.ts` 的公开边界增加 pending action/preview dispatch 查询，且明确不扫描 task `targetFolderIds`。
- [x] 4.3 新增 `src/main/services/workspace/workspace/workspace-reference-inspector.ts`，只通过 session/proposal/automation domain 根级 `_public` 和 workspace document public service 聚合 `{ activeReferences, historicalSessions }`；添加聚焦测试验证 active 优先阻塞、历史只提示、task target 不阻塞和跨 Workspace 引用可定位。

## 5. Workspace 创建、编辑与删除状态机

- [x] 5.1 新增 `src/main/services/workspace/workspace/workspace-lifecycle-service.ts`，实现 `createCollectionWorkspace()`：用 `nanoid()` 分配 workspaceId、通过 `FolderRegistryService.resolveOrCreateFolder()` 解析 1–16 个成员、验证 primary/重复/嵌套后一次保存 `kind: "collection"`；失败不得留下 Workspace meta，单成员仍保持 collection。
- [x] 5.2 在 lifecycle service 实现 `updateWorkspaceDefinition()`：所有 kind 可改名；Folder Workspace 拒绝成员/primary mutation；Collection Workspace 支持增删/排序/primary，并在移除前调用 reference inspector，使用 `confirmHistoricalSessions` 重试且写入前重新检查。
- [x] 5.3 修改 `resolveOrCreateFolderWorkspace()`：命中 tombstone 时返回 `WORKSPACE_DELETED` 和原 workspaceId，不再调用 `assertWorkspaceRestorable()` 静默恢复；重复/并发打开 active Folder Workspace 仍更新 `lastOpenedAt` 并复用稳定数据。
- [x] 5.4 在 lifecycle service 实现 `softDeleteWorkspace()` 与 `restoreWorkspace()` 的 meta 状态转换；soft delete 只在 runtime 已由调用方安全停止后写 `restorable`，restore 只接受 `restorable` 并保留 ID/成员/数据，`purging`/`cleanup-failed` 拒绝恢复。
- [x] 5.5 新增 `src/main/services/workspace/workspace/workspace-cleanup-service.ts`，实现 `permanentlyDeleteWorkspace()`：串行写 `purging`，依次调用 workspace data/window state/可证明 legacy source 删除 helper，meta 最后删除；失败重写 `cleanup-failed` 和失败对象，重试对 ENOENT 幂等，且永不删除 Folder/repository/orphan。
- [x] 5.6 扩展 `test/main/services/workspace/workspace/workspace-service.spec.ts`，并为 lifecycle/cleanup service 新增镜像测试：覆盖 Collection 创建编辑、Folder mutation、active/historical member removal、soft delete runtime 前置、primary missing restore、provenance/no-provenance purge、legacy 删除失败、重启重试和其他 Workspace/Folder 隔离。

## 6. IPC、窗口、Preload 与 Renderer API

- [x] 6.1 扩展 `src/shared/ipc/workspace/workspace.channels.ts` 与 `.schemas.ts`，为 active/deleted list、create/update、softDelete、restore、permanentDelete/retry、relocateFolder 定义 domain-first channel 和 strict zod input；补齐 `test/shared/ipc/workspace/workspace.schemas.spec.ts` 的 17 成员、Folder mutation shape、确认 flag 与任意 path/legacy 字段拒绝测试。
- [x] 6.2 重构 `src/main/ipc/workspace/workspace.ts`：所有 handler 只负责 schema/sender 校验、service 调用和窗口编排；soft delete/permanent cleanup 使用 `WorkspaceWindowManager.closeWorkspaceWindow(id, { cleanupRuntime: false })` 后显式 await `cleanupWorkspaceRuntime(id)`，清理失败不得写 tombstone；relocation conflict/impact 原样返回结构化 details。
- [x] 6.3 修改 `src/main/ipc/workspace/window.ts`：Collection/secondary missing 可打开，primary missing 保持阻断；openFolder 命中 tombstone 返回 `WORKSPACE_DELETED`，不绑定窗口；覆盖 launcher parent dialog、focused-existing、bound-current 和 deleted/missing 结果。
- [x] 6.4 扩展 `src/preload/api/workspace/workspace.ts`、`src/preload/index.ts`、`src/preload/index.d.ts` 与 `src/renderer/src/api/workspace/workspace.ts`，完整暴露新生命周期 API，保持 `window.api.workspace.workspace.*` 与 `IpcResponse<T>`；同步更新 `test/preload/api/workspace/workspace.spec.ts` 和 renderer wrapper 测试。
- [x] 6.5 扩展 `test/main/ipc/workspace/workspace.spec.ts`、`test/main/ipc/workspace/window.spec.ts` 与 `test/main/bootstrap/workspace-window-manager.spec.ts`，断言 window/runtime cleanup 顺序、失败不 tombstone、Collection/degraded 打开、tombstone 不静默恢复和同 Workspace 单窗口。

## 7. Renderer store、导航与 Launcher UI

- [x] 7.1 重构 `src/renderer/src/stores/workspace/workspace.ts`：分别维护 active `WorkspaceLauncherItem[]`、deleted items、current `WorkspaceInfo`、loading/error 和 mutation generation；实现 create/edit/relocate/soft-delete/restore/permanent-delete actions，迟到响应不得覆盖已切换 Workspace，删除/确认在 scope 变化时拒绝。
- [x] 7.2 在 `src/renderer/src/config/activity-bar.ts`、`src/renderer/src/config/auto-routes.ts` 或集中 navigation gate helper 中增加阶段性 Collection Chat capability：activity bar 与 route guard 使用同一结果；Workspace 管理可用，但 Collection Chat/Agent 被禁用并显示原因，Main 不获得 primary-only fallback 请求。
- [x] 7.3 将 `src/renderer/src/components/welcome/ProjectList.vue` 重命名为 Workspace 语义组件，并更新 `WelcomeView.vue`：Folder item 显示唯一完整路径，Collection item 显示 primary path + Folder 数量，详情可查看全部成员/missing 状态；提供“打开文件夹”“创建 Workspace”“已删除的 Workspace”入口和空/loading/error 状态。
- [x] 7.4 在 `src/renderer/src/components/welcome/` 新增 create/edit modal 与成员编辑组件：使用目录选择 IPC 添加 Folder、支持 1–16 成员排序和 primary、Folder Workspace 隐藏成员 mutation并提供“基于此 Folder 创建 Workspace”；展示 duplicate/nested/relocation conflict 的 Workspace/Folder/path relation，并可打开或聚焦冲突 Workspace。
- [x] 7.5 新增 deleted Workspace manager 与危险操作确认：`restorable` 提供恢复，`purging/cleanup-failed` 只提供继续/重试永久清理；永久删除文案说明 current Workspace 和可唯一归属 legacy copy 的范围，primary missing 恢复后进入 repair，不伪装可打开。
- [x] 7.6 更新 `src/renderer/src/pages/index.vue`、`src/renderer/src/components/layout/AppHeader.vue` 及 Workspace 管理入口，展示 primary missing/secondary degraded、active reference、historical Session confirmation 和 cleanup failure；遵守 focus-visible、键盘、窄窗口、浅/深色以及 destructive action 的 `UiDesign.md` 规则。
- [x] 7.7 扩展 `test/renderer/src/stores/workspace/workspace.spec.ts`、`test/renderer/src/components/welcome-view.spec.ts`，并新增 launcher/editor/deleted manager/navigation gate 组件测试，覆盖 Folder/Collection 一成员语义、missing、创建编辑、两阶段确认、tombstone、清理重试、迟到响应和 activity/route 一致性。

## 8. 指南、追踪与质量门禁

- [x] 8.1 更新 `guidelines/MainProcess.md`，记录 Workspace lifecycle service、Folder registry 全局 mutation、meta-last cleanup/provenance 删除边界；更新 `guidelines/RendererProcess.md` 的 launcher/store/navigation capability gate；更新 `guidelines/UiDesign.md` 的 Workspace destructive/repair overlay 模式；更新 `guidelines/Testing.md` 的 lifecycle/relocation/cleanup 分层测试入口。
- [x] 8.2 更新 `references/designs/multi-root-workspace/README.md` §23 中 Phase 2 的 launcher、Collection lifecycle、member removal、relocation、soft-delete/restore/permanent cleanup 条目为 `add-workspace-launcher-lifecycle` proposal 及 `workspace-lifecycle`/`workspace-model`/`workspace-window` specs 的追踪关系，不继续维护第二份验收措辞。
- [x] 8.3 按 `scripts/prepare-worktree-env.sh` 准备 main worktree 后运行聚焦 main/renderer 测试，再运行 `pnpm typecheck`、`pnpm lint`、`pnpm format`、`pnpm test`、`pnpm test:coverage` 和 `pnpm build`；所有命令通过且 `git diff --check` 无错误后才完成 Apply。
