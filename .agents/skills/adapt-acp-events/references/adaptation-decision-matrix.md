# ACP Session Update Adaptation Matrix

Use this reference after reading the current repository specs, guidelines, mapper, assembler, and tests. It guides placement; it does not override live contracts.

## Evidence Threshold

| Claim                    | Minimum evidence                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| ACP-wide behavior        | Current SDK/schema semantics plus representative traces; must work for identity/unknown Agents                                              |
| Agent-specific behavior  | Canonical `agentId`, actual version or explicit unavailable marker, real trace, minimized fixture, positive test, other-Agent negative test |
| Cross-event behavior     | Ordered multi-event fixture proving state cannot be decided from one update                                                                 |
| Error compatibility      | Raw status/output contradiction plus explicit expected internal terminal state                                                              |
| Parent/subagent behavior | Stable metadata key path and ordered parent/child trace; never infer from title text                                                        |
| Agent tool coverage      | Version-scoped inventory from authoritative sources, exact raw tool identifiers, per-tool sample status, and explicit gap reasons           |
| Display title mapping    | Raw title variants, proven semantic source, canonical template, structured context source, fallback case, and cross-Agent comparison        |

Do not implement a permanent compatibility rule from a screenshot, final UI state, one normalized event, or an undocumented recollection.

## Version-Scoped Tool Inventory

Inventory the tools actually exposed by the target Agent/version before choosing sampling prompts. Agent tool names may be renamed, split, merged, hidden behind modes, or supplied dynamically, so generic categories are only a fallback review lens.

Record this coverage ledger in the versioned Agent analysis document:

| Field                  | Record                                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| Raw tool identity      | Exact observed name or identifier before normalization                                         |
| Raw title variants     | Exact start/update titles observed before normalization                                        |
| Inventory source       | Tool listing/help, registry/configuration, session capability, or prior raw trace              |
| Availability condition | Mode, configured MCP server, enabled skill, authentication, parent tool, or other prerequisite |
| Semantic family        | Canonical family candidate and the public or Agent-specific evidence supporting it             |
| Sample status          | Sampled, partially sampled, unavailable, blocked, or intentionally skipped                     |
| Scenarios              | Safe invocation plus applicable success, failure, orphan, delayed-field, and replacement cases |
| Observed shape         | Raw update kinds and Agent-specific field or metadata paths                                    |
| Gap reason             | Concrete safety, authorization, environment, cost, or reproducibility constraint               |

Attempt at least one safe representative invocation per discovered tool. Do not invoke destructive, irreversible, paid, externally visible, production-affecting, authentication-changing, or otherwise unauthorized tools merely to raise coverage. Record the gap and request approval when approval could make the sample safe.

Compare inventories across Agent versions by raw identity and availability condition. Treat a renamed, added, removed, split, or merged tool as new evidence work even when it maps to a familiar semantic category. Never mark the inventory complete merely because read, search, edit, execute, fetch, MCP, and subagent dimensions have examples.

## Stable Capture Execution

Copy `../assets/acp-capture-plan.template.json` into a `mktemp -d` directory and execute it with `../scripts/capture-acp-events.mjs`. Keep the plan and full capture temporary; retain only minimized fixtures and the versioned analysis after replay succeeds.

The plan separates evidence decisions from protocol execution:

| Plan area    | Responsibility                                                                                                   |
| ------------ | ---------------------------------------------------------------------------------------------------------------- |
| `capture`    | Canonical Agent identity, actual version/source, bridge version when applicable, and ACP SDK version             |
| launch       | Exact command/arguments, isolated absolute cwd, and temporary environment overrides; never store credentials     |
| `mcpServers` | Only safe, authorized MCP servers required for the version-scoped inventory                                      |
| `prompts`    | Inventory-derived scenarios and ACP content blocks; `continueOnError` controls independent-scenario continuation |
| `timeouts`   | Bounded spawn, initialize, session, prompt, graceful shutdown, and force-kill waits                              |

The capture preserves `capture` plus ordered `updates` for direct analyzer compatibility, and adds phase timings, prompt outcomes, permission requests, bounded stderr, diagnostics, child exit, and cleanup evidence. It deliberately omits the plan's prompts and environment. Treat the capture as sensitive raw evidence until it is minimized and redacted.

The runner's permission callback selects `allow_once` when present and returns cancelled otherwise. This is a non-blocking, replaceable sampling fallback, not a stable host authorization contract. A prompt may continue or fail according to the Agent; record the outcome and continue only when the next scenario is independent and the plan explicitly permits it. After a prompt timeout, continue only if the Agent settles the timed-out request after cancellation; otherwise stop the session instead of overlapping turns.

Use runner diagnostics as routing evidence:

| Diagnostic code             | Meaning                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| `FILE_WATCH_UNAVAILABLE`    | The environment rejected a filesystem watcher, often surfaced as `EMFILE ... watch`         |
| `SANDBOX_PERMISSION_DENIED` | The Agent encountered `EPERM` or an equivalent environment permission denial                |
| `PHASE_TIMEOUT`             | The named ACP phase exceeded its configured deadline                                        |
| `CAPTURE_INTERRUPTED`       | The caller interrupted the run; incremental evidence and cleanup state remain authoritative |
| `ACP_PHASE_FAILED`          | The phase failed without a narrower known environment classification                        |

The runner never requests or performs privilege elevation. When an environment diagnostic is the only blocker, preserve the partial capture and use the host's explicit approval path for any retry.

## Placement Decision

| Observation                                                                       | Target                                           | Required checks                                                | Reject                                         |
| --------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------- | ---------------------------------------------- |
| Depends only on ACP public fields                                                 | `update-normalizers.ts` or `tool-call-mapper.ts` | identity adapter and unknown Agent coverage                    | Agent-ID branch in the baseline                |
| Depends on a known Agent's `_meta` or verified output shape                       | `agent-adapters/<agent>.ts`                      | versioned fixture, registry alias, positive and negative tests | copying the full base mapper                   |
| Requires previous start/update state                                              | `MessageAssembler` or shared pure assembly       | orphan, delayed, replacement, terminal ordering tests          | mutable lifecycle state in the mapper          |
| Field is absent                                                                   | Preserve absence or existing contract fallback   | historical compatibility                                       | guessing from title, tool ID, input, or output |
| Agent-specific non-tool update lacks an adapter hook                              | Reassess Direct vs Plan for an internal hook     | baseline viability and all-Agent impact                        | routing it through a tool adapter              |
| Requires new shared event/schema, persisted field, UI default/state, or ownership | OpenSpec Proposal                                | explicit user consent before proposal creation                 | direct implementation                          |
| Tool data appears to request a host workflow action                               | No mapping-side effect                           | use validated Fyllo Action or existing explicit contract       | semantic trigger from tool metadata            |

## User-Facing Title Normalization

Treat `toolName` as stable identity and `title` as user-facing action text. Preserve raw identities and titles in evidence even when the mapped event uses a canonical title.

| Observation                                                                      | Decision                                                                               |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| ACP public `kind` and structured fields prove a known semantic family            | Use the existing shared family and canonical title template                            |
| Verified Agent-specific identity or metadata proves the same semantic family     | Map it in the Agent adapter, then reuse the shared title formatter                     |
| Structured input supplies a safe target, query, command, MCP name, or agent type | Append concise context to the canonical action prefix                                  |
| Only free-form title, prompt, command output, or ambiguous input suggests type   | Preserve the original ACP title; do not guess                                          |
| A later update omits title or carries only a transient phrase                    | Preserve the established canonical title                                               |
| A later update adds more specific structured context                             | Refine the context without changing the canonical semantic family                      |
| No project-wide vocabulary, template, context, or fallback contract exists       | Treat the user-visible behavior decision as an OpenSpec Proposal before implementation |

Examples such as `Read <target>`, `Search <query>`, `Edit <target>`, `Run <command>`, `Call MCP <server/tool>`, and `Delegate <agent-type>` illustrate the pattern only. Do not use the examples as a closed tool list. Sanitize title context: prefer basenames to absolute paths and exclude credentials, private paths, prompts, reasoning, and unrelated raw input.

For each normalized family, test at least two Agents when evidence exists, unknown-Agent fallback, start/update title stability, orphan updates, delayed structured context, and a negative case proving that free-form text cannot trigger the classification. Verify Main persistence and Renderer live assembly produce the same title.

## Event Review Checklist

| Update                      | Inspect                                                            | Representative edge cases                                                                   |
| --------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `tool_call`                 | ID, title, kind, status, raw input, content, locations, `_meta`    | pending start, in-progress start, fields omitted until update                               |
| `tool_call_update`          | status, raw input/output, content, locations, title/kind, metadata | no start, no status, failed, contradictory completed/error, explicit null/empty replacement |
| `agent_thought_chunk`       | text block and Agent metadata                                      | non-text block, prefix stripping, suppression justified by evidence                         |
| `plan`                      | entry content, status, priority, replacement behavior              | empty plan, renamed status, malformed entries                                               |
| `available_commands_update` | command name, description, input shape                             | missing optional fields, invalid item filtering                                             |
| `config_option_update`      | option kind, values, current selection                             | partial options, unknown variants, invalid values                                           |
| `usage_update`              | used, size, cost and currency                                      | missing cost/currency, partial update                                                       |
| unknown update              | discriminator and SDK/schema version                               | future protocol variant; log and skip unless a contract is agreed                           |

## Tool Lifecycle Review

For every `toolCallId`, record:

1. first event kind and whether start is absent;
2. status sequence without manufacturing omitted statuses;
3. fields present on start versus update;
4. every explicit `content` and `locations` replacement, including `null` and empty arrays;
5. first terminal event and any later updates;
6. parent/subagent metadata key paths;
7. whether the expected result needs single-event mapping or cross-event assembly.

Treat `content` and `locations` presence separately from their values. Missing means preserve; explicit null/empty/invalid-only replacement means clear according to the current contract.

## Fixture Retention

Store permanent minimized fixtures under:

```text
test/main/services/session/chat/acp-mapper/fixtures/<agent-id>/<capture-id>.json
```

The fixture must include:

- canonical `agentId` and display name;
- actual Agent/adapter version when available and its source;
- underlying Agent version for bridges when available;
- ACP SDK version and capture timestamp;
- concise scenario and redaction list;
- minimal ordered raw updates and expected internal events.

Keep the version in metadata, not in the directory name. Add a new capture when behavior changes; do not overwrite older evidence while its Agent version remains supported. Store complete raw traces only in a temporary directory, then delete them after the minimized fixture replays successfully.

Store the corresponding human-readable analysis as:

```text
references/third-party/acp/tool-call-trace/agent-tool-call-analysis/<agent-id>-<agent-version>.md
```

Use the actual Agent/adapter version for `<agent-version>`, normalized to lowercase filename-safe letters, digits, dots, and hyphens with a redundant leading `v` removed. Use `unknown` only when the actual version is unavailable. Keep the underlying Agent version in document metadata. Preserve one analysis document per Agent version instead of overwriting earlier version evidence.

## Minimum Test Matrix

- Mapper positive case from the fixture.
- Agent adapter negative case using identity or another registered Agent.
- Orphan update case when the Agent can omit start.
- Missing status preserves previous state.
- Failed and completed terminal states remain distinct.
- Missing versus explicit empty `content`/`locations` remains distinct.
- Parent/subagent metadata arrives on start and/or a later update when observed.
- Same-semantic tools across Agents reuse one canonical title template.
- Unknown or ambiguous tools preserve the original ACP title without text-based classification.
- Later updates preserve the semantic prefix and refine context only from structured evidence.
- Main and shared/Renderer assembly produce the same persistent observable fields.
- Old history without newer optional metadata continues to load when the touched path affects history.
