# fyllo-workflow MCP server

`fyllo-workflow` 是内置的 HTTP-only MCP server，提供两个工具：

- `list_workflows({})`：从当前可信 Workspace 实时读取 v2 workflow definition 摘要。
- `trigger_workflow({ workflowId })`：请求 Main 接受一个 workflow Run，返回 accepted 或结构化 rejected 结果。

MCP 子进程只负责工具 schema、请求上下文和 Node child-process IPC RPC。它不执行 workflow、不读取 Run snapshot，也不接受 `parentSessionId`、路径、YAML 或其他 caller-owned target 字段。Workspace 与 parent identity 来自 Main proxy 注入的可信 context；Main handler 还会重新校验 caller owner 和 WorkflowEngine 的 preflight/concurrency contract。只有普通 `chat` caller 可以触发；workflow/spawned/unknown caller 会被拒绝且不会创建 Run。

Workflow definition 只来自当前 Workspace 的 `workflows/<workflow-id>/definition.yaml`。Run snapshot、fresh Agent transcript 和 Action output 位于对应的 `runs/<run-id>/`，MCP server 不直接访问这些文件。

## 传输和协议

server 只接受 `FYLLO_MCP_TRANSPORT=http`。缺少 Host 提供的 HTTP Workspace context 时，HTTP transport 会拒绝请求；不会回退到 stdio。

子进程与 Main 之间使用独立的 `fyllo-workflow-rpc` v1 envelope。请求由 `requestId` 关联，MCP 请求取消会发送同协议 cancel envelope，IPC disconnect 会拒绝所有 pending 请求。`trigger_workflow` 只返回 accepted/rejected 结果，不等待 Run 完成；Run 的等待、决策和终态由独立的 Workflow Run IPC/Renderer activity 负责。

Workflow-owned fresh Agent session 的 bundled MCP allowlist 固定为 `fyllo-specs` 和 `fyllo-cortex`，不包含 `fyllo-spawn` 或 `fyllo-workflow`，以避免递归触发和 spawned-session 混用。

## 布局

- `src/index.ts`：child-process 入口和退出处理
- `src/server.ts`：HTTP-only MCP server 与 RPC client 生命周期
- `src/rpc-client.ts`：workflow-specific IPC client
- `src/rpc-schema.ts`：独立 request/response/caller/result schema
- `src/tools/`：两个工具的显式注册
- `../../../test/mcp-servers/fyllo-workflow/`：server、schema、tool 和 RPC client 测试

开发构建产物为 `out/mcp-servers/fyllo-workflow/index.js`，生产包路径为 `app.asar.unpacked/mcp-servers/fyllo-workflow/index.js`。
