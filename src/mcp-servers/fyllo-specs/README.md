# fyllo-specs MCP server

`fyllo-specs` is the built-in MCP server that exposes the OpenSpec workflows used by FylloCode:

- `explore`
- `create-plan`
- `create-proposal`
- `apply-change`
- `archive-change`

This document focuses on three things:

- the full invocation chain from Electron main process to OpenSpec CLI
- the stdio and HTTP transport modes
- the Workspace v2 context, Project ownership, and environment-variable contract the server depends on

The chain is intentionally written down in detail because it crosses multiple runtimes and packaging boundaries. Future bundled MCP servers should use this as a reference.

## Layout

- `src/index.ts`: MCP process entry and lifecycle handling
- `src/server.ts`: MCP server setup and tool registration
- `src/tools/`: tool handlers
- `src/tools/instructions/*.md`: prompt text loaded by tools
- `src/runtime-openspec/`: OpenSpec CLI adapter
- `src/runtime-workspace/`: ProposalRef resolution and fixed Proposal targets
- `src/utils/project-root.ts`: compatibility helper backed by the shared Workspace resolver
- `../shared/workspace-resolver.ts`: Workspace v2 and authorized Folder resolver
- `../../../test/mcp-servers/fyllo-specs/`: Vitest tests

## Build And Packaging

- Development bundle path: `out/mcp-servers/fyllo-specs/index.js`
- Production bundle path: `Contents/Resources/app.asar.unpacked/mcp-servers/fyllo-specs/index.js`
- Production OpenSpec CLI path: `Contents/Resources/app.asar/node_modules/@fission-ai/openspec/bin/openspec.js`

These two production paths are intentionally different:

- the MCP server bundle stays in `app.asar.unpacked` because Electron launches it as a top-level script
- the OpenSpec CLI stays in `app.asar` because Node must resolve its ESM dependencies from the same packaged `node_modules` tree

Do not move the OpenSpec CLI to `app.asar.unpacked` unless you also move its full dependency tree with it. The previous production failure came from `openspec.js` being outside the package tree while `commander` stayed inside `app.asar/node_modules`.

## Stdio Invocation Chain

This is the compatibility-path runtime for one MCP tool call. HTTP-capable Agents use the shared process and request flow described in [Transport Modes](#transport-modes), then enter the same tool handler and OpenSpec runtime from step 4 onward.

### 1. Electron main process builds the stdio bundled MCP spec

File:

- `src/main/infra/mcp/bundled-mcp-servers.ts`

Responsibility:

- define the built-in MCP server descriptor consumed by ACP
- hide all dev/prod path differences from the rest of the app

What it returns:

- `name`: MCP server id, here `fyllo-specs`
- `command`: always `process.execPath`
- `args`: top-level MCP server bundle path
- `env`: launch-time environment variables for the MCP server

Important path split:

- `resolveBundlePath()` points to `out/.../index.js` in development
- `resolveBundlePath()` points to `app.asar.unpacked/mcp-servers/.../index.js` in production
- `resolveOpenspecCliPath()` points to `node_modules/@fission-ai/openspec/bin/openspec.js`
  - from repo root in development
  - from `app.asar` in production

### 2. ACP launches the MCP server process

Responsibility:

- start `fyllo-specs` as a stdio MCP server subprocess
- pass the descriptor produced by the main process

Actual launch shape:

```text
command = process.execPath
args    = [<fyllo-specs bundle path>]
env     = { ELECTRON_RUN_AS_NODE=1, FYLLO_WORKSPACE_JSON=..., ... }
```

Why `process.execPath`:

- in development this is the Electron binary running in dev mode
- in production this is the packaged FylloCode binary
- `ELECTRON_RUN_AS_NODE=1` makes that binary behave like Node for this subprocess

### 3. `src/index.ts` starts the MCP server

File:

- `src/mcp-servers/fyllo-specs/src/index.ts`

Responsibility:

- set `process.env.DO_NOT_TRACK = "1"` before anything else runs
- install `SIGTERM` / `SIGINT` handling and abort when the parent IPC channel disconnects
- call `startServer()`

This is the MCP process entrypoint, not the OpenSpec CLI entrypoint. `startServer()` selects HTTP or stdio.

### 4. `src/server.ts` registers MCP tools

File:

- `src/mcp-servers/fyllo-specs/src/server.ts`

Responsibility:

- create the MCP server instance
- register the five tools
- dispatch each tool request into `src/tools/*`

At this layer the process is already a normal MCP server. No OpenSpec CLI is involved yet.

### 5. A tool handler resolves prompt + state

Files:

- `src/tools/explore.ts`
- `src/tools/create-plan.ts`
- `src/tools/create-proposal.ts`
- `src/tools/apply-change.ts`
- `src/tools/archive-change.ts`

Responsibility:

- validate input
- read prompt markdown through `loadPrompt()`
- call the OpenSpec runtime adapter when OpenSpec state is needed
- return one text payload containing:
  - `<tool_instruction>...</tool_instruction>`
  - `<state>...</state>`

The tools do not spawn child processes directly and do not import `@fission-ai/openspec` as a library.

`create-plan` is the Workspace/Session-scoped exception in this tool set. It writes directly under
the descriptor's `workspaceDataDir` and `sessionId`, so it neither resolves nor accepts a Folder
owner, including in multi-root Workspaces. Its best-effort MCP event carries Workspace/Session
identity only. Repository-scoped OpenSpec operations continue to select an authorized Folder and,
when required, an owner-qualified ProposalRef through the shared resolver.

### 6. `runtime-openspec` resolves the authorized Folder and CLI path

Files:

- `src/utils/project-root.ts`
- `src/runtime-openspec/resolve-cli.ts`

Responsibility:

- `resolveProjectRoot()`
  - read the immutable Workspace v2 descriptor through the shared resolver
  - use the only authorized Folder for legacy single-root helper calls
  - reject ambiguous multi-root calls unless the tool schema supplies an explicit `folderId`
- `validateTargetPath()`
  - accept only the selected Folder root or a registered worktree of the same repository
- `resolveOpenspecCli()`
  - use `FYLLO_OPENSPEC_CLI_PATH` first
  - otherwise probe fallback candidates

Why the Workspace descriptor and owner-qualified ProposalRef exist:

- MCP server `cwd` and caller-provided absolute paths are not authorization facts
- the server must operate only within the activation's fixed Folder allowlist
- Proposal operations must resolve `{ folderId, changeId }` to a repository-owned target instead of trusting caller paths

Why `FYLLO_OPENSPEC_CLI_PATH` exists:

- the main process already knows the correct packaged layout
- the MCP server should not have to reconstruct bundle/resource paths by itself

### 7. `runtime-openspec/spawner.ts` starts the OpenSpec CLI

File:

- `src/runtime-openspec/spawner.ts`

Responsibility:

- always spawn `process.execPath`
- pass the OpenSpec CLI path as script/module input
- inject telemetry-related env vars
- collect stdout/stderr
- parse JSON when required
- normalize timeout / exit-code failures

Important detail:

- this code does **not** do `spawn(cliPath, ...)`
- it does `spawn(process.execPath, spawnArgs, ...)`

That distinction matters in production because `cliPath` may point inside `app.asar`.

### 8. Electron bootstrap restores Node-style CLI argv

File:

- generated by `ensureElectronBootstrap()` in `src/runtime-openspec/spawner.ts`

Responsibility:

- run only when current runtime is Electron
- fix `process.argv` shape before loading OpenSpec CLI

Why it exists:

- `commander` detects Electron and may misinterpret `argv[1]` in packaged-electron execution
- the bootstrap rewrites argv so OpenSpec CLI sees normal Node CLI semantics

Generated bootstrap logic:

```ts
process.defaultApp = true;
const [, , cliPath, ...cliArgs] = process.argv;
process.argv = [process.argv[0], cliPath, ...cliArgs];
await import(pathToFileURL(cliPath).href);
```

### 9. The OpenSpec CLI is loaded as a module

What actually happens:

- the child process starts from `process.execPath`
- bootstrap code runs
- bootstrap calls `import(pathToFileURL(cliPath).href)`
- `cliPath` may be inside `app.asar`

Why `app.asar` works here:

- `join()` only builds the path string
- Electron/Node's `asar` support makes `import()` able to read `app.asar/...`

Why this is different from executing a file directly:

- loading a JS module from `app.asar` is supported
- directly asking the OS to execute `app.asar/.../openspec.js` is not the same thing

### 10. OpenSpec CLI executes the requested command

Examples:

- `openspec list --json`
- `openspec show <item> --json`
- `openspec new change <name>`

Responsibility:

- inspect the project `openspec/` directory
- print JSON or plain text to stdout

### 11. Runtime adapter maps CLI output back to tool state

Files:

- `src/runtime-openspec/list.ts`
- `src/runtime-openspec/status.ts`
- `src/runtime-openspec/instructions.ts`
- `src/runtime-openspec/create-change.ts`
- `src/runtime-openspec/archive-change.ts`

Responsibility:

- convert raw CLI output into stable tool-facing shapes
- hide CLI invocation details from `src/tools/*`

### 12. MCP response goes back to ACP and then to the agent

Final effect:

- ACP receives the MCP tool result
- ACP forwards the result into the active agent session
- the agent sees one tool result containing prompt + state

## Transport Modes

`fyllo-specs` supports two transports through the same `createMcpServer()` factory:

- stdio is the compatibility and fallback mode. One process owns one `McpServer` and one `StdioServerTransport`.
- HTTP is selected with `FYLLO_MCP_TRANSPORT=http`. The process listens on a random loopback port and reports `{ type: "ready", port }` to the main process over IPC.

The main process owns a stable loopback proxy URL and passes it to HTTP-capable ACP agents. The real backend port remains private and can change after a backend restart.

HTTP mode requires `FYLLO_MCP_AUTH_TOKEN`. The process refuses to start its listener without the token, and every request must include the matching bearer token. Each HTTP request creates a short-lived in-memory `McpServer` plus stateless `StreamableHTTPServerTransport`; requests do not spawn additional operating-system processes.

Workspace/session context is request-scoped in HTTP mode. ACP receives a per-activation bearer capability; the Main proxy validates its server scope, strips caller `Authorization` and `X-Fyllo-*` headers, then injects the internal backend token plus one `X-Fyllo-Workspace-Context` header. The decoded Workspace v2 descriptor is held in `AsyncLocalStorage` for the request.

stdio receives the same descriptor once through `FYLLO_WORKSPACE_JSON`; the child parses and freezes it before accepting tools. Neither transport falls back to `cwd` or legacy Project path context.

## Environment Variables

There are two layers of environment variables in this flow:

1. variables received by the `fyllo-specs` MCP server process
2. variables passed from `fyllo-specs` to the spawned OpenSpec CLI child

### Variables Received By `fyllo-specs`

The stdio values are injected by `createBundledMcpActivation()`; HTTP process-level values are injected by `bundled-mcp-host.ts`.

| Variable                  | Example                                                            | Meaning                                                                                                                                                                                                             |
| ------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ELECTRON_RUN_AS_NODE`    | `"1"`                                                              | Makes the launched Electron binary behave like Node so the MCP bundle can run outside Electron.                                                                                                                     |
| `FYLLO_MCP_TRANSPORT`     | `"http"`                                                           | Selects the HTTP listener. Any other value keeps the stdio compatibility mode.                                                                                                                                      |
| `FYLLO_MCP_AUTH_TOKEN`    | application-generated token                                        | Required only in HTTP mode; authenticates requests and must never be logged.                                                                                                                                        |
| `FYLLO_WORKSPACE_JSON`    | serialized Workspace v2 descriptor                                 | Required in stdio mode; defines the immutable Folder allowlist and Workspace-owned storage/session context.                                                                                                         |
| `FYLLO_OPENSPEC_CLI_PATH` | `".../app.asar/node_modules/@fission-ai/openspec/bin/openspec.js"` | Absolute path to the packaged OpenSpec CLI entry. `resolveOpenspecCli()` uses this first before probing fallback paths.                                                                                             |
| `FYLLO_MCP_TELEMETRY`     | `"0"`                                                              | Contract-level switch stating bundled MCP telemetry must stay disabled. `fyllo-specs` does not currently branch on this value, but the launcher still passes it explicitly as part of the bundled-MCP env contract. |

Notes:

- `FYLLO_WORKSPACE_JSON` and `FYLLO_OPENSPEC_CLI_PATH` are the two critical path-resolution variables
- if either one is wrong in production, tool calls usually fail even though MCP handshake itself still succeeds

### Variables Used Internally By `fyllo-specs`

These are set or consumed inside the MCP server process.

| Variable       | Source                | Meaning                                                                    |
| -------------- | --------------------- | -------------------------------------------------------------------------- |
| `DO_NOT_TRACK` | set in `src/index.ts` | Disables telemetry as early as possible for the MCP server process itself. |

### Variables Passed To Spawned OpenSpec CLI

These are injected by `buildEnv()` in `src/openspec-runtime/spawner.ts`.

| Variable             | Value | Meaning                                                          |
| -------------------- | ----- | ---------------------------------------------------------------- |
| `DO_NOT_TRACK`       | `"1"` | Disables OpenSpec telemetry using the documented global opt-out. |
| `OPENSPEC_TELEMETRY` | `"0"` | Explicit OpenSpec-specific telemetry off switch.                 |
| `CI`                 | `"1"` | Forces non-interactive CLI behavior.                             |
| `NO_COLOR`           | `"1"` | Prevents colored output from polluting stdout/stderr parsing.    |

Notes:

- these variables are for the OpenSpec CLI child, not for MCP protocol behavior
- MCP tools that expect JSON output depend on stable, non-interactive stdout

### Launcher-Side Control Variable

This variable is not received by the running MCP server process. It is consumed earlier by the main process.

| Variable                      | Meaning                                                                                                                |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `FYLLO_DISABLE_BUNDLED_MCP=1` | Prevents the main process from starting the proxy/backends and makes `createBundledMcpActivation()` return no servers. |

## Failure-Prone Points

These are the places most likely to break when adding another bundled MCP server.

- Top-level MCP bundle path is wrong:
  ACP cannot start the server at all.

- `ELECTRON_RUN_AS_NODE` is missing:
  the Electron binary does not behave like Node for the MCP subprocess.

- `FYLLO_WORKSPACE_JSON` is missing or invalid:
  stdio startup fails before any OpenSpec tool can run.

- `FYLLO_OPENSPEC_CLI_PATH` is wrong:
  MCP handshake works, but the first tool call fails when runtime tries to spawn OpenSpec.

- Dependency-heavy secondary JS is moved from `app.asar` to `app.asar.unpacked`:
  module resolution can fail because package entry and dependencies no longer live in the same tree.

- `spawn(cliPath, ...)` replaces `spawn(process.execPath, ...)`:
  `app.asar/...` paths stop being loadable in production.

- Electron bootstrap is removed:
  `commander` may parse packaged Electron argv incorrectly.

- OpenSpec child env stops forcing `CI=1` / `NO_COLOR=1`:
  JSON parsing becomes fragile because CLI output may become interactive or decorated.

## Development Notes

- Build output is `out/mcp-servers/fyllo-specs/index.js`.
- Prompt markdown can be edited without changing tool TypeScript unless the returned state shape changes.
- OpenSpec is always consumed by CLI spawn, never by importing `@fission-ai/openspec` internals.
