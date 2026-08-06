## Why

当前 Chat 会话始终在 ACP session 启动时绑定 FylloCode 内置 MCP，并在首条用户消息前注入完整 system reminder，用户无法选择仅把 FylloCode 作为 Agent CLI 的桌面 UI。新增会话模式后，用户可以在新会话开始前明确选择 FylloCode 协作能力或 Agent 原生行为，同时让选择在会话全生命周期内保持稳定、可识别且可恢复。

## What Changes

- 为新 Chat 会话新增 `FylloCode` 与 `原生` 两种会话模式；默认使用 `FylloCode`，模式随 Session meta 持久化，历史会话缺失该字段时按 `FylloCode` 解释。
- 在首条消息发送前，于输入框上方展示内容宽度自适应的模式 Tabs；两个选项通过 tooltip 展示既定描述。会话创建后隐藏 Tabs，并在聊天 Header 左侧两个 icon button 之后以低强调 neutral badge 展示该会话模式及 tooltip；会话列表不展示模式。
- 让 draft probe 携带会话模式。Main 在同一 Workspace 与 Agent 下只保留一个 probe：模式相同则复用，模式不同则复用现有 `closeProbe` 清理旧 probe 后创建新 probe；正在启动但已失效的 probe 在 `newSession` 返回后沿用现有路径撤销 activation 并关闭 ACP session。
- `FylloCode` 模式保持当前行为：向 ACP lifecycle 传递 Workspace 目录、绑定内置 MCP，并在需要时注入 FylloCode system reminder 与 fresh-recovery history reminder。
- `原生` 模式仍使用 Session Workspace snapshot 的 `cwd`、`additionalDirectories` 和 Agent session config options，但向 ACP lifecycle 传递空 MCP server 集合，不构造 bundled MCP activation，且不注入 FylloCode system reminder 或 fresh-recovery history reminder。
- Session 创建后不提供模式修改入口；流式消息与恢复流程只信任持久化 Session mode，不接受 Renderer 在每轮 prompt 时覆盖模式。
- Proposal Apply、Archive 等由 FylloCode 内部启动的非 Chat ACP session 不受本功能影响，继续使用现有 owner-only MCP 与 reminder 契约。

## Capabilities

### New Capabilities

- `chat-session-mode`: 定义新会话模式选择、默认值、持久化与不可变性、draft probe 替换、Header 呈现，以及 FylloCode/原生模式对 MCP 和提示词注入的差异。

### Modified Capabilities

- `chat-message-submission`: 首次提交必须固定并持久化所选模式，提交期间模式变化必须使旧 draft 结果失效。
- `acp-multi-root-session`: Chat/probe 在两种模式下继续使用相同固定 Workspace 目录快照，但只有 FylloCode 模式派生 bundled MCP descriptor。
- `bundled-mcp-http-transport`: 原生模式的 ACP lifecycle 不等待 bundled MCP readiness，也不接收 HTTP 或 stdio bundled MCP spec。
- `mcp-workspace-authorization`: bundled MCP descriptor 与 grant 只为 FylloCode Chat/probe activation 创建，原生 activation 不签发 grant。
- `acp-agent-connection-lifecycle`: cold recovery 继续恢复 Agent config，但仅 FylloCode 模式注入 system/history reminder。
- `fyllo-cortex-guidelines`: Chat guideline reminder 只在 FylloCode 模式构建；Apply/Archive 行为不变。
- `fyllo-cortex-knowledge`: Chat knowledge reminder 只在 FylloCode 模式构建；knowledge 存储、浏览与显式 Action 流程不变。

## Impact

- 跨进程契约与持久化：`src/shared/types/chat.ts`、`src/shared/types/chat-probe.ts`、`src/shared/ipc/session/chat.schemas.ts`、session preload/renderer API，以及 `src/main/infra/storage/session-store.ts` 的兼容读取。
- Main Chat lifecycle：`chat-service.ts`、`session-probe-registry.ts`、`session-probe-service.ts`、`acp-session.ts`、`acp-session-activation.ts` 与 `src/main/ipc/session/chat.ts`；现有 `closeProbe`、ACP process pool 和 bundled MCP activation 实现继续复用。
- Renderer：session store、首次提交竞态保护、`ChatPromptPanel.vue`、`ChatContainer.vue`，以及用于统一 Tabs/Badge 文案与 tooltip 的会话模式 UI 单元。
- 测试：shared schema、session storage、probe lifecycle、ACP activation/reminder、IPC、renderer store、首次提交和 Chat Header/Prompt 组件测试。
- 不新增第三方依赖，不改变 Workspace 授权快照、Agent 配置菜单、会话列表、Apply/Archive ACP 行为或 bundled MCP host 的应用级启动生命周期。
