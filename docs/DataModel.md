# 数据模型

所有共享类型定义在 `shared/types/`，主进程和渲染进程均可导入，路径别名 `@shared/types/*`。

## IPC 通用类型（`ipc.ts`）

```ts
// 所有 handle channel 的统一响应格式
type IpcResponse<T> = { ok: true; data: T } | { ok: false; error: IpcErrorInfo };

// 流式消息（通过 MessagePort 传输）
type StreamMessage<T> =
  | { type: "chunk"; data: T }
  | { type: "done"; data: { totalTokens: number } }
  | { type: "error"; data: IpcErrorInfo };

interface StreamChunkData {
  content: string;
  tokenCount: number;
}

// 事件推送消息（ipcRenderer.on 订阅）
interface EventMessage<T> {
  type: string;
  payload: T;
}
```

## Chat（`chat.ts`）

**核心实体：**

```ts
interface Session {
  id: string;
  projectId: string;
  title: string;
  status: "running" | "ended";
  turnCount: number;
  createdAt: Date;
  updatedAt: Date;
  messages: Message[];
  fileChanges: FileChange[];
}
```

**消息类型（判别联合）：**

| type       | 额外字段                                        | 说明           |
| ---------- | ----------------------------------------------- | -------------- |
| `user`     | `content`, `attachments?`                       | 用户输入       |
| `thinking` | `summary`, `content`                            | Agent 思考过程 |
| `text`     | `content`                                       | Agent 文本回复 |
| `file-op`  | `operations: FileChange[]`                      | 文件变更操作   |
| `command`  | `command`, `output`, `success`                  | 执行命令       |
| `confirm`  | `description`, `action`, `resolved`, `allowed?` | 需要用户确认   |

**文件变更：**

```ts
interface FileChange {
  filePath: string;
  changeType: "added" | "modified" | "deleted";
  summary: string; // 如 "+42 lines"
  diffLines: DiffLine[];
}

interface DiffLine {
  type: "added" | "removed" | "context";
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}
```

**其他类型：**

- `AgentType`: `"claude-code" | "codex"`
- `AgentStatus`: `"idle" | "thinking" | "executing" | "awaiting-confirmation"`
- `ModeType`: `"auto" | "manual"`
- `SidebarTab`: `"sessions" | "files"`
- `DiffViewMode`: `"side-by-side" | "inline"`

## Project（`project.ts`）

```ts
interface ProjectInfo {
  id;
  name;
  path;
  lastOpenedAt;
}
interface ProjectSummary extends ProjectInfo {
  agent: ProjectAgent;
}
interface ProjectAgent {
  id;
  name;
  type: "claude-code" | "codex";
}
type ProjectTemplate = "empty" | "git";
interface CreateProjectForm {
  name;
  path;
  template;
  gitUrl?;
}
```

## Workflow（`workflow.ts`）

**核心实体：**

```ts
type WorkflowStageType =
  | "proposal-apply"
  | "code-review"
  | "security-check"
  | "create-pr"
  | "custom";

interface WorkflowStage {
  id: string;
  name: string;
  type: WorkflowStageType;
  agent?: string;
  prompt?: string;
  when?: string;
  onFailure?: string;
  mcp?: string[];
  skills?: string[];
}

interface WorkflowTemplate {
  id: string;
  name: string;
  description?: string;
  version?: number;
  source: "built-in" | "custom";
  yaml: string;
  stages: WorkflowStage[];
}
```

**请求与响应：**

```ts
interface WorkflowSaveRequest {
  name: string;
  yaml: string;
  projectId?: string;
}

interface WorkflowListRequest {
  projectId?: string;
}

interface WorkflowListResult {
  templates: WorkflowTemplate[];
}

interface WorkflowDeleteRequest {
  name: string;
  projectId?: string;
}
```

## Proposal Apply Run（`proposal.ts`）

项目内 proposal apply 运行状态存放在：

```text
data/projects/<encodedProjectPath>/apply-runs/<changeId>/
├── run.json
├── stage-0.messages.jsonl
├── stage-N.messages.jsonl
├── archive.json
└── archive.messages.jsonl
```

`run.json` 保存 `ApplyRunMeta`；每个 `stage-{N}.messages.jsonl` 按追加顺序保存该 stage
的 `UIMessage<MessageMeta>`，新运行会先写入 stage user message，再追加 assistant message。

`archive.json` 保存独立的 `ArchiveRunMeta`：

```ts
interface ArchiveRunMeta {
  runId: string;
  changeId: string;
  status: "running" | "done" | "error";
  startedAt: string;
  updatedAt: string;
}
```

`archive.messages.jsonl` 保存 archive 流程的 user + assistant 消息，独立于 stage 消息文件。

## Integration（`integration.ts`）

```ts
type IntegrationCategoryId =
  | "project-management"
  | "source-control"
  | "ci-cd"
  | "deployment"
  | "communication"
  | "observability";

type ProviderConnectionState = "not-connected" | "connected" | "expired";

interface ProviderManifest {
  id;
  name;
  description;
  authType: "api-token" | "oauth";
  credentialFields: ProviderCredentialField[];
  capabilities: ProviderCapability[];
  logoIcon;
  logoColor;
  comingSoon: boolean;
}

interface ProviderConnection {
  providerId;
  state: "connected" | "expired";
  accountName?;
  accountId?;
  connectedAt?;
  credentialPreview?;
}

interface ProviderResource {
  id;
  name;
  providerId;
  resourceType;
  subtitle?;
}

interface ProjectIntegrationEntry {
  providerId;
  resourceType;
  resourceId;
}

type ProjectIntegrationConfig = Record<IntegrationCategoryId, ProjectIntegrationEntry[]>;
```

当前 manifest 允许存在多个 provider 条目，但当前真实可连接、可探测、可拉取资源的 provider 仅覆盖 `yunxiao`，对应：

- `projex-project`
- `codeup-repo`
- `flow-pipeline`

## Settings（`settings.ts`）

```ts
interface PreferencesConfig {
  theme: "light" | "dark" | "system";
  language: string;
  defaultAgentMode: "auto" | "manual";
  notificationMethods: ("system" | "sound" | "in-app")[];
  autoSaveSession: boolean;
  tokenStatsPeriod: "daily" | "weekly" | "monthly";
  budgetAlert: { value: number; unit: "tokens" | "usd" };
}

interface AgentInfo {
  id;
  name;
  description;
  installed;
  version?;
  docsUrl;
}
```
