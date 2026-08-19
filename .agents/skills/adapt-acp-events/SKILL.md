---
name: adapt-acp-events
description: Normalize and adapt ACP Agent session/update events, especially tool_call and tool_call_update differences, for FylloCode. Use when integrating a new ACP Agent, improving an existing Agent's tool activity display or user-facing tool titles, analyzing real ACP traces, adding or revising an Agent event adapter, or debugging thought, plan, command, config, usage, tool title, status, diff, location, parent-tool, or subagent mapping behavior.
---

# Adapt ACP Events

Turn real ACP traces into the narrowest evidence-backed compatibility change while preserving FylloCode's stable internal event semantics.

## Read Before Acting

1. Read the repository `AGENTS.md` and inspect `git status --short`.
2. Read these files in full before changing covered areas:
   - `guidelines/Architecture.md`
   - `guidelines/MainProcess.md`
   - `guidelines/Testing.md`
   - `guidelines/QualityGates.md`
   - `openspec/specs/acp-tool-event-fidelity/spec.md`
3. Read the current mapper, normalizers, adapter types and registry, relevant adapters, `SessionEvent`, `MessageAssembler`, shared tool-call assembly, and their tests. Treat current source and specs as authoritative; do not rely on paths or field behavior remembered from an earlier run.
4. Read [adaptation-decision-matrix.md](references/adaptation-decision-matrix.md) in full.

## Establish the Adaptation Boundary

State whether the request is:

- **new integration**: add evidence and the narrowest adapter support for an Agent not yet optimized; or
- **existing integration optimization**: reproduce and correct a known mapping or display mismatch.

Record the canonical `agentId`, display name, actual running version, version source, ACP SDK version, and underlying Agent version when a bridge or adapter is involved. Prefer a detected or command-reported version over a registry latest version. Use `null` with `agentVersionSource: "unavailable"` when the actual version cannot be established; never silently omit it or substitute `latestVersion`.

Do not execute an arbitrary custom Agent with `--version`. Use already available status, package, registry, or user-provided evidence. If version discovery would launch unknown code or mutate state, ask first.

## Capture Real Evidence

Capture representative `session/update` sequences, not isolated screenshots or normalized output. Build a version-scoped tool inventory before sampling instead of assuming standardized tool names:

1. Discover the complete tool set exposed by the target Agent/version from authoritative, non-mutating sources available for that Agent, such as its tool listing or help surface, registry/configuration, session capabilities, and prior raw traces. Include dynamically provided MCP, skill, mode-specific, and subagent tools when they are available.
2. Preserve each exact raw tool name or identifier and the source that proved its availability before applying any semantic normalization. Do not collapse Agent-specific names into generic categories during evidence collection.
3. Attempt at least one safe representative invocation for every discovered tool. Exercise conditional tools by entering their required mode or configuration when that is safe and already authorized.
4. Keep a coverage ledger in the versioned analysis document with the discovered tool, exact raw name or identifier, observed raw title variants, inventory source, sampled scenarios, observed update shapes, semantic family candidate, coverage status, and any skip or blocked reason.
5. Use read, search, edit, execute, fetch, MCP, and subagent only as fallback semantic coverage dimensions for finding inventory gaps, never as an allowlist or a substitute for the Agent's actual tool inventory.

For every discovered tool, cover the applicable lifecycle and update cases:

- successful and failed terminal states;
- start followed by updates and update-without-start;
- fields first appearing on start or on a later update;
- omitted, replaced, and explicitly cleared `content` or `locations`;
- thought, plan, available commands, config options, usage, and unknown update types;
- parent-tool and subagent metadata.

Do not force an invocation that is destructive, irreversible, paid, externally visible, production-affecting, authentication-changing, or outside the user's authorized scope. Record it as skipped or blocked with the concrete reason, and obtain explicit approval before sampling it when approval could make the invocation safe. Never claim full coverage solely because the fallback semantic dimensions were exercised.

Create raw capture storage with `mktemp -d`. Keep complete raw logs outside the repository. Do not commit prompts, reasoning, credentials, environment values, user names, home paths, private repository paths, or unrelated large tool output.

Use the bundled capture runner instead of assembling an inline ACP client command:

```bash
capture_dir="$(mktemp -d)"
cp .agents/skills/adapt-acp-events/assets/acp-capture-plan.template.json "$capture_dir/plan.json"
# Fill plan.json from the target Agent/version inventory and authoritative version evidence.
node .agents/skills/adapt-acp-events/scripts/capture-acp-events.mjs \
  "$capture_dir/plan.json" \
  --output "$capture_dir/capture.json"
```

Keep `command`, `args`, `cwd`, environment overrides, MCP servers, and safe prompts in the temporary plan. Do not put credentials in the plan. The runner executes the plan in one Agent process and one ACP session, registers update handling before `newSession`, saves every phase and received update atomically, bounds stderr, and cleans up the process tree. It does not discover the tool inventory or generate sampling prompts; complete those evidence-driven steps before filling the plan.

The runner temporarily selects `allow_once` when the Agent offers it and otherwise returns cancelled. Treat that callback as a replaceable sampling boundary, not as FylloCode's long-term permission policy. A cancelled permission or other prompt error can be recorded without blocking later scenarios when the plan sets `continueOnError`; an unacknowledged prompt timeout stops the session because starting another turn would be unsafe. `completed_with_errors` intentionally exits non-zero, so inspect the capture before deciding what remains unsampled.

Always inspect the capture even when the runner exits non-zero. Use `phases`, `diagnostics`, bounded `process.stderrTail`, prompt results, and cleanup state to distinguish spawn, initialize, session, prompt, timeout, and process failures. `FILE_WATCH_UNAVAILABLE` and `SANDBOX_PERMISSION_DENIED` are environment diagnoses only; the runner never elevates itself. Retry outside the sandbox only through the host's approval flow, without turning that approval into an adaptation prerequisite.

Analyze a capture without modifying it:

```bash
node .agents/skills/adapt-acp-events/scripts/analyze-acp-session-updates.mjs <trace-path>
node .agents/skills/adapt-acp-events/scripts/analyze-acp-session-updates.mjs <trace-path> --format json
node .agents/skills/adapt-acp-events/scripts/analyze-acp-session-updates.mjs <legacy-trace-path> --skip-invalid
```

The analyzer accepts FylloCode logger lines containing `[acp-mapper] ← sessionUpdate:`, a JSON object or array, JSONL, or a fixture object with `capture` and `updates`. Keep strict parsing for evidence fixtures. Use `--skip-invalid` only to inventory legacy or truncated logs, review every reported skipped record, and recreate any evidence used for a permanent rule as a strict minimized fixture. Treat the report as structural evidence, not as an adaptation decision.

## Preserve the Minimum Reproducible Fixture

Copy [agent-session-update-fixture.template.json](assets/agent-session-update-fixture.template.json) to:

```text
test/main/services/session/chat/acp-mapper/fixtures/<agent-id>/<capture-id>.json
```

Minimize the fixture to the shortest event sequence that still proves the behavior. Replace absolute paths with `/workspace/...`; replace prompts and output with small synthetic equivalents while preserving types, field presence, ordering, nulls, empty collections, and metadata keys required by the behavior.

Keep human-readable findings in:

```text
references/third-party/acp/tool-call-trace/agent-tool-call-analysis/<agent-id>-<agent-version>.md
```

Use the actual running Agent/adapter version in the filename, normalized to filename-safe lowercase letters, digits, dots, and hyphens. Remove a redundant leading `v`; replace other characters with hyphens. Use `unknown` only when `agentVersionSource` is `unavailable`, and keep the underlying Agent version in the document metadata rather than substituting it into the filename. Never use registry `latestVersion` as the filename version unless it is also proven to be the running version.

Link each Agent-specific conclusion to a fixture and focused test. Keep the tool coverage ledger and one analysis document per Agent version; add a new file when observed behavior changes under another version instead of overwriting the previous version's evidence. Fixtures remain minimal behavior proofs and do not need to duplicate the full inventory in one capture. Do not keep a complete trace unless timing cannot be represented by a smaller sequence; if an exception is necessary, fully redact it and record why it cannot be minimized. Delete the temporary raw capture after the fixture replays successfully.

## Choose the Correct Layer

Apply these rules in order:

1. Put behavior derived only from ACP public fields in `update-normalizers.ts` or `tool-call-mapper.ts`, and cover unknown Agents.
2. Put behavior requiring a known `agentId`, Agent-specific `_meta`, or a verified stable quirk in one explicit `agent-adapters/<agent>.ts` adapter with registry aliases.
3. Leave cross-event accumulation, orphan-update card creation, and lifecycle merging in `MessageAssembler` or the existing shared pure assembly rule. Do not add mapper state.
4. Keep missing information missing or use an existing contract-defined fallback. Do not infer Agent identity or host workflow semantics from titles, tool IDs, input, or output text.
5. Keep tool activity display data observational. Never use a tool name, title, raw input, raw output, or `_meta` to trigger tasks, notifications, Proposals, or other host-side effects.

For Agent-specific non-tool updates, first determine whether defensive public-field normalization is sufficient. Do not force plan, commands, config, usage, or another update type through a tool adapter. If a new internal adapter hook is needed, select Direct or Plan based on complexity; if the shared event or user-visible contract changes, use Proposal.

## Normalize User-Facing Tool Titles

Keep tool identity and display title separate. Preserve the exact raw tool name and raw title in capture evidence; keep `toolName` stable for identity and use `title` only for user-facing action text.

Normalize titles with this evidence order:

1. Reuse an existing project-wide canonical semantic family and title template when one is already defined.
2. Classify from ACP public `kind` and structured fields when they unambiguously establish the tool semantics.
3. Use a verified Agent-specific raw tool identifier or stable metadata path only inside that Agent's adapter to select the same project-wide semantic family.
4. Fall back to the original ACP title when classification or structured context is insufficient. Never infer a semantic family from free-form title, command, prompt, input, or output substrings.

Use one canonical action prefix or template for the same semantic family across Agents, then append only context supported by structured fields. Representative forms include `Read <target>`, `Search <query>`, `Edit <target>`, `Run <command>`, `Call MCP <server/tool>`, and `Delegate <agent-type>`; treat these as examples, not an exhaustive tool allowlist. Prefer a safe concise target such as a basename over an absolute path, and never expose credentials, private paths, prompts, or unrelated raw input in a title.

Keep canonical titles stable across the lifecycle. A later update may add a more specific structured target, but it must not replace a canonical title with a transient Agent phrase or erase a previously established title when the field is omitted. Orphan updates must use the same classification and formatting rules as normal start/update sequences.

Place shared classification and formatting derived from ACP public fields in the Agent-neutral layer. Keep only the mapping from verified Agent-specific identities or metadata to a canonical semantic family in the Agent adapter. If no canonical vocabulary, template, context policy, or fallback behavior exists and the implementation would introduce or change user-visible title behavior, stop and route that contract decision through an OpenSpec Proposal.

## Implement the Narrowest Change

- Reuse the Agent-neutral base event and modify only fields supported by evidence.
- Register stable Agent IDs and explicit aliases; retain the identity fallback for missing and unknown IDs.
- Do not copy common input, content, diff, location, or status extraction into an Agent adapter.
- Reuse shared semantic families and title formatters; do not let each Agent adapter invent different user-facing wording for the same tool type.
- Add a positive test for each new rule and a negative test proving other Agents do not trigger it.
- Preserve update replacement semantics and missing-field semantics exactly.
- Do not edit `SessionEvent`, shared schemas, persisted fields, user-visible defaults/states, or ownership boundaries without an approved OpenSpec Proposal. Stop and report the required contract change instead.

## Verify End to End

Validate in layers:

1. Replay raw updates through mapper tests and compare the expected `SessionEvent` sequence.
2. Replay mapped tool events through Main and shared/Renderer assembly tests; compare observable persisted fields while ignoring message IDs and Renderer-only live state.
3. Cover pending, in-progress, completed, failed, missing status, orphan updates, replacement clearing, delayed metadata, canonical title stability, unknown-title fallback, and backward-compatible history where applicable.
4. Run focused tests first, followed by the relevant main Vitest project, `pnpm typecheck:node`, and lint for touched files. Prepare the worktree environment first when project commands have not yet been run in the current worktree.
5. Re-read the saved fixture and analysis for secrets, user paths, prompts, reasoning, and unrelated large outputs.

Report the Agent/version evidence, tool inventory coverage and skip reasons, chosen layer and rationale, files changed, fixtures retained, validation results, and any unsupported or unresolved event shapes.
