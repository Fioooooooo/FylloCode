## Why

Proposal 详情页目前只能查看 change 内容，无法触发实施。用户需要一种方式从 UI 直接启动 ACP agent 执行 workflow，并实时看到执行进度，同时保证关闭窗口再打开后历史日志不丢失。

## What Changes

- **新增** `proposal:apply` IPC channel：接收 `projectId`、`changeId`、`workflowId`，将 `.openspec.yaml` 的 `status` 改为 `applying`，生成 `runId`，持久化 `ApplyRunMeta`，返回 `{ runId, stages }`
- **新增** `proposal:stageStream` IPC channel：接收 `{ runId, stageIndex, projectId, changeId }`，main 进程根据 stage type 构造 prompt，启动 `AcpSession`，通过 `MessageChannelMain` 将 chunk 推给 renderer；同时在 main 进程组装 `UIMessage` 并在 stage 完成时持久化到磁盘
- **新增** `proposal:loadRun` IPC channel：读取 `ApplyRunMeta`，用于页面重新打开时恢复进度展示
- **新增** `proposal:loadRunMessages` IPC channel：读取指定 stage 的 `UIMessage` JSONL，用于恢复历史日志展示
- **新增** `proposal:stageStream:cancel` IPC channel：取消当前正在运行的 stage stream
- **新增** stage 类型分发策略：`proposal-apply` 类型在 main 进程注入 prompt `加载 skill fyllo-apply-change，实现 {changeId}`；其他类型预留 switch-case 入口，当前抛出 not-implemented 错误
- **新增** main 进程 `MessageAssembler`：在 main 进程将 `SessionEvent` chunk 流组装为 `UIMessage`（复用与 chat store 相同的组装逻辑），stage 完成时写入磁盘，不依赖 renderer 存活
- **新增** 持久化目录 `apply-runs/<changeId>/`：在现有 `projects/<encoded>/` 下新增子目录，存放 `run.json` 和 `stage-N.messages.jsonl`
- **新增** renderer `useProposalRunStore`：管理当前 run 的状态（runMeta、messages、isStreaming），驱动 stageStream 发起与推进
- **修改** `[id].vue` `onMounted`：检测到 `status === "applying"` 时自动调用 `resumeRun`，从磁盘恢复历史日志展示
- **修改** `[id].vue` SidePanel：替换 `mockLogs` 为来自 `useProposalRunStore` 的真实 `UIMessage` 列表，复用 chat 页面的 markdown 渲染组件
- **不修改** chat 相关任何现有代码（`ipc/chat.ts`、`stores/chat.ts`、`chat-agent/`）；本次实现作为 main 线程持久化的验证，通过后再考虑迁移 chat

## Capabilities

### New Capabilities

- `proposal-apply-run`：proposal apply 执行生命周期管理，包括 run 创建、stage 流式执行、进度持久化、页面恢复展示

### Modified Capabilities

- `proposal-ipc`：新增 `proposal:apply`、`proposal:stageStream`、`proposal:stageStream:cancel`、`proposal:loadRun`、`proposal:loadRunMessages` 五个 IPC channel
- `proposal-detail`：详情页新增 apply 触发入口（已有"开始实现"按钮）、SidePanel 实时日志展示、页面重新打开时自动恢复进度

## Impact

- **新增文件**：`electron/main/ipc/proposal-apply.ts`（新 IPC handlers）、`electron/main/chat-agent/message-assembler.ts`（main 进程消息组装）、`frontend/src/stores/proposal-run.ts`（renderer run store）
- **修改文件**：`shared/types/channels.ts`（新增 ProposalChannels 条目）、`shared/types/proposal.ts`（新增 `ApplyRunMeta` 类型）、`electron/preload/api/proposal.ts`（新增 preload API）、`electron/preload/index.d.ts`（类型同步）、`frontend/src/pages/proposal/[id].vue`（onMounted 恢复逻辑 + SidePanel 接入）
- **依赖**：`ai` SDK（`generateId`、`DynamicToolUIPart` 类型）已在根 `package.json`，main 进程可直接使用（已验证 `generateId` 在 Node.js 环境正常运行）
- **不影响**：chat 页面、chat IPC、AcpSession、session-store 均不修改
