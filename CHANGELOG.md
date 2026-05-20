# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, adapted for the current stage of the project.

## [0.9.0] - 2026-05-20

First stable `0.9.0` release. On top of the initial beta baseline, FylloCode now further completes multi-worktree orchestration, session-list interaction refinements, built-in specs workspace capabilities, and a set of product-level UX and reliability improvements needed for broader day-to-day use.

### Added

- Proposal apply and archive workflow with stage-based execution flow
- Task panel, local task CRUD, task chat bridge, and task detail modal
- Agent chat session management with context usage display
- ACP reasoning chunks, slash commands, stop support, and improved prompt UX
- System reminder injection for new ACP sessions, including persistence and UI filtering
- Built-in `fyllo-specs` MCP server for proposal, apply-change, archive-change, and explore workflows
- Workflow editor and built-in workflow templates
- Multi-worktree foundation, including chat orchestration, archive orchestration, and proposal list worktree scanning
- Settings About panel for version visibility inside the desktop app

### Changed

- Integration model refactored toward provider-based connections and project-level resource mounting
- Activity bar, welcome flow, and navigation structure refined around current product layout
- ACP agent process lifecycle and shutdown behavior improved for desktop stability
- Packaging and bundled resource path handling refined for app distribution
- Built-in `fyllo-specs` workspace upgraded to support the latest project workflow expectations
- Session list behavior refined toward a conversation-first interaction model
- Apply and archive prompt guardrails tightened, with `includeInstruction` handling made more explicit
- System reminder template assets moved to standalone text resources for easier maintenance
- Settings navigation width and chat status indicator styling refined
- `.worktrees` is now ignored in the repository to reduce local workspace noise

### Fixed

- Unpacked MCP server path resolution during packaging
- macOS ARM64 build fatal issues and Fyllo icon loading problems
- Streaming pipeline consistency between chat and proposal execution flows
- Test assertions around reminder persistence and apply-change fixture handling
- Chat submitted state is now preserved during `usage_update` events
- Chat state is reset correctly when creating a new session
- Documentation and test spec inconsistencies cleaned up

### Notes

- This release consolidates everything shipped across `0.9.0-beta.1` through `0.9.0-beta.3` into the first stable `0.9.0`
- `1.0.0` remains reserved for the point where MVP is fully validated and core product contracts are considered stable
