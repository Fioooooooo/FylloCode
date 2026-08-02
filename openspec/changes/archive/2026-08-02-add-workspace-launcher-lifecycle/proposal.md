## Why

Workspace/Folder 稳定身份和 cutover 已经落地，但 launcher 仍只支持打开单个 Folder Workspace，Collection Workspace 的创建、编辑、缺失成员修复和完整删除生命周期尚无公开契约。下一阶段需要把这些管理能力落地，同时确保共享 Folder、Workspace-owned 数据和正在运行的 Session/Proposal 不会因成员变更、重定位或清理而被静默破坏。

## What Changes

- **BREAKING**：launcher 从仅展示最近 Folder Workspace，升级为统一的 Workspace 管理入口；新增 Collection Workspace 创建/编辑、完整成员摘要、missing 状态、已删除 Workspace 管理视图和修复入口。
- 新增 Collection Workspace 生命周期：创建时选择 1–16 个 Folder 和唯一 primary，编辑时允许改名、增删/排序成员和修改 primary；Folder Workspace 仍禁止成员 mutation，但允许改名和重定位唯一 Folder。
- 新增 Folder 全局重定位：保持稳定 `folderId`，在单一 Main mutation boundary 内校验 canonical path 占用、所有引用 Workspace 的重复/嵌套冲突和 active runtime；失败返回可定位 Workspace/Folder/Session/run 的结构化报告，成功不改写历史 Session snapshot。
- 新增成员移除影响检查：active probe/chat/apply/archive 阻止移除；非 active Session 只产生确认提示并保留 snapshot，后续恢复路径能力由 ACP multi-root proposal处理；task target 不阻止移除。
- 完整定义 Workspace soft delete、恢复和永久清理：soft delete 先关闭窗口并清理 runtime，只写 tombstone；恢复保留原 ID、成员和 Workspace 数据；永久清理采用 `purging`/`cleanup-failed` 状态机，删除 Workspace-owned 数据、window state 及可由 `legacyAppDataKey` 唯一证明归属的 legacy copy，但不删除 Folder registry、repository/worktree 或无法安全归属的 orphan。
- “打开文件夹”命中 tombstoned Folder Workspace 时不再静默恢复或创建重复记录，而是返回恢复提示；primary missing 阻止打开，secondary missing 允许 Workspace 以 degraded 状态进入管理界面。
- Collection Workspace 在 ACP multi-root session proposal 完成前可以创建、编辑和打开管理窗口，但 Chat/Agent 启动保持不可用；本变更不提前实现 `additionalDirectories` 或 Session snapshot 新行为。
- 同步 renderer 的 Workspace store、launcher 组件、管理 overlay/页面、危险操作确认、missing/冲突/失败状态，并更新相关架构指南和覆盖测试。

## Capabilities

### New Capabilities

- `workspace-lifecycle`: 定义 Collection Workspace 创建/编辑、成员影响检查、Folder 重定位、soft delete、恢复、永久清理和可恢复失败状态。

### Modified Capabilities

- `workspace-model`: 扩展 Folder registry 的原子 mutation 契约，加入全局重定位、引用 Workspace 冲突校验和稳定 identity 保留规则。
- `workspace-window`: 将 launcher 从 Folder Workspace 入口扩展为完整 Workspace 管理入口，定义 Collection/degraded Workspace 打开、tombstone 恢复提示和阶段性 Chat 门控。

## Impact

- Shared/public contracts：`src/shared/types/workspace.ts`、`src/shared/constants/error-codes.ts`、`src/shared/ipc/workspace/{workspace,window}.channels.ts` 与 schemas、preload API 和 renderer wrapper。
- Main：`src/main/domain/workspace/model.ts`、Folder registry、Workspace lifecycle/cleanup services、Workspace/window IPC、`WorkspaceWindowManager` runtime 清理协作和 Workspace/window-state/legacy Project storage 删除能力。
- Renderer：`src/renderer/src/stores/workspace/workspace.ts`、`components/welcome/**`、Workspace 创建/编辑/删除/修复 UI、Collection Workspace 的 Chat/navigation 门控和错误状态。
- Tests：shared schema、domain、storage、services、IPC/preload、renderer store/components，以及 deletion/relocation 并发与 legacy provenance fixtures。
- Guidelines：同步 `guidelines/MainProcess.md`、`guidelines/RendererProcess.md`、`guidelines/UiDesign.md` 和 `guidelines/Testing.md` 中的 Workspace lifecycle、launcher 与测试边界。
- 不新增外部依赖，不改变 migration runner/ledger 语义，不实现 ACP `additionalDirectories`、MCP Workspace v2、ProposalRef、Cortex 双重作用域或 legacy 批量 cleanup migration。
