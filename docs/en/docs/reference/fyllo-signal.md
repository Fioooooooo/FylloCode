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

The initial release enables only `show.time`:

| Field | Constraint |
| --- | --- |
| `label` | Required string, 1–200 characters, with no CR or LF |

It is used for current date or time queries and renders `label` as a non-interactive pill with a clock icon. A response may emit at most one `show.time`.

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

## Parsing and Display Boundaries

Fyllo Signal is enabled only for assistant text parts in Chat. Specs, Guidelines, Knowledge, Proposal, user messages, reasoning, and tool content do not register the Signal tag, so identical text stays ordinary Markdown there.

FylloCode waits for the closing tag and a complete standalone-block boundary before rendering. An unclosed tag remains ordinary Markdown. A closed tag with an invalid type, JSON body, or payload shows the generic invalid-Signal fallback and does not invoke a type-specific component.

Historical Signals are rendered only by parsing saved assistant text again. Mounting or remounting a Signal never calls Action IPC, writes session `actionStates`, creates a separate storage record, or affects session attention.
