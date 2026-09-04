## MODIFIED Requirements

### Requirement: fyllo-workflow SHALL be an explicit HTTP-only bundled server with two tools

系统 SHALL 在 bundled MCP 显式 registry 和构建 registry 中注册 `fyllo-workflow`，其 transport policy SHALL 为 `http-only`，未通过 HTTP transport 时 SHALL 失败且不得回退到 stdio。server SHALL 注册四个 tool：`list_workflows`、`trigger_workflow`（Phase 1）、`describe_workflow_schema`、`propose_workflow`（Phase 2）。全部四个 tool SHALL 通过同一套 Node child_process IPC RPC（`fyllo-workflow-rpc` 协议）调用 Main；`list_workflows`/`trigger_workflow` SHALL 路由到既有 WorkflowEngine，`describe_workflow_schema`/`propose_workflow` SHALL 路由到 Main 的 workflow proposal service。MCP 子进程 SHALL NOT 直接执行 workflow、读取 Run snapshot、读写 proposal 文件或计算 parent identity。

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

#### Scenario: Chat Agent 查询 workflow schema

- **WHEN** trusted Chat Agent 调用 `describe_workflow_schema({})`
- **THEN** server SHALL 通过同一 RPC 机制请求 Main 的 workflow proposal service
- **AND** SHALL 返回 schema 骨架文本
- **AND** 调用 SHALL NOT 产生任何持久化副作用

#### Scenario: Chat Agent 提交生成的 workflow

- **WHEN** trusted Chat Agent 调用 `propose_workflow({yaml, persist, mode, workflowId?})`
- **THEN** server SHALL 通过 RPC 请求 Main 的 workflow proposal service 执行校验与落盘
- **AND** 结果 SHALL 是 `status: "accepted"` 附带 `proposalId`，或 `status: "rejected"` 附带结构化 `errors`
- **AND** SHALL NOT 返回 `runId`

#### Scenario: MCP server 被要求走 stdio

- **WHEN** `FYLLO_MCP_TRANSPORT` 不是 HTTP 或缺少 Host HTTP context
- **THEN** fyllo-workflow server SHALL 拒绝启动或请求
- **AND** SHALL NOT 创建没有 trusted Workspace/caller context 的 Run 或 proposal

### Requirement: Bundled MCP Host SHALL dispatch server-neutral envelopes through per-server codecs

bundled MCP Host SHALL 使用与具体 server 无关的 request/response envelope、requestId 关联和生命周期管理。每个 bundled server SHALL 注册自己的 codec、protocol/version/schema 和 RPC handler；`fyllo-spawn` SHALL 继续使用既有 codec 和错误语义，`fyllo-workflow` SHALL 使用独立的 protocol/schema，且该 schema SHALL 覆盖 Phase 1 的 `list_workflows`/`trigger_workflow` 与 Phase 2 新增的 `describe_workflow_schema`/`propose_workflow` 四个 method。系统 SHALL NOT 通过复制 host/proxy/token/backend lifecycle 或为 `FylloSpawnRpcRequest` 增加别名实现第二套 host。

#### Scenario: fyllo-spawn RPC 回归

- **WHEN** fyllo-spawn 通过改造后的 Host 发出既有 RPC request
- **THEN** Host SHALL 使用其既有 codec 编解码并返回兼容 response/error
- **AND** spawn parent、owner、Workspace authorization 和 process lifecycle 语义 SHALL 保持不变

#### Scenario: fyllo-workflow RPC 注册四个 method

- **WHEN** fyllo-workflow server 启动并发出 list/trigger/describe/propose 四类 RPC 中的任意一种
- **THEN** Host SHALL 按 server name 与 method 选择 workflow codec/handler
- **AND** requestId、超时/断连和进程停止 SHALL 复用 Host 的通用生命周期
- **AND** workflow RPC SHALL 不被错误解析为 fyllo-spawn request

#### Scenario: Host shutdown

- **WHEN** 应用进入 shutdown fence
- **THEN** Host SHALL 停止接受新的 workflow/spawn RPC
- **AND** workflow server process 与既有 bundled server process SHALL 由同一登记的 shutdown/force hooks 有界停止
- **AND** 不得遗留未登记的 MCP child process
