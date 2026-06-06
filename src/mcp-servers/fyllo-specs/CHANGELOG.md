# Changelog

All notable changes to the `fyllo-specs` MCP server will be documented in this file.

The format is based on Keep a Changelog.

## [0.5.1] - 2026-05-27

### Changed

- Runtime subprocess spawning now uses `cross-spawn`, improving command resolution consistency across platforms.

### Fixed

- Git subprocesses now force the `C` locale, avoiding unstable parsing on systems with non-English locale output.

## [0.5.0] - 2026-05-24

### Added

- `create-proposal`: now bootstraps missing OpenSpec project structure before invoking the CLI, including `openspec/specs/`, `openspec/changes/archive/`, and a default `openspec/config.yaml` when absent.
- `create-proposal`: now augments existing OpenSpec configs with the default `guidelines-evaluation` task rule when the rule is missing, while preserving other user-defined config fields.

### Changed

- `archive-change`: workspace finalization now includes structured recovery for linked-worktree merge divergence, allowing safe rebase-and-retry flows before cleanup continues.
- `archive-change`: confirmed archive handling now distinguishes CLI failure from "archive not confirmed" outcomes, preserving structured downstream error handling.

### Fixed

- `archive-change`: no longer treats exit-0 OpenSpec runs as success unless stdout confirms the archive completed for the requested change.
- `archive-change`: blocks commit/merge/worktree cleanup when archival is unconfirmed, avoiding false-success cleanup on grey-area CLI outcomes.

## [0.4.0] - 2026-05-20

### Changed

- `create-proposal`: added `workspaceMode` with linked worktree mode as the default and explicit main workspace override support.
- `create-proposal`: responses now include `workspace: { mode, path }` plus `warnings`, so agents edit proposal artifacts in the prepared workspace path.
- `archive-change`: added `commitMessage` for confirmed archives and moved archive git finalization into the MCP runtime.
- `archive-change`: responses now split OpenSpec archive status and workspace git finalization status into `archive` and `workspace` objects with per-step git operation results.
- System reminders now describe MCP tool contracts and result handling instead of embedding worktree lifecycle shell command sequences.

### Added

- Added internal `workspace-runtime` for proposal workspace preparation, linked worktree creation, archive commit, fast-forward merge, worktree removal, branch deletion, and structured git step results.

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
