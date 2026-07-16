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
- Select installed ACP Agents
- Send text and attachment context
- Display Agent reasoning, tool calls, and streamed output
- Render structured content such as Mermaid and Markdown
- Create proposals and continue later stages inside task context
- Show a source task banner for task-based sessions, including after reopening the session
- Let Agents propose task creation, submit a plan for review, and flag or request review of knowledge entries through [fyllo-action](/en/docs/reference/fyllo-action), with FylloCode taking over execution after your confirmation

## Locating Past Messages

A timeline appears in the top-left of the conversation area, marking every message you've sent in the current session. While scrolling a long conversation, the timeline highlights the node matching your current reading position; clicking a node scrolls smoothly back to that message. The timeline is hidden when there are fewer than two messages.

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
