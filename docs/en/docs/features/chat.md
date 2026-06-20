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
- Let Agents propose local task creation through structured `fyllo-action` output, with user confirmation before execution

## Relationship with Lineage

Sessions started from a task are automatically bound to that task's [lineage subject](/en/docs/guide/lineage). Sessions started directly from Chat create a chat-origin subject, and can later create a task to return to the main path. Proposals created through `fyllo-specs` are automatically recorded on the same subject, without manual linking.

## Working Model

Ordinary Agent sessions usually only have current code and the latest prompt. FylloCode organizes project specs, historical decisions, task context, and guidelines as Agent-readable background so the Agent works inside clearer boundaries.

The Chat page does not aim to replace every chat tool. Its purpose is to move chat outcomes into a governable process: when the problem is clear and the decision is made, create a Proposal. After review, enter Apply & Archive so implementation and change records are preserved.
