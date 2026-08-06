## Context

Chat 在没有 active Session 时会为当前 Workspace 与 Agent 提前创建 draft probe。Probe 的 ACP `newSession` 当前总是携带 bundled MCP specs；首条消息提交后，ready probe 可被提升为真实 Chat Session，并在第一次 prompt 前注入 FylloCode system reminder。现有 probe registry 以 `workspaceId + agentId` 为唯一键，通过对象 identity 使已经被替换但仍在启动的 probe 在 `newSession` 返回后自动撤销 activation、关闭 ACP session。

Session meta 当前持久化 Agent、ACP session ID、配置、Workspace snapshot 等信息，但没有会话模式。Renderer 的 draft state 也只区分 Agent，无法证明一个 ready probe 是否与用户首发时选择的模式一致。由于 ACP lifecycle 没有在既有 session 上替换整组 MCP servers 的能力，FylloCode 与原生模式不能共享同一个 ACP session。

前端设计以根目录 `session-startup-config-prototype.html` 为视觉目标，并受 `guidelines/UiDesign.md` 约束：模式 Tabs 只在首条消息前出现，宽度随内容自适应；会话开始后由 Header 左侧 neutral badge 表达固定模式；tooltip 使用最终确认文案；会话列表不增加模式元数据。

## Goals / Non-Goals

**Goals:**

- 让用户在新 Chat 会话首发前选择 `FylloCode` 或 `原生`，默认 `FylloCode`。
- 让模式成为持久化 Session 身份的一部分，并由 Main 在 probe promotion、stream、cold recovery 时强制执行。
- 在不复制清理逻辑的前提下，保证同一 Workspace 与 Agent 同时只有一个有效 probe；模式切换复用现有 `closeProbe` 与失效 probe 自清理路径。
- 原生模式保留 Workspace 目录和 Agent config options，但不向 Agent 暴露 bundled MCP，也不注入 FylloCode 或 history reminder。
- 让 Tabs、Badge、tooltip 在浅色/深色主题和键盘交互下遵守现有 Nuxt UI 与 Tailwind 语义样式。

**Non-Goals:**

- 不允许已创建 Session 在两种模式间切换。
- 不把模式展示到 ChatSidebar/SessionItem，也不增加按模式筛选。
- 不改变 Agent 选择、Agent config option 菜单、Workspace snapshot、附件、消息提交顺序或 session recovery 策略。
- 不停止应用级 bundled MCP host；原生模式只是不为该 ACP activation 创建或传递 bundled MCP specs。
- 不改变 Proposal Apply、Archive 或其他非 Chat ACP owner 的 MCP/reminder 行为。

## Decisions

### 1. 使用持久化 `ChatSessionMode` 作为唯一事实源

在 `src/shared/types/chat.ts` 定义 `ChatSessionMode = "fyllocode" | "native"`，并让 Renderer 可见的 `Session` 与 Main `SessionMeta` 都包含 `sessionMode`。`createSessionInputSchema` 接受该字段并默认 `fyllocode`；Renderer 首次提交始终显式传递当前 draft mode。`session-store.ts#normalizeSessionMetaRecord` 对缺失或非法历史值归一化为 `fyllocode`，因此无需一次性数据迁移。

Main 的 stream handler 从已持久化 meta 读取 mode，并把它传给 `AcpSession`；`streamMessageInputSchema` 不增加 mode，防止 Renderer 在后续 turn 覆盖既有 Session 契约。`updateSessionInputSchema` 也不允许修改 mode。

备选方案是只在 Renderer 保存模式，并在每次 prompt 中回传。该方案无法约束重启恢复、其他 Renderer 调用方或被篡改的 stream input，因此不采用。

### 2. Probe registry 继续保持单键，模式参与复用判断

`ProbeEntry` 与 `ProbeSnapshot` 增加 `sessionMode`，probe ensure/close/config IPC payload 与 update event 均携带 mode。Registry 仍以 `workspaceId + agentId` 为键，不为两种模式缓存两个 ACP session。

`ensureProbe(workspaceId, agentId, sessionMode, workspaceSnapshot)` 的处理顺序为：

1. 没有 probe 时按目标 mode 创建。
2. 现有 probe mode 相同且 ready/starting 时沿用当前复用逻辑。
3. 现有 probe mode 不同时调用现有 `closeProbe(workspaceId, agentId)`，再创建目标 mode probe。

Renderer 的 `draftSessionMode` 默认 `fyllocode`。模式变化时沿用现有 200ms probe 调度防抖，并用当前 draft Agent、mode、Workspace generation 过滤迟到结果。Main 继续以 starting entry 的对象 identity 判定失效：被模式切换替换的旧 `newSession` 返回后，现有代码会删除 handler、调用 `forgetActiveAcpSession()`、撤销 grant 并 `closeSession()`。这里不新增第二套 cleanup，也不保留后台 probe 缓存。

`getProbeWorkspaceSnapshotForPromotion()` 与 `takeProbeFor()` 增加 expected mode；Session 创建和 stream promotion 必须同时匹配 Workspace、Agent、ACP session ID 与 mode。

备选方案是为每个 mode 缓存一个 probe。它能减少回切等待，但会长期保留不用的 ACP session、handler 和 MCP grant，并让 Agent config state 出现两个来源，因此不采用。

### 3. 在 Chat service 层选择 MCP activation，不修改通用 ACP lifecycle

新增窄的 Chat activation policy（可放在 `src/main/services/session/chat/session-runtime-profile.ts`，具体命名可在实现时保持同等单一职责）：

- `fyllocode`：调用现有 `createSessionMcpWorkspaceDescriptor()` 与 `createBundledMcpActivation()`。
- `native`：返回 `{ mcpServers: [], mcpActivationId: null, revoke: no-op }`，不等待 bundled MCP readiness，不创建 HTTP grant，也不生成 stdio spec。

`activateAcpSession()` 已通过 `createMcpActivation` callback 接收 lifecycle 环境，应继续保持 Agent/owner 无关，不在其中硬编码 Chat mode。`markAcpSessionActive()` 现有的 `null` activation ID 已被视为没有可撤销 HTTP grant但 activation 有效，可用于 native empty-MCP session；日志不得把该状态误报为必然 stdio。

Chat native mode 仍在 activation 前校验 `SessionWorkspaceSnapshot` 和 Agent 对 `additionalDirectories` 的兼容性，并向 `newSession`/`resumeSession`/`loadSession` 传递固定 `cwd` 与 `additionalDirectories`。模式不改变文件系统授权边界，只改变 FylloCode 的 MCP 扩展是否出现。

### 4. 原生模式在 reminder assembly 的最外层短路

`AcpSessionOpts` 增加 Chat mode。`resolveReminderParts()` 在 native Chat 下直接返回空数组，不调用 `resolveSystemReminder()`，也不追加 fresh-recovery history reminder。这样所有 `<workspace>`、guidelines、knowledge、Fyllo Action/Signal contract 与 task context 都不会进入 Agent prompt；`onReminderInjected` 也不会写入隐藏 reminder part。

FylloCode mode 保持现有“仅 brand-new ACP session 注入一次”的语义。Apply/Archive owner 不使用 Chat session mode，继续执行现有 reminder provider。

原生 Session 在 resume/load 都失败而 fresh fallback 时不会由 FylloCode 重放历史，这是“不做提示词注入”的直接结果；UI 中已经持久化的消息仍正常展示，不删除也不改写。

### 5. Renderer 以一个轻量 feature 统一两处模式呈现

该能力同时有 draft Tabs 与 established Header badge 两个宿主入口，并共享 label/description 投影，因此在 `src/renderer/src/features/chat-session-mode/` 建立最小 `model + ui` feature：

- `model/session-mode-presentation.ts`：穷尽映射两种 mode 的 label 与 tooltip 文案。
- `ui/SessionModeTabs.vue`：接收 mode、发出 change；使用带边框、内容宽度自适应的紧凑 Tabs/segmented control，并用 `UTooltip` 展示说明。
- `ui/SessionModeBadge.vue`：使用 `UBadge color="neutral" variant="soft"` 与 `UTooltip`，不使用 primary 强调。
- `index.ts`：显式导出两个稳定 UI 入口与必要类型/呈现函数，不使用 `export *`。

最终文案固定为：

- FylloCode：`结合项目规范、规约与知识，按 FylloCode 工作流程协作并沉淀成果。`
- 原生：`保持 Agent 默认的工作方式，不做改变。`

`ChatPromptPanel.vue` 仅在没有 active Session 时把 `SessionModeTabs` 放在输入框上方；容器不占整行，并保持与 prompt 的 8px 同组间距。`ChatContainer.vue` 在 Header 左栏现有 sidebar toggle 与 new-session icon button 之后渲染 `SessionModeBadge`；按钮自身的现有显示条件不因本功能改变。SessionItem/ChatSidebar 不消费 mode。

备选方案是在两个宿主组件中分别硬编码文案与样式。它会使 tooltip 文案和 neutral 强度容易漂移，因此不采用。

### 6. 首发把 mode 纳入 draft scope 快照

`sendMessageCore()` 在首发开始时同时捕获 `draftAgentIdSnapshot` 与 `draftSessionModeSnapshot`。创建 Session、保存附件、durable append 和激活前的每个 scope check 都验证 mode 未变化；创建请求携带 snapshot mode，carry probe 也必须具有相同 mode。模式在提交期间变化时，旧 run 按现有失败清理删除未提交 Session 并保留输入/附件草稿，迟到 probe 或 Session 结果不得激活。

## Risks / Trade-offs

- [频繁切换模式会创建并关闭多个 ACP session] → 复用现有 200ms 防抖，只为最终稳定选择启动 probe；Main 的对象 identity 继续清理已经开始但失效的 session。
- [Agent 的 `session/close` 失败] → 在调用 Agent 前先解除 handler、`forgetActiveAcpSession()` 并撤销本地 grant；失败只记录日志，Agent 进程退出时仍会释放遗留 session。
- [原生 fresh fallback 不携带历史导致上下文丢失] → 这是“保持 Agent 默认工作方式、不注入提示词”的明确取舍；持久化消息只用于 UI，不伪装成 Agent 原生历史。
- [历史 Session 没有 mode] → 读取时默认 `fyllocode`，保持升级前行为且无需迁移。
- [模式文案在两处漂移] → 由 feature model 的穷尽映射作为 Renderer 单一来源，Tabs 与 Badge 共用。

## Migration Plan

1. 先扩展 shared type/schema 与 session meta 兼容读取，使历史数据稳定映射为 `fyllocode`。
2. 扩展 probe contract、registry 和 Main replacement/promotion 校验，再接入 mode-aware activation/reminder policy。
3. 扩展 Renderer draft store、首发 scope guard和两个 UI 入口。
4. 运行聚焦 main/renderer 测试、typecheck 与 lint，并人工检查浅色/深色、窄窗口、键盘 focus 和 tooltip。

回滚时可移除 UI 与 mode-aware policy；新增 meta 字段会被旧版宽松 record reader 当作未知字段保留或忽略。由于历史默认是 `fyllocode`，回滚不会把既有会话切换为原生行为。

## Open Questions

无。会话模式命名、默认值、文案、UI 位置、会话列表策略、probe 替换语义和原生 reminder/MCP 边界均已确认。
