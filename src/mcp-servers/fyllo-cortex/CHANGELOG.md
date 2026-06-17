# Changelog

All notable changes to the `fyllo-cortex` MCP server will be documented in this file.

The format is based on Keep a Changelog.

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
