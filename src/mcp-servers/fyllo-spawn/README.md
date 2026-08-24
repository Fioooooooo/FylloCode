# fyllo-spawn MCP server

`fyllo-spawn` is the built-in HTTP-only MCP server that delegates focused work from a trusted parent FylloCode Chat Session to spawned ACP Sessions. It exposes five tools:

- `available_agents`
- `prompt_to_agent`
- `check_session_status`
- `read_response`
- `cancel_session`

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
- `src/tools/cancel-session.ts`: `cancel_session` definition
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

Creates a spawned Session when `sessionId` is omitted or continues an owner-matched Session. It supports synchronous and background turns plus config overrides; `background` defaults to `true`, so a call that omits it returns `accepted` once Main has durably dispatched the turn. A new call that omits `folderId` inherits the complete parent Workspace snapshot. To run an Agent that cannot accept additional directories, a new call may set the optional `folderId` to one Folder ID from the parent Session's fixed authorized snapshot; Main then uses that Folder as `cwd` with no additional directories. `folderId` cannot be combined with `sessionId`, and continuation calls keep the persisted Workspace or Folder scope without accepting a scope change. If a complete multi-root Workspace causes `PROMPT_CAPABILITY_MISMATCH`, no Session or turn is created; retry as a new call with an authorized Folder ID, or use an Agent that supports additional directories for work spanning multiple Folders. Absolute `cwd` or other paths are never accepted.

Main automatically exposes both new and continued Sessions through the parent Chat activity view. A returned Session identity MAY be referenced once by the optional `spawn.session` contextual deep link, but the Signal is not required for discovery or status updates and continuation calls do not repeat it.

#### Semantic model and thought-level configuration

The first formal call may provide semantic `model` and `thought_level` values directly; a probe turn is not required. These fields are value/name queries, not ACP option IDs. Main activates the real ACP Session and resolves them only from that Session's live `configOptions`:

- `model` targets the unique `type=select`, `category=model` option.
- `thought_level` targets the unique `type=select`, `category=thought_level` option after the model set has returned its complete replacement snapshot.
- Matching is conservative and ordered: exact value, normalized value, normalized name, then separator-token containment. A layer with candidates stops the search; zero or multiple candidates are never resolved by provider default, current value, list order, or similarity.

For example, if a live model category contains both `openai/gpt-5.6-luna` and `openrouter/gpt-5.6-luna-0731`, requesting `model: "luna"` is provider-ambiguous. The tool returns `configuration_required` with the ordered live candidates and `promptDispatched: false`; choose an exact candidate value or ask the user, then retry the original prompt with the returned `sessionId`. The prepared Session remains idle and does not create a user message, turn, notification, watchdog, or active-turn capacity reservation.

The `config` map remains the exact live option-ID escape hatch for `mode`, `model_config`, boolean, and Agent-specific options. Semantic and raw constraints are planned together in the order `mode → model → model_config → thought_level → other`; equal values targeting one option are deduplicated, while conflicting values return `SPAWN_INVALID_REQUEST` instead of using last-write-wins. Raw-only calls retain the existing warning-and-continue behavior when an option set fails. A semantic set failure, incomplete response snapshot, or non-converging configuration returns `SPAWN_CONFIG_FAILED` and never dispatches the prompt. Live model lists are Session-specific: `initialize`, `available_agents`, Agent defaults, and static capability caches are not sources of the live model list.

If a prepared Session becomes expired because its Agent process is no longer active, start a new call without `sessionId`; do not assume a prepared handle survives process restart or unloading.

### `check_session_status`

Returns an owner-scoped status snapshot without waiting for an active turn to finish.

### `read_response`

Reads a bounded response chunk using an opaque `responseId` and cursor. Tools never accept or expose an app-data file path.

### `cancel_session`

Requests cancellation of a running spawned Session owned by the caller. `{ cancelled: true }` means the request was triggered, not that the ACP turn has confirmed; the turn settles as `error` with code `TURN_CANCELLED_BY_PARENT` and the final state is confirmed through `check_session_status`. Missing, finished, or cross-owner targets all return `{ cancelled: false, reason: "Session not found" }` indistinguishably.

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
