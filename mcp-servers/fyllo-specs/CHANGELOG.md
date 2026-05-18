# Changelog

All notable changes to the `fyllo-specs` MCP server will be documented in this file.

The format is based on Keep a Changelog.

## [0.3.1] - 2026-05-18

### Changed

- `apply-change`: `applyState` now respects `applyRequires` when deciding whether implementation is blocked. Non-required artifacts that are not yet `done` no longer incorrectly block Apply.
- `explore`: updated prompt guidance to prefer `mermaid` diagrams over ASCII-style diagrams for exploration and reasoning.
- `archive-change`: `confirm: true` responses now include `archiveRawOutput`, forwarding the raw stdout from `openspec archive ... --yes` so agents can summarize the actual archive/sync result. The archive prompt now tells agents to prefer this output over inference.

## [0.3.0] - 2026-05-18

### Changed

- `create-proposal`: renamed input `name` → `changeName` for consistency with the other tools; the parameter is now required, and tool/parameter descriptions instruct the agent to confirm intent and derive a kebab-case name before calling.
- `create-proposal`: removed the unused `description` input/output field — it never participated in any logic and was only echoed back.
- `create-proposal`: `template` and `instruction` returned in `state` are now resolved against the next un-`done` artifact (matching `nextArtifact`) instead of always being the first artifact's values.
- `apply-change`: `changeName` is now required. Removed the auto-select-when-single-active-change behavior so the agent must always specify which change to apply (use `explore` to list active changes).
- `apply-change`: collapsed the duplicate `computeStatus` invocation and dead `applyState` recomputation in the tool layer — the tool now returns `loadApplyState(...)` directly, halving CLI spawns per call.
- `archive-change`: `changeName` is now schema-required (was `optional()` with a runtime null-check); `confirm` uses `z.boolean().default(false)`.
- `archive-change`: removed the misleading `artifactStatus` field from the returned state — its data was a duplicate of `deltaSpecSummary.files`. Prompt updated accordingly.
- `archive-change`: `ArchiveResult.deltaSpecSummary` type tightened from `unknown | null` to `{ files: string[] } | null`.
- `schemaName` is now read from `openspec/config.yaml` (via the new `readProjectSchema` helper) instead of being hard-coded to `"spec-driven"` in `create-proposal` and `apply-change`. Falls back to `"spec-driven"` when the file is missing or malformed.
- Refactored: extracted shared `changeDir(projectRoot, name)` helper into `openspec-runtime/paths.ts`, replacing three duplicated definitions across `apply-change.ts`, `tasks.ts`, and `archive-change.ts`.

## [0.2.0]

Initial bundled release covering the four core tools: `explore`, `create-proposal`, `apply-change`, `archive-change`. Each tool wraps the OpenSpec CLI and returns a `<tool_instruction>` + `<state>` payload to drive the corresponding skill workflow.
