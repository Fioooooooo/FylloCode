---
title: What Coding Agents Should Tell You When the Prompt Cache Expires
description: A look at Kimi Code, Claude Code, Windsurf, and Pi, and how Coding Agents can turn prompt cache expiry from a hidden cost into visible, actionable session state.
sidebar:
  order: 12
---

# What Coding Agents Should Tell You When the Prompt Cache Expires

I recently read Claude’s blog post [“Maximizing the value of your Claude Code sessions”](https://claude.com/blog/maximizing-the-value-of-your-claude-code-sessions), which spends a substantial amount of time on tokens and prompt caching. If the beginning of a request is exactly the same as the beginning of the request the server just received, the shared prefix state is also the same. The server can therefore retain that state and prefill only the content that follows it. When tokens hit the cache, the request is both more efficient and less expensive.

As it happened, yesterday I was using Kimi Code and tried to send another message to a conversation that had been idle for a while. Kimi Code showed a hint along the lines of: “The Prompt Cache for this conversation expired `x` minutes ago. Continuing will consume `x` additional tokens.”

That caught my attention, so I decided to investigate how Agent Harnesses currently interact with users when the Prompt Cache expires.

## Four mechanisms that should not be conflated

As I compared these implementations, I found that prompt-cache features are often discussed together even though they intervene at very different points in the user’s decision.

| Level | Typical behavior | Can the user avoid this cold-cache cost? |
| --- | --- | --- |
| Post-request observation | Show a cache miss, hit rate, or rebilled tokens after the response | No |
| Expiry visibility | Show a TTL countdown and change state when it expires | Yes, but the user has to work out what to do |
| Pre-send warning | At submit time, report that the cache has expired and estimate how much context the next turn may reprocess | Yes |
| Pre-send decision gate | Pause submission and offer compaction, a new session, or sending unchanged | Yes, with an explicit recovery path |

Aider’s keep-alive, Pydantic AI Harness’s `CacheBustWarning`, and VS Code’s Cache Explorer are useful reference points, but they solve different problems. A keep-alive tries to prevent expiry. `CacheBustWarning` and Cache Explorer diagnose requests after they happen. What I want to examine here are the last two levels: **whether an Agent knows that its cache is cold before it sends a message, and whether it gives the cost and the decision back to the user.**

## Kimi Code: the most complete pre-send decision flow so far

Kimi Code introduced its Cache Expiry Hint in [PR #2646](https://github.com/MoonshotAI/kimi-code/pull/2646). It can trigger in two situations: after resuming a long-idle session, and when submitting a new message after the current process has been idle for long enough.

What stood out to me was not the dialog itself, but the work required to decide whether it should appear.

The first thing I noticed is that the TTL is not hard-coded in the client. Kimi Code reads `estimated_cache_duration` from a public `client_configs` endpoint and obtains a `cache_duration` and `min_tokens_to_hint` for each model. It interrupts the user only when the idle period exceeds that model’s cache lifetime and the current context is large enough to justify a warning. The current implementation applies only to OAuth-managed providers. If the model, usage, or server configuration is missing, it skips the hint instead of pretending that it knows the cache state.

The second detail matters just as much: it tracks real LLM round trips rather than every piece of local activity. Permission decisions, Plan updates, and configuration changes may modify session files, but they do not refresh the server-side cache. When Kimi Code reconstructs `lastActiveAt` for a resumed session, it considers only message and compaction records. In a live session, it updates activity only after a provider request completes. The implementation is visible in [`cache-hint-controller.ts`](https://github.com/MoonshotAI/kimi-code/blob/main/apps/kimi-code/src/tui/controllers/cache-hint-controller.ts).

When the rule matches, Kimi Code stashes the submitted message instead of sending it first and warning afterward. The dialog shows the idle period and the current context size in tokens, then offers four actions:

- Compact the context and continue.
- Start a new session and send the message there.
- Keep the full history and continue as-is.
- Turn off future warnings.

Canceling restores the message to the editor. If the user chooses compaction or a new session, the stashed message returns to the normal send path only after that action starts successfully. The official configuration documentation exposes this behavior through the default-on `cache_expiry_hint` setting. See the [Kimi Code configuration reference](https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/configuration/config-files.md#tuitoml).

Put together, these pieces form a complete flow: the server supplies the TTL, the client identifies real model activity, the submit path holds the message, the interface explains the impending cost, and the user chooses how to recover. This is more than an expiry notification. It is a preflight check for a request that may be unexpectedly expensive.

## Claude Code: not yet comprehensive

Looking at Claude Code, I see prompt cache state moving out of diagnostics and into the main interaction.

[v2.1.84](https://github.com/anthropics/claude-code/releases/tag/v2.1.84) added an idle-return prompt. When a user returned after more than 75 minutes, the client nudged them toward `/clear` to avoid recaching a large stale session.

[v2.1.92](https://github.com/anthropics/claude-code/releases/tag/v2.1.92) went further. Pro users returning to a session after its prompt cache had expired began seeing a footer hint with a rough estimate of how many tokens the next turn would send uncached. The same release fixed the `/clear to save X tokens` hint so that it used the current context size rather than cumulative session tokens.

The current Claude Code documentation also confirms that the client knows which TTL applies to each request category. Main conversations within a subscription plan’s included usage generally receive a one-hour TTL. API keys, cloud providers, and main conversations using paid usage credits generally receive five minutes. Newer versions expose `promptCacheTtl` and `subagentPromptCacheTtl`, allowing users to choose five minutes or one hour. For actions such as switching models or reloading plugins, Claude Code also uses cache validity to decide whether to confirm or block a change that would force a full reread on the next turn. See the [Claude Code prompt-caching documentation](https://code.claude.com/docs/en/prompt-caching).

Claude Code still does not provide a universal pre-send gate for every expired request. The v2.1.84 release notes explicitly place the idle-return threshold at 75 minutes, while the v2.1.92 footer hint explicitly names Pro users. A user on v2.1.114 also reported receiving no pre-send warning after leaving a large five-minute-TTL context idle for 45 minutes. See [Claude Code issue #51218](https://github.com/anthropics/claude-code/issues/51218).

So I would not describe Claude Code as having “no cache-expiry warning.” A more accurate conclusion is: **Claude Code has TTL-aware cost hints and a `/clear` recovery suggestion, but the hint’s coverage is not yet aligned with every TTL the next request may actually use.**

## Windsurf: putting the cache timer beside context usage

Windsurf takes a more persistent approach. In April 2026, it integrated a prompt cache timer directly into the context-window indicator so users could see the remaining cache lifetime before sending another message. Response cards also began showing token counts to explain how each message’s cost was calculated. See the [Windsurf announcement](https://windsurf.com/blog/windsurf-adaptive).

The official post does not describe the exact interaction after the countdown reaches zero. A report from a Windsurf v2.3.9 user says that hovering over the usage indicator reveals the remaining TTL and that the message changes to `Prompt cache has expired. Higher cost expected.` when the timer reaches zero. This is user-reported behavior rather than an official product contract, but it does provide evidence of a visible transition from valid, to counting down, to expired. See the [Windsurf user report](https://www.reddit.com/r/windsurf/comments/1tjpybl/prompt_cache_expires_while_the_agent_is_running/).

What I like about Windsurf’s approach is that the state remains visible instead of appearing only after the user presses Send. The limitation is equally clear: there is no evidence yet that it estimates how many tokens the next request will reprocess or offers compaction and new-session actions directly. It exposes the risk, but leaves the next step to the user.

## Pi: a community extension derives TTL from the outgoing request

Pi’s built-in `showCacheMissNotices` is post-request behavior. After a response, it uses reported usage to identify a significant miss and estimate the rebilled tokens and cost. A newer community extension, [`@siddr/pi-cache-expiry-warning`](https://www.npmjs.com/package/@siddr/pi-cache-expiry-warning), moves the timing ahead of the next turn.

The extension inspects the payload that Pi actually sends to the provider, recognizes Anthropic, Bedrock, and OpenAI cache-control fields, and starts the corresponding timer when the request goes out. It uses five minutes for the normal short-cache window. If the payload carries a one-hour or 24-hour retention setting, it follows the TTL that was actually serialized. Once the timer expires, it displays a warning above the editor without adding anything to model context.

It does not estimate tokens or offer an action menu, but it suggests an implementation rule I would keep: **do not rely only on an environment variable, and do not infer expiry from a zero cache-read count after the fact. Whenever possible, derive the active cache policy from the final outgoing request.** If a custom provider does not serialize a recognized TTL, the extension shows no warning. That is more trustworthy than a precise-looking countdown based on a guess.

## Third-party clients are filling gaps left by mainstream Agents

The open-source [Better Agent Terminal](https://github.com/tony1223/better-agent-terminal) wraps the Claude Code SDK with another fairly complete Cache Cost Awareness layer:

- An optional floating countdown for both five-minute and one-hour TTLs.
- Refreshes every 30 seconds and appears after one minute of idle time.
- Per-turn cache read/write history with model-specific cost calculations.
- A pre-send confirmation when more than 150K cached tokens have expired after more than one hour.

It is an Agent client rather than a separate model Agent. That distinction is exactly why I find the example useful. When the underlying Agent does not provide complete cost protection, a host can still add a guard using session usage, TTL, and submit events. In a desktop application that hosts several Agents, this capability may belong in the shared session layer instead of waiting for every Agent to implement it separately.

## What a dependable cache-expiry UX needs to know

After comparing these implementations, I would not build a pre-send warning around a single `setTimeout`. The client has to answer at least five questions.

### 1. Which TTL did this request actually use?

Main conversations, subagents, API keys, subscription usage, and paid overage can use different TTLs inside the same product. The best sources, in order, are the final outgoing payload, server-supplied configuration, explicit provider capabilities, and only then a client default.

### 2. What event actually refreshed the cache?

Typing, permission approvals, and local state writes do not count. Only a model request that reaches the provider and establishes or hits the cache can refresh its lifetime. A failed request, a turn blocked by a hook, or a message that has not left the client should not reset the countdown early.

### 3. Did the TTL expire, or did the prefix change?

Switching models, changing effort, modifying tool definitions, or reordering the system prompt can invalidate a cache that is still within its TTL. Time can identify a likely expiry. Usage can identify a miss that already happened. A dependable client also needs to track model, effort, tool set, and cache-key changes if it wants to explain the cause correctly.

### 4. How much is actually at risk?

“Cache expired” means very different things in a 2,000-token session and a 200,000-token session. A useful warning should at least show how much context may be reprocessed. If the client knows the provider’s effective price, it can also estimate a cost range. If a gateway, routing change, or server policy makes that estimate uncertain, the interface should say “estimated” rather than presenting it as an invoice.

### 5. What can the user do next?

A warning without a recovery action hands the technical decision back to the user. An actionable prompt should at least allow compaction, a new session, sending unchanged, and canceling. Users who do not want the interruption can opt out, but silence should not be the only default.

The interface does not need to explain the full prompt-cache implementation. From a user’s point of view, three lines are enough:

```text
Prompt cache expired 12 minutes ago
The next request may reprocess approximately 184K tokens
[Compact and continue] [New session] [Send unchanged] [Cancel]
```

## Prompt cache belongs in session state

Kimi Code currently provides the most complete decision gate. Claude Code has started showing uncached-token estimates and suggesting `/clear`. Windsurf keeps the TTL countdown visible. Pi’s community extension demonstrates how to derive TTL from the final provider payload. Better Agent Terminal shows how a shared client can add a pre-send guard around an existing Agent.

They do not use the same interface, but I see the same direction in all of them. Prompt cache is no longer just a number in provider usage. It is session state that can change the cost of the user’s next action.

For an Agent client, the useful question is no longer “Did the previous request miss the cache?” It is: **before the user presses Send, do we know that this request is about to become more expensive, and if we do, have we offered a cheaper option that still fits the task?** That is the standard I would use when evaluating a cache-expiry warning.

## References

- [Kimi Code PR #2646: Cache Expiry Hint](https://github.com/MoonshotAI/kimi-code/pull/2646)
- [Kimi Code `cache-hint-controller.ts`](https://github.com/MoonshotAI/kimi-code/blob/main/apps/kimi-code/src/tui/controllers/cache-hint-controller.ts)
- [Kimi Code configuration reference](https://github.com/MoonshotAI/kimi-code/blob/main/docs/en/configuration/config-files.md#tuitoml)
- [Claude Code v2.1.84](https://github.com/anthropics/claude-code/releases/tag/v2.1.84)
- [Claude Code v2.1.92](https://github.com/anthropics/claude-code/releases/tag/v2.1.92)
- [Claude Code prompt caching](https://code.claude.com/docs/en/prompt-caching)
- [Windsurf: Introducing Adaptive](https://windsurf.com/blog/windsurf-adaptive)
- [Pi Cache Expiry Warning](https://www.npmjs.com/package/@siddr/pi-cache-expiry-warning)
- [Better Agent Terminal: Cache Cost Awareness](https://github.com/tony1223/better-agent-terminal#cache-cost-awareness)
