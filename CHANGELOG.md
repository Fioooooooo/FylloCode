# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, adapted for the current stage of the project.

## [0.10.3] - 2026-05-26

This patch release focuses on bundle size, Windows compatibility, and local debugging. It tightens the desktop packaging scope, improves cross-platform child process startup paths, and adds a development entry point for diagnosing renderer errors.

### Added

- DevTools launcher in the top navigation for quickly opening developer tools from inside the desktop app
- Renderer error and unhandled rejection reporting flow, passing frontend exceptions to main-process logs through the app IPC / preload API

### Changed

- Packaging rules now use stricter allowlist and exclusion strategies, reducing source files, project metadata, tests, examples, documentation, sourcemaps, and other non-runtime content in installers
- Windows installer strategy was adjusted to reduce waiting cost during the installer loading phase
- External child process startup now consistently uses `cross-spawn` across the main process, built-in MCP runtime, and script entry points for more stable cross-platform command execution
- Added and archived the OpenSpec record for desktop packaging optimization, and updated the related constraints in the Build, CodeStyle, and MainProcess guidelines

### Fixed

- Fixed Windows project path persistence where paths were not safely encoded and could fail to restore correctly for special paths
- Fixed inconsistent command resolution on some platforms when using Node's native child process spawn directly

## [0.10.2] - 2026-05-26

This patch release adds a project health check entry point, improves ACP shutdown so it cleans up the entire process tree.

### Added

- Project health check in the top navigation, with a one-click entry that guides the agent to evaluate static constraints, test constraints, and workflow constraints, then help close gaps through the standard proposal flow

### Changed

- ACP process shutdown now performs bounded session close, stdin close, and process-tree termination so agent children and MCP grandchildren are cleaned up together
- Main-process disposable timeout was raised to 8 seconds to cover the ACP teardown sequence with headroom

### Fixed

- Fixed an issue where MCP child processes spawned by ACP agents could remain orphaned after app quit

## [0.10.1] - 2026-05-25

This patch release adds the first end-to-end multimodal chat prompt flow. Users can attach files and images to chat prompts, agents can advertise prompt attachment capabilities, and local image attachments now render safely in chat history.

### Added

- Multimodal chat prompt support for image and file attachments, including prompt-side attachment UI and submission handling
- Agent prompt capability loading and caching so the renderer can enable attachment entry points only when the active agent supports them
- IPC and preload APIs for reading local attachment files as data URLs for image preview rendering
- Chat attachment storage and prompt part utilities for preserving file metadata through the chat flow

### Changed

- Chat prompt UI was reorganized into smaller prompt-specific components for attachment cards, attachment lists, action menus, and slash commands
- Chat message rendering was split into dedicated `ChatMessageList`, `AssistantMessage`, and `UserMessage` components under `components/chat/message`
- User image preview resolution now lives in a focused `useUserImagePart` composable

### Fixed

- Local `file://` image attachments now render through a controlled data URL read path instead of relying on direct renderer access
- Chat and proposal message list call sites now use the renamed message component after the chat message directory reorganization

## [0.10.0] - 2026-05-24

This release extends the built-in MCP workflow layer beyond the initial `0.9.0` stable baseline. It adds the new `fyllo-skills` bundled server, deepens `fyllo-specs` automation around OpenSpec setup and archive finalization, and fixes a visible chat stop-state issue during the first-message setup path.

### Added

- Bundled `fyllo-skills` MCP server with a `guidelines` tool for repository guideline authoring workflows
- `fyllo-skills` `guidelines` read mode, returning scanned `guidelines/**/*.md` metadata so agents can inspect local guideline coverage
- Automatic OpenSpec bootstrap in `fyllo-specs create-proposal`, including missing directory initialization and default config creation when needed
- Automatic `guidelines-evaluation` rule injection for OpenSpec configs created or reused by `fyllo-specs`

### Changed

- `fyllo-specs archive-change` now performs structured archive finalization recovery after linked-worktree merge divergence, including safe rebase-and-retry handling
- `fyllo-specs archive-change` now confirms OpenSpec archival via stdout success markers before continuing with downstream git cleanup
- Repository guidelines were restructured into a leaner topic index with `Build` and `DeveloperWorkflow` split into dedicated documents

### Fixed

- Chat stop handling during the initial ACP setup path, so the first submitted message can be cancelled cleanly before connection/session setup completes
- Archive flows that previously could treat exit-0-but-unconfirmed OpenSpec outcomes as success and continue destructive cleanup

### Notes

- The in-progress `project-health-check` OpenSpec change is not included in this release because it has not been implemented in product code yet

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
