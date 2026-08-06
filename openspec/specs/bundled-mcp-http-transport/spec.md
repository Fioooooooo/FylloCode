# bundled-mcp-http-transport Specification

## Purpose

定义 FylloCode 由 Electron 主进程托管 bundled MCP HTTP 后端的运行契约，涵盖稳定代理、共享鉴权、请求级上下文隔离、ACP transport 分流、故障恢复及子进程生命周期清理。

## Requirements

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

### Requirement: ACP session 前执行共享 readiness 分流

系统 SHALL在 required gate通过后后台启动 bundled MCP host，且 SHALL在不阻塞正式 renderer navigation或 interactive readiness的前提下，于 `fyllocode` Chat/probe的 ACP `newSession`前等待共享的 bundled MCP首次 readiness结果，并按 Agent能力和单个后端状态选择 transport。`native` Chat/probe SHALL跳过该 readiness等待并向 ACP lifecycle传递空 bundled MCP spec列表；该会话级选择 SHALL NOT停止或重启应用级 host。

#### Scenario: Startup shell 正在承载 required gate

- **WHEN** application startup shell已可见但 required migration/cutover gate尚未通过
- **THEN** 主进程 SHALL NOT启动 bundled MCP proxy或 backend
- **AND** startup shell SHALL NOT等待或展示 bundled MCP readiness

#### Scenario: Renderer 在 MCP 后端启动期间加载

- **WHEN** required gate已通过且主进程已开始启动 bundled MCP host但后端尚未 ready
- **THEN** 主进程 SHALL继续注册 IPC、接管 startup window并导航正式 renderer
- **AND** renderer SHALL NOT因 bundled MCP readiness保持全局启动阻塞

#### Scenario: 首个 FylloCode probe 与 chat 并发

- **WHEN** 首个 `fyllocode` probe和正常 `fyllocode` chat在 bundled MCP首次启动期间并发准备 ACP session
- **THEN** 两者 SHALL共享同一个 startup promise
- **AND** 两者 SHALL在各自调用 ACP `newSession`前等待该 promise结算
- **AND** 系统 SHALL NOT因并发等待重复启动 host或后端

#### Scenario: 后端在首次等待内 ready

- **WHEN** `fyllocode` activation的 Agent声明 `mcpCapabilities.http: true`
- **AND** proxy与目标后端在首次 readiness超时前 ready
- **THEN** 新 ACP session SHALL获得该 server的 HTTP spec、稳定 proxy URL与必要 headers

#### Scenario: 能力不支持或后端超时

- **WHEN** `fyllocode` activation的 Agent未声明 HTTP MCP能力，或单个目标后端在首次 readiness等待内不可用
- **THEN** 新 ACP session SHALL对该 server使用现有 stdio spec
- **AND** 其他已 ready server SHALL仍可在同一个 `newSession`中使用 HTTP spec

#### Scenario: Native activation 跳过 readiness

- **WHEN** `native` Chat或 probe准备 `newSession`、`resumeSession`或 `loadSession`
- **THEN** Main SHALL NOT为该 activation调用 bundled MCP readiness等待
- **AND** lifecycle request的 bundled MCP spec列表 SHALL为空
- **AND** 应用级 host的当前运行状态 SHALL保持不变

### Requirement: HTTP host 可恢复且可安全关闭

系统 SHALL 对异常退出的 bundled MCP backend进行有界重启，并 SHALL 通过集中 main shutdown lifecycle 幂等释放 proxy、grant、timer和子进程资源。Host SHALL 在 `quiesce` phase 先停止接收新 activation、撤销 grants并取消 restart/ready timer，在 `terminate` phase 与 ACP process pool 并行关闭 proxy/backend；总 deadline 后 SHALL force terminate已知 backend process group。每个由 host通过 IPC托管的 bundled MCP HTTP子进程 SHALL 将父进程 IPC channel视为生命周期租约，并在该 channel disconnect时终止自身 listener。

#### Scenario: 后端异常退出

- **WHEN** bundled MCP backend在应用未关闭时异常退出
- **THEN** host SHALL 立即清除该 backend端口
- **AND** host SHALL 按有限次数指数退避尝试重启
- **AND** 达到最大次数后 SHALL 将该 backend标记为 failed且停止继续 spawn
- **AND** 单个 backend重启 SHALL NOT 改变稳定 proxy endpoint或撤销仍有效的 activation grants

#### Scenario: 应用正常退出

- **WHEN** 主进程开始 graceful shutdown
- **THEN** quiesce phase SHALL 停止 proxy接收新连接、撤销全部 activation grants并取消 restart/ready timers
- **AND** terminate phase SHALL 请求所有 backend子进程退出并与其他独立 OS resource并行结算
- **AND** host SHALL 在应用级总 deadline 内强制终止未退出的子进程
- **AND** 重复调用 shutdown 方法 SHALL NOT 重复启动清理或抛出资源状态错误

#### Scenario: Shutdown deadline 到达

- **WHEN** bundled MCP proxy或backend未在应用级总 deadline 内关闭
- **THEN** host force hook SHALL 关闭剩余 connection并终止已知 process group
- **AND** main SHALL NOT 为 host 单独重新开始一个完整 deadline

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
