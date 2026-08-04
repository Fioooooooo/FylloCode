## MODIFIED Requirements

### Requirement: ACP session 前执行共享 readiness 分流

系统 SHALL 在 required gate 通过后后台启动 bundled MCP host，且 SHALL 在不阻塞正式 renderer navigation或 interactive readiness 的前提下，于 ACP `newSession` 前等待共享的 bundled MCP 首次 readiness 结果，并按 agent 能力和单个后端状态选择 transport。

#### Scenario: Startup shell 正在承载 required gate

- **WHEN** application startup shell 已可见但 required migration/cutover gate 尚未通过
- **THEN** 主进程 SHALL NOT 启动 bundled MCP proxy或 backend
- **AND** startup shell SHALL NOT 等待或展示 bundled MCP readiness

#### Scenario: Renderer 在 MCP 后端启动期间加载

- **WHEN** required gate 已通过且主进程已开始启动 bundled MCP host但后端尚未 ready
- **THEN** 主进程 SHALL 继续注册 IPC、接管 startup window 并导航正式 renderer
- **AND** renderer SHALL NOT 因 bundled MCP readiness 保持全局启动阻塞

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
