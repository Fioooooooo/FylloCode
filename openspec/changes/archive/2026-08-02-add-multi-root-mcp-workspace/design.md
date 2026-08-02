## Context

当前 bundled MCP 有两条 transport：支持 HTTP 的 ACP Agent 连接 Main 托管的稳定 proxy，再由 proxy 转发到应用级共享 backend；不支持 HTTP 的 Agent 获得 stdio spec。两条路径都把单个 `projectPath`、Workspace data/event dir 和 Session ID 作为调用方可见的 headers/env。HTTP 还把同一个应用级 token 直接发给所有 ACP Session，因此 token 只能证明“来自本应用”，不能证明请求属于哪个 Workspace snapshot。

Phase 3 已建立 `SessionWorkspaceSnapshot`、stale 校验和 multi-root ACP 目录参数。本阶段必须让 MCP 使用同一固定授权集合，同时保持现有应用级 HTTP backend、稳定 proxy、单请求 MCP server 实例和 stdio fallback。实现跨越 Main session service、ACP process 生命周期、MCP host/shared runtime、两个 bundled server 与 lineage event，是带安全边界的一次性协议切换。

约束：

- Main 是 Workspace、Session snapshot、grant 和 app-data 路径的唯一可信拥有者；Agent、LLM 输出、tool input 与 Agent 发出的 HTTP headers 均不可信。
- `src/mcp-servers/**` 不依赖 Electron 或 `@main/*`，只消费 shared descriptor/context/resolver。
- Chat/probe 使用已验证 Session snapshot；apply/archive 继续只拥有当前 run 的单一 owner Folder，ProposalRef/多 owner 路由留给下一阶段。
- 不保留 Project request-context 兼容层；HTTP、stdio、`fyllo-specs`、`fyllo-cortex` 与事件协议同批切换。

## Goals / Non-Goals

**Goals:**

- 用一个版本化、不可变的 `McpWorkspaceDescriptorV2` 表达每次 activation 的 Workspace 与 Folder allowlist。
- 让 HTTP proxy 用 per-activation capability 绑定 Workspace、Session 与 server scope，并使 backend 只相信 proxy 注入的内部 context。
- 让 stdio fallback 使用同一 descriptor 和 resolver 语义，同时明确其信任边界依赖 Agent runtime 的进程隔离。
- 让 Chat/probe、resume/load/fresh fallback、probe promotion、取消与进程失效具有可测试的 grant 签发、复用、转移和撤销生命周期。
- 让 MCP tools 与 events 使用稳定 `workspaceId/folderId`，不能用 caller absolute path 或 repository path 反推 owner。

**Non-Goals:**

- 不引入 `ProposalRef`，不修改 create/explore/apply/archive 的 owner 参数与 proposal target 解析；这些属于 `make-openspec-proposals-repository-owned`。
- 不在本阶段完成 Cortex guidelines/knowledge/lineage 的全部跨 Folder 产品语义，也不实现 renderer 的 repository aggregate pages。
- 不防御已攻陷的 ACP executable 读取同用户进程内其他 credential；该威胁需要每 Session Agent 进程或 OS sandbox。
- 不新增持久化 grant store、renderer token API、远程 MCP endpoint 或外部依赖。

## Decisions

### 1. Shared 类型固定 Workspace v2，而 descriptor 由 Main 投影

在 `src/shared/types/mcp-workspace.ts` 定义严格 schema 与类型：

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

`src/main/services/session/chat/mcp-workspace-descriptor.ts` 提供两种投影：Chat/probe 从已通过 `assertSessionWorkspaceSnapshotCurrent()` 的 snapshot 生成完整 descriptor；apply/archive 从当前 run owner 生成只含一个 Folder 的 descriptor。投影校验 folders 非空、ID 唯一、primary 恰好出现一次、paths 为 canonical absolute path，并由 Main 填入 `workspaceDataDir(workspaceId)` 与 `mcpEventsDir(workspaceId)`。

descriptor 不持久化为新的 Session 字段；Chat 的权威持久化源仍是 `SessionWorkspaceSnapshot`。这样 Workspace 编辑不会热修改已存在 activation，也避免出现两份可漂移的授权快照。

备选方案是把 descriptor 直接持久化进 Session meta；拒绝该方案，因为 data/event dir 是 Main 运行时投影，且 snapshot 已经提供持久化授权事实。

### 2. Main grant registry 持有明文之外的全部授权事实

新增 `src/main/infra/mcp/mcp-access-grant-registry.ts`。`issueMcpAccessGrant()` 生成 256-bit base64url token 与独立 `activationId`，只把 SHA-256 `tokenHash`、descriptor、允许的 bundled server names、`issuedAt/expiresAt` 和可选绑定的 ACP session ID 保存在内存。明文 token 只返回给构造 ACP HTTP spec 的调用点，不记录日志、不进入错误详情或 renderer。

grant 采用固定短期 TTL 常量并通过注入 clock 测试。token 需要支持同一 activation 的多个 MCP 请求，因此不是单次 nonce。过期 grant 在 lookup 时惰性删除；下一次 ACP prompt 在直连复用前检查已绑定 lease，失效时把该 ACP Session 视为 cold，走 resume/load/new recovery 并签发新 grant。不会为一个不执行 ACP lifecycle 的普通直连 prompt提前签发无效 token。

registry API 至少包括 issue、authorize(token, serverName)、bindToAcpSession、isActive、revokeActivation、revokeAcpSession、revokeAgent 与 revokeAll。相同 token 只能返回同一 immutable descriptor/server allowlist。

备选方案是签名 JSON/JWT claim；拒绝该方案，因为 proxy 仍需主动撤销、绑定 Agent runtime 状态和隐藏 paths，内存 registry 更简单且不会把授权详情交给 Agent。

### 3. ACP process entry 拥有 activation lease 生命周期

`AgentProcess` 增加 ACP session ID 到 MCP activation ID 的映射。`createBundledMcpActivation()` 取代每轮直接 `resolveBundledMcpServers()`：只有 new/resume/load/fresh fallback 或新 probe 确实要提交 `mcpServers` 时才创建 grant/spec；成功后由 `markAcpSessionActive()` 同时绑定 lease，失败或被取消时立即撤销未绑定 activation。

生命周期规则：

- probe 创建 grant，并在 `ProbeEntry` 记录 activation ID；probe 提升为 Chat 时把同一个 ACP Session 与 lease 一并转移，不重签、不泄漏第二个 grant；probe 丢弃/替换时撤销。
- persisted ACP Session 的 direct prompt 仅在 process entry 仍有 active、未过期 lease 时复用；否则先 `forgetActiveAcpSession()` 并进入 cold recovery。
- resume/load 每次创建新的 activation/grant；成功后撤销该 ACP Session 的旧 lease并绑定新 lease，失败 fallback 时撤销失败尝试的 grant，再为 fresh activation 签发新的 grant。
- close/cancel/session replacement、`forgetActiveAcpSession()`、Agent process invalidation、host stop 和应用退出全部撤销对应 grant；重复撤销幂等。

将 lease 放在 process entry 而非 `AcpSession` turn 对象，是因为逻辑 ACP Session 会跨多轮复用，而 turn 对象每轮结束即清理 handler。

### 4. HTTP 使用外部 capability 与内部 backend token 两级认证

`bundled-mcp-host.ts` 继续在应用启动时生成一个内部 token，只注入 HTTP backend 的 `FYLLO_MCP_AUTH_TOKEN`，不再通过 `getMcpServerEndpoint()` 暴露给 ACP spec。外部 HTTP spec 的 `Authorization` 是 activation token，URL 仍是稳定 `/mcp/<server-name>`。

proxy 的处理顺序固定为：

1. 解析并严格匹配 bundled server name；
2. 从 bearer token 调用 grant registry 校验 token hash、有效期、activation 状态与 server allowlist；
3. 从转发 headers 中移除 caller 的 `Authorization` 及所有大小写形式的 `X-Fyllo-*`；
4. 写入内部 bearer token，并把 registry 中的 descriptor 编码为唯一内部 `X-Fyllo-Workspace-Context` header；
5. 转发到当前 ready backend。

未知/过期/已撤销 token 或 server scope 不匹配返回 401/403，且不泄露 grant 是否属于其他 Workspace。backend `startHttpServer()` 继续先校验内部 token，再严格解码 Workspace v2 context；缺失或 schema 无效返回 400，tool 不执行。每个请求仍创建独立 `McpServer`/stateless transport，并在 `AsyncLocalStorage<McpWorkspaceDescriptorV2>` 中运行。

备选方案是保留 caller path headers并额外附加 descriptor；拒绝该方案，因为会留下两个相互冲突的上下文来源和 header spoofing 面。

### 5. stdio 每次 activation 只接收一个冻结 JSON descriptor

不支持 HTTP 或 backend 不可用时，`createBundledMcpActivation()` 为每个 lifecycle 请求生成 stdio specs，只设置 `FYLLO_WORKSPACE_JSON`、`ELECTRON_RUN_AS_NODE`、telemetry 与 server 自身静态 env。`src/mcp-servers/shared/request-context.ts` 启动时严格解析 JSON 并冻结 descriptor；不再读取 `FYLLO_PROJECT_PATH`、`FYLLO_PROJECT_DATA_DIR`、`FYLLO_MCP_EVENT_DIR` 或 `FYLLO_SESSION_ID`。

stdio child 的实际创建与销毁由 ACP runtime 按 activation MCP spec 管理。FylloCode 的契约要求 runtime 不跨 activation 复用 child；无法保证该行为的 Agent 在 multi-root activation 下不得使用 stdio bundled MCP。这里不把 env 当作密码学 credential，因为 Agent 本身已经获得相同 cwd/additionalDirectories。

### 6. Shared resolver 是 bundled tools 唯一路径入口

新增 `src/mcp-servers/shared/workspace-context.ts` 与 `workspace-resolver.ts`：

- `resolveWorkspace()` 返回当前冻结 descriptor；
- `resolvePrimaryFolder()` 与 `resolveFolder(folderId)` 只查 descriptor allowlist，未知 ID 返回结构化错误；
- `validateWorktree(folderId, worktreePath)` canonicalize target，接受该 Folder 的 snapshot root或 `git worktree list --porcelain` 当前登记且归属同一 repository 的 worktree，拒绝字符串前缀伪造、symlink 逃逸和任意 absolute path。

`src/mcp-servers/shared/env.ts` 删除 `getProjectPath()` 等 Project getter，改为仅从 resolver 暴露 Workspace-owned data/event/session values。`fyllo-specs` 和 `fyllo-cortex` 的 root utilities 与工具调用点统一迁移；tool 输入若未显式选择 `folderId`，只在 descriptor 恰好一个 Folder时可省略，multi-root 下不得静默回退 primary。Phase 5 会再为 proposal tools引入显式 owner 参数，本阶段保持现有 tool schema时，多根中需要 repository root 的旧工具返回明确 owner-required 错误。

备选方案是在每个 tool 内各自解析 descriptor；拒绝该方案，因为不同 bundled server 很容易产生不一致的 allowlist、canonicalization 和 worktree 校验。

### 7. MCP event 明确携带 Workspace 与 Folder identity

`McpProposalEvent` 与 `McpPlanEvent` 增加 `workspaceId`、`folderId`。事件 writer 从当前 descriptor 获取 identity，event dir 仍由 descriptor 的 `mcpEventDir` 决定；consumer 校验 event 的 `workspaceId` 等于正在扫描的 Workspace，并把 `folderId` 传入日志/lineage owner context，而不从 `repositoryPath` 反推。

本阶段 proposal tool 仍是单 owner 旧 schema，因此 event `folderId` 使用该 activation descriptor 的唯一 Folder；若 descriptor 含多个 Folder而调用方未选择 owner，writer/tool 必须拒绝，不生成歧义 event。Phase 5 再把显式 `ProposalRef` 和 owner routing贯穿 tool/state。

### 8. 一次性删除 v1 context 并使用 focused validation

删除 `X-Fyllo-Project-Path`、`X-Fyllo-Project-Data-Dir`、`X-Fyllo-Mcp-Event-Dir`、`X-Fyllo-Session-Id`、对应 `FYLLO_PROJECT_*`/event/session env fallback 和 `getProjectPath()`。同步更新两个 bundled server README、shared/runtime tests 与 `guidelines/MainProcess.md`，避免文档继续授权旧协议。

验证只运行受影响的 Vitest project/file、`pnpm typecheck`、`pnpm lint` 与格式检查；按用户约束不运行完整 `pnpm build`，不启动 `pnpm dev`。

## Risks / Trade-offs

- [固定 TTL 在长时间空闲 Session 后失效] → direct prompt 前检查 lease，过期即走 cold recovery并重新签发，不把过期错误留到 tool call 时才暴露。
- [probe promotion 或 recovery fallback 泄漏 grant] → 未绑定 activation 使用 try/finally 撤销；ProbeEntry/process entry 显式记录 lease，转移和替换覆盖单测。
- [HTTP header 大小受 descriptor 影响] → Workspace 上限为 16 Folder，context 使用 canonical base64url JSON并设定明确字节上限；超限在签发前失败，不发送部分 allowlist。
- [stdio runtime 复用 child 会越权] → 将单 activation child 作为 capability 前置条件；能力不满足时 multi-root 禁用 stdio bundled MCP，并在文档中明确非对抗式信任边界。
- [一次性删除旧 env 造成大量测试和工具调用点失败] → 先落 shared schema/resolver，再迁移两个 server及 fixtures，最后删除兼容 getter；禁止长期双读。
- [Phase 4 尚无 ProposalRef，multi-root proposal owner 仍歧义] → repository tool 在 descriptor 多成员且没有唯一 owner 时明确拒绝；owner selection与完整工具 API 在紧随其后的 Phase 5 解决。

## Migration Plan

1. 新增 shared Workspace v2 schema、descriptor projector、grant registry和 resolver 单测，不连接现有调用点。
2. 改造 HTTP host/proxy/backend 为外部 grant + 内部 token，并迁移 HTTP focused tests。
3. 改造 ACP lifecycle/probe/process entry，使 grant 只随 lifecycle 请求签发、绑定与撤销；覆盖 direct reuse、cold recovery、promotion、cancel和 invalidation。
4. 切换 stdio env、shared request context 与两个 bundled server到 Workspace v2 resolver，同步删除全部 v1 path context。
5. 扩展 MCP events/consumer identity，更新 bundled server README、MainProcess guideline与测试。
6. 运行 focused tests、typecheck、lint和格式检查。若切换失败，回滚整个 commit恢复 v1；不需要数据回滚，因为 grant/descriptor均不持久化，event schema 尚未归档前不会混合发布。

## Open Questions

无。TTL 数值与 descriptor/context 字节上限作为实现常量落地并由测试固定；若产品后续需要可配置策略，另行提案。
