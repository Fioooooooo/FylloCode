---
title: Proactive Knowledge Capture in FylloCode
description: How FylloCode's knowledge tool defines what deserves to be preserved, uses a two-stage flag/capture mechanism, and completes an agent self-evolution loop with guidelines and lineage.
sidebar:
  order: 9
---

# Proactive Knowledge Capture in FylloCode

FylloCode v0.14.1 introduced the `knowledge` feature, which proactively discovers and preserves three kinds of project-level knowledge:

| Type | Definition | Typical entries | Who can retire it |
| --- | --- | --- | --- |
| `project` | Facts about this project | Architectural invariants and pitfalls (with anchors); business or legal context and oral history (without anchors, but with a `source`) | With an anchor: an agent after verification; without an anchor: only the user |
| `reference` | Facts about third parties | Framework documentation summaries, observed dependency behavior (`package` anchor), external API patterns (`url` anchor) | An agent after checking the version or freshness window |
| `feedback` | **Durable** instructions, corrections, or emphasis from the user that remain applicable beyond the current task | “Do not run pnpm lint directly—an uncached run takes at least three minutes”; “Do not use GPL-licensed dependencies (legal requirement)” | **Only the user** |

## A Particularly Grueling Debugging Session

The idea for this tool grew out of a bug investigation. The eventual fix was simple—you can see it [here](https://github.com/Fioooooooo/FylloCode/commit/874904517a53b8e7a506a2d1b57dcfcbe980dfa4)—but finding it consumed most of my day.

The initial symptom was straightforward. During local testing, I noticed that a conversation page became very slow to load once a session accumulated too many turns. The conversation I was investigating had roughly 15 turns and was not especially long, yet opening the conversation stream took at least 20 seconds.

I started Codex inside FylloCode to help investigate. We first read the source of Nuxt UI's `ChatMessages` component because FylloCode's conversation stream is built mainly on top of it, making the component the obvious first suspect. After reading the entire component and trying several speculative fixes, the problem remained.

Next, we recorded the page opening in Electron DevTools and inspected the flame chart. After several rounds of testing, the time was finally traced to the `MarkStream` component. This component is only a thin wrapper around the `markstream-vue` Markdown rendering library and contains almost no business logic.

While Codex dug into the `markstream-vue` source, I searched the official documentation for possible solutions. `markstream-vue` is highly configurable, so we tried another round of parameter tuning, again without much improvement. Throughout the investigation, the agent kept saying things like “this does not add up,” “this should not happen,” and “the source already contains optimizations, so it should not be this slow.”

I decided to have Codex search with me for other projects using the same or a similar stack. We found [deepchat](https://github.com/ThinkInAIXYZ/deepchat), a project with 6,000 GitHub stars and a stack very close to ours: it is also an electron-vite + TypeScript desktop application, it also supports ACP, and, most importantly, it also uses `markstream-vue` for Markdown rendering. I asked Codex to analyze deepchat's Markdown parsing path and reproduce its logic to see whether that would solve FylloCode's problem. But deepchat did not customize very much, so this still did not address the root cause.

By then we had spent a great deal of time and tokens without solving the problem. I went back to the beginning and tried to narrow down the likely source methodically. Deepchat uses the same stack. If it had the same rendering problem, plenty of users would surely have reported it—but they had not. Why, then, was FylloCode so much slower? Comparing the two item by item, deepchat and FylloCode both use `markstream-vue` only for plain-text rendering of assistant output. For tool calls, deepchat uses a custom component, whereas FylloCode uses Nuxt UI's [ChatTool](https://ui.nuxt.com/docs/components/chat-tool) component. There were no other meaningful differences.

Wait—tool calls. That was the biggest difference between deepchat and FylloCode. Deepchat is positioned as a general-purpose desktop agent that integrates both cloud APIs and local agents, whereas FylloCode is more focused on engineering work for product and development teams. Because of that difference, a single turn in FylloCode naturally produces more tool calls: the agent needs to investigate the codebase, read files, and search. This continually fragments the DOM on FylloCode's conversation page. Every tool call creates a `ChatTool`, and each piece of text between calls—even a single sentence—is rendered by another `MarkStream`. FylloCode's conversation stream therefore produces far more nodes.

Those 15 turns had created nearly 400 markstream-vue nodes. Combining that fact with the earlier flame-chart analysis, Codex finally identified the root cause: the `MarkStream` wrapper used VueUse's `useDark` function internally to adapt to light and dark modes. Because so many `MarkStream` instances were rendered, global style recalculation was triggered repeatedly during `flushJobs`, ultimately causing the slowdown. The fix was simple: move `useDark` up into the conversation list and pass its value to each `MarkStream` through props. The test conversation's load time fell from 20 seconds to around two.

## What Remains After the Conversation Closes

Afterward, I kept thinking about how much reusable knowledge and capability that process had produced. If we did nothing with it, everything would disappear as soon as the debugging conversation was closed. Plan and Proposal capabilities were already on the roadmap, but this time-, energy-, and token-intensive investigation did not belong in either one. It was not a relatively complex plan. Debugging required frequent trial and error, and it did not change any public contract such as user-visible behavior, architectural conventions, or page or file capabilities. Once the conversation closed, all of the agent's exploration would be lost, and the next similar problem would have to be investigated from scratch.

That led me to consider building a tool that could proactively preserve knowledge during a conversation.

Before implementing anything, I conducted an in-depth study of [the memory mechanisms of three coding agents](2026-07-07-memory-detail-of-coding-agents.md). I looked at how their memory systems worked and read a great deal of community feedback. From that research, the direction of the `knowledge` tool gradually emerged.

The conclusion was that we could not simply copy memory. Claude Code's memory entries, for example, are short, take effect immediately when written, require no review, and are edited or deleted in place when they become outdated. What I wanted to preserve was different. The output of this investigation was long and structured, and an incorrect entry could mislead future sessions, so the user needed to review it before it was written. Once the premises change, the mechanism must be reconsidered. The following sections record several questions that took the longest to resolve during the design process.

## What Counts as Knowledge

The first question was admission. If anything can enter knowledge, it will quickly deteriorate into an inferior summary of the repository, while the repository itself will always be more authoritative. I therefore established one hard rule: could a future agent reach the same conclusion from the repository, guidelines, lineage, or git log within a reasonable token budget? If it could, the conclusion must not be treated as knowledge.

After applying that rule, only two kinds of knowledge remain.

The first is a **cache of expensive inferences**. The conclusion can technically be derived from the repository, but doing so is costly. For example: “Every text part in the conversation stream is a separate `MarkStream` instance. A long conversation can create hundreds of instances, making this rendering path extremely sensitive to per-instance overhead.” Reaching that conclusion again would require another round of flame-chart analysis.

The second is **facts that cannot be inferred**. These are facts that no repository scan could reveal, such as “Do not use GPL-licensed dependencies for legal reasons.” Unless someone records that sentence, an agent can never discover it on its own.

## Classifying Knowledge

`project` and `reference` were settled early. The third category was the difficult one.

At first it was called `preference`. The categories were based on what could make each kind of knowledge expire: project knowledge aged as the code evolved, reference knowledge aged with dependency versions, and preferences expired only when a person changed their mind. But `preference` could not hold something like “Legal does not permit GPL.” That is not a preference; it is a project fact that only a person can assert. I renamed the category `context` and expanded it into a broad container for preferences, business constraints, environmental realities, and oral history.

Then `context` proved too broad. Almost anything can be called context, and a name that accepts everything provides no guidance when classifying entries. I revisited Claude Code's four memory types—user, project, feedback, and reference—and eventually settled on `feedback`:

- It contains only durable instructions from the user: instructions that remain applicable beyond the current task. “Do not run pnpm lint directly; an uncached run takes three minutes” qualifies. “Change this function to X” does not; that is simply a task instruction.
- Every feedback entry must record its rationale. The rationale is what makes later reconsideration possible. If lint becomes fast one day, the user can see why the entry existed and know it can be retired.
- Claude Code's `user` type was excluded. FylloCode is an engineering tool and does not need to model the user as a person.

This round of iteration also produced a more important change: expiration semantics moved from types down to anchors. What truly determines when an entry expires is not its type but its own anchor. File anchors store a content digest (SHA-256), dependency anchors store the resolved version, and external-source anchors store the last verification time. Entries with anchors can be checked mechanically for freshness. Entries that cannot provide an anchor must name their source and can be retired only on a person's authority. Types return to being purely semantic groupings, while expiration checks become fingerprint comparisons instead of “reason through everything again.”

## Where Knowledge Is Stored

Guidelines live in the repository because I want people and coding agents to be able to share them even when they are not using FylloCode. Should knowledge live there too? I spent a long time on this question and ultimately decided it should not. Instead, it lives in a project-level directory under app data, for three reasons:

1. Worktree consistency. FylloCode relies heavily on worktrees. A file inside the repository belongs to a branch and is invisible to other sessions until merged; discard the branch and the knowledge disappears with it. App data is immediately visible to every window and worktree.
2. False authority. Anything committed to a repository carries an air of approval. Guidelines deserve that authority because they are deliberately maintained team conventions. Much of knowledge consists of inferences awaiting validation or material closer to a user's personal notes.
3. Pull-request noise. Knowledge is a high-frequency byproduct of conversations. Mixing it into feature PRs would increase review overhead.

The storage structure also went through a round of simplification. An intermediate design used `entries/` and `staged/` subdirectories—one for accepted entries and one for candidates. It later became clear that candidates did not need a directory at all. In the final design, the files in the knowledge directory are the knowledge itself, all at one flat level. There is only one writer. The invariant that “everything in this directory has been reviewed by the user” is guaranteed by the structure and requires no fields or filtering logic to maintain.

## When Knowledge Is Triggered

This was the most difficult part of the entire design because three constraints worked against one another.

Knowledge entries are much longer than memory entries. The user must be informed before they are written and must review them afterward. If the agent begins capturing knowledge the moment it notices something worth preserving, it interrupts both the user's attention and the agent's context. But waiting until the task is completely finished does not work either. If the user immediately gives the agent something else to do, its attention shifts and it “forgets” what should have been preserved. I also explicitly rejected Codex's approach of organizing conversations into memories in the background. If an LLM quietly runs behind the scenes, the user's first thought will be: “FylloCode is stealing my tokens.”

The more constraints I considered, the closer I came to the real solution. If all of my concerns revolved around LLM attention, why not use that mechanism instead? At the beginning of a conversation, the agent can be prompted to look for knowledge worth preserving. The moment such a signal appears, it makes a very lightweight tool call. FylloCode can show a tiny hint in the conversation stream, much like placing a bookmark while reading. Once the bookmark exists, the agent can return its attention to that point when the user mentions it later.

This decomposes one problem into two steps—“discovery” and “writing”—and that decomposition directly solves the transparency problem because the entire process is visible to the user. Application-persisted state bridges the two steps, and every LLM call happens in the foreground conversation where the user can see it.

- **Flag stage:** The instant a signal appears, the agent emits only a `knowledge.flag`: a one-sentence candidate plus a few file pointers, costing roughly a hundred tokens, and then continues working. It is not knowledge yet, only a bookmark. It requires no review and can simply be discarded if it is wrong. What counts as a signal? Four common cases are: reality overturns a reasonable assumption—the moment the agent finds itself writing “it turns out”; in the investigation above, Codex repeatedly saying “this does not add up” was the classic signal; an investigation or long reading session produces far less output than the volume of material consumed; the user gives a durable instruction; or the user states background information that cannot be found in the repository. No list can cover every form, so the fallback test is one question: if this information is lost, will a future session have to pay for it?
- **Capture stage:** The actual writing waits until the user explicitly triggers it. Unresolved flags remain in the conversation's EventRail, which serves as the reminder. When the user wants to handle them, they click once and FylloCode assembles an ordinary user message for the agent. Authorization to spend tokens is therefore no different from a normal chat message. The agent takes the candidate list, runs each item through the admission tests, explains why rejected items were filtered out, expands accepted items into complete entries, and finally packages them into a `knowledge.review` card. The user reviews them in bulk in a panel, and application code writes the confirmed entries to disk. Each conversation interrupts the user at most once.

This two-stage system has a deliberate bias: the threshold for flagging is low. Flag anything that looks even somewhat promising. False positives pass through two inexpensive filters—the agent reviews them again during capture, and the user reviews the card. False negatives cannot be recovered. A signal that should have been recorded but was not is the only irreversible error in the system.

## Explicit Creation, Explicit Review

During capture, the agent applies five admission tests to every candidate:

- It cannot be inferred, or inferring it would be cumbersome and expensive.
- It has a reuse scenario.
- Its ownership is correct: only durable user instructions are feedback; conventions inferred by the agent should be routed to guidelines instead.
- The conclusion has been verified.
- For investigation-related candidates specifically, it remains true after the fix.

The correct output for a typical conversation is zero entries. If every candidate passes all five rules, the process is probably just going through the motions.

Once the user approves an entry, writing it to disk is entirely the responsibility of application code. The `knowledge.review` payload carries structured fields rather than arbitrary Markdown. A handler generates the file, prevents path traversal, writes atomically, and makes retries idempotent per entry. This follows the same principle described in the Lineage article: the agent is responsible for judgment, analysis, and expression; the engineering system is responsible for pipeline integrity and data safety.

## The Final Implementation

In v0.14.1, this mechanism consists of several parts:

- Two fyllo-actions: `knowledge.flag` (rendered passively, with unresolved items kept in the EventRail) and `knowledge.review` (the review card).
- One MCP tool, `knowledge`, with four modes: capture retrieves writing guidance and the existing index, update revises outdated entries, retire retires them, and audit performs a batch health check.
- A derived index: at the beginning of every conversation, FylloCode scans the frontmatter of every entry and injects a `<knowledge>` block into the system reminder. It includes only the name, a one-line hook, and the freshness status, at roughly 30 tokens per entry. Status is computed live when the block is injected. Anchor fingerprint comparisons produce `active`, `suspect`, or `unknown`; the agent verifies entries marked suspect before using them.
- The knowledge files themselves: a flat directory of Markdown files under app data. Their frontmatter records the type, anchor fingerprint, and source. Their bodies describe the fact, its rationale, and the conditions that would falsify it.

The index is derived rather than maintained as a MEMORY.md-style list like Claude Code's. A handwritten index can drift away from its underlying files, which is why Claude Code needs consolidation as after-the-fact maintenance. A derived index is a mechanical projection of the file system and cannot drift. It can also include freshness calculated in real time whenever it is injected.

## What It Provides

Return to the debugging session at the beginning. If knowledge had existed then, the output of that half-day should have looked like this:

| Output | Destination |
| --- | --- |
| The fix itself (moving `useDark` upward) | Git commit, as before |
| “Do not subscribe directly to a global reactive composable inside a leaf component that is instantiated many times” | Guideline, becoming a team convention |
| “Every text part in the conversation stream creates a `MarkStream` instance; long conversations create hundreds, so this path is highly sensitive to per-instance overhead” | Project knowledge, anchored to the relevant components |
| The causal model behind the fix (why passing the value down from the container works) | Project knowledge, preventing a future “helpful refactor” from reintroducing the problem |
| The distilled `markstream-vue` documentation | Reference knowledge, anchored to the dependency version |

In reality, all of it disappeared when the conversation closed. Later, another conversation needed to change `markstream-vue` and read the documentation all over again. That is exactly the kind of cost knowledge is meant to eliminate. The repeated exploration saved by a single successful lookup can pay for injecting the index into dozens of conversations.

For a team, the benefits are concrete: the next agent can immediately find a previously investigated pitfall; documentation that has already been read does not need to be reread in the next conversation; rules the user has emphasized are not forgotten when the session changes. And code that looks strange but exists for a reason will not be casually “cleaned up.”

## Three Pillars of Self-Evolution

Knowledge is not an isolated feature. It completes the third part of FylloCode's knowledge system. Each of the three tools has one job:

- **Guideline** governs “how things should be done.” It is normative, lives in the repository, and goes through pull requests.
- **Knowledge** governs “what is true and why.” It captures facts and causal models, carries anchors and sources, and changes as those facts are verified.
- **Lineage** governs “where all of this came from.” It is the causal chain from tasks and conversations through Proposals to commits.

There are also paths between them. Knowledge entries that are repeatedly referenced and deserve formal status can be promoted to guidelines. Where lineage does not reach—for example, a direct fix that bypasses Proposal—knowledge preserves the causal model. New discoveries made while an agent follows a guideline flow back into knowledge.

Together, these three tools give a coding agent the conditions for self-evolution inside a project: **every conversation consumes existing conventions, facts, and context while also producing new ones**. As the project grows in functionality, the agent's understanding of it grows too, and that understanding no longer evaporates when a conversation closes.

Every debate and reversal from the design process remains in the repository under `references/knowledge-tool/`. By knowledge's own standards, that document is itself a textbook example of valid project knowledge.
