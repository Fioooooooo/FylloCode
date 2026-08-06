## 1. 扩展会话模式契约与持久化

- [x] 1.1 在 `src/shared/types/chat.ts` 定义并导出 `ChatSessionMode = "fyllocode" | "native"`，为 `Session` 增加必填 `sessionMode`；在 `src/shared/ipc/session/chat.schemas.ts` 为 `createSessionInputSchema` 增加默认 `fyllocode` 的 mode schema，保持 `updateSessionInputSchema` 与 `streamMessageInputSchema` 不可修改 mode，并在 `test/shared/ipc/session/chat.schemas.spec.ts` 覆盖默认值、两个合法值与非法值。
- [x] 1.2 在 `src/main/infra/storage/session-store.ts#SessionMeta` 持久化 `sessionMode`，让 `normalizeSessionMetaRecord()` 把缺失或非法历史值归一化为 `fyllocode`；更新 `src/main/services/session/chat/chat-service.ts#createSession()` / `toSession()` 读写该字段，并在 `test/main/infra/storage/session-store.spec.ts` 与 `test/main/services/session/chat/chat-service.spec.ts` 验证新 Session round-trip和 legacy默认行为。
- [x] 1.3 对齐 `src/preload/api/session/chat.ts`、`src/preload/index.d.ts` 与 `src/renderer/src/api/session/chat.ts` 的 createSession类型，让 Renderer显式提交 `sessionMode`且响应始终包含 mode；更新对应 preload/renderer API测试，确保后续 stream与 update surface没有 mode override。

## 2. 让 draft probe 按模式复用和替换

- [x] 2.1 在 `src/shared/types/chat-probe.ts`、`ProbeEntry`、probe ensure/close/set-config schemas与 `sessionProbeBus` update payload中加入 `sessionMode`，同步 preload/renderer API参数和事件类型；补充 shared schema与 API测试，确保 mode随 snapshot/event往返且非法值被拒绝。
- [x] 2.2 保持 `src/main/services/session/chat/session-probe-registry.ts` 的 key为 `workspaceId + agentId`，在 `src/main/services/session/chat/session-probe-service.ts#ensureProbe()` 中将 mode纳入复用判断：相同 mode沿用 existing/inflight，模式不同时调用现有 `closeProbe()` 后建立目标 entry；不得建立 per-mode并行 registry或复制 handler/grant/session清理逻辑。
- [x] 2.3 扩展 `getProbeWorkspaceSnapshotForPromotion()` 与 `takeProbeFor()` 接收 expected `sessionMode`，并在 `src/main/ipc/session/chat.ts` 的 createSession与 stream promotion路径同时验证 Workspace、Agent、ACP session ID和 mode；mode不匹配时返回 validation error且不得 consume probe。
- [x] 2.4 扩充 `test/main/services/session/chat/session-probe-registry.spec.ts`、`session-probe-service.spec.ts` 和 `test/main/ipc/session/chat.spec.ts`：覆盖同 mode复用、ready probe切换 mode时复用现有 close、starting probe失效后在 `newSession`返回时自动撤销/关闭、快速往返切换只保留最后 entry、promotion mode不匹配被拒绝。

## 3. 按模式构造 ACP 运行环境

- [x] 3.1 在 `src/main/services/session/chat/` 增加单一职责的 Chat runtime profile helper（例如 `session-runtime-profile.ts`）：`fyllocode`复用 `createSessionMcpWorkspaceDescriptor()`、`createBundledMcpActivation()`与 `toAcpMcpServer()`；`native`直接返回空 `mcpServers`、`null` activation ID和 no-op revoke，且不得调用 bundled MCP readiness、HTTP grant或 stdio spec构造。
- [x] 3.2 为 `src/main/services/session/chat/acp-session.ts#AcpSessionOpts` 增加持久化 Chat mode，在 `prepareStartContext()` 中让两种 mode继续校验固定 Workspace snapshot与 Agent additional-directories兼容性，但只为 `fyllocode`创建 MCP descriptor；保持 Apply/Archive传入的 owner-only descriptor路径不变。
- [x] 3.3 在 `AcpSession#resolveReminderParts()` 最外层对 `native` Chat返回空数组，使其不调用 `resolveSystemReminder()`、不追加 fresh-recovery history reminder且不触发 `onReminderInjected`；保持 `fyllocode`仅在 brand-new ACP session注入一次，以及 Apply/Archive现有 provider行为。
- [x] 3.4 调整 `src/main/infra/process/acp-process-pool.ts` 中对 `mcpActivationId === null` 的诊断文案，使它能表示 stdio或 empty-MCP activation而不误报；继续让 active native session可 direct prompt复用，且 `forgetActiveAcpSession()`保持幂等。
- [x] 3.5 在 `src/main/ipc/session/chat.ts` 的 stream onReady中要求 Session meta存在并以其 `sessionMode`创建 `AcpSession`；probe promotion必须与该 persisted mode一致，Renderer不得通过 stream input覆盖。补充 `test/main/services/session/chat/acp-session.spec.ts`、`acp-session-activation.spec.ts`、`test/main/ipc/session/chat.spec.ts`：覆盖 native new/resume/load/fresh请求的空 MCP、无 reminder/history、配置恢复、direct prompt复用，以及 FylloCode与 Apply/Archive回归。

## 4. 将模式纳入 Renderer draft 生命周期

- [x] 4.1 在 `src/renderer/src/stores/session/session.ts` 增加 `draftSessionMode`（默认 `fyllocode`）与唯一 mode切换 action；`beginDraftSession()`重置为默认值，probe调度/ensure/close/config/update携带并校验 mode，沿用现有 200ms防抖和 Workspace generation保护，忽略旧 mode迟到 update。更新 `test/renderer/src/stores/session/session.spec.ts` 覆盖默认、切换、相同 mode复用、旧 mode update隔离和新 draft重置。
- [x] 4.2 在 `src/renderer/src/stores/session/chat.ts#sendMessageCore()` 捕获 `draftSessionModeSnapshot`，用它选择同 mode carry probe并创建 Session；在 Session创建、附件物化、durable append与激活前的既有 scope guard中加入 mode比较。更新 `test/renderer/src/stores/session/chat.spec.ts`，覆盖 native首发持久化、mode匹配 promotion、提交中切换 mode时清理未提交 Session并保留草稿、迟到结果不激活。

## 5. 按原型实现模式 Tabs 与 Header Badge

- [x] 5.1 创建 `src/renderer/src/features/chat-session-mode/README.md`，记录该 feature的状态、范围、非范围、两处宿主和公共入口；创建 `model/session-mode-presentation.ts` 作为 label/description穷尽映射，精确使用 `FylloCode` / `原生` 及已确认的两段 tooltip文案。
- [x] 5.2 创建 `ui/SessionModeTabs.vue` 与 `ui/SessionModeBadge.vue`，并由 feature根 `index.ts`显式导出。Tabs使用带边框、内容宽度自适应的紧凑二选一控件与 `UTooltip`，支持 hover、keyboard focus和可见焦点；Badge使用 `UBadge color="neutral" variant="soft"`、圆角和相同 tooltip，不使用 primary、阴影 hover、transform或 `transition-all`。
- [x] 5.3 在 `src/renderer/src/components/chat/prompt/ChatPromptPanel.vue` 中仅对 draft在输入框上方挂载 `SessionModeTabs`，保持与 prompt 8px同组间距且不占满整行；在 `src/renderer/src/components/chat/ChatContainer.vue` Header左栏两个现有 UButton声明之后挂载 established Session的 `SessionModeBadge`，不改变按钮既有显示条件，不加入“发送首条消息后锁定”文案，也不修改 `ChatSidebar.vue` / `SessionItem.vue`。
- [x] 5.4 在 `test/renderer/src/features/chat-session-mode/` 为 presentation mapping、Tabs选择与 tooltip、neutral Badge增加聚焦测试，并更新 `test/renderer/src/components/chat-prompt-panel.spec.ts` 与 `chat-container.spec.ts` 验证 draft/established切换、Header DOM顺序和会话列表无 mode展示；测试组件语义与交互，不断言 Nuxt UI内部 DOM实现。

## 6. 验证行为与界面

- [x] 6.1 在 linked worktree首次运行项目命令前执行 `sh scripts/prepare-worktree-env.sh`，然后运行受影响的 main/shared/renderer聚焦 Vitest文件，确认 probe清理、native空 MCP、reminder短路、首发竞态和 UI状态全部通过。
- [x] 6.2 运行 `pnpm typecheck` 与 `pnpm lint`；本变更不涉及构建配置，未经用户针对本次 Apply明确授权不得运行 `pnpm build`。修复所有本次新增的类型、feature边界、术语与格式问题。
- [x] 6.3 人工检查浅色/深色主题、窄窗口与桌面窗口：Tabs宽度、边框、默认选择、tooltip、focus-visible、Header neutral badge及 icon button顺序正确；确认 ChatSidebar无模式标识，快速切换后只有最终 mode probe有效。
