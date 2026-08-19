# Changelog

All notable changes to the `fyllo-spawn` MCP server will be documented in this file.

The format is based on Keep a Changelog.

## [0.2.0] - 2026-08-19

### Added

- Added `cancel_session`, which lets the parent Agent request cancellation of a running spawned Session it owns. `{ cancelled: true }` means the request was triggered, not confirmed; the turn settles as `error` with code `TURN_CANCELLED_BY_PARENT`, and the final state is confirmed through `check_session_status`.

### Changed

- **BREAKING**: `prompt_to_agent`'s `background` parameter now defaults to `true`. Calls that omit `background` return `accepted` instead of blocking for the terminal result. Callers that need the previous synchronous behavior must pass `background: false` explicitly.
- Rewrote the `prompt_to_agent` tool description to recommend the default background mode, show the polling flow, and document the sync mode's Signal delay limitation.
- Changed the `spawn.session` Signal guidance in `prompt_to_agent` from a required discovery step to an optional contextual deep link. Main now exposes spawned Sessions through the parent Chat activity view regardless of whether the Signal is emitted, so Agents no longer need to emit it for observability.

## [0.1.1] - 2026-08-10

### Changed

- Aligned the bundled MCP source structure with `fyllo-specs` and `fyllo-cortex`: each tool now has its own module, the registry only composes tools, and shared caller/result handling remains centralized.
- Added standalone TypeScript coverage for the server and its mirrored tests, dedicated version metadata, and server maintenance documentation without changing tool behavior.

### Compatibility

- Tool names, inputs, outputs, HTTP-only transport, trusted caller derivation, and child-to-Main RPC behavior remain compatible with `0.1.0`; the server version advances only by a patch.

## [0.1.0] - 2026-08-08

Initial bundled release of HTTP-only ACP Agent delegation.

### Added

- Added `available_agents`, `prompt_to_agent`, `check_session_status`, and `read_response`.
- Added synchronous and background spawned turns, owner-scoped continuation and status queries, config overrides, bounded response reads, active-turn capacity, inactivity cancellation, and durable completion notifications.
- Added typed child-to-Main IPC so the MCP backend reuses the existing Main ACP process pool, Session runtime, persistence, and application shutdown lifecycle.
- Added trusted Workspace/parent Session derivation from authenticated HTTP request context, with no stdio fallback or caller-controlled identity fields.
