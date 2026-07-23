## ADDED Requirements

### Requirement: 应用级托管 bundled MCP HTTP 后端

系统 SHALL 在一次应用运行期间由主进程为每个启用的 bundled MCP server 托管至多一个 HTTP 子进程，并 SHALL 使不同 ACP agent 与 session 共享这些子进程。

#### Scenario: 启动所有 bundled MCP 后端

- **WHEN** 应用启动且未设置 `FYLLO_DISABLE_BUNDLED_MCP=1`
- **THEN** 主进程 SHALL 为每个注册的 bundled MCP server 启动一个独立子进程
- **AND** 每个子进程 SHALL 仅监听由操作系统分配的 loopback 随机端口
- **AND** 子进程 SHALL 通过 IPC 向主进程报告其 ready 端口

#### Scenario: 多个 ACP session 使用共享后端

- **WHEN** 多个支持 HTTP MCP 的 ACP session 使用同一个 bundled MCP server
- **THEN** 系统 SHALL 向这些 session 提供同一个应用级 proxy endpoint
- **AND** 系统 SHALL NOT 因每个 ACP session 创建新的 bundled MCP HTTP 操作系统进程

### Requirement: 稳定代理路由随机后端端口

系统 SHALL 在主进程内提供一个应用生命周期内稳定的 loopback HTTP proxy，并 SHALL 按 bundled server name 将稳定路径映射到对应后端当前的随机端口。

#### Scenario: Agent 通过稳定代理访问后端

- **WHEN** agent 请求 `/mcp/<bundled-server-name>`
- **AND** 对应后端状态为 ready
- **THEN** proxy SHALL 将目标路径改写为 `/mcp`
- **AND** proxy SHALL 将请求流式转发到该 server 当前的 `127.0.0.1:<backendPort>`
- **AND** agent SHALL NOT 获得或依赖真实后端端口

#### Scenario: 后端重启并更换端口

- **WHEN** bundled MCP 子进程退出后在新随机端口重新 ready
- **THEN** 主进程 SHALL 先清除旧端口，再原子更新该 server name 对应的后端端口
- **AND** proxy 监听端口、proxy URL 与已有 ACP session 的 MCP 配置 SHALL 保持不变

#### Scenario: 代理路径或后端不可用

- **WHEN** proxy 收到未知 bundled server name
- **THEN** proxy SHALL 返回 404
- **AND WHEN** 已知 server 尚未 ready、正在重启或已失败
- **THEN** proxy SHALL 返回 503 和短 `Retry-After`
- **AND** proxy SHALL NOT 将请求转发到其他 bundled server

### Requirement: HTTP 后端使用应用级共享 token

系统 SHALL 为每次应用运行生成一个共享 bearer token，并 SHALL 使用该 token 鉴权所有 bundled MCP HTTP 请求。

#### Scenario: HTTP 子进程缺少 token

- **WHEN** bundled MCP 子进程以 HTTP 模式启动但缺少 `FYLLO_MCP_AUTH_TOKEN`
- **THEN** 子进程 SHALL 拒绝启动 HTTP listener

#### Scenario: HTTP 请求鉴权

- **WHEN** HTTP 请求缺少 bearer token 或 token 不精确匹配应用级共享 token
- **THEN** 后端 SHALL 返回 401
- **AND WHEN** agent 创建 HTTP MCP session
- **THEN** 主进程 SHALL 通过 ACP MCP spec header 提供该 bearer token

#### Scenario: 后端重启

- **WHEN** bundled MCP 后端重启
- **THEN** 系统 SHALL 复用本次应用运行的共享 token
- **AND** 系统 SHALL NOT 在日志或 renderer API 中暴露 token

### Requirement: HTTP 请求使用独立 server 实例与请求上下文

系统 SHALL 为每个 bundled MCP HTTP 请求创建独立的内存 `McpServer` 与 stateless transport 实例，并 SHALL 使用请求级上下文解析项目与会话信息。

#### Scenario: 并发 HTTP 请求

- **WHEN** 同一后端同时处理来自不同项目或 session 的多个请求
- **THEN** 每个请求 SHALL 使用独立的 `McpServer` 与 `StreamableHTTPServerTransport`
- **AND** 每个请求 SHALL 在自己的 `AsyncLocalStorage` context 中执行
- **AND** 请求完成后对应 server/transport SHALL 被关闭并可被垃圾回收

#### Scenario: 解码请求上下文

- **WHEN** 合法请求携带 base64url 编码的 `X-Fyllo-Project-Path`、`X-Fyllo-Project-Data-Dir` 及可选 context headers
- **THEN** 系统 SHALL 按 UTF-8 解码并向 tool handler 提供对应请求上下文
- **AND** tool handler SHALL NOT 通过修改进程环境变量切换请求上下文

#### Scenario: 请求上下文格式无效

- **WHEN** 请求缺少必填 project path/data dir header，或 context header 不是合法 base64url/UTF-8
- **THEN** 后端 SHALL 返回 400
- **AND** 后端 SHALL NOT 执行 MCP tool

### Requirement: ACP session 前执行共享 readiness 分流

系统 SHALL 在不阻塞 renderer 窗口加载的前提下，于 ACP `newSession` 前等待共享的 bundled MCP 首次 readiness 结果，并 SHALL 按 agent 能力和单个后端状态选择 transport。

#### Scenario: Renderer 在 MCP 后端启动期间加载

- **WHEN** 主进程已开始启动 bundled MCP host 但后端尚未 ready
- **THEN** 主进程 SHALL 继续注册 IPC 并打开 renderer window
- **AND** renderer SHALL NOT 因 bundled MCP readiness 显示全局启动阻塞

#### Scenario: 首个 probe 与 chat 并发

- **WHEN** 首个 probe 和正常 chat 在 bundled MCP 首次启动期间并发准备 ACP session
- **THEN** 两者 SHALL 共享同一个 startup promise
- **AND** 两者 SHALL 在各自调用 ACP `newSession` 前等待该 promise 结算
- **AND** 系统 SHALL NOT 因并发等待重复启动 host 或后端

#### Scenario: 后端在首次等待内 ready

- **WHEN** agent 声明 `mcpCapabilities.http: true`
- **AND** proxy 与目标后端在首次 readiness 超时前 ready
- **THEN** 新 ACP session SHALL 获得该 server 的 HTTP spec、稳定 proxy URL 与必要 headers

#### Scenario: 能力不支持或后端超时

- **WHEN** agent 未声明 HTTP MCP 能力，或单个目标后端在首次 readiness 等待内不可用
- **THEN** 新 ACP session SHALL 对该 server 使用现有 stdio spec
- **AND** 其他已 ready server SHALL 仍可在同一个 `newSession` 中使用 HTTP spec

### Requirement: HTTP host 可恢复且可安全关闭

系统 SHALL 对异常退出的 bundled MCP 后端进行有界重启，并 SHALL 通过主进程 lifecycle 幂等释放 proxy、timer 和子进程资源。每个由 host 通过 IPC 托管的 bundled MCP HTTP 子进程 SHALL 将父进程 IPC channel 视为生命周期租约，并在该 channel disconnect 时终止自身 listener。

#### Scenario: 后端异常退出

- **WHEN** bundled MCP 后端在应用未关闭时异常退出
- **THEN** host SHALL 立即清除该后端端口
- **AND** host SHALL 按有限次数指数退避尝试重启
- **AND** 达到最大次数后 SHALL 将该后端标记为 failed 且停止继续 spawn

#### Scenario: 应用退出

- **WHEN** 主进程开始 graceful shutdown
- **THEN** host SHALL 先停止 proxy 接收新连接并取消 restart/ready timers
- **AND** host SHALL 请求所有后端子进程退出
- **AND** host SHALL 在有界等待后强制终止未退出的子进程
- **AND** 重复调用 stop SHALL NOT 重复启动清理或抛出资源状态错误

#### Scenario: 主进程 IPC 意外断开

- **WHEN** 任一当前或未来注册的 bundled MCP HTTP 子进程检测到父进程 IPC channel disconnect
- **THEN** 该子进程入口 SHALL 通过进程级 `AbortController` abort 当前 transport 并关闭 HTTP listener
- **AND** detached 子进程 SHALL NOT 因主进程异常退出而继续监听端口
- **AND** 新增 bundled MCP HTTP server SHALL 遵循同一 disconnect 关闭机制

### Requirement: bundled MCP 保持 stdio 兼容

系统 SHALL 保留 bundled MCP 的 stdio transport 和现有 tool 行为，以支持 fallback、显式禁用与逐步迁移。

#### Scenario: stdio fallback

- **WHEN** HTTP host 级启动失败、agent 不支持 HTTP 或目标后端不可用
- **THEN** 系统 SHALL 生成与变更前等价的 stdio command、args 与 env
- **AND** bundled MCP tool 的输入、输出、错误语义和存储路径 SHALL 保持不变

#### Scenario: 完全禁用 bundled MCP

- **WHEN** 设置 `FYLLO_DISABLE_BUNDLED_MCP=1`
- **THEN** 主进程 SHALL NOT 启动 proxy 或 bundled MCP HTTP 子进程
- **AND** ACP `newSession` SHALL 收到空的 bundled MCP spec 列表
