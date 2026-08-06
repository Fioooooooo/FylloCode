## MODIFIED Requirements

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
