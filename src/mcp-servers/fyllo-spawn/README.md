# fyllo-spawn MCP server

`fyllo-spawn` is the built-in HTTP-only MCP server that delegates focused work from a trusted parent FylloCode Chat Session to spawned ACP Sessions. It exposes four tools:

- `available_agents`
- `prompt_to_agent`
- `check_session_status`
- `read_response`

The server is intentionally a thin adapter. Tool handlers validate MCP inputs through the shared RPC schemas, derive the caller from the trusted request context, and forward typed requests to Electron Main. Agent discovery, ACP process/session ownership, persistence, concurrency, cancellation, notifications, and shutdown remain Main-process responsibilities.

## Layout

- `src/index.ts`: child-process entrypoint and abort lifecycle
- `src/server.ts`: HTTP-only MCP server setup and RPC client lifecycle
- `src/version.ts`: server version metadata
- `src/rpc-client.ts`: versioned child-to-Main IPC transport
- `src/tools/index.ts`: explicit tool registry
- `src/tools/available-agents.ts`: `available_agents` definition
- `src/tools/prompt-to-agent.ts`: `prompt_to_agent` definition
- `src/tools/check-session-status.ts`: `check_session_status` definition
- `src/tools/read-response.ts`: `read_response` definition
- `src/tools/shared.ts`: trusted caller and common MCP result formatting
- `tsconfig.json`: standalone source and mirrored-test TypeScript configuration
- `../../../test/mcp-servers/fyllo-spawn/`: Vitest tests

## Runtime Chain

1. Electron Main starts one application-level `fyllo-spawn` backend and exposes it through the stable bundled MCP proxy.
2. An HTTP-capable `fyllocode` ACP activation receives the proxy URL and an activation-scoped capability token. `native` activations and Agents without HTTP MCP support do not receive this server.
3. The proxy authenticates the activation, removes caller-supplied Fyllo headers, and injects the immutable Workspace descriptor before forwarding the request to the backend.
4. The shared HTTP server creates an isolated MCP server and request context for that request.
5. A tool derives `{ workspaceId, parentSessionId }` from the trusted context and sends a versioned request through `SpawnRpcClient` over the child process IPC channel.
6. `bundled-mcp-host.ts` validates the RPC envelope and forwards it to the Main spawn bridge. The bridge and `SpawnedSessionManager` reuse the existing ACP process pool, session runtime, persistence, capacity, watchdog, and shutdown lifecycle.
7. The typed RPC result is returned as both MCP text content and `structuredContent`. Errors retain their stable code, message, and retryable flag.

The MCP child never imports Electron or `@main/*`, reads Main storage directly, or creates its own ACP runtime.

## HTTP-only Transport

`fyllo-spawn` has no stdio fallback. It depends on the application-owned child-to-Main IPC channel and on the request-scoped Workspace/Session identity injected by the authenticated Main proxy. If HTTP MCP is unavailable, the activation omits this server.

`src/index.ts` treats `SIGTERM`, `SIGINT`, and parent IPC `disconnect` as the same abort signal. Aborting closes the RPC client and the HTTP listener so a detached backend cannot survive the Electron Main process.

## Tool Boundaries

### `available_agents`

Returns installed registry and valid custom ACP Agents without starting a process or creating a Session.

### `prompt_to_agent`

Creates a spawned Session when `sessionId` is omitted or continues an owner-matched Session. It supports synchronous and background turns plus config overrides. New Session results direct the parent Agent to use the injected `spawn.session` Signal contract once; continuation calls do not repeat that signal.

### `check_session_status`

Returns an owner-scoped status snapshot without waiting for an active turn to finish.

### `read_response`

Reads a bounded response chunk using an opaque `responseId` and cursor. Tools never accept or expose an app-data file path.

## Trusted Context And RPC Contract

Caller ownership comes only from the immutable `McpWorkspaceDescriptorV2` request context. A request without a parent FylloCode Session fails with `SPAWN_PARENT_SESSION_REQUIRED`; tool inputs cannot override Workspace or parent Session identity.

The shared schemas and versioned envelope live in `src/shared/types/fyllo-spawn-rpc.ts`. The MCP server must reuse those definitions rather than declaring local copies. `SpawnRpcClient` correlates requests by `requestId`, forwards cancellation, rejects pending work on disconnect, and validates successful responses with the method-specific result schema.

## Build And Packaging

- Development bundle: `out/mcp-servers/fyllo-spawn/index.js`
- Production bundle: `app.asar.unpacked/mcp-servers/fyllo-spawn/index.js`

`scripts/build-mcp-servers.mjs` bundles this server from `src/index.ts`. `src/main/infra/mcp/bundled-mcp-registry.ts` registers it with the `http-only` transport policy.

## Versioning And Changes

The server version is defined in `src/version.ts`. Notable changes are recorded in `CHANGELOG.md`; contract-preserving structural refactors use a patch release under the repository's bundled-server versioning rules.

## Verification

```bash
pnpm exec tsc --noEmit -p src/mcp-servers/fyllo-spawn/tsconfig.json --composite false
pnpm exec vitest run --project main test/mcp-servers/fyllo-spawn test/mcp-servers/child-process-lifecycle.spec.ts
pnpm build:mcp-servers
```
