## Context

当前 proposal 详情页（`frontend/src/pages/proposal/[id].vue`）已有"开始实现"按钮（`status === 'draft'` 时显示）和 SidePanel 骨架，但两者均未接入真实逻辑：按钮点击后无任何行为，SidePanel 使用 `mockLogs` 静态数据。

现有基础设施：

- `AcpSession`（`electron/main/chat-agent/acp-session.ts`）：封装 ACP agent 的 session 生命周期，emit `SessionEvent` 事件流
- `MessageChannelMain` 模式（`ipc/chat.ts`）：已验证的 main→renderer 流式传输方案
- `session-store.ts`：`appendMessage` / `loadMessages` 以 JSONL 格式持久化 `UIMessage`，路径规则为 `projects/<encoded>/sessions/`
- `workflow:list` IPC：已能解析 workflow YAML，返回 `WorkflowTemplate`（含 `stages[]`）
- `ai` SDK 的 `generateId` 已验证在 Node.js main 进程可正常运行

约束：

- **不修改** chat 相关任何现有代码（`ipc/chat.ts`、`stores/chat.ts`、`chat-agent/` 目录下所有文件）
- main 进程持久化必须不依赖 renderer 存活
- 本次只实现 `proposal-apply` stage type，其他 type 预留入口

## Goals / Non-Goals

**Goals:**

- 从 proposal 详情页点击"开始实现"，选择 workflow 后触发 apply 流程
- main 进程驱动 ACP agent 执行，实时 chunk 推给 renderer 展示
- main 进程在 stage 完成时将 `UIMessage` 持久化到磁盘，不依赖 renderer 存活
- 关闭窗口再打开，自动从磁盘恢复历史日志展示（只读，不续跑）
- 多 stage workflow 预留入口，本次只跑通 `proposal-apply` 单 stage

**Non-Goals:**

- 断点续跑（中断后重新触发是新建 run，不是接续上次）
- 修改 chat 页面任何现有逻辑
- 实现除 `proposal-apply` 以外的 stage type
- apply 完成后自动修改 `.openspec.yaml` status（由 agent 自行处理）

## Decisions

### 决策 1：main 进程组装 UIMessage 并持久化

**选择**：在 main 进程新建 `MessageAssembler`，将 `SessionEvent` 流组装为 `UIMessage`，stage done 时调用 `appendMessage` 写磁盘。

**备选方案**：renderer 组装后调 `persistMessage` IPC 写回 main（现有 chat 的做法）。

**理由**：renderer 离线时持久化链路断裂，消息丢失。main 进程持久化不依赖 renderer 存活，是更可靠的方案。`ai` SDK 的 `generateId` 已验证在 Node.js 可用，`DynamicToolUIPart` 只是类型定义，无运行时依赖。

### 决策 2：持久化原始 UIMessage，不持久化原始 SessionEvent

**选择**：main 进程组装完成后持久化 `UIMessage`（与 `session-store` 格式完全一致），而不是持久化原始 `SessionEvent` 流。

**备选方案**：持久化原始 `SessionEvent`，renderer 重新打开时回放组装。

**理由**：`UIMessage` 格式已有完整的读写基础设施（`appendMessage` / `loadMessages`），renderer 读取后可直接渲染，无需再次组装。原始事件回放需要 renderer 侧额外的回放逻辑，增加复杂度。

### 决策 3：持久化目录在现有 projects/<encoded>/ 下新增 apply-runs/

**选择**：

```
data/projects/<encoded>/
├── sessions/          ← 现有 chat session（不动）
└── apply-runs/
    └── <changeId>/
        ├── run.json                   ← ApplyRunMeta
        └── stage-0.messages.jsonl    ← UIMessage JSONL（复用 appendMessage 格式）
```

**理由**：与现有 `session-store` 路径规则一致（同一 `encodeProjectPath` 函数），隔离 apply-runs 与 chat sessions，避免混淆。每个 changeId 只保留最新一次 run（覆盖写），简化管理。

### 决策 4：stage 类型分发使用策略 Map

**选择**：

```ts
// electron/main/ipc/proposal-apply/stage-runners.ts
type StageRunner = (ctx: StageRunnerContext) => string; // 返回 prompt

const stageRunners: Partial<Record<WorkflowStageType, StageRunner>> = {
  "proposal-apply": ({ changeId }) => `加载 skill fyllo-apply-change，实现 ${changeId}`,
};

export function buildStagePrompt(ctx: StageRunnerContext): string {
  const runner = stageRunners[ctx.stage.type];
  if (!runner) throw new Error(`Stage type "${ctx.stage.type}" not yet implemented`);
  return runner(ctx);
}
```

**理由**：比 switch-case 更易扩展，新增 type 只需在 Map 里加一条记录，不需要修改分发逻辑。

### 决策 5：多 stage 由 renderer 驱动串行推进

**选择**：renderer 在当前 stage `done` 后，自动发起下一个 `stageStream`，直到所有 stage 完成。

**备选方案**：main 进程自动串行执行所有 stage，通过 push event 通知 renderer 进度。

**理由**：renderer 驱动更灵活，未来可在 stage 之间插入用户确认、暂停、跳过等交互，而不需要修改 main 进程逻辑。

### 决策 6：apply 始终新建 run，不续跑

**选择**：每次点击"开始实现"都创建新的 `runId`，覆盖旧的 `run.json`。`resumeRun` 只读取历史，不触发新 stream。

**理由**：语义清晰，避免"续跑"与"重新跑"的歧义。断点续跑涉及 ACP session 恢复、消息去重等复杂问题，留给后续 proposal 处理。

## Risks / Trade-offs

**[风险] main 进程引入 `ai` SDK** → 已验证 `generateId` 在 Node.js 可用；`DynamicToolUIPart` 仅为类型，无运行时代码。如遇问题，可用 `nanoid` 替换 `generateId`，类型定义可本地复制。

**[风险] stage 完成时一次性写入所有 UIMessage** → 如果 stage 运行时间很长（数十分钟），中途崩溃会丢失所有消息。缓解：未来可改为每条 `text_delta` 完成后增量 append，但当前阶段接受这个限制。

**[Trade-off] 每个 changeId 只保留最新一次 run** → 历史 run 会被覆盖，无法查看多次 apply 的历史对比。当前阶段可接受，未来可按 runId 分目录存储。

**[Trade-off] 恢复后不自动续跑** → 用户关闭窗口再打开，只能看到历史日志，需要手动重新触发。这是有意为之，避免自动续跑带来的意外行为。

## Data Structures

### ApplyRunMeta（新增，存于 run.json）

```ts
interface ApplyRunMeta {
  runId: string; // 唯一标识，格式 "run-{timestamp}"
  changeId: string; // 对应的 change 目录名
  workflowId: string; // 使用的 workflow id
  stages: WorkflowStage[]; // workflow 的 stage 列表（快照）
  currentStageIndex: number; // 当前执行到第几个 stage（0-based）
  stageAcpSessionIds: Record<number, string>; // stageIndex → acpSessionId（用于未来续跑）
  status: "running" | "done" | "error";
  startedAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}
```

### IPC Channels（新增）

```ts
// shared/types/channels.ts 新增到 ProposalChannels
apply: "proposal:apply",
stageStream: "proposal:stageStream",
stageStreamPort: "proposal:stageStream:port",
stageStreamCancel: "proposal:stageStream:cancel",
loadRun: "proposal:loadRun",
loadRunMessages: "proposal:loadRunMessages",
```

### proposal:apply 请求/响应

```ts
// 请求
{ projectId: string; changeId: string; workflowId: string }

// 响应（IpcResponse 包装）
{ runId: string; stages: WorkflowStage[] }
```

### proposal:stageStream 请求

```ts
{
  runId: string;
  stageIndex: number;
  projectId: string;
  changeId: string;
}
// agentId 从 stages[stageIndex].agent 读取，无则使用 workflow 默认 agent
// prompt 由 main 进程根据 stage.type 通过 stageRunners 构造
```

### proposal:loadRun 请求/响应

```ts
// 请求
{
  projectId: string;
  changeId: string;
}

// 响应（IpcResponse 包装）
ApplyRunMeta | null;
```

### proposal:loadRunMessages 请求/响应

```ts
// 请求
{
  projectId: string;
  changeId: string;
  stageIndex: number;
}

// 响应（IpcResponse 包装）
UIMessage < MessageMeta > [];
```

## File Layout

```
electron/main/
├── chat-agent/
│   └── message-assembler.ts          ← 新增：main 进程 UIMessage 组装器
├── ipc/
│   ├── proposal.ts                   ← 现有，不修改
│   └── proposal-apply.ts             ← 新增：apply 相关 IPC handlers
│       └── stage-runners.ts          ← 新增（可内联到 proposal-apply.ts）

shared/types/
├── channels.ts                       ← 修改：ProposalChannels 新增 5 个 channel
└── proposal.ts                       ← 修改：新增 ApplyRunMeta 类型

electron/preload/
├── api/proposal.ts                   ← 修改：新增 apply/stageStream/loadRun/loadRunMessages API
└── index.d.ts                        ← 无需修改（类型从 api/proposal.ts 自动推导）

frontend/src/
├── stores/proposal-run.ts            ← 新增：useProposalRunStore
├── components/proposal/
│   ├── ProposalDetailHeader.vue      ← 新增：顶部 header 区域
│   ├── ProposalMarkdownContent.vue   ← 新增：tabs + markdown 渲染区域
│   └── ProposalApplySidePanel.vue    ← 新增：右侧 apply 执行面板
└── pages/proposal/[id].vue           ← 修改：精简为布局骨架 + 数据协调
```

### 前端组件职责划分

**`[id].vue`（修改后约 80 行）**

保留内容：

- 路由参数解析（`changeId` computed）
- `onMounted` 数据加载（`ensureProposalLoaded`、`loadMarkdownFiles`、`workflowStore.fetchTemplates`、`resumeRun` 恢复逻辑）
- 跨组件共享状态：`sidePanelOpen`、`tabs`、`loadingFiles`、`fileError`、`activeTab`
- 布局骨架：左右两栏 flex 容器，左侧放 Header + Content，右侧放 SidePanel
- 引入 `useProposalRunStore`，将 store 实例和 `changeId` 作为 props 传给子组件

移除内容：所有 Header、Markdown、SidePanel 的具体 template 和相关 script 逻辑，下沉到子组件。

---

**`ProposalDetailHeader.vue`**

Props：

- `proposal: ProposalMeta | null`
- `changeId: string`
- `workflowMenuItems: DropdownMenuItem[][]`（由父组件计算后传入）
- `workflowStoreLoading: boolean`
- `runMeta: ApplyRunMeta | null`（用于 applying 状态栏）
- `isStreaming: boolean`

Emits：

- `back`：点击返回按钮
- `open-side-panel`：点击 applying 状态栏

包含内容：

- 返回按钮
- 标题 + 状态 badge（`statusConfig` 定义在此组件内）
- "开始实现" `UDropdownMenu`（`v-if="proposal.status === 'draft'"`）
- applying 状态栏（`v-if="isApplying && runMeta"`，点击触发 `open-side-panel` emit）

---

**`ProposalMarkdownContent.vue`**

Props：

- `tabs: MarkdownTab[]`
- `loading: boolean`
- `error: string | null`
- `modelValue: MarkdownTabValue`（当前激活 tab，v-model）

Emits：

- `update:modelValue`

包含内容：

- `UTabs` tab 切换
- loading 状态（spinner）
- error 状态（error box）
- 空态（无文件提示）
- `ChatComark` markdown 渲染

---

**`ProposalApplySidePanel.vue`**

Props：

- `runMeta: ApplyRunMeta | null`
- `messages: UIMessage<MessageMeta>[]`
- `isStreaming: boolean`

Emits：

- `close`：点击关闭按钮

包含内容：

- Panel header（workflow 名称、stage 计数、关闭按钮）
- Stage 进度条（已完成 / 当前 / 待执行 三态样式）
- 消息流区域：遍历 `messages`，按 `UIMessage` 的 parts 渲染：
  - `text` part → `ChatComark` 渲染 markdown
  - `dynamic-tool` part（`state: "input-available"`）→ 工具调用中状态（工具名 + spinner）
  - `dynamic-tool` part（`state: "output-available"`）→ 工具调用完成状态（工具名 + 结果摘要）
- 底部 streaming 指示器（`isStreaming` 时显示"正在执行..."+ spinner）

## Sequence: 完整执行流程

```
[id].vue                    useProposalRunStore         IPC Main (proposal-apply.ts)    AcpSession
   │                               │                            │                           │
   │ 点击"开始实现"，选 workflow    │                            │                           │
   │──startRun(projectId,          │                            │                           │
   │   changeId, workflowId)──────▶│                            │                           │
   │                               │──proposal:apply ──────────▶│                           │
   │                               │                            │ 1. 找 WorkflowTemplate     │
   │                               │                            │ 2. 写 .openspec.yaml       │
   │                               │                            │    status=applying         │
   │                               │                            │ 3. 生成 runId              │
   │                               │                            │ 4. 写 run.json             │
   │                               │◀── {runId, stages} ───────│                           │
   │                               │                            │                           │
   │                               │──proposal:stageStream ────▶│                           │
   │                               │  {runId, stageIndex=0,     │ buildStagePrompt()        │
   │                               │   projectId, changeId}     │ new AcpSession(agentId)   │
   │                               │                            │──────────────────────────▶│
   │                               │◀── MessagePort ────────────│                           │
   │                               │                            │                           │
   │                               │ port.send("ready")         │                           │
   │                               │───────────────────────────▶│ session.start(prompt)     │
   │                               │                            │──────────────────────────▶│
   │                               │                            │                           │
   │                               │◀── chunk events ───────────┼───────────────────────────│
   │                               │  (text_delta,              │ MessageAssembler.apply(ev)│
   │                               │   tool_call_start/update)  │ （main 进程组装 UIMessage）│
   │◀── messages 更新 ─────────────│                            │                           │
   │  SidePanel 实时渲染            │                            │                           │
   │                               │                            │                           │
   │                               │◀── done ───────────────────┼───────────────────────────│
   │                               │                            │ appendMessage(stage-0)    │
   │                               │                            │ 写 stage-0.messages.jsonl │
   │                               │                            │ 更新 run.json             │
   │                               │                            │                           │
   │                               │ [有下一个 stage?]           │                           │
   │                               │ → 重复 stageStream(1)      │                           │
   │                               │ [全部完成]                  │                           │
   │                               │ → run.status = "done"      │                           │

--- 用户关闭窗口再打开 ---

[id].vue onMounted              useProposalRunStore         IPC Main
   │                               │                            │
   │ proposal.status==="applying"  │                            │
   │──resumeRun(projectId,         │                            │
   │   changeId)──────────────────▶│                            │
   │                               │──proposal:loadRun ────────▶│
   │                               │◀── ApplyRunMeta ───────────│
   │                               │──proposal:loadRunMessages ▶│
   │                               │  {stageIndex: currentIdx}  │ 读 stage-N.messages.jsonl │
   │                               │◀── UIMessage[] ────────────│                           │
   │◀── 历史消息展示 ───────────────│                            │                           │
   │  SidePanel 展示历史日志        │                            │                           │
   │  （不自动续跑）                │                            │                           │
```

## Open Questions

- 无。所有关键决策已在探索阶段与用户确认。
