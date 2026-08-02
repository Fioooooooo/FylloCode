## Context

Workspace foundation 已提供 `ResolvedWorkspace.cwd`、`additionalDirectories`、可用/缺失 Folder 列表以及 `SessionWorkspaceSnapshot` shared type，但 Chat 仍通过 `WorkspaceInfo.chatAvailable = kind === "folder"` 整体阻止 Collection Workspace。`session-probe-service.ts`、`acp-session-activation.ts` 与 `AcpSession` 当前只传 `cwd`，`SessionMeta.workspaceSnapshot` 虽已预留却未建立完整 lifecycle；本地预览仍接收单一 `folderPath`，附件则把 renderer 可提交的 `file://` URI 当作读取位置。

ACP SDK 已在 probe/new/load/resume 请求中支持 `additionalDirectories`，capability cache 也能保留 `sessionCapabilities.additionalDirectories` marker。本提案需要把这些现有基础串成一个 Main-authoritative 的会话授权边界，同时避免提前实现 Phase 4 的 MCP Workspace v2。

相关约束：

- 当前 Workspace 是 Window-level 实时状态；ACP Session 的 Folder 授权是 activation 时固定并持久化的快照。
- missing secondary 不进入新 Session 快照；primary missing 仍不能启动 Agent。
- apply/archive 继续只使用 proposal owner worktree，不获得其他成员目录。
- Renderer 只能表达用户意图；Workspace、Session、Folder 与路径归属均由 Main 从 sender 和持久化状态解析。

## Goals / Non-Goals

**Goals:**

- 只在有效目录数量大于一时要求 Agent 支持 `additionalDirectories`，并让 picker、probe、create、stream 与 cold recovery 使用相同判定。
- 让 probe/new/load/resume 始终使用同一份 `SessionWorkspaceSnapshot` 的 `cwd` 与 `additionalDirectories`。
- 对 removed、missing、relocated snapshot Folder 采用明确、不可静默修复的失败语义。
- 分离 Window preview trust、Session Agent authorization、Workspace-owned attachment copy 与 member file live reference 四种路径能力。
- 从快照安全生成完整 Workspace reminder，并向用户展示已有 Session 与当前 Workspace 的 scope 差异。

**Non-Goals:**

- 不实现 MCP Workspace v2 descriptor、per-activation capability token、HTTP/stdio grant、bundled MCP folder resolver 或 MCP event owner。
- 不实现跨 repository proposal、apply/archive 多根写入、ProposalRef、repository browser 聚合或 lineage v2。
- 不热扩张或原地迁移已有 Session 快照；Workspace 成员或 primary 变化只影响后续新 Session。
- 不把任意 absolute path、renderer `file://` URI 或 user-confirmed preview grant转换为 Agent 目录授权。

## Decisions

### 1. 用三态 capability selector 驱动 UI，并由 Main 重做最终校验

在 `AcpAgentCapabilitySnapshot` 的 SDK 原始字段之外保留 snapshot completeness/provenance，使 selector 能区分：

- `supported`：完整 initialize snapshot 中 `sessionCapabilities.additionalDirectories` 是非 null marker；
- `unsupported`：完整 snapshot 已知，但 marker 缺失或为 null；
- `unknown`：没有 snapshot，或只从 v1 prompt-only cache 提升得到 partial snapshot。

单根 Session 不读取该 marker，三种状态均可继续使用。需要附加目录时，picker 只允许 `supported`；`unknown` 显示“连接后检测”并先调用既有 `ensureAgent` 刷新，刷新后仍非 supported 则不启动 probe。Main 在 create/probe/stream/recovery 前使用 live initialize response 或完整 cache 再执行相同判定，不能信任 renderer 过滤结果。

选择三态而不是把缺失统一归一化为 false，是为了避免旧 v1 partial cache 把尚未检测的 Agent永久显示成不支持；也不把未知直接乐观放行，以免创建只拿到 primary 的降权 Session。

### 2. Session snapshot 是目录参数的唯一来源

新增 session workspace helper，负责：

1. 从 `ResolvedWorkspace.availableFolders` 按 Workspace 成员顺序创建快照，要求 primary 可用且恰好出现一次；
2. 令 `cwd` 等于 primary 的 snapshotted path，`additionalDirectories` 等于其他 snapshot Folder paths；
3. 校验 snapshot 的 workspace identity、current membership 及每个 `folderId` 当前 registry path；
4. 返回 `SESSION_FOLDER_REMOVED`、`SESSION_FOLDER_PATH_MISSING` 或 `SESSION_FOLDER_RELOCATED`，不裁剪列表、不替换路径。

draft probe 在调用 `newSession` 前创建快照并保存在 `ProbeEntry`；probe 提升为 Chat 时，`createSession` 通过匹配的 `{ workspaceId, agentId, acpSessionId }` 读取该快照并持久化，不能在提升时重新解析 Workspace。无 probe 的新 Chat 在创建 Session meta 时生成并持久化快照。`activateAcpSession` 接收 snapshot-derived `cwd` 与 `additionalDirectories`，对 resume、load、fresh fallback 和 new 使用同一参数集。

历史 Folder Workspace Session 没有 `workspaceSnapshot` 时，可在首次恢复前从当前唯一 Folder 生成等价单成员快照并原子回填；Collection Workspace 历史 Session 不做猜测，要求新建 Session。这样无需数据迁移，也不会为无法证明的旧多根授权补成员。

### 3. Window trust 与 Agent scope 分两步计算

`workspace.document` IPC 继续从 sender 取得 `workspaceId`，再解析当前 `ResolvedWorkspace.availableFolders`。`LocalFilePreviewService` 对所有成员并行 canonicalize 与枚举 registered worktrees；单成员 worktree 枚举失败只丢弃该成员的 worktree candidates，Folder root 仍可用，Folder root 自身无法 canonicalize 才排除该成员。命中多个 roots 时按 canonical path 分段长度选择最具体 root，并投影 `{ folderId, worktreePath }`。

Chat 发起的 preview 可额外提交 `sessionId` 作为 scope-comparison context。Main 校验 Session 属于 sender Workspace后，将 member-derived owner 与 Session snapshot 比较；匹配且 snapshot 未 stale 才返回 `agentScope: "authorized"`，否则返回 `"window-only"`。external exact-path grant 在 Chat 中始终是 `window-only`。`sessionId` 不参与文件读取授权，非 Chat 页面可省略 `agentScope`。

Renderer 允许打开 `window-only` 文档，但在 Slideover/Chat header 显示原因，并禁止将它转换为 `WorkspaceFileResourceRef` 或直接 dispatch 给当前 Agent。

### 4. Attachment copy 与 member file ref 使用不同 discriminant

上传附件仍写入 `<workspaceDataDir>/sessions/<sessionId>/attachments`，但 `attachment-store.ts` 返回随机 `attachmentId`，持久化 message/prompt part 保存 `{ type: "attachment", attachmentId, mediaType, filename }`。读取接口只接受 workspace/session/attachment ID，由 Main 校验 Session 归属并在固定目录内解析；renderer 不再提交或持久化 `file://` absolute URI。向 ACP 转换时，Main 才读取副本：图片转 base64 image，其他附件转为 Agent 可读 resource link。

成员文件使用独立的 `{ type: "workspace_file", ref: { folderId, worktreePath, repositoryRelativePath }, ... }`。Main 在捕获、持久化、preview、resume/load 和 prompt dispatch 时复用 session workspace validator 与 registered worktree 校验，并以 canonical relative resolution 阻止 `..`、absolute path 和 symlink escape。worktree 不存在或不再注册时返回明确 unavailable error，绝不回退 main worktree。

显式 discriminant 比自定义 URI scheme 更安全：它不要求从字符串重新推导 owner，也防止 attachment handle 与 member live path 走错 resolver。

### 5. Reminder 只接收已验证 snapshot 投影

扩展 `SystemReminderContext`，让 Chat/probe provider 接收已完成 stale 校验的 `SessionWorkspaceSnapshot`，不再用单一 `projectPath` 或 current registry 构造 Workspace 数据。provider 将以下动态对象先 `JSON.stringify`，再将 `<`/`>` 编码为 `\\u003c`/`\\u003e`：

```ts
{
  workspaceId,
  workspaceKind,
  primaryFolderId,
  folders: [{ folderId, folderName, folderPath }]
}
```

`folderName` 仅在 reminder projection 中按 Unicode code point 截为最多 120 个（119 + `…`），不修改持久化快照；编码后 Workspace JSON 超过 64 KiB 时返回 `WORKSPACE_REMINDER_TOO_LARGE`。stale/size 校验均发生在 Agent activation 或 prompt dispatch 前，不能发送部分 reminder。

本阶段只改变 Chat/probe reminder。apply/archive reminder 继续沿用 owner-only target，完整 MCP descriptor 与 repository-grouped guidelines 留到各自后续提案。

### 6. Renderer 同时维护 current Workspace 与 active Session snapshot projection

`Session` renderer contract 暴露持久化 snapshot，session store 派生 `activeSessionScopeDiff`：current-only Folder、snapshot-only Folder、primary 变化与同 ID 显示名称变化。Chat header 以 snapshot 表示 Agent 实际 scope；Workspace 管理与 navigation 继续使用 current `ResolvedWorkspace`。这避免把“窗口现在可见”误呈现成“旧 Agent Session 已授权”。

Workspace-level `chatAvailable` 不再等于 `kind === "folder"`。它只表达 primary 是否可用于进入 Chat shell；具体 Agent 是否能创建多根 Session由 per-Agent gate 判定。Main 的所有 session/probe/stream IPC 继续执行最终校验。

### 7. 保持 Phase 3 与 Phase 4 的清晰接缝

ACP Agent 在本阶段直接获得 `cwd/additionalDirectories`，但 bundled MCP servers 仍保持当前单 owner/legacy context，不宣称获得多根授权。需要 bundled MCP 的多根 Chat 在 Phase 4 引入 activation grant 后才获得 folder-aware MCP tools。本阶段的 `SessionWorkspaceSnapshot`、stale validator 和 member ref resolver 会成为 Phase 4 descriptor/grant 的可信输入。

## Risks / Trade-offs

- [同一 Agent process 服务多个不同目录快照，错误复用 session 参数] → 每次 lifecycle request 都从目标 Session/Probe snapshot 显式传入完整参数，并为 resume/load/fresh fallback 写参数一致性测试。
- [capability cache 旧记录被误判] → 保留 complete/partial provenance；未知必须经 `ensureAgent` 收敛，Main 最终以 live/完整 snapshot 判定。
- [多成员 Git 探测增加 preview 延迟] → 单次请求并行探测且允许 per-member degradation；不引入会产生 stale 授权的长期 cache。
- [opaque attachment contract 会触及现有历史 message] → 对已持久化的旧 `file://` parts 只提供受限单根兼容读取或清晰失败，不允许新 IPC 再接受任意 URI；具体兼容 fixture 在实现测试中固定。
- [Session snapshot 与当前 Workspace 分歧增加 UI 复杂度] → 用统一 `activeSessionScopeDiff` selector 驱动 header 与 preview 状态，不让组件各自比较数组。
- [Phase 3 Agent 可访问多个目录但 bundled MCP 尚未多根化] → UI/说明明确目录能力与 MCP tool 能力是两条边界，不在本提案伪造 MCP 多根上下文。

## Migration Plan

1. 先落 shared contracts、capability completeness/selector 与 Session snapshot helper，并保持 Collection Chat 的 Main gate 未开放。
2. 接通 probe/new/load/resume 与 Session meta 持久化、stale 校验和 reminder，再用 focused Main tests 验证生命周期。
3. 完成本地预览、附件/member ref 安全边界及 renderer scope UI。
4. 最后替换临时 Collection Chat gate，只有所有 Main 最终校验就位后才允许 compatible Agent 启动。
5. 不运行独立数据 migration；旧 Folder Workspace Session 首次恢复时惰性补单成员 snapshot。回滚代码后新增 `workspaceSnapshot` 与 opaque attachment 元数据作为未知可选字段保留，不改写 Workspace registry。

## Open Questions

无。Phase 4 MCP Workspace v2 和后续 proposal/lineage owner 问题已明确排除，不阻塞本提案实现。
