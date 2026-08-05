---
sidebar:
  group: Product Features
  order: 40
---

# Chat and Execution

The Chat page carries Agent collaboration inside a project context. It is where the Chat stage lands on the main path. Agents analyze requirements, inspect code evidence, guide tradeoff discussions, converge on decisions with you, and then move toward Proposal and Apply & Archive.

## Main Capabilities

- Manage sessions in the Workspace
- Pin important sessions into a separate group, with the pinned state restored after restart
- Collapse the **Pinned Sessions** and **Recent Sessions** groups independently, sharing available height between expanded groups
- Select installed ACP Agents
- Inspect and change Agent-provided Session configuration from one menu
- Inspect the fixed Session scope in the Chat header, including snapshot-only and stale members
- Send text and attachment context
- Display Agent reasoning, tool calls, subagent calls, and streamed output state
- Render structured content such as Mermaid and Markdown
- Safely preview absolute local file links supplied by an Agent from any Markdown reading surface
- Create proposals and continue later stages inside task context
- Show a source task banner for task-based sessions, including after reopening the session
- Let Agents propose task creation, submit a plan for review, and flag or request review of knowledge entries through [fyllo-action](/en/docs/reference/fyllo-action), with FylloCode taking over execution after your confirmation
- Let Agents display lightweight information that requires no confirmation through [Fyllo Signal](/en/docs/reference/fyllo-signal); Signals do not enter the session event rail

## Managing Session Groups

**Pinned Sessions** and **Recent Sessions** are each sorted by recent activity. Every non-empty group can be collapsed independently. When both groups are expanded, they share the remaining height below their headers and scroll separately. Collapsing a group does not interrupt background execution, and expanding it restores the previous scroll position. Collapse state lasts only for the current Chat-sidebar mount and is not written to session metadata.

## Adjusting Session Configuration

When an Agent provides Session configuration, the composer shows one configuration button. The button prioritizes the current values as “model · thought level,” shows either value when only one is available, and falls back to `Config` when neither category exists. The button is hidden when there is no visible configuration.

The menu presents select configuration through submenus and boolean configuration as top-level checkboxes. It preserves the Agent's option order. After a change, FylloCode refreshes the summary, current values, and available options from the Agent's complete configuration snapshot, so related changes such as a model updating its thought levels appear together.

## Locating Past Messages

When the current session has at least two user prompts, a floating timeline appears in the top-left of the conversation area. Each of 2–10 prompts gets a guide; longer conversations stay at 10 guides, while the full rail still maps continuously to every prompt. A separate teal thumb follows the current reading position, so the timeline does not keep growing or reduce the message-column width.

Hovering or using the arrow keys shows up to five nearby prompt summaries. Clicking the timeline or pressing Enter pins the complete prompt list, which scrolls independently and lets you locate any message by selecting its summary. Dragging or using the mouse wheel moves through prompts quickly, Home and End jump to the boundaries, and Escape closes the summary popover. The timeline is hidden when there are fewer than two prompts.

## Reading Agent Activity

The currently streaming assistant message shows a runtime indicator after the content already received, with generic status text and elapsed time in natural units. The indicator only means the reply is still being processed; it does not infer the Agent's specific action from tool calls. It is removed when the stream finishes, fails, or is cancelled, and historical messages do not retain this runtime state.

Consecutive Thinking and normal tool calls are grouped into a collapsible Activity group. After expanding the group, you can inspect each Thinking and Tool item separately, including complete Input and Output sections. Long content scrolls inside the detail area instead of being truncated in the underlying data.

When Claude Code starts a subagent through the Agent tool, the parent call appears as a separate card. Opening the details shows the prompt, status, model, tokens, duration, tool statistics, child tool activity, and final response. The details connect only parent-child tool relationships that can be safely confirmed inside the same assistant message; tools that cannot be linked continue to appear as normal tools.

## Session Scope

When a multi-root ACP Session is created, FylloCode fixes the Workspace member snapshot at that moment. Agents with additional-directory support can access multiple authorized Projects at once; later Workspace additions, removals, or relocations do not change a running Session. The Chat header scope popover lists each Project, its path, and the primary-Project marker, and warns when the current Workspace differs from the Session snapshot. See [Multi-root Workspace](/en/docs/features/multi-root-workspace) for the problem it solves and its authorization boundaries.

## Previewing Local Files

When an Agent emits a Markdown link to a POSIX, Windows drive, or UNC absolute path, clicking it opens a read-only preview in a window-level Slideover. Files under the roots and registered worktrees of Projects in the current Session snapshot can be read directly. For files outside those trusted roots, FylloCode displays the full canonical path, size, and modification time before reading content, then requires either **Open Once** or **Open and Trust in This Window**.

Preview accepts regular UTF-8 text files up to 5 MiB. Directories, devices, binary content, and invalid UTF-8 are rejected. Add `:line[:column]` to a link to locate source; the preview supports search, selection, and copy, but never save or write-back. Window trust exists only in memory for the current Renderer Window and expires when the window closes or the app restarts.

Every text file can switch between **Content Overflow** and **Wrap Lines**. Recognized Markdown files also show **Source** and **Preview** modes; Preview renders the current read-only snapshot through shared MarkStream. These display choices reset when the Slideover closes.

## Fyllo Signal

Fyllo Signal is a passive display marker emitted inside assistant text. The current `show.time` type renders a time label as a non-interactive pill. It requires no confirmation, creates no Action state, does not enter the session event rail, and does not affect pending counts. Historical Signals are rendered again only from saved assistant text. See the [Fyllo Signal reference](/en/docs/reference/fyllo-signal) for the protocol details.

## Session Event Rail

A collapsible rail on the right side of the conversation area collects information that matters but shouldn't interrupt the current discussion:

- **Agent agenda**: the list of action items the Agent has laid out for this session
- **Proposal cards**: proposals created in this session and their live status
- **Pending fyllo-action items**: read-only summaries and navigation entries for rail-type actions such as `knowledge.flag` and `knowledge.review`; confirmation still happens on the inline card in the chat transcript

<figure class="fc-doc-image">
  <img src="/assets/screenshots/chat-rail.png" alt="Session event rail screenshot" />
</figure>

The rail can be collapsed to a narrow strip at any time; its expanded/collapsed state persists across sessions.

## Relationship with Lineage

Sessions started from a task are automatically bound to that task's [lineage subject](/en/docs/guide/lineage). Sessions started directly from Chat create a chat-origin subject, and can later create a task to return to the main path. Proposals created through `fyllo-specs` are automatically recorded on the same subject, without manual linking.

## Working Model

Ordinary Agent sessions usually only have current code and the latest prompt. FylloCode organizes project specs, historical decisions, task context, and guidelines as Agent-readable background so the Agent works inside clearer boundaries.

Chat moves discussion outcomes into a governable process. When the problem is clear and the decision is made, create a Proposal. After review, enter Apply & Archive so implementation and change records are preserved.
