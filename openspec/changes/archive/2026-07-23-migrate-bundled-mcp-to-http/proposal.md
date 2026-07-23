## Why

当前 bundled MCP server 通过 ACP `newSession` 以 stdio spec 交给 agent，agent 会为会话启动额外 MCP 子进程；随着 agent 与会话数量增加，重复进程带来不必要的内存和生命周期管理开销。将 bundled MCP 收敛为应用级 HTTP 后端，可让多个 ACP 会话共享固定数量的 MCP 子进程，同时保持项目与会话上下文隔离。

## What Changes

- 主进程为每个 bundled MCP server 启动一个独立 HTTP 子进程，并通过 IPC 接收其随机 loopback 端口。
- 主进程提供应用生命周期内地址稳定的 loopback HTTP proxy，以 server name 路由到各 MCP 后端的当前随机端口；后端重启只更新内存映射。
- 主进程生成应用级共享 bearer token，通过 spawn 环境变量传给 MCP 后端，并通过 ACP HTTP MCP spec headers 传给 agent；缺少 token 时 HTTP 后端拒绝启动。
- bundled MCP server 同时支持 HTTP 与现有 stdio 模式；HTTP 模式下每个请求创建并释放独立的内存 `McpServer` 与 stateless transport 实例。
- 项目路径、项目数据目录、事件目录和会话标识通过 base64url HTTP headers 传递，并由 `AsyncLocalStorage` 提供请求级上下文隔离。
- renderer 启动不等待 MCP 后端；probe 和正常 chat 在调用 ACP `newSession` 前共享一次有界 readiness 等待，并按 agent HTTP 能力及单个后端状态选择 HTTP 或 stdio spec。
- 后端异常退出后按有限指数退避重启；稳定 proxy URL 与共享 token 在应用退出前保持不变。
- 保留 `FYLLO_DISABLE_BUNDLED_MCP=1` 的完全禁用语义，并保留不支持 HTTP、host 失败或后端未就绪时的 stdio fallback。

## Capabilities

### New Capabilities

- `bundled-mcp-http-transport`: 定义 bundled MCP 的应用级 HTTP 托管、稳定代理路由、共享 token、请求上下文、ACP transport 分流、启动门控、故障恢复与关闭行为。

### Modified Capabilities

无。`fyllo-specs` 与 `fyllo-cortex` 的 tool 业务语义保持不变，本变更只新增其共享 transport 与托管契约。

## Impact

- 影响 `src/main/infra/mcp/`、主进程 bootstrap/lifecycle、ACP chat/probe session 创建路径、`src/shared/types/mcp.ts`，以及两个 bundled MCP server 的启动与环境读取方式。
- 新增主进程内 HTTP proxy、子进程 ready IPC、HTTP 请求上下文和 transport 共享模块；不新增独立代理进程或第三方代理依赖。
- ACP MCP spec 从仅 stdio 扩展为 stdio/HTTP union；不改变 renderer IPC、持久化格式或用户界面。
- 当前阶段仅使用应用级共享 token 和必填 context 结构校验；token-context 绑定、请求签名、路径归属校验、token 轮换/撤销及 Host/Origin 防护明确留待后续独立 proposal。
