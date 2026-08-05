## Why

`create-plan` 的公开契约将 Plan 定义为 session-scoped，且只接受 `goal` 与 `slug`，但当前实现会在写入前调用 repository-scoped `resolveSingleFolder()`；因此 multi-root Workspace 无法创建 Plan。Plan 文件本已存放在 Workspace/Session 数据目录，强制 Folder owner 既不可由调用方提供，也没有有效的持久化或 lineage 用途。

## What Changes

- 让 `create-plan` 只依赖 Workspace descriptor 中的 `workspaceDataDir`、`sessionId`、`workspaceId` 与可选 event directory，不再解析唯一 Folder owner。
- 将 Plan MCP event 定义为 Workspace/Session-scoped event，移除 `folderId`；Proposal event 继续携带并校验 repository owner。
- 让 Main lineage event consumer 按 `workspaceId`、`sessionId` 与 `planSlug` 关联 Plan，不再对 Plan event 执行 Folder membership 校验。
- 清理 Plan lineage 内无效的可选 `folderId` 传递，同时保持既有 Plan 文件路径、frontmatter、章节、审批流程和 Proposal owner 语义不变。
- 增加 single-root、multi-root、跨 Workspace/Session 隔离、非法或重复 slug、事件消费与写入失败回归测试，并同步 bundled MCP 文档与变更日志。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `mcp-workspace-authorization`: 区分 repository-owned Proposal event 与 Workspace/Session-owned Plan event；multi-root `create-plan` 不再要求 Folder owner。

## Impact

- MCP tool 与事件协议：`src/mcp-servers/fyllo-specs/src/tools/create-plan.ts`、`src/shared/types/mcp-event.ts`。
- Main lineage：`src/main/services/insight/lineage/mcp-event-consumer.ts`、`src/main/services/insight/lineage/lineage-service.ts`、`src/main/domain/insight/lineage/subject.ts`、`src/shared/types/lineage.ts`。
- 规范与文档：`openspec/specs/mcp-workspace-authorization/spec.md`、`src/mcp-servers/fyllo-specs/README.md`、`src/mcp-servers/fyllo-specs/CHANGELOG.md`。
- 测试：`test/mcp-servers/fyllo-specs/workspace-scope.spec.ts`、`test/main/services/insight/lineage/mcp-event-consumer.spec.ts`、相关 Plan lineage focused tests。
- 不新增依赖，不迁移 Plan 文件，不改变 `create-plan` 输入 schema、`state.planPath` 形状或 `plan.create` Action contract。
