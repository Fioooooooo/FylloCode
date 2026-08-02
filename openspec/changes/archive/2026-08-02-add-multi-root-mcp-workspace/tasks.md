## 1. Workspace v2 契约与投影

- [x] 1.1 在 `src/shared/types/mcp-workspace.ts` 增加严格的 `McpWorkspaceDescriptorV2`/Folder schema、invariant 校验与序列化边界，并在 `test/shared/types/mcp-workspace.spec.ts` 覆盖 primary、重复 ID、canonical path和非法版本。
- [x] 1.2 在 `src/main/services/session/chat/mcp-workspace-descriptor.ts` 实现 Chat/probe snapshot投影和 apply/archive owner-only投影，复用 Workspace storage helpers，并为 stale前置、Folder顺序和单 owner结果增加 focused tests。

## 2. Capability registry 与 HTTP 信任边界

- [x] 2.1 新增 `src/main/infra/mcp/mcp-access-grant-registry.ts`，实现 hash-only issue/authorize/bind/revoke/expiry/revokeAll API与可注入 clock，并覆盖 token隔离、server allowlist、过期和幂等撤销测试。
- [x] 2.2 改造 `src/main/infra/mcp/bundled-mcp-host.ts` 与 `bundled-mcp-servers.ts`：ACP spec只获得 activation token，proxy剥离 caller Authorization/全部 `X-Fyllo-*`、注入内部 token和 Workspace context；扩展 host/server tests覆盖 spoofing、跨 server token与 backend重启。
- [x] 2.3 将 `src/mcp-servers/shared/request-context.ts` 和 `http-server.ts` 切换为严格 Workspace v2内部 context与 request-local ALS，覆盖内部鉴权、并发 descriptor隔离、缺失/损坏 context和请求资源释放。

## 3. ACP Session 与 grant 生命周期

- [x] 3.1 扩展 `src/main/infra/process/acp-process-pool.ts` 和 `acp-session-activation.ts`，在 process entry绑定 ACP session到 activation lease，并实现成功绑定、replacement、close、forget、进程失效与 shutdown撤销测试。
- [x] 3.2 重构 `AcpSession`/config-option recovery，使 mcpServers只在 new/resume/load/fresh lifecycle创建，direct prompt复用有效 lease、过期转 cold recovery，并覆盖 cancel/fallback/失败路径不泄漏 grant。
- [x] 3.3 扩展 `ProbeEntry` 与 `session-probe-service.ts`，让 probe creation绑定 activation、promotion转移同一 lease、probe失效/替换撤销，并更新 probe/chat promotion focused tests。
- [x] 3.4 更新 proposal apply/archive 的 `AcpSession` 调用点，显式传入 owner-only descriptor输入并验证 cwd/worktree、空 additionalDirectories与 MCP Folder allowlist一致。

## 4. stdio 与 shared Workspace resolver

- [x] 4.1 新增 `src/mcp-servers/shared/workspace-context.ts`/`workspace-resolver.ts`，实现 HTTP/stdio统一的 descriptor读取、Folder/primary解析和明确 owner-required错误，并为 allowlist与 frozen snapshot增加测试。
- [x] 4.2 实现 `validateWorktree(folderId, worktreePath)` 的 canonical main/registered-worktree校验，覆盖其他 repository、未注册路径、symlink/relative逃逸和路径前缀伪造。
- [x] 4.3 将 stdio spec切换为每 activation的 `FYLLO_WORKSPACE_JSON`，删除 legacy Project/data/event/session env解析与 `getProjectPath()`，并更新 bundled server child lifecycle、shared env/context及 spec生成测试。
- [x] 4.4 将 `fyllo-specs` 的 project-root、create/explore/apply/archive与 event writer迁移到 shared resolver；在多 Folder且 owner尚未由现有 tool contract唯一确定时明确拒绝，并更新工具测试与 README。
- [x] 4.5 将 `fyllo-cortex` 的 guidelines/knowledge/lineage root与 data getter迁移到 shared resolver，拒绝 descriptor外路径，并更新工具测试与 README。

## 5. MCP event identity 与规范同步

- [x] 5.1 扩展 `src/shared/types/mcp-event.ts`、proposal/plan event writers与 `mcp-event-consumer.ts`，写入并校验 `workspaceId/folderId`，覆盖 workspace不匹配、owner歧义和正常 lineage消费。
- [x] 5.2 全仓检索并删除运行时 `X-Fyllo-Project-*`、`FYLLO_PROJECT_*`、旧 event/session context与 `getProjectPath()` 引用，同步 `guidelines/MainProcess.md` 和 bundled MCP文档中的 Workspace v2边界。

## 6. 验证

- [x] 6.1 运行 `sh scripts/prepare-worktree-env.sh` 后执行受影响 Main/session/MCP/lineage的 focused Vitest测试并修复失败；不运行完整 `pnpm build`，不启动 `pnpm dev`。
- [x] 6.2 运行 `pnpm typecheck`、`pnpm lint` 与针对改动文件的 Prettier检查，确认 OpenSpec校验通过且 repository不再存在允许旧 MCP path context的运行时代码。
