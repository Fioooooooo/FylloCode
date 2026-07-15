# Changelog

All notable changes to the `fyllo-cortex` MCP server will be documented in this file.

The format is based on Keep a Changelog.

## [0.5.0] - 2026-07-15

### Added

- Added the `knowledge` tool with `capture`, `update`, `retire`, and `audit` modes. Responses include authoring instructions plus state derived from `FYLLO_PROJECT_DATA_DIR/knowledge`.
- Knowledge tool state now returns `knowledgeRoot`; agents write or update markdown entries there before emitting `knowledge.review` with a `name` payload for user review.

## [0.4.0] - 2026-07-02

### Changed

- **Breaking**: `guidelines` tool modes changed from `read`/`write` to scenario-oriented `init`/`create`/`update`:
  - `init`: bootstrap guidelines for a project that has none (requires no extra input).
  - `create`: add a new guideline document for an unwritten convention (requires `topic`).
  - `update`: repair an existing document that is stale or conflicts with repository facts (requires `path`, scoped to `guidelines/**/*.md`).
- Responses now follow the fyllo-specs convention: `<tool_instruction>` (scenario-specific authoring guidance) plus `<state>` (current guidelines index, `AGENTS.md` index status for init/create, target frontmatter for update). `includeInstruction: false` returns state JSON only, for follow-up re-checks.
- Authoring contract rewritten and modularized: frontmatter contract and quality rules are hard requirements (MUST); document body structure is now three archetype skeletons (rules / map / playbook) offered as defaults (SHOULD); the per-topic MUST checklists were removed.
- Tool description rewritten to be trigger-oriented and to steer agents away from calling the tool for reads.
- Guideline scanning tolerates UTF-8 BOM frontmatter and degrades unreadable files to per-entry `parseError` instead of failing the whole scan.
- Project root now resolves via `FYLLO_PROJECT_PATH` (falling back to cwd), consistently across `guidelines` and `lineage`.

### Removed

- `guidelines` `mode=read` — the guidelines index is now injected into Chat/Apply session reminders by the FylloCode main process, which reuses the same scanner.

## [0.3.1] - 2026-06-30

### Changed

- `lineage` session output now includes linked plans with `slug` and `createdAt`, so session-scoped planning records can be traced alongside proposals.
- Older lineage session links without `plans` are handled as an empty list in MCP responses.

## [0.3.0] - 2026-06-17

### Added

- New `lineage` tool that retrieves the design history behind code changes, linking commits back to tasks, chat sessions, and OpenSpec proposal artifacts (`proposal.md`, `design.md`, `tasks.md`).
- `lineage` tool supports three trace modes:
  - `trace-file`: given a file path and optional line range, find all commits that touched the file and return matching lineage entries (preferred entry point for "why" questions).
  - `trace-commit`: given a full Git SHA, return the lineage entry for that specific commit.
  - `trace-proposal`: given an OpenSpec change ID, return the lineage entry for that proposal.
- `lineage` responses now include `proposalPath` for each proposal, pointing to either the active change directory or the archived change directory.

### Changed

- Server renamed from `fyllo-skills` to `fyllo-cortex` to align with the project documentation and conceptual model.
- `lineage` tool description was expanded to clarify when and how to use each trace mode.

### Fixed

- Corrected `proposalStatus` derivation so archived proposals are reported as `completed` and active proposals reflect their actual OpenSpec status.

## [0.2.0] - 2026-05-24

### Added

- `guidelines`: added `read` mode, which recursively scans `guidelines/**/*.md` in the target project and returns structured metadata for each guideline file.
- Added YAML frontmatter parsing and metadata extraction for guideline `name`, `description`, and `keywords`.
- Added tolerant read-mode error reporting for malformed frontmatter via per-entry `parseError`.

### Changed

- `guidelines`: now supports mode-specific responses, keeping authoring instructions in `write` mode while returning JSON guideline inventory in `read` mode.
- `guidelines` metadata entries are now normalized to project-root-relative POSIX paths and sorted deterministically by path.

## [0.1.0] - 2026-05-21

Initial bundled release of the `fyllo-cortex` MCP server.

### Added

- Added the `guidelines` tool for repository-owned guideline authoring workflows.
- Added standalone markdown-based prompt loading for the `guidelines` instruction body.
- Added dedicated server metadata and tests independent of `fyllo-specs`.
