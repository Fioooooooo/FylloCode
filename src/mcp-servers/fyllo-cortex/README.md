# fyllo-cortex

`fyllo-cortex` is a bundled MCP server that exposes guidelines, lineage, and durable knowledge tools. Tool behavior is transport-independent.

## Transport Modes

`src/server.ts` exposes a shared `createMcpServer()` factory:

- stdio mode creates one `McpServer` connected to `StdioServerTransport`.
- `FYLLO_MCP_TRANSPORT=http` starts the shared loopback HTTP listener from `src/mcp-servers/shared/http-server.ts`.

HTTP mode requires `FYLLO_MCP_AUTH_TOKEN`; the listener refuses to start without it and rejects requests whose bearer token does not match. The listener binds `127.0.0.1` on an operating-system-assigned port and reports `{ type: "ready", port }` to the main process over IPC.

The Electron main process exposes a separate stable proxy URL to ACP agents. A backend restart can change the real `fyllo-cortex` port without changing existing ACP session configuration.

The child aborts its active transport when the parent IPC channel disconnects, preventing a detached HTTP listener from surviving an unexpected main-process exit.

Each HTTP request creates and closes an independent in-memory `McpServer + StreamableHTTPServerTransport` pair. This is a JavaScript object lifecycle inside the shared child process, not a new operating-system process.

## Request Context

HTTP request context uses base64url-encoded UTF-8 headers:

| Header                     | Required | Stdio fallback           |
| -------------------------- | -------- | ------------------------ |
| `X-Fyllo-Project-Path`     | yes      | `FYLLO_PROJECT_PATH`     |
| `X-Fyllo-Project-Data-Dir` | yes      | `FYLLO_PROJECT_DATA_DIR` |
| `X-Fyllo-Mcp-Event-Dir`    | no       | `FYLLO_MCP_EVENT_DIR`    |
| `X-Fyllo-Session-Id`       | no       | `FYLLO_SESSION_ID`       |

`AsyncLocalStorage` keeps concurrent project/session calls isolated. Tool and utility modules use the getters in `src/mcp-servers/shared/env.ts` and never mutate `process.env` per request.

The current release only enforces the application-lifetime shared token and structural header decoding. Context signatures, token-context binding, path ownership validation, token rotation/revocation, and Host/Origin checks are future work.

## Disable and Fallback

`FYLLO_DISABLE_BUNDLED_MCP=1` disables all bundled MCP servers before ACP session creation. If the agent lacks HTTP capability or the shared HTTP backend is unavailable, the main process supplies the existing stdio spec instead.
