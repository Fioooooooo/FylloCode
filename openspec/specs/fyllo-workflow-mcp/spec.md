# fyllo-workflow-mcp Specification

## Purpose

定义 Phase 1 `fyllo-workflow` bundled MCP server 与主进程的调用边界：Agent 通过 HTTP-only MCP 查询和触发 Workspace workflow，Host 以 server-neutral RPC 转发到 WorkflowEngine，并以 trusted caller、Workspace descriptor 和最小权限 allowlist 阻止递归或越权执行。

## Requirements

### Requirement: fyllo-workflow is an explicit HTTP-only bundled server with two tools

系统 SHALL 在 bundled MCP 显式 registry 和构建 registry 中注册 `fyllo-workflow`，transport policy SHALL 为 `http-only`；未通过 HTTP transport 时 SHALL 失败且不得回退到 stdio。server SHALL 只注册 `list_workflows` 与 `trigger_workflow` 两个 Phase 1 tool，并通过 Node child-process IPC RPC 调用 Main WorkflowEngine，不在 MCP 子进程执行 workflow、读取 Run snapshot 或计算 parent identity。

#### Scenario: Chat Agent 查询当前 Workspace workflow

- **WHEN** trusted Chat Agent 调用 `list_workflows({})`
- **THEN** server SHALL 通过 RPC 请求 Main 读取当前 Workspace 正式 workflow 目录
- **AND** 返回项 SHALL 至少包含 workflowId、name 和可选 description
- **AND** 结果 SHALL 反映调用时最新保存的 definition，而不是启动时静态缓存

#### Scenario: Chat Agent 触发 workflow

- **WHEN** trusted Chat Agent 调用 `trigger_workflow({workflowId})`
- **THEN** RPC request SHALL 只携带 workflowId 和 Host 注入的 trusted context
- **AND** accepted SHALL 返回 status、runId 和 running/awaiting_start_confirmation runStatus
- **AND** tool SHALL 表示 Run 已接受，不得假装 stage 已完成

#### Scenario: MCP server 被要求走 stdio

- **WHEN** `FYLLO_MCP_TRANSPORT` 不是 HTTP 或缺少 Host HTTP context
- **THEN** server SHALL 拒绝启动或请求
- **AND** SHALL NOT 创建没有 trusted Workspace/caller context 的 Run

### Requirement: RPC uses trusted caller context and stable rejection results

Workflow RPC handler SHALL 从 bundled MCP Host 的 trusted context 获取 workspaceId、parent session identity、caller owner 和授权 Workspace descriptor。`trigger_workflow` input SHALL NOT 接受 caller 自报的 parentSessionId、workspace path、target path 或 definition YAML。

当 workflow 不存在、同一 parent 已有 active Run、definition 不支持 Phase 1 或 caller owner 非 chat 时，server SHALL 返回结构化 `status: "rejected"` result。错误至少区分 `WORKFLOW_NOT_FOUND`、`WORKFLOW_RUN_CONFLICT`、`WORKFLOW_CONTEXT_UNSUPPORTED`、`WORKFLOW_FEATURE_NOT_IMPLEMENTED` 和 `WORKFLOW_INVALID_CALLER`；preflight/owner rejection SHALL 发生在任何 ACP/Action 副作用之前。

#### Scenario: Caller 试图自报 parent session 或目标

- **WHEN** tool input 包含 parentSessionId、workspacePath 或其他 caller-owned target 字段
- **THEN** schema SHALL 拒绝额外字段
- **AND** handler SHALL 使用 Host trusted context
- **AND** SHALL 不因自报值创建或访问另一个 parent 的 Run

#### Scenario: Workflow 不存在或 preflight 失败

- **WHEN** trigger 使用不存在 workflowId 或对应 definition 超出 Phase 1 capability
- **THEN** server SHALL 返回 status rejected 和对应 code/message/stage/feature refs
- **AND** SHALL NOT 返回 runId、创建 Run 或启动执行资源

#### Scenario: 非 Chat caller 触发 workflow

- **WHEN** trusted caller owner 为 workflow、spawned 或 unknown
- **THEN** handler SHALL 返回 `WORKFLOW_INVALID_CALLER`
- **AND** message SHALL 包含 caller 类型或定位信息
- **AND** Main SHALL 记录 warn 且 SHALL NOT 创建 Run

### Requirement: Bundled MCP Host dispatches server-neutral envelopes through per-server codecs

bundled MCP Host SHALL 使用与具体 server 无关的 request/response envelope、requestId 关联和生命周期管理。每个 server SHALL 注册自己的 codec、protocol/version/schema 和 RPC handler；`fyllo-spawn` SHALL 继续使用既有 codec/error semantics，`fyllo-workflow` SHALL 使用独立 protocol/schema。系统 SHALL NOT 复制 host/proxy/token/backend lifecycle 或以 `FylloSpawnRpcRequest` alias 承载第二套 host。

#### Scenario: fyllo-spawn RPC remains compatible

- **WHEN** fyllo-spawn 通过改造后的 Host 发出既有 RPC request
- **THEN** Host SHALL 使用其既有 codec 返回兼容 response/error
- **AND** spawn parent、owner、Workspace authorization 和 process lifecycle SHALL 保持不变

#### Scenario: fyllo-workflow RPC uses its own codec

- **WHEN** fyllo-workflow 发出 list/trigger RPC
- **THEN** Host SHALL 按 server name 选择 workflow codec/handler
- **AND** requestId、断连和进程停止 SHALL 复用通用生命周期
- **AND** workflow RPC SHALL 不被解析为 fyllo-spawn request

#### Scenario: Host shutdown is bounded

- **WHEN** 应用进入 shutdown fence
- **THEN** Host SHALL 停止接受新的 workflow/spawn RPC
- **AND** workflow server 与既有 bundled server process SHALL 由登记的 shutdown/force hooks 有界停止
- **AND** SHALL NOT 遗留未登记的 MCP child process

### Requirement: Workflow fresh sessions receive a fixed minimal bundled MCP allowlist

创建 `AgentStage(context: fresh)` 的 ACP activation 时，workflow runner SHALL 显式将 MCP server allowlist 固定为 `["fyllo-specs", "fyllo-cortex"]`。ACP server 列表和 access grant allowlist SHALL 同时只包含这两个 server；`fyllo-spawn` 与 `fyllo-workflow` SHALL 被排除。普通 Chat session 的既有 activation 仍可获得 fyllo-workflow 以触发 Run。

#### Scenario: Fresh Agent receives only the minimal allowlist

- **WHEN** workflow runner 创建 fresh Agent ACP session
- **THEN** Agent 可用列表、ACP activation 和 grant SHALL 只包含 fyllo-specs/fyllo-cortex
- **AND** SHALL 不包含 fyllo-spawn 或 fyllo-workflow

#### Scenario: Fresh Agent cannot recursively trigger

- **WHEN** workflow-owned caller 请求 fyllo-workflow trigger
- **THEN** handler SHALL 返回 `WORKFLOW_INVALID_CALLER`
- **AND** SHALL 不创建递归 Run、不调用 SpawnedSessionManager、不启动新的 ACP session

#### Scenario: Ordinary Chat caller remains enabled

- **WHEN** 普通 Chat session 使用正常 bundled MCP activation 调用 fyllo-workflow
- **THEN** handler SHALL 继续执行 trusted caller、preflight、并发检查和 Run 创建
- **AND** fresh session allowlist SHALL 不限制普通 Chat activation

### Requirement: fyllo-workflow SHALL be an explicit HTTP-only bundled server with two tools

系统 SHALL 在 bundled MCP 显式 registry 和构建 registry 中注册 `fyllo-workflow`，其 transport policy SHALL 为 `http-only`，未通过 HTTP transport 时 SHALL 失败且不得回退到 stdio。server SHALL 只注册 `list_workflows` 与 `trigger_workflow` 两个 Phase 1 tool，并 SHALL 通过 Node child_process IPC RPC 调用 Main WorkflowEngine，不在 MCP 子进程内执行 workflow、读取 Run snapshot 或计算 parent identity。

#### Scenario: Chat Agent 查询当前 Workspace workflow

- **WHEN** trusted Chat Agent 调用 `list_workflows({})`
- **THEN** server SHALL 通过 RPC 请求 Main 读取当前 Workspace 正式 workflow 目录
- **AND** 返回项 SHALL 至少包含 `workflowId`、`name` 和可选 `description`
- **AND** 结果 SHALL 反映调用时最新保存的 definition，而不是启动时静态缓存

#### Scenario: Chat Agent 触发 workflow

- **WHEN** trusted Chat Agent 调用 `trigger_workflow({workflowId})`
- **THEN** RPC request SHALL 只携带 workflowId 和由 Host 注入的 trusted caller/context
- **AND** accepted 结果 SHALL 返回 `status: "accepted"`、runId 和 `running` 或 `awaiting_start_confirmation` runStatus
- **AND** tool 返回 SHALL 表示 Run 已接受，不得假装 stage 已经执行完成

#### Scenario: MCP server 被要求走 stdio

- **WHEN** `FYLLO_MCP_TRANSPORT` 不是 HTTP 或缺少 Host HTTP context
- **THEN** fyllo-workflow server SHALL 拒绝启动或请求
- **AND** SHALL NOT 创建没有 trusted Workspace/caller context 的 Run

### Requirement: fyllo-workflow RPC SHALL use trusted caller context and stable rejection results

Workflow RPC handler SHALL 从 bundled MCP Host 提供的 trusted caller context 获取 `workspaceId`、parent session identity、caller owner 和授权 Workspace descriptor。`trigger_workflow` input SHALL NOT 接受 caller 自报的 `parentSessionId`、workspace path、target path 或 definition YAML。

当 workflow 不存在、同一 parent 已有 active Run、definition 不支持 Phase 1 或 caller owner 非 `chat` 时，server SHALL 返回结构化 `status: "rejected"` result。错误至少能区分 `WORKFLOW_NOT_FOUND`、`WORKFLOW_RUN_CONFLICT`、`WORKFLOW_CONTEXT_UNSUPPORTED`、`WORKFLOW_FEATURE_NOT_IMPLEMENTED` 和 `WORKFLOW_INVALID_CALLER`；preflight/owner rejection SHALL 在任何 ACP/Action 副作用前发生。

#### Scenario: Caller 试图自报 parent session

- **WHEN** tool input 包含 parentSessionId、workspacePath 或其他 caller-owned target 字段
- **THEN** schema SHALL 拒绝额外或不受信任的字段
- **AND** handler SHALL 使用 Host trusted context 的 parent identity
- **AND** SHALL 不因 caller 自报值创建或访问另一个 parent 的 Run

#### Scenario: Workflow 不存在

- **WHEN** Chat Agent 使用不存在的 workflowId 调用 trigger
- **THEN** server SHALL 返回 `status: "rejected"` 和 `reason.code: "WORKFLOW_NOT_FOUND"`
- **AND** SHALL NOT 创建 Run 或启动任何执行资源

#### Scenario: Definition preflight 失败

- **WHEN** workflowId 对应定义包含 Phase 1 不支持的 stage/capability
- **THEN** server SHALL 返回带有 code、message 和 stage/feature 定位的 rejected reason
- **AND** SHALL NOT 返回 runId
- **AND** SHALL NOT 让已执行的部分 stage 留下副作用

#### Scenario: 非 Chat caller 触发 workflow

- **WHEN** trusted caller owner 为 workflow、spawned 或 unknown
- **THEN** handler SHALL 返回 `status: "rejected"`
- **AND** `reason.code` SHALL 为 `WORKFLOW_INVALID_CALLER`
- **AND** message SHALL 包含 caller 类型或定位信息
- **AND** Main SHALL 记录 warn 且 SHALL NOT 创建 Run

### Requirement: Bundled MCP Host SHALL dispatch server-neutral envelopes through per-server codecs

bundled MCP Host SHALL 使用与具体 server 无关的 request/response envelope、requestId 关联和生命周期管理。每个 bundled server SHALL 注册自己的 codec、protocol/version/schema 和 RPC handler；`fyllo-spawn` SHALL 继续使用既有 codec 和错误语义，`fyllo-workflow` SHALL 使用独立的 protocol/schema。系统 SHALL NOT 通过复制 host/proxy/token/backend lifecycle 或为 `FylloSpawnRpcRequest` 增加别名实现第二套 host。

#### Scenario: fyllo-spawn RPC 回归

- **WHEN** fyllo-spawn 通过改造后的 Host 发出既有 RPC request
- **THEN** Host SHALL 使用其既有 codec 编解码并返回兼容 response/error
- **AND** spawn parent、owner、Workspace authorization 和 process lifecycle 语义 SHALL 保持不变

#### Scenario: fyllo-workflow RPC 注册

- **WHEN** fyllo-workflow server 启动并发出 list/trigger RPC
- **THEN** Host SHALL 按 server name 选择 workflow codec/handler
- **AND** requestId、超时/断连和进程停止 SHALL 复用 Host 的通用生命周期
- **AND** workflow RPC SHALL 不被错误解析为 fyllo-spawn request

#### Scenario: Host shutdown

- **WHEN** 应用进入 shutdown fence
- **THEN** Host SHALL 停止接受新的 workflow/spawn RPC
- **AND** workflow server process 与既有 bundled server process SHALL 由同一登记的 shutdown/force hooks 有界停止
- **AND** 不得遗留未登记的 MCP child process

### Requirement: Workflow fresh sessions SHALL receive a fixed minimal bundled MCP allowlist

创建 `AgentStage(context: fresh)` 的 ACP activation 时，workflow runner SHALL 显式将 MCP server allowlist 固定为 `["fyllo-specs", "fyllo-cortex"]`。ACP server 列表和 access grant allowlist SHALL 同时只包含这两个 server；`fyllo-spawn` 与 `fyllo-workflow` SHALL 被排除。普通 Chat session 的既有 activation 仍可获得 fyllo-workflow 以触发 Run。

#### Scenario: Fresh Agent 查看 MCP server

- **WHEN** workflow runner 为 fresh Agent 创建 ACP session
- **THEN** Agent 可用列表 SHALL 包含 fyllo-specs 和 fyllo-cortex
- **AND** SHALL 不包含 fyllo-spawn 或 fyllo-workflow
- **AND** allowlist 与 grant 的集合 SHALL 一致

#### Scenario: Fresh Agent 尝试递归触发

- **WHEN** 因 activation bug 或伪造 RPC，workflow-owned caller 请求 fyllo-workflow trigger
- **THEN** handler SHALL 按 `WORKFLOW_INVALID_CALLER` 拒绝
- **AND** SHALL 不创建递归 Run、不调用 SpawnedSessionManager、不启动新的 ACP session

#### Scenario: 普通 Chat caller 保持可用

- **WHEN** 普通 Chat session 使用其正常 bundled MCP activation 调用 fyllo-workflow
- **THEN** handler SHALL 继续使用 trusted Chat caller 的预检、并发检查和 Run 创建流程
- **AND** fresh session 的最小 allowlist 规则 SHALL NOT 限制普通 Chat activation

## Implementation mapping

- Registry, allowlist and host transport：`src/main/infra/mcp/bundled-mcp-registry.ts`、`bundled-mcp-servers.ts`、`bundled-mcp-host.ts`、`src/main/services/session/chat/session-runtime-profile.ts`。
- Main bridge and unique engine integration：`src/main/services/automation/workflow/workflow-rpc-bridge.ts`、`workflow-engine.ts`。
- MCP server/RPC contract：`src/mcp-servers/fyllo-workflow/**`。
- Build/distribution：`scripts/build-mcp-servers.mjs` and `test/main/packaging/**`。
- Acceptance tests：`test/main/infra/mcp/bundled-mcp-host.spec.ts`、`bundled-mcp-registry.spec.ts`、`bundled-mcp-servers.test.ts`、`test/main/services/automation/workflow/workflow-rpc-bridge.spec.ts`、`test/mcp-servers/fyllo-workflow/**`。
