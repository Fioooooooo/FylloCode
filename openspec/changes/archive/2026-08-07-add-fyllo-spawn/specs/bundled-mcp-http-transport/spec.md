## MODIFIED Requirements

### Requirement: ACP session 前执行共享 readiness 分流

系统 SHALL 在 required gate 通过后后台启动 bundled MCP host，且 SHALL 在不阻塞正式 renderer navigation 或 interactive readiness 的前提下，于 `fyllocode` Chat/probe 的 ACP `newSession` 前等待共享的 bundled MCP 首次 readiness 结果，并按 Agent 能力、单个后端状态与 server transport policy 选择 transport。每个 `BundledMcpServerRegistration` SHALL 声明或继承 `http-or-stdio | http-only` policy；`http-only` server 无法使用 HTTP 时 SHALL 从该 activation 省略，而 `http-or-stdio` server SHALL 保持现有 stdio fallback。`native` Chat/probe SHALL 跳过该 readiness 等待并向 ACP lifecycle 传递空 bundled MCP spec 列表；该会话级选择 SHALL NOT 停止或重启应用级 host。

#### Scenario: Startup shell 正在承载 required gate

- **WHEN** application startup shell 已可见但 required migration/cutover gate 尚未通过
- **THEN** 主进程 SHALL NOT 启动 bundled MCP proxy 或 backend
- **AND** startup shell SHALL NOT 等待或展示 bundled MCP readiness

#### Scenario: Renderer 在 MCP 后端启动期间加载

- **WHEN** required gate 已通过且主进程已开始启动 bundled MCP host 但后端尚未 ready
- **THEN** 主进程 SHALL 继续注册 IPC、接管 startup window 并导航正式 renderer
- **AND** renderer SHALL NOT 因 bundled MCP readiness 保持全局启动阻塞

#### Scenario: 首个 FylloCode probe 与 chat 并发

- **WHEN** 首个 `fyllocode` probe 和正常 `fyllocode` chat 在 bundled MCP 首次启动期间并发准备 ACP session
- **THEN** 两者 SHALL 共享同一个 startup promise
- **AND** 两者 SHALL 在各自调用 ACP `newSession` 前等待该 promise 结算
- **AND** 系统 SHALL NOT 因并发等待重复启动 host 或后端

#### Scenario: 后端在首次等待内 ready

- **WHEN** `fyllocode` activation 的 Agent 声明 `mcpCapabilities.http: true`
- **AND** proxy 与目标后端在首次 readiness 超时前 ready
- **THEN** 新 ACP session SHALL 获得该 server 的 HTTP spec、稳定 proxy URL 与必要 headers

#### Scenario: 允许 fallback 的 server 无法使用 HTTP

- **WHEN** `fyllocode` activation 的 Agent 未声明 HTTP MCP 能力，或一个 `http-or-stdio` 后端在首次 readiness 等待内不可用
- **THEN** 新 ACP session SHALL 对该 server 使用现有 stdio spec
- **AND** 其他已 ready server SHALL 仍可在同一个 `newSession` 中使用 HTTP spec

#### Scenario: HTTP-only server 无法使用 HTTP

- **WHEN** `fyllocode` activation 的 Agent 未声明 HTTP MCP 能力，或一个 `http-only` 后端在首次 readiness 等待内不可用
- **THEN** 新 ACP session SHALL 从 bundled MCP spec 列表省略该 server
- **AND** SHALL NOT 为该 server 生成 stdio spec
- **AND** 其他 server SHALL 继续按各自 transport policy 独立选择 transport

#### Scenario: Native activation 跳过 readiness

- **WHEN** `native` Chat 或 probe 准备 `newSession`、`resumeSession` 或 `loadSession`
- **THEN** Main SHALL NOT 为该 activation 调用 bundled MCP readiness 等待
- **AND** lifecycle request 的 bundled MCP spec 列表 SHALL 为空
- **AND** 应用级 host 的当前运行状态 SHALL 保持不变

### Requirement: bundled MCP 保持 stdio 兼容

系统 SHALL 为 transport policy 为 `http-or-stdio` 的 bundled MCP 保留 stdio transport，以支持不具备 HTTP 能力的 ACP Agent 和单个 backend 不可用时的 fallback；policy 为 `http-only` 的 server SHALL NOT 生成 stdio spec。允许 stdio 的 server SHALL 使用当前 activation 的 Workspace v2 descriptor 与独立 child 生命周期，tool 业务输入输出保持不变，但不再兼容 Project path env/request context。

#### Scenario: stdio fallback

- **WHEN** HTTP host 级启动失败、Agent 不支持 HTTP 或单个 `http-or-stdio` backend 不可用
- **THEN** 系统 SHALL 为该 activation 生成该 server 的 stdio command、args 与 env
- **AND** env SHALL 使用 `FYLLO_WORKSPACE_JSON` 传递与 HTTP grant 相同的 immutable descriptor
- **AND** SHALL NOT 发送 legacy Project path/data/event/session env
- **AND** bundled MCP tool SHALL 使用 shared Workspace resolver 解析作用域

#### Scenario: HTTP-only server 不退化为 stdio

- **WHEN** fyllo-spawn 或其他 `http-only` server 无法取得可用 HTTP transport
- **THEN** 系统 SHALL 从该 activation 省略该 server
- **AND** SHALL NOT 为该 server 创建 stdio child 或注入 legacy env

#### Scenario: stdio child 不跨 activation 复用

- **WHEN** 两个 ACP activation 均使用同一个允许 stdio fallback 的 bundled MCP server
- **THEN** Agent runtime SHALL 为它们启动不同 child 并分别注入各自 descriptor
- **AND** 任一 child SHALL NOT 处理另一个 activation 的 tool calls

#### Scenario: 完全禁用 bundled MCP

- **WHEN** 设置 `FYLLO_DISABLE_BUNDLED_MCP=1`
- **THEN** 主进程 SHALL NOT 启动 proxy 或 bundled MCP HTTP 子进程
- **AND** ACP lifecycle request SHALL 收到空的 bundled MCP spec 列表
