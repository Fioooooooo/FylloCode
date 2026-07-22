---
sidebar:
  group: Product Features
  order: 40
---

# Chat and Execution

The Chat page carries Agent collaboration inside a project context. It is where the Chat stage lands on the main path. Agents analyze requirements, inspect code evidence, guide tradeoff discussions, converge on decisions with you, and then move toward Proposal and Apply & Archive.

<figure class="fc-doc-image">
  <img src="/assets/screenshots/chat.png" alt="Chat page screenshot" />
</figure>

## Main Capabilities

- Manage project sessions
- Pin important sessions into a separate group, with the pinned state restored after restart
- Select installed ACP Agents
- Send text and attachment context
- Display Agent reasoning, tool calls, subagent calls, and streamed output state
- Render structured content such as Mermaid and Markdown
- Create proposals and continue later stages inside task context
- Show a source task banner for task-based sessions, including after reopening the session
- Let Agents propose task creation, submit a plan for review, and flag or request review of knowledge entries through [fyllo-action](/en/docs/reference/fyllo-action), with FylloCode taking over execution after your confirmation

## Locating Past Messages

A timeline appears in the top-left of the conversation area, marking every message you've sent in the current session. While scrolling a long conversation, the timeline highlights the node matching your current reading position; clicking or dragging the line index locates the matching message. The timeline also supports keyboard focus, arrow-key preview, Enter to locate, and Escape to close the summary popover. The timeline is hidden when there are fewer than two messages.

## Reading Agent Activity

The currently streaming assistant message shows a runtime indicator after the content already received, with generic status text and elapsed time in natural units. The indicator only means the reply is still being processed; it does not infer the Agent's specific action from tool calls. It is removed when the stream finishes, fails, or is cancelled, and historical messages do not retain this runtime state.

Consecutive Thinking and normal tool calls are grouped into a collapsible Activity group. After expanding the group, you can inspect each Thinking and Tool item separately, including complete Input and Output sections. Long content scrolls inside the detail area instead of being truncated in the underlying data.

When Claude Code starts a subagent through the Agent tool, the parent call appears as a separate card. Opening the details shows the prompt, status, model, tokens, duration, tool statistics, child tool activity, and final response. The details connect only parent-child tool relationships that can be safely confirmed inside the same assistant message; tools that cannot be linked continue to appear as normal tools.

## Session Event Rail

A collapsible rail on the right side of the conversation area collects information that matters but shouldn't interrupt the current discussion:

- **Agent agenda** — the list of action items the Agent has laid out for this session
- **Proposal cards** — proposals created in this session and their live status
- **Pending fyllo-action items** — read-only summaries and navigation entries for rail-type actions such as `knowledge.flag` and `knowledge.review`; confirmation still happens on the inline card in the chat transcript

<figure class="fc-doc-image">
  <img src="/assets/screenshots/chat-rail.png" alt="Session event rail screenshot" />
</figure>

The rail can be collapsed to a narrow strip at any time; its expanded/collapsed state persists across sessions.

## Relationship with Lineage

Sessions started from a task are automatically bound to that task's [lineage subject](/en/docs/guide/lineage). Sessions started directly from Chat create a chat-origin subject, and can later create a task to return to the main path. Proposals created through `fyllo-specs` are automatically recorded on the same subject, without manual linking.

## Working Model

Ordinary Agent sessions usually only have current code and the latest prompt. FylloCode organizes project specs, historical decisions, task context, and guidelines as Agent-readable background so the Agent works inside clearer boundaries.

The Chat page does not aim to replace every chat tool. Its purpose is to move chat outcomes into a governable process: when the problem is clear and the decision is made, create a Proposal. After review, enter Apply & Archive so implementation and change records are preserved.
