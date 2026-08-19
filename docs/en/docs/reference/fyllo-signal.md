---
sidebar:
  group: Reference
  order: 36
---

# Fyllo Signal

Fyllo Signal is a passive display protocol emitted by an ACP Agent inside Chat assistant text. It renders a schema-valid tag as lightweight visual information without asking for confirmation or triggering a business action.

Fyllo Signal shares the top-level standalone Markdown-block boundary used by [fyllo-action](/en/docs/reference/fyllo-action), but the two protocols have different responsibilities:

| Protocol | Purpose | User action | Persistence and attention |
| --- | --- | --- | --- |
| `fyllo-action` | Ask FylloCode to perform an action that requires confirmation | Confirm or cancel | May create Action state; some types enter the session event rail |
| `fyllo-signal` | Display lightweight information the Agent has already resolved | None | Creates no state, never enters the event rail, and does not change pending counts |

## Enabled Types

Two Signal types are enabled:

| Type | Purpose |
| --- | --- |
| `show.time` | Display a date or time label that has already been resolved. |
| `spawn.session` | Open read-only details for a spawned Session created through [`fyllo-spawn`](/en/docs/reference/fyllo-spawn). |

The `show.time` payload is:

| Field | Constraint |
| --- | --- |
| `label` | Required string, 1–200 characters, with no CR or LF |

It is used for current date or time queries and renders `label` as a non-interactive pill with a clock icon. A response may emit at most one `show.time`.

The `spawn.session` payload accepts one opaque lookup key:

| Field | Constraint |
| --- | --- |
| `sessionId` | Required string, 1–256 characters, with no `/`, `\`, or NUL. |

`spawn.session` is only an optional contextual deep link: Main automatically exposes newly created and continued spawned Sessions through the parent Chat activity view, so discovery, status updates, and detail access do not depend on the Signal. If the Agent emits it, it should do so only once, when `prompt_to_agent` omitted `sessionId` and successfully created a new spawned Session; continuing an existing Session does not emit it again. The payload cannot carry Workspace, parent Session, Agent, status, content, response ID, or local-path facts. Main queries and validates those values.

## Tag Format

A real Signal may use only the `type` attribute, and its body must be a strict JSON object matching that type's schema:

```html
<fyllo-signal type="show.time">
{
  "label": "2026-07-30 14:30"
}
</fyllo-signal>
```

The fenced block above is a protocol example, so it remains literal code. To emit a real Signal, the Agent starts the opening tag at the beginning of a line and gives it a standalone top-level Markdown block. If prose appears before or after it, a blank line must separate the prose from the tag. Literal `<` and `>` characters inside payload strings must be encoded as `\u003c` and `\u003e`.

`spawn.session` uses the same format, with only `sessionId` in its body:

```html
<fyllo-signal type="spawn.session">
{
  "sessionId": "spawned-session-id"
}
</fyllo-signal>
```

## Parsing and Display Boundaries

Fyllo Signal is enabled only for assistant text parts in Chat. Specs, Guidelines, Knowledge, Proposal, user messages, reasoning, and tool content do not register the Signal tag, so identical text stays ordinary Markdown there.

FylloCode waits for the closing tag and a complete standalone-block boundary before rendering. An unclosed tag remains ordinary Markdown. A closed tag with an invalid type, JSON body, or payload shows the generic invalid-Signal fallback and does not invoke a type-specific component.

Historical Signals are rendered only by parsing saved assistant text again. Mounting or remounting a Signal never calls Action IPC, writes session `actionStates`, creates a separate storage record, or affects session attention.

`spawn.session` uses the Workspace and parent Session that own its assistant message as query context; it never falls back to another currently open Session. Main validates the window, parent Session, and spawned Session owner again. Unknown, deleted, or cross-owner targets all appear unavailable. Opening details does not create, continue, cancel, or retry a spawned turn, and does not claim or dispatch its background completion notification.
