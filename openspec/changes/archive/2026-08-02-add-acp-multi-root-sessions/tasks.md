> Apply 执行规则：严格按顺序实施；每完成并验证一项任务，立即将该项从 `- [ ]` 更新为 `- [x]`，再开始下一项。不得集中到最后批量更新状态。

## 1. Shared contracts 与错误语义

- [x] 1.1 在 `src/shared/types/acp-agent.ts` 为 capability snapshot 增加 complete/partial provenance 与 `AdditionalDirectoriesCapability = "supported" | "unsupported" | "unknown"` selector；更新 `src/main/infra/storage/agent-capability-store.ts`，让 v1 prompt-only cache 返回 partial、v2/live initialize 返回 complete，且不裁剪 SDK marker；在 `test/main/infra/storage/agent-capability-store.spec.ts`（不存在则创建）和 `test/renderer/src/stores/platform/acp-agents.spec.ts` 覆盖三态判定与旧 cache。
- [x] 1.2 在 `src/shared/types/workspace.ts` 为 `SessionWorkspaceSnapshot` 增加 runtime validation schema，并在 `src/shared/types/chat.ts` 或现有 Session public contract 中暴露可选 snapshot；补充 `test/main/infra/storage/session-store.spec.ts`，验证完整 round-trip、未知字段兼容与旧 Session 无 snapshot 读取。
- [x] 1.3 在 `src/shared/constants/error-codes.ts` 定义 `SESSION_FOLDER_REMOVED`、`SESSION_FOLDER_PATH_MISSING`、`SESSION_FOLDER_RELOCATED`、`WORKSPACE_REMINDER_TOO_LARGE` 及 member resource/worktree unavailable 所需错误码；补充 shared/Main error mapping 测试，确保 IPC 保留 code 与结构化 details。
- [x] 1.4 在 `src/shared/types/chat-prompt.ts` 与 `src/shared/ipc/session/chat.schemas.ts` 将新写入的附件和成员文件 prompt/message part 定义为显式 `attachment`/`workspace_file` discriminant，attachment 只含 opaque ID，member ref 使用 `{ folderId, worktreePath, repositoryRelativePath }`；更新 `test/shared/ipc/session/chat.schemas.spec.ts`，拒绝新 contract 中的任意 `file://` URI、absolute relative path 和缺失 owner 字段。

## 2. Session Workspace snapshot 领域边界

- [x] 2.1 新建 `src/main/domain/session/chat/session-workspace-snapshot.ts`，实现从 `ResolvedWorkspace.availableFolders` 创建快照、校验结构不变量与派生 `cwd/additionalDirectories`；复用 `workspace-resolver` 的成员顺序，拒绝 primary missing/重复/缺失，并在 `test/main/domain/session/chat/session-workspace-snapshot.spec.ts` 覆盖单根、多根和 missing secondary。
- [x] 2.2 在 `src/main/services/session/chat/session-workspace-service.ts` 实现 current membership/path stale 校验，复用 Folder registry 与 Workspace resolver 的 canonical identity，精确返回 removed、missing、relocated；测试证明任一失败不裁剪 snapshot、不替换路径且重新加入同一 Folder 后继续执行 path 校验。
- [x] 2.3 修改 `src/main/services/session/chat/chat-service.ts`、`src/main/infra/storage/session-store.ts` 与 `src/main/ipc/session/chat.ts`：新 Session 在 meta 创建时持久化 snapshot，probe promotion 复用 probe snapshot；仅对无 snapshot 的历史 Folder Workspace Session在 activation 前惰性回填单成员 snapshot，Collection 历史 Session 明确拒绝猜测；更新 `test/main/services/session/chat/chat-service.spec.ts` 与 `test/main/ipc/session/chat.spec.ts`。

## 3. Agent 门控与 ACP lifecycle

- [x] 3.1 修改 `src/renderer/src/stores/platform/acp-agents.ts`，公开 additional directories 三态 selector 和“目标 snapshot 是否可用该 Agent”selector；保持现有 prompt selector 默认语义，并在 `test/renderer/src/stores/platform/acp-agents.spec.ts` 覆盖单根不受限、多根 supported/unsupported/unknown。
- [x] 3.2 修改 `src/renderer/src/components/chat/empty/ChatEmptyAgentPicker.vue`、`InstalledAgentTile.vue` 与必要的 picker props：多根时过滤/禁用不支持 Agent，unknown 显示“连接后检测”并通过既有 `ensureAgent` 收敛后才启动 probe；新增或更新 component test，验证原因文案、键盘焦点、unknown→supported/unsupported 两条路径。
- [x] 3.3 用 Main-authoritative `assertAgentWorkspaceCompatibility` 替换 `src/main/ipc/session/chat.ts` 的 `kind === folder` 临时 gate，并让 create/probe/stream/config recovery 都在启动前校验实际 snapshot 与 Agent 完整/live capability；更新 `src/main/services/workspace/workspace/workspace-service.ts`、`src/renderer/src/config/navigation-gate.ts` 及对应 tests，确保 Chat shell 可进入但不兼容 activation 不会降级 primary-only。
- [x] 3.4 扩展 `src/main/services/session/chat/session-probe-registry.ts` 与 `session-probe-service.ts`，让 `ProbeEntry` 固定 `SessionWorkspaceSnapshot` 并在 probe `newSession` 传 `additionalDirectories`；probe promotion 必须以 workspace/agent/ACP session ID 匹配原快照；更新 `session-probe-registry.spec.ts` 和 `session-probe-service.spec.ts`。
- [x] 3.5 修改 `src/main/services/session/chat/acp-session-activation.ts`、`acp-session.ts` 与 `config-option-service.ts`，让 resume/load/new/fresh fallback 和 cold config recovery 均从同一 snapshot 传 `cwd/additionalDirectories`，并在任何 Agent调用前完成 stale/capability 校验；更新 `acp-session-activation.spec.ts`、`acp-session.spec.ts` 与 `config-option-service.spec.ts` 覆盖所有 lifecycle 分支。

## 4. 安全 Workspace reminder

- [x] 4.1 扩展 `src/main/services/session/chat/system-reminder/types.ts` 与 `providers/chat.ts`，新增从已验证 snapshot 生成 Workspace projection 的 helper：按 Unicode code point 截断 `folderName`、`JSON.stringify` 后编码尖括号、计算 UTF-8 64 KiB 上限；更新 `templates/chat.txt` 加入静态 ownership/data-not-instruction 规则，不从 current registry 读取动态成员。
- [x] 4.2 更新 `test/main/services/session/chat/system-reminder/resolve.spec.ts`（必要时新增 `workspace.spec.ts`），覆盖引号、反斜杠、换行、`</workspace>`、非 BMP 字符、120 code point、完整 16 成员和 64 KiB 超限；在 `acp-session.spec.ts` 验证 stale/超限发生在 activation/prompt 前且不注入部分 reminder。

## 5. Multi-root local file preview

- [x] 5.1 修改 `src/main/services/workspace/document/local-file-preview-service.ts`，将 context 改为 `availableFolders[]`，并行 canonicalize/枚举各成员 registered worktrees，按成员降级并记录 warning，使用 longest canonical root match 投影 `{ folderId, worktreePath }`；扩展 `test/main/services/workspace/document/local-file-preview-service.spec.ts` 覆盖多成员、missing 排除、单成员探测失败、symlink 与内嵌 worktree 最长匹配。
- [x] 5.2 修改 `src/main/ipc/workspace/document.ts`、`src/shared/types/local-file-preview.ts` 与 preload/renderer API：Main 从 sender 解析 current Workspace，Chat 请求只可附带 `sessionId` comparison context；ready result 对 member-derived target返回 owner，并在 Session context 下返回 `authorized | window-only`；测试拒绝跨 Workspace Session ID，external grant 不伪造 owner且始终 window-only。
- [x] 5.3 修改 `src/renderer/src/features/local-file-preview/**`，让 controller/Slideover呈现 window-only 警告并禁止 Agent resource 转换，同时保持非 Session 页面、confirmation、Monaco 与 MarkStream 行为；更新 `local-file-preview-controller.spec.ts`、`use-local-file-preview.spec.ts`、`local-file-preview-slideover.spec.ts` 和 `markstream-local-file-preview.spec.ts`。

## 6. Opaque attachments 与 member file resources

- [x] 6.1 重构 `src/main/infra/storage/attachment-store.ts`，以 `attachmentId` 在固定 Workspace/Session 目录中安全解析副本，返回 handle 而非 absolute path/file URI；保留 Session 删除清理，并更新 `test/main/infra/storage/attachment-store.test.ts` 覆盖跨 Workspace/Session、路径逃逸、原文件删除和 cleanup。
- [x] 6.2 修改 `src/main/ipc/session/chat.ts`、preload/renderer chat API、`src/renderer/src/composables/useChatAttachment.ts` 与 attachment view model，使 save/read/stream 全链路只提交 opaque handle；更新 `test/main/ipc/session/chat.spec.ts`、`test/preload/api/session/chat.spec.ts` 与 `test/renderer/src/components/chat-prompt-attachments.spec.ts`，证明 renderer `file://` URI 被拒绝。
- [x] 6.3 新建或扩展 Main member resource resolver，复用 Session stale validator、registered worktree reader 与 canonical containment，验证 `{ folderId, worktreePath, repositoryRelativePath }`；在 `src/main/services/session/chat/acp-session.ts` 将合法 attachment/member refs 转成 ACP image/resource link，拒绝 window-only、removed/relocated/missing、worktree removed 与 relative path escape，并补 focused resolver/ACP tests。

## 7. Session scope UI

- [x] 7.1 修改 `src/main/services/session/chat/chat-service.ts`、shared `Session` contract 与 `src/renderer/src/stores/session/session.ts`，向 renderer 暴露 snapshot 并派生 `activeSessionScopeDiff`（current-only、snapshot-only、primary、名称变化）；更新 `test/renderer/src/stores/session/session.spec.ts` 覆盖 Workspace 编辑不改写历史 scope。
- [x] 7.2 在 `src/renderer/src/components/chat/` 新增轻量 Session scope header 并接入 `ChatContainer.vue`，展示 snapshot Folder、degraded/stale/current diff 与“新建 Session 获得当前成员授权”提示；遵循 `UiDesign.md` 的 token、keyboard focus 与窄窗口要求，并新增 component test。

## 8. 边界回归与验证

- [x] 8.1 为 apply/archive activation 增加回归测试，证明来源 Workspace 多根时仍只传固定 owner `cwd` 且 `additionalDirectories: []`，本提案不向 bundled MCP 注入其他成员或 Workspace v2 descriptor。
- [x] 8.2 运行一次 `sh scripts/prepare-worktree-env.sh`，随后执行与上述改动对应的 focused Vitest 项目/文件、`pnpm typecheck`、`pnpm lint`、`pnpm format` 与 `git diff --check`；修复所有失败并记录无法执行项。不得运行完整 `pnpm build`，不得启动 `pnpm dev`。
  - 验证记录：除两个需要监听 `127.0.0.1`、在当前沙箱中以 `EPERM` 失败的基础设施测试文件外，其余 278 个测试文件、2010 个用例全部通过；类型检查、lint、格式化与 diff 检查通过。未运行完整 build，未启动 dev。
