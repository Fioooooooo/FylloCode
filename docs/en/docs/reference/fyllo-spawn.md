---
sidebar:
  group: Reference
  order: 25
---

# fyllo-spawn MCP

`fyllo-spawn` is FylloCode's built-in cross-ACP-Agent delegation service. The current Chat Agent can send one focused task to another installed Agent, wait synchronously, or let Main own the turn in the background. Every call remains scoped to the Workspace and parent Chat Session that initiated it.

## Availability

`fyllo-spawn` is available only through HTTP bundled MCP and has no stdio fallback. It appears in a Chat Session only when:

- the Session uses `FylloCode` mode;
- the current Agent advertises HTTP MCP capability; and
- the application-level `fyllo-spawn` backend is ready.

Native mode, an Agent without HTTP MCP support, or an unavailable backend causes the activation to omit this server. Other bundled MCP servers that allow stdio fallback are unaffected.

## Tools

| Tool | Input | Purpose |
| --- | --- | --- |
| `available_agents` | None | Return installed registry Agents and valid custom Agents without starting a process or creating a Session. |
| `prompt_to_agent` | `agentId`, `prompt`; optional `sessionId`, `config`, `background` | Create a spawned Session or continue an owner-matched Session that remains reusable. |
| `check_session_status` | `sessionId` | Read the current status snapshot without waiting for an active turn. |
| `read_response` | `sessionId`, `responseId`; optional `cursor`, `maxBytes` | Read a completed response in bounded chunks using an opaque cursor. |
| `cancel_session` | `sessionId` | Request cancellation of a running spawned Session owned by the current parent Session. |

Omitting `sessionId` from `prompt_to_agent` creates a Session; providing it continues an existing one. Values in `config` can be strings or booleans. Main validates them against the Agent-provided configuration schema and sets them before the prompt. A rejected option does not block the prompt, but appears in `warnings`.

`background` defaults to `true`. A background call returns `accepted` after Main has persisted the turn, applied configuration, and dispatched the ACP prompt. Accepted means Main owns the work; the parent Agent can keep working or report progress, then retrieve the final result through `check_session_status` and `read_response`. Pass `background: false` only for simple, fast tasks where the parent Agent intentionally blocks: a synchronous call waits for the terminal result and returns up to a 24 KiB UTF-8-safe response prefix, but the Agent cannot emit anything while blocked, so the `spawn.session` Signal appears only after the task completes.

`cancel_session` asks Main to cancel a running spawned Session. It returns `{ cancelled: true }` once the cancellation request has been triggered; this does not mean the ACP turn has confirmed cancellation. The turn may run for a few more seconds, then settles as `error` with code `TURN_CANCELLED_BY_PARENT`, and the Session cannot be reused. Confirm the final state with `check_session_status`. If the target is not running — unknown, already finished, or owned by another parent — the call returns `{ cancelled: false, reason: "Session not found" }` without distinguishing those cases.

## Status and Responses

`check_session_status` returns:

| Status | Meaning |
| --- | --- |
| `not_found` | The target is absent or outside the current Workspace / parent Session. The two cases are intentionally indistinguishable. |
| `running` | The turn is active, with its mode, timestamps, and up to three recent Activity items. |
| `idle` | The latest turn completed and may expose `latestResponseId`. |
| `error` | The turn failed with a stable code and message. |
| `expired` | The AgentProcess generation changed, so the old ACP Session cannot continue. |
| `interrupted` | A normal exit or restart reconciliation confirmed that the turn did not continue. |

An immutable `responseId` identifies each complete response. `read_response` reads 24 KiB by default, with `maxBytes` capped at 64 KiB. Use only the opaque cursor returned by the server. No tool accepts or exposes an app-data file path.

## Capacity, Inactivity, and Permissions

- One spawned Session can have only one active turn at a time.
- One parent Chat Session can run up to four spawned turns; the application can run up to eight.
- Capacity rejection is immediate and retryable as `SPAWN_CAPACITY_EXCEEDED`; requests are not queued.
- A turn has no absolute runtime limit. Ten minutes without ACP activity triggers cancellation, followed by a five-second confirmation window.
- The spawned Agent inherits the `cwd` and `additionalDirectories` fixed in the parent Session snapshot. Current Workspace additions cannot expand that authority.
- The spawned Agent receives no FylloCode system reminder or bundled MCP server and uses the existing ACP connection's `allow_once` permission policy.

Spawned Agents share the same Workspace directories. Parallel delegation must use non-overlapping file scopes; `fyllo-spawn` provides no separate worktree, file lock, or automatic merge.

## User-visible Inspection

After a new spawned Session is created, the parent Agent can emit one `spawn.session` according to the [Fyllo Signal](/en/docs/reference/fyllo-signal) contract. Selecting it queries Main for trusted status, the original prompt, Activity, Transcript, and response IDs. Active background turns for the current parent Session also appear near the Chat composer.

These views are read-only. Opening, closing, or refreshing details does not continue, cancel, or retry work and does not consume a background completion notification. Reopening a window queries durable state again. Background turns do not continue across application processes: a normal exit records `APP_SHUTDOWN`, while leftover non-terminal work after an unexpected restart records `APP_RESTARTED`.

## Ownership and Data Boundaries

The caller's `workspaceId` and parent Session ID come only from trusted request context injected by the Main proxy; tool input cannot override them. Main validates the parent Session, fixed Workspace snapshot, and spawned Session owner again. Cross-Workspace and cross-parent IDs return `not_found`.

Messages, turn records, and complete responses live in the parent Session's local data directory and are deleted with that parent. Deletion first blocks new turns, cancels related work, and suppresses undelivered notifications, then removes the parent Session directory. Late events cannot recreate deleted data.
