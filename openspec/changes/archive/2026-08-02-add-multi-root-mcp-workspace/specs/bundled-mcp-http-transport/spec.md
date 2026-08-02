## MODIFIED Requirements

### Requirement: HTTP 后端使用应用级共享 token

系统 SHALL 为每次 bundled MCP host 运行生成一个只供 Main proxy 到 HTTP backend 使用的应用级内部 bearer token，并 SHALL NOT 将该内部 token提供给 ACP Agent、renderer 或 MCP tool。Agent 到 proxy 的请求 SHALL 改用 per-activation opaque capability token；proxy 校验 capability 后 SHALL 用内部 token替换外部 Authorization再转发。

#### Scenario: HTTP 子进程缺少内部 token

- **WHEN** bundled MCP 子进程以 HTTP 模式启动但缺少 `FYLLO_MCP_AUTH_TOKEN`
- **THEN** 子进程 SHALL 拒绝启动 HTTP listener

#### Scenario: Proxy 校验外部 capability

- **WHEN** Agent 请求稳定 proxy endpoint
- **THEN** proxy SHALL 校验 bearer token对应的 active grant、有效期和目标 server allowlist
- **AND** 无效、过期、已撤销或 server scope不匹配的请求 SHALL 在转发前被拒绝

#### Scenario: Backend 只接受内部 token

- **WHEN** HTTP backend收到请求
- **THEN** 请求 bearer token SHALL 精确匹配当前 host 的应用级内部 token
- **AND** 不匹配时 backend SHALL 返回 401且不执行 MCP tool
- **AND** Agent MCP spec SHALL NOT 包含该内部 token

#### Scenario: 单个后端重启

- **WHEN** bundled MCP backend异常退出后由同一个 host重启
- **THEN** 系统 SHALL 复用本次 host运行的内部 token与现有有效 grants
- **AND** 系统 SHALL NOT 在日志、renderer API或 tool output中暴露内部 token或 capability token

### Requirement: HTTP 请求使用独立 server 实例与请求上下文

系统 SHALL 为每个 bundled MCP HTTP 请求创建独立的内存 `McpServer` 与 stateless transport 实例，并 SHALL 只使用 Main proxy 从已验证 grant注入的 `McpWorkspaceDescriptorV2` 建立请求级 `AsyncLocalStorage` context。Agent 自报的 Workspace、Session、Folder path或 app-data path SHALL NOT 成为 tool context。

#### Scenario: 并发 HTTP 请求

- **WHEN** 同一 backend同时处理来自不同 Workspace、Session或 Folder allowlist 的多个请求
- **THEN** 每个请求 SHALL 使用独立的 `McpServer` 与 `StreamableHTTPServerTransport`
- **AND** 每个请求 SHALL 在自己的 Workspace v2 AsyncLocalStorage context中执行
- **AND** 请求完成后对应 server/transport SHALL 被关闭并可被垃圾回收

#### Scenario: Proxy 清理 caller context headers

- **WHEN** Agent 请求包含任意大小写形式的 `X-Fyllo-*` headers
- **THEN** proxy SHALL 在转发前移除这些 caller headers
- **AND** SHALL 只注入由已验证 grant descriptor编码的内部 Workspace context
- **AND** caller SHALL NOT 通过 header覆盖 workspaceId、sessionId、folder paths或 storage paths

#### Scenario: Backend 解码可信 Workspace context

- **WHEN** proxy 使用内部 token转发合法请求并携带 Workspace v2 context
- **THEN** backend SHALL 严格解码并校验 descriptor schema与 invariants
- **AND** tool handler SHALL 通过 shared Workspace resolver读取该 context
- **AND** SHALL NOT 通过修改 `process.env` 切换请求上下文

#### Scenario: 内部请求上下文格式无效

- **WHEN** backend请求缺少 Workspace v2 context或其编码、JSON、版本或 schema无效
- **THEN** backend SHALL 返回 400
- **AND** backend SHALL NOT 执行 MCP tool

### Requirement: HTTP host 可恢复且可安全关闭

系统 SHALL 对异常退出的 bundled MCP backend进行有界重启，并 SHALL 通过主进程 lifecycle幂等释放 proxy、grant、timer和子进程资源。每个由 host通过 IPC托管的 bundled MCP HTTP子进程 SHALL 将父进程 IPC channel视为生命周期租约，并在该 channel disconnect时终止自身 listener。

#### Scenario: 后端异常退出

- **WHEN** bundled MCP backend在应用未关闭时异常退出
- **THEN** host SHALL 立即清除该 backend端口
- **AND** host SHALL 按有限次数指数退避尝试重启
- **AND** 达到最大次数后 SHALL 将该 backend标记为 failed且停止继续 spawn
- **AND** 单个 backend重启 SHALL NOT 改变稳定 proxy endpoint或撤销仍有效的 activation grants

#### Scenario: 应用退出

- **WHEN** 主进程开始 graceful shutdown
- **THEN** host SHALL 先停止 proxy接收新连接并撤销全部 activation grants
- **AND** SHALL 取消 restart/ready timers并请求所有 backend子进程退出
- **AND** host SHALL 在有界等待后强制终止未退出的子进程
- **AND** 重复调用 stop SHALL NOT 重复启动清理或抛出资源状态错误

#### Scenario: Host 整体重新启动

- **WHEN** proxy/host 生命周期结束后建立新的 host实例
- **THEN** 新 host SHALL 生成新的内部 token并使用空 grant registry
- **AND** 旧 host签发的全部 capability token SHALL 无法访问新 proxy生命周期

#### Scenario: 主进程 IPC 意外断开

- **WHEN** 任一当前或未来注册的 bundled MCP HTTP子进程检测到父进程 IPC channel disconnect
- **THEN** 该子进程入口 SHALL 通过进程级 `AbortController` abort当前 transport并关闭 HTTP listener
- **AND** detached子进程 SHALL NOT 因主进程异常退出而继续监听端口
- **AND** 新增 bundled MCP HTTP server SHALL 遵循同一 disconnect关闭机制

### Requirement: bundled MCP 保持 stdio 兼容

系统 SHALL 保留 bundled MCP的 stdio transport以支持不具备 HTTP能力的 ACP Agent和单个 backend不可用时的 fallback；stdio SHALL 使用当前 activation的 Workspace v2 descriptor与独立 child生命周期，tool业务输入输出保持不变，但不再兼容 Project path env/request context。

#### Scenario: stdio fallback

- **WHEN** HTTP host级启动失败、Agent不支持 HTTP或单个目标 backend不可用
- **THEN** 系统 SHALL 为该 activation生成 stdio command、args与 env
- **AND** env SHALL 使用 `FYLLO_WORKSPACE_JSON` 传递与 HTTP grant相同的 immutable descriptor
- **AND** SHALL NOT 发送 legacy Project path/data/event/session env
- **AND** bundled MCP tool SHALL 使用 shared Workspace resolver解析作用域

#### Scenario: stdio child 不跨 activation 复用

- **WHEN** 两个 ACP activation均使用同一个 bundled MCP stdio server
- **THEN** Agent runtime SHALL 为它们启动不同 child并分别注入各自 descriptor
- **AND** 任一 child SHALL NOT 处理另一个 activation的 tool calls

#### Scenario: 完全禁用 bundled MCP

- **WHEN** 设置 `FYLLO_DISABLE_BUNDLED_MCP=1`
- **THEN** 主进程 SHALL NOT 启动 proxy或 bundled MCP HTTP子进程
- **AND** ACP lifecycle request SHALL 收到空的 bundled MCP spec列表
