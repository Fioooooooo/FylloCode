# Changelog

All notable changes to the `fyllo-skills` MCP server will be documented in this file.

The format is based on Keep a Changelog.

## [0.2.0] - 2026-05-24

### Added

- `guidelines`: added `read` mode, which recursively scans `guidelines/**/*.md` in the target project and returns structured metadata for each guideline file.
- Added YAML frontmatter parsing and metadata extraction for guideline `name`, `description`, and `keywords`.
- Added tolerant read-mode error reporting for malformed frontmatter via per-entry `parseError`.

### Changed

- `guidelines`: now supports mode-specific responses, keeping authoring instructions in `write` mode while returning JSON guideline inventory in `read` mode.
- `guidelines` metadata entries are now normalized to project-root-relative POSIX paths and sorted deterministically by path.

## [0.1.0] - 2026-05-21

Initial bundled release of the `fyllo-skills` MCP server.

### Added

- Added the `guidelines` tool for repository-owned guideline authoring workflows.
- Added standalone markdown-based prompt loading for the `guidelines` instruction body.
- Added dedicated server metadata and tests independent of `fyllo-specs`.
