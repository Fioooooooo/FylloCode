## Why

Collection Workspace 已能创建和管理，但当前 Chat 仍被整体禁用，ACP lifecycle 也只获得 primary Folder 路径。需要让兼容 Agent 在固定、可恢复且可审计的 Session 目录快照内访问多个 Folder，同时继续保证单根 Workspace 对不支持附加目录的 Agent 可用。

## What Changes

- 按 Workspace 是否需要附加目录以及 Agent 的 `sessionCapabilities.additionalDirectories` 能力，统一控制 Chat 入口、Agent picker、draft probe 与 Main activation；能力未知时不允许启动多根 Session，但不影响单根 Session。
- 为 probe、`newSession`、`resumeSession` 与 `loadSession` 传递同一组 `cwd`/`additionalDirectories`，并在 Session 创建时持久化包含 Folder identity、显示名和路径的 `SessionWorkspaceSnapshot`。
- 在恢复 Session、构造 reminder、发送结构化文件资源前校验快照成员仍属于 Workspace 且路径未 missing/relocated；失败时返回明确错误，不裁剪授权，也不改用当前 registry 路径。
- 将本地文件预览扩展到当前 Workspace 的全部可用成员及其 registered worktrees，并区分 Window 实时信任与已有 Agent Session 授权：Chat preview 返回 `authorized | window-only`，后者只可查看、不可直接发送给旧 Session Agent。
- 将上传附件改为 Workspace/Session-scoped opaque handle；将成员文件引用建模为 `{ folderId, worktreePath, repositoryRelativePath }`，并按 Session 快照验证 owner、worktree 与相对路径。
- Chat/probe system reminder 从 Session 快照注入完整 Workspace 授权 JSON，执行安全编码、Folder 名称显示截断和 64 KiB 上限；stale Session 在 reminder 注入前失败。
- Chat header 展示 Agent Session snapshot 与当前 Workspace 的 scope 差异，包括 current-only、snapshot-only、primary 和显示名称变化。
- 保持 apply/archive Agent 的 owner-only 文件系统范围；本提案不引入 MCP Workspace v2、per-activation grant、proposal owner 路由或跨仓库 lineage。

## Capabilities

### New Capabilities

- `acp-multi-root-session`: 定义 ACP 多根能力门控、lifecycle 目录参数、Session Workspace 快照、stale 校验、安全 reminder、附件与成员文件资源的会话授权契约。

### Modified Capabilities

- `acp-agent-capability-cache`: 增加 `additionalDirectories` 三态 selector 及单根/多根 Agent 可用性判定契约。
- `workspace-window`: 用按 Workspace 目录数量与 Agent 能力判定的 Chat capability 取代 Collection Workspace 的临时全禁用门控，并规定 Chat header 的 Session/current scope 差异。
- `local-file-link-preview`: 将单 Folder trusted root 扩展为当前 Workspace 全部可用成员/worktree，并增加 owner projection 与 `authorized | window-only` Agent scope。

## Impact

- Shared contracts：`src/shared/types/workspace.ts`、`src/shared/types/local-file-preview.ts`、Chat prompt/attachment 与 IPC schemas。
- Main：Workspace resolver、session store/chat service、probe 与 ACP activation、system reminder、attachment store、local file preview service 和相关 IPC handlers。
- Renderer：ACP Agent capability selectors、navigation/activity capability gate、`ChatEmptyAgentPicker`、Chat header、attachment composer 与 local-file-preview feature。
- Tests：`test/main/**`、`test/renderer/**` 与 shared contract fixtures；验证使用 focused Vitest、typecheck、lint、format 和 `git diff --check`，不运行完整 `pnpm build`，也不启动 `pnpm dev`。
- 不新增外部依赖；现有单根 Session 和历史单成员快照保持兼容。
