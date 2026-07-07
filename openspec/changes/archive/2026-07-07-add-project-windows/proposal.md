## Why

FylloCode 当前是单窗口模型，用户在同一个 renderer 内切换项目会丢失当前窗口的路由、会话草稿和页面状态，也无法并排处理多个项目。现有主进程还有三处事件广播只记住一个 `BrowserWindow`，一旦引入多个窗口会导致 probe、agent 和 proposal 状态只发给最后注册的窗口。

该变更将项目上下文提升为主进程管理的窗口绑定关系，让每个项目拥有独立窗口、独立窗口状态和项目级事件隔离，同时保留无项目 launcher 作为打开项目入口。

## What Changes

- 新增一项目一窗口的窗口模型：同一个项目同一时间最多对应一个 project window，重复打开同一项目时聚焦已有窗口。
- 新增无项目 launcher window：启动时展示 launcher；launcher 用于打开文件夹和最近项目；macOS 无窗口激活时重新创建 launcher。
- 新增主进程窗口上下文契约：renderer 通过 IPC 获取当前窗口是 launcher 还是 project window，并据此设置当前项目。
- 调整打开项目语义：从 launcher 打开未打开项目可复用当前 launcher 绑定为 project window；从 project window 打开其他项目只创建或聚焦目标项目窗口，不重绑当前窗口。
- 将窗口状态从单一 `main-window.json` 调整为 launcher 与每个项目分别持久化 bounds/maximized 状态。
- 将 chat probe、proposal status、stream cancel、apply cancel 等运行时 registry 和事件路由加上项目维度，避免不同项目的相同 `agentId`、`changeId`、`sessionId` 或 `runId` 互相覆盖。
- 将 ACP agent registry/status/install/uninstall 等应用级事件广播到所有活跃窗口。
- 将打开文件夹对话框绑定到发起窗口，避免多窗口下系统 dialog 无归属。
- **BREAKING**：renderer 的 `openFolder`、`openRecentProject`、`switchProject` 用户语义从“在当前窗口替换当前项目”改为“请求主进程创建或聚焦项目窗口”。

## Capabilities

### New Capabilities

- `project-window`: 定义 launcher/project window 生命周期、项目窗口唯一性、窗口上下文、项目级事件隔离、流式运行时隔离和 per-project 窗口状态持久化。

### Modified Capabilities

无。

## Impact

- Main/bootstrap：`src/main/bootstrap/window.ts`、`src/main/bootstrap/index.ts`，新增 `ProjectWindowManager` 管理窗口注册、绑定、聚焦、关闭和 fanout。
- Main IPC：新增 window IPC 链路，并调整 `src/main/ipc/project.ts`、`src/main/ipc/chat.ts`、`src/main/ipc/proposal.ts`、`src/main/ipc/proposal-apply.ts`、`src/main/ipc/acp-agents.ts` 的窗口和事件行为。
- Runtime services：调整 `sessionProbeRegistry`、`proposalStatusService`、`sessionRegistry` 的 key 与清理 API，使项目级运行时状态不会串扰。
- Infra storage：`src/main/infra/storage/window-state-store.ts` 支持 launcher/project state key，并兼容读取旧 `main-window.json`。
- Shared/preload/renderer API：新增 window channel、schema、类型、preload API 和 renderer wrapper。
- Renderer：调整 project store、projects bootstrap task、AppHeader、WelcomeView、ProjectList 和事件订阅过滤逻辑。
- Tests：新增和更新 main、preload、renderer 测试，覆盖窗口唯一性、窗口上下文、事件路由、registry key 隔离、窗口状态迁移和 UI 打开项目语义。
