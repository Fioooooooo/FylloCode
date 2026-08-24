# Changelog

All notable changes to the `fyllo-spawn` MCP server will be documented in this file.

The format is based on Keep a Changelog.

## [Unreleased]

### Added

- `prompt_to_agent` accepts optional semantic `model` and `thought_level` values. Main resolves them from the real Session's live `configOptions`, applies `model` before resolving `thought_level`, and does not require a probe turn.
- Ambiguous or unsupported semantic values return `configuration_required` with ordered live candidates and `promptDispatched: false`, leaving an idle prepared Session that can be continued with the same `sessionId` after an exact value is selected.

### Changed

- Semantic matching uses exact value, normalized value, normalized name, and conservative separator-token containment. It never guesses between providers, defaults, current values, list order, or similarity scores; for example, a query such as `luna` remains ambiguous when live options contain provider-qualified `luna` models.
- `config` remains an exact live option-ID map for `mode`, `model_config`, boolean, and Agent-specific options. Equal semantic/raw targets are deduplicated, conflicts return `SPAWN_INVALID_REQUEST`, and raw-only calls retain warning-and-continue compatibility.
- Semantic set failures, incomplete snapshots, and non-converging preparation return `SPAWN_CONFIG_FAILED` without dispatching the prompt. `initialize`, `available_agents`, and static capability caches do not provide the live model list for a Session.

### Recovery

- For `configuration_required`, select an exact candidate `value` (or ask the user), then retry the original prompt with the returned `sessionId`.
- For `SPAWN_CONFIG_FAILED`, treat the prompt as not dispatched, verify Agent availability, and retry. If the prepared Session is expired, start a new call without `sessionId`.

## [0.2.1] - 2026-08-23

### Added

- Added optional `folderId` selection for first-time `prompt_to_agent` calls. Omitting it keeps the complete parent Workspace; selecting one authorized Folder creates a fixed single-root scope for Agents without additional-directories support.

### Changed

- Continuations now keep their persisted Workspace or Folder scope and reject scope changes. Capability mismatch errors describe the authorized Folder IDs and names, the required new-call fields, and the Agent alternative for tasks spanning multiple Folders.

### Compatibility

- Existing tool names, five-tool registry, RPC envelope version 1, owner-scoped response reads, background behavior, and optional `spawn.session` Signal remain compatible.

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
