# fyllo-cortex

`fyllo-cortex` is a bundled MCP server that exposes guidelines, lineage, and durable knowledge tools. Tool behavior is transport-independent.

## Transport Modes

`src/server.ts` exposes a shared `createMcpServer()` factory:

- stdio mode creates one `McpServer` connected to `StdioServerTransport`.
- `FYLLO_MCP_TRANSPORT=http` starts the shared loopback HTTP listener from `src/mcp-servers/shared/http-server.ts`.

HTTP mode requires an internal `FYLLO_MCP_AUTH_TOKEN`; the listener refuses to start without it. ACP never receives this token: it receives a per-activation capability that the Main proxy validates before injecting the internal token. The listener binds `127.0.0.1` on an operating-system-assigned port and reports `{ type: "ready", port }` to the main process over IPC.

The Electron main process exposes a separate stable proxy URL to ACP agents. A backend restart can change the real `fyllo-cortex` port without changing existing ACP session configuration.

The child aborts its active transport when the parent IPC channel disconnects, preventing a detached HTTP listener from surviving an unexpected main-process exit.

Each HTTP request creates and closes an independent in-memory `McpServer + StreamableHTTPServerTransport` pair. This is a JavaScript object lifecycle inside the shared child process, not a new operating-system process.

## Request Context

HTTP receives one proxy-injected `X-Fyllo-Workspace-Context` header containing a strict Workspace v2 descriptor. `AsyncLocalStorage` keeps concurrent Workspace/session calls isolated. stdio receives the same descriptor through `FYLLO_WORKSPACE_JSON` and freezes it before accepting tools.

Tools read Workspace-owned data through the shared resolver. Repository-scoped guidelines, knowledge anchor, and lineage operations accept an authorized `folderId`; omission is compatible only when the descriptor contains exactly one Folder. A multi-root activation without an explicit owner is rejected rather than silently selecting primary. Guideline `path` values remain relative to the selected Folder repository. Legacy Project headers/env and `cwd` fallback are not accepted.

Lineage proposal and commit traces read the selected Folder's reverse index and expose all origin/reference identities, but hydrate subject/task/session details only for the active descriptor Workspace. File traces use the Folder main root by default; an explicit `worktreePath` must be registered for that Folder, and `filePath` remains repository-relative within the resolved worktree.

## Disable and Fallback

`FYLLO_DISABLE_BUNDLED_MCP=1` disables all bundled MCP servers before ACP session creation. If the agent lacks HTTP capability or the shared HTTP backend is unavailable, the main process supplies the existing stdio spec instead.
