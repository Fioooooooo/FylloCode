# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, adapted for the current stage of the project.

## [0.9.0] - 2026-05-13

First structured pre-1.0 release. FylloCode has moved beyond the initial scaffold and now covers the main proposal, task, chat, workflow, and agent integration flows needed for MVP validation.

### Added

- Proposal apply and archive workflow with stage-based execution flow
- Task panel, local task CRUD, task chat bridge, and task detail modal
- Agent chat session management with context usage display
- ACP reasoning chunks, slash commands, stop support, and improved prompt UX
- System reminder injection for new ACP sessions, including persistence and UI filtering
- Built-in `fyllo-specs` MCP server for proposal, apply-change, archive-change, and explore workflows
- Workflow editor and built-in workflow templates

### Changed

- Integration model refactored toward provider-based connections and project-level resource mounting
- Activity bar, welcome flow, and navigation structure refined around current product layout
- ACP agent process lifecycle and shutdown behavior improved for desktop stability
- Packaging and bundled resource path handling refined for app distribution

### Fixed

- Unpacked MCP server path resolution during packaging
- macOS ARM64 build fatal issues and Fyllo icon loading problems
- Streaming pipeline consistency between chat and proposal execution flows
- Test assertions around reminder persistence and apply-change fixture handling

### Notes

- Version `0.9.0` marks the start of formal changelog tracking
- `1.0.0` is reserved for the point where MVP is fully validated and core product contracts are considered stable
