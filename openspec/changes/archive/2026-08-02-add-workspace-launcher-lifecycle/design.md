## Context

`introduce-workspace-model` 已经建立 `WorkspaceMeta`、`FolderMeta`、稳定 ID、Folder registry、Workspace window 和 Project cutover。当前实现仍是过渡形态：`WorkspaceInfo` 只投影 primary Folder；`WorkspaceChannels` 只有 list/get/update/remove；`resolveOrCreateFolderWorkspace()` 命中 tombstone 时会静默恢复；renderer launcher 只有“打开文件夹”和最近列表；`removeWorkspace()` 只写 tombstone，没有恢复、永久清理、Collection 成员管理或 Folder 重定位。

本变更跨越 shared schema、Main domain/service/infra、IPC/preload、renderer store/UI 和多层测试。它必须遵守以下现有边界：Workspace-owned 数据按 `workspaceId` 存储；Folder identity 全局共享；窗口和 runtime 归 Main 所有；Folder/Workspace mutation 必须串行；Project 数据只能通过明确的 legacy helper 读取或删除；Phase 3 之前不能让 Collection Workspace 的 Agent 误以为只有 primary Folder。

## Goals / Non-Goals

**Goals:**

- 让 launcher 成为 Folder/Collection Workspace 的统一创建、打开、编辑、删除、恢复和修复入口。
- 在 Main 中原子维护 Workspace 成员不变量、canonical Folder identity、全局重定位和引用保护。
- 让 soft delete、恢复与永久清理具有可重试、不会误删共享 Folder/repository 数据的明确状态机。
- 对 primary/secondary missing、tombstone、重定位冲突、active runtime 和清理失败提供结构化错误与可执行 UI。
- 保持 Folder Workspace、旧数据和现有单根 Workspace-owned 能力回归。

**Non-Goals:**

- 不为 ACP session 传递 `additionalDirectories`，不改变 Session snapshot 激活/恢复语义。
- 不实现 MCP Workspace v2、ProposalRef、跨 Folder proposal/Cortex/overview 聚合。
- 不新增自动 tombstone GC、Folder 删除、跨 Workspace 数据合并或 Folder/Collection kind 转换。
- 不修改已发布 migration、migration ledger/baseline，也不执行全局 legacy cleanup。

## Decisions

### 1. 区分持久化 meta、详情投影和 launcher 投影

保留 `WorkspaceMeta`/`FolderMeta` 的持久化 schema；在 `src/shared/types/workspace.ts` 增加：

- `WorkspaceFolderInfo`：`folderId/folderName/folderPath/pathMissing/isPrimary`；
- `WorkspaceInfo`：完整 `folders`、`availableFolders`、`missingFolders`、primary 和阶段性 capability；
- `WorkspaceLauncherItem`：名称、kind、primary path、folder count/paths、missing count、last opened 和 cleanup state；
- create/update/relocation/cleanup impact 与 conflict DTO。

list endpoint 返回 launcher projection，get/create/update 返回详情投影。renderer 不再从 `primaryFolder.path` 猜成员集合或删除状态。

备选方案是继续让 `WorkspaceInfo extends WorkspaceMeta` 并只追加字段；否决原因是 active、deleted 与 partial/missing 的展示需求不同，单一宽类型会让组件继续依赖不适用于 Collection/tombstone 的 primary-only 字段。

### 2. 生命周期写操作集中在 Main service，IPC 只做 sender/schema/window 编排

在 `src/main/services/workspace/workspace/` 中保留查询职责，并新增 `workspace-lifecycle-service.ts` 与 `workspace-cleanup-service.ts`：

- lifecycle service 负责 Collection create/update、member impact、soft-delete meta、restore 和状态校验；
- cleanup service 负责 `purging → success/remove meta` 或 `cleanup-failed` 的幂等清理；
- `src/main/ipc/workspace/workspace.ts` 只校验 schema、要求 launcher/workspace sender、调用 service，并在 soft delete/permanent cleanup 前通过 `WorkspaceWindowManager` 关闭窗口和清理 runtime。

所有 Workspace 写操作复用按 `workspaceId` 的 mutation queue；Collection 创建 ID 使用 `nanoid()`，Folder Workspace 继续使用 `folderId`。创建/编辑先解析全部 Folder，再一次性校验并保存 Workspace meta，不允许逐成员部分写入 Workspace。

备选方案是把所有流程留在 IPC handler；否决原因是引用检查、确认重试和清理状态机会变成不可测试的跨层业务逻辑。

### 3. 成员移除与重定位采用“重新检查后确认”，不使用易过期确认 token

`updateCollectionWorkspace()` 与 `relocateFolder()` 都接受 `confirmHistoricalSessions`。Main 在持锁状态下每次重新收集引用：

- active probe/chat/create/apply/archive、watcher、pending action 或 preview dispatch 直接返回阻塞错误；
- 非 active Session 不阻塞，但第一次返回 `*_CONFIRMATION_REQUIRED` 和受影响 Session 摘要；
- renderer 确认后带 `confirmHistoricalSessions: true` 重试，Main 再次完整检查，结果变化时以新结果为准；
- task `targetFolderIds` 不进入阻塞扫描。

Session/proposal/action/preview 的引用查询通过各 service domain 根级 `_public` 窄接口提供，Workspace service 不深路径导入其他 domain 实现。该阶段只保留历史 snapshot 并展示影响；`SESSION_FOLDER_REMOVED`/`SESSION_FOLDER_RELOCATED` 的后续 activation 拒绝由 Phase 3 完成。

备选方案是持久化一次性确认 token；否决原因是它引入额外状态和过期语义，仍不能替代写入前的最终引用检查。

### 4. Folder registry 使用同一个全局 mutation queue 完成重定位

扩展 `FolderRegistryService`，让 `resolveOrCreateFolder()` 与 `relocateFolder()` 共享现有 `mutationTail`。重定位在写入前完成：

1. canonicalize 请求路径并加载完整 Folder/Workspace registry；
2. 拒绝被其他 Folder 占用的 exact canonical path；
3. 对所有引用目标 Folder 的 Workspace，用替换后的路径执行重复/ancestor/descendant 校验；
4. 收集所有引用 Workspace 的 active/historical runtime；
5. 仅在无冲突、无 active runtime且确认历史影响后保存同 ID `FolderMeta`。

`FOLDER_RELOCATION_CONFLICT` 返回 `occupiedByFolder` 与 `workspaceConflicts[]`；`FOLDER_RELOCATION_ACTIVE_RUNTIME` 返回 Workspace/Session/run 引用。失败不写 Folder，也不修改 Workspace meta。成功只改 Folder path，不移动 Workspace data、不改历史 Session snapshot。

### 5. 删除使用 tombstone 状态机，meta 最后删除

soft delete 顺序固定为：关闭 Workspace window → 停止并验证 runtime 清理 → 在 Workspace mutation lock 内写 `isDeleted: true`、`deletedAt`、`cleanupState: "restorable"`。清理 runtime 失败时不写 tombstone。

恢复只接受 `restorable`，原子清除 deletion fields；不修改 Folder/path。primary missing 的 Workspace 恢复后仍留在 launcher，并进入 repair 状态。

永久清理只接受 tombstone：

1. 持锁写 `cleanupState: "purging"`；
2. 删除 Workspace directory 中除 `meta.json` 外的数据和对应 Workspace window state；
3. 仅当 meta 存在 `legacyAppDataKey` 时，通过 `legacy-project-path.ts`/`legacy-project-store.ts` 删除该 key 的 active legacy source 与同稳定 ID legacy meta；ENOENT 视为幂等成功；
4. 最后删除 Workspace meta/directory；
5. 任一步失败都尽力重写 `cleanupState: "cleanup-failed"`，返回失败对象；重启后只允许重试清理，不允许恢复。

清理永不删除 `FolderMeta`、`workspace-folders/<folderId>`、repository/worktree、其他 Workspace 或没有 provenance 的 legacy orphan。

备选方案是直接 `rm workspaceDataDir` 后记录结果；否决原因是 meta 与数据同目录，先删 meta 会失去失败恢复和 provenance 证据。

### 6. 打开文件夹不再隐式恢复 tombstone

`resolveOrCreateFolderWorkspace()` 命中 deleted Workspace 时返回 `WORKSPACE_DELETED` 和足以打开“已删除的 Workspace”视图的 identity；它不得调用 `assertWorkspaceRestorable()` 后静默激活。普通 list/open 排除 tombstone，deleted list 单独返回所有 cleanup states。

Collection Workspace 与 secondary missing Workspace可以打开管理窗口；primary missing 返回 `WORKSPACE_PRIMARY_FOLDER_MISSING` 并提供 `folderId/workspaceId` 修复入口。Phase 3 前，Collection Workspace 的 Chat/Agent capability 为 disabled，route 与 activity bar 使用同一 gate 结果，避免 UI 可进入但 Main 只按 primary 启动 Agent。

### 7. Launcher UI 使用传统 renderer 分层，不新建 feature

本能力只有 launcher/Workspace 管理入口，durable 状态仍由 `useWorkspaceStore` 拥有，不满足独立复杂 feature 的准入条件。继续使用：

- `src/renderer/src/api/workspace/**` wrapper；
- `src/renderer/src/stores/workspace/workspace.ts` 统一管理 active/deleted lists、详情、mutation 和请求世代；
- `components/welcome/**` 拆分 launcher list、create/edit modal、deleted manager、relocation/conflict/confirmation UI；
- `pages/index.vue` 只处理页面级 launcher/workspace error。

所有危险操作使用明确名称和二次确认；键盘焦点、窄窗口、浅/深色主题和 loading/empty/error 状态遵守 `UiDesign.md`。现有 `ProjectList.vue` 重命名为 Workspace 语义文件，不保留 Project 命名。

## Risks / Trade-offs

- [永久清理跨多个目录，无法获得文件系统事务] → 先持久化 `purging`、meta 最后删除、失败写 `cleanup-failed`，每个删除步骤保持幂等并覆盖重启重试测试。
- [确认与实际写入之间引用状态变化] → 每次重试在同一 mutation boundary 内重新扫描；active 引用永远优先拒绝。
- [Folder 重定位影响多个 Workspace，扫描成本随数据增长] → v1 最多 16 成员且使用显式用户操作；优先保证全局一致性，不引入不可靠缓存。
- [Collection Workspace 可打开但 Phase 3 前不能 Chat，体验不完整] → launcher 和 Workspace 管理明确展示阶段性不可用原因；禁止任何 primary-only Agent fallback。
- [删除 cleanup 与窗口 closed 事件重复触发 runtime cleanup] → `WorkspaceWindowManager.closeWorkspaceWindow(..., { cleanupRuntime: false })` 后显式 await 一次 cleanup，并让 cleanup 操作幂等。
- [已有实现会静默恢复 tombstone，行为切换可能暴露旧测试假设] → 更新 workspace service/IPC/renderer 回归，明确断言 `WORKSPACE_DELETED` 与恢复入口。

## Migration Plan

1. 先扩展 shared DTO/error/schema 与纯 domain 校验，保持旧 list/open 调用可编译。
2. 实现查询 projection、Collection mutation、引用 inspector、Folder relocation 和 cleanup infra/service。
3. 接入 IPC/preload/renderer API，再切换 store 与 launcher UI；在 UI 切换完成前不暴露半套入口。
4. 更新导航 gate，使 Collection Workspace 的 Chat 在 Phase 3 前一致禁用。
5. 执行 main/renderer 聚焦测试、完整测试、typecheck、lint、format 和 build。

本变更不需要数据 migration：foundation 已持久化最终 `WorkspaceMeta`/`FolderMeta` schema，新增内容是操作与派生投影。回滚代码时已创建的 Collection meta 仍符合现有 schema，但旧 UI 无法管理；因此发布回滚必须回滚到变更前版本前先避免创建 Collection，或将本变更作为不可拆分发布单元。

## Open Questions

无。Collection health 展示不在本提案实现：launcher 只展示 Folder/missing 摘要，不派生单一 health score；该产品决策留给后续 aggregate Workspace Folder proposal。
