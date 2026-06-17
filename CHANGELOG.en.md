# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, adapted for the current stage of the project.

## [0.13.1] - 2026-06-17

This patch release continues to tighten project governance and the Chat experience while improving ACP Agent extensibility and main-process stability. You can now register additional ACP Agents through a custom agent configuration file. The Chat execution plan panel has been merged into a session event rail, and Overview further unifies proposal navigation, archived commit clues, and active-change titles. Main-process architecture was also reorganized to make storage, process communication, and error handling more reliable.

### Added

- Support custom ACP agents via `custom-agents.json`, enabling integration of third-party or internal agents
- Chat session event rail that incorporates the ACP execution plan panel into the session event timeline, keeping the input area clean and execution progress readable
- New lineage tool in the fyllo-cortex MCP server with trace-file mode for tracing requirement subjects and returning proposal paths
- Archive commit hashes are now persisted for requirement proposals and displayed in the Overview lineage view
- Custom agent editor moves the save button to the top for easier one-click saving on long forms

### Changed

- Proposal navigation moved from a standalone page into Overview, reducing context switching across project workspace
- Chat now clears stale active session state when entering the page, preventing old state from interfering with new conversations
- Hide the Chat audio input button until the related capability is ready
- Renamed the `fyllo-skills` MCP server to `fyllo-cortex` to align with project docs and conceptual model
- Optimized Overview stats bar grid columns to preserve information density in narrower windows
- Unified ACP stream parsing through a shared driver, reducing duplicated mapping across main, preload, and renderer layers
- Normalized agent error construction onto `ipcError`, with agent error codes maintained by a single event-mapping function
- Relocated IO-bound pseudo-domain modules into the infra layer and routed agent-service broadcasts through an event bus, aligning the main-process layering with the id factory spec

### Fixed

- Corrected inconsistent `proposalStatus` derivation between overview and lineage
- Guarded ACP binary archive extraction against zip-slip path traversal
- Restricted external navigation to http/https schemes to prevent unintended protocol jumps
- Fixed main-process infra continuing to broadcast to closed windows and failing to cancel restart timers on dispose
- Used atomic synchronous writes for integration and window-state stores to prevent data corruption
- Hardened storage parsing, startup flow, and log redaction against malformed input and log leakage
- Fixed active change title formatting in Overview

## [0.13.0] - 2026-06-12

This release turns FylloCode into a more traceable project workspace. The new Overview page surfaces project governance, active changes, recent threads, and lineage-backed metrics as the default project entry. Chat, Task, and Proposal are now connected through a persisted lineage model, while Chat can render confirmed Fyllo actions from agent output. The release also adds the public documentation site, restores parallel chat streaming, and improves ACP tool-call compatibility across agents.

### Added

- Project Overview page backed by real main-process data, combining OpenSpec counts, guideline activity, git trends, active changes, recent lineage subjects, and governance metrics in one project landing view
- Project lineage model and storage for tracing a requirement subject across tasks, chat sessions, and proposals, including lineage IPC, task-origin session links, proposal links from `fyllo-specs create-proposal`, and recent-thread projection for Overview
- Origin task banner in Chat sessions started from a task, so users can see the task source even after returning to the conversation later
- Chat `<fyllo-action>` rendering and persistence, starting with a confirmed `task.create` action that lets agents propose a local task from structured assistant output while FylloCode keeps validation and execution under user control
- Open-discussion task creation flow for direct Chat sessions that produce proposals, allowing unbound conversations to create and bind a local task into the same lineage subject
- VitePress documentation site with product guides, feature references, screenshots, ACP agent docs, `fyllo-specs` and `fyllo-cortex` references, and docs build/preview scripts
- Codex session repair skill for recovering Codex CLI session JSONL files affected by encrypted-content parse failures

### Changed

- Project entry now opens Overview first, making project governance and current work state the initial workspace surface
- Long user text messages in Chat now collapse by default with expand/collapse controls, improving scanability for pasted logs, specs, and long prompts
- ACP stream event contracts were unified across main, preload, and renderer layers, reducing duplicated mapping and preserving tool-call fields such as input, content, diff, locations, and terminal metadata more consistently
- Chat system reminders now include Fyllo action contracts and lineage context, including task titles for task-bound sessions while still avoiding full task-description injection
- Repository source layout moved under `src/`, tests moved into the top-level `test/` mirror, and project guidelines, README, and contribution docs were refreshed for the new layout
- Contributor workflow now validates commit messages through the hook pipeline and broadens lint-staged coverage for ESM/CJS/TS/Vue files
- Runtime and development dependencies were refreshed, including ACP SDK, AI SDK, Nuxt UI, Vue tooling, VitePress, and related lockfile updates

### Fixed

- Restored parallel Chat session streaming so switching sessions no longer drops chunks, status, title updates, or usage updates from other running sessions
- Fixed Chat MessagePort handoff for concurrent streams by correlating each stream with its own `streamId`
- Fixed ACP agent runtime spawning so `npx`, `uvx`, and binary distributions now honor registry-provided startup `args` and `env`
- Fixed Chat scroll offset issues caused by `content-visibility` on message rendering
- Improved tool-call card compatibility for agents that send updates before start events, include input or diff content at different phases, or report completed calls with error output
- Fixed `fyllo-specs` shared-type dependency resolution after the source-layout migration so lint and type-aware checks can cover the bundled server correctly

### Notes

- Local task and session metadata now carries additional lineage and action-state fields. Existing data remains readable; no manual migration is required.

## [0.12.1] - 2026-06-06

This patch release fixes an urgent codex-acp permission request handling issue. When `allow_always` was selected automatically, codex-acp only matched requests against already-approved command prefixes, so unapproved commands returned `user abort` and could not run. The app now selects `allow_once` so the current permission request can proceed as a one-time approval.

### Fixed

- Fixed ACP Agent permission request auto-handling selecting `allow_always`, which triggered codex-acp's approved-prefix matching limit and caused unapproved commands to return `user abort` instead of running

## [0.12.0] - 2026-06-04

This release focuses on tightening the Chat experience, exposing session execution progress, and improving version visibility. The Settings About panel can now check GitHub official releases for newer versions directly from inside the app. Chat also gains an inline ACP execution plan panel, a loading skeleton for session history, and lower Markdown rendering overhead. In addition, Agent available commands returned during the probe stage are now captured and preserved on the session, and interrupted streaming replies now keep partially generated assistant content instead of dropping it outright.

### Added

- GitHub official release version checking in the Settings About panel, with direct links to the matching release page when an update is available
- Inline ACP execution plan display in Chat sessions, showing current plan progress, item status, and priority above the prompt while a session is active
- Capture and persistence of Agent available command lists on chat sessions, providing a stable foundation for Slash Commands in both draft and regular sessions
- A loading skeleton for chat history while session messages are being fetched, reducing blank waiting states
- A shared confirmation dialog component and `useConfirmDialog()` composable to unify confirmation flows across the renderer

### Changed

- Reduced Markdown rendering overhead in chat messages, improving UI performance for long messages and streaming output
- Unified confirmation dialog behavior across settings actions, task cards, Agent cards, and related flows to reduce interaction inconsistencies
- Slash Command data is now maintained and restored per session, making command state more consistent when switching conversations

### Fixed

- Fixed a case where partially generated assistant content could be lost when a streaming reply was stopped by the user or interrupted by an error
- Fixed cases where interrupted replies were not persisted correctly, causing partial assistant messages to disappear after re-entering the session
- Fixed a case where `mode` category config options could still appear in Chat even though the corresponding permission gating is not yet ready to expose those controls safely

## [0.11.3] - 2026-06-01

This patch release focuses on consolidating the local JSON persistence model and introducing a proper migration path. The app now runs data migrations automatically at startup, bringing persisted field naming and time formats into a single consistent shape instead of letting historical formats diverge over time. It also fixes a case where the config options bar could stay empty when starting a new draft session with the same Agent as before.

### Added

- Local JSON data migration framework, running migrations in version order during app startup and providing a baseline mechanism so new installs do not replay historical migrations
- Initial persistence migration scripts to rename the historical `config_options` field to `configOptions` and convert timestamp fields in several caches and install records to ISO 8601 strings

### Changed

- Unified field naming conventions across persisted JSON files around camelCase
- Unified time field formats in the ACP registry cache, status cache, and installed records to ISO 8601 strings, reducing cross-module read/write inconsistencies
- Reorganized migration script registration into a dedicated scripts directory with a static registry for easier future extension and maintenance
- Corrected runtime dependency classification by moving `@nuxt/ui` into production dependencies so the component library is not treated as development-only

### Fixed

- Fixed a case where creating a new draft session with the same Agent as the previous draft would not re-trigger config option probing, leaving the config bar empty
- Fixed migration runner tests to improve regression coverage stability for the migration flow
- Fixed invalid warning output in the icon build script

## [0.11.2] - 2026-06-01

This patch release focuses on ACP Agent management improvements. Installed Agents can now be uninstalled from inside the app, Agent lists show clearer kind information, and the Chat empty-state picker layout is more stable. Agent installation status detection is also much faster, reducing wait time in settings and selection surfaces.

### Added

- ACP Agent uninstall flow, allowing installed Agents to be removed from settings after confirmation and using the correct uninstall command for each installation method
- ACP Agent kind classification, shown in registry cache, settings cards, and Chat empty-state cards to help distinguish different Agent categories
- Agent installation status cache with background refresh, allowing the app to show the most recent known result first and then update status asynchronously

### Changed

- Agent installation status detection now runs in batched distribution-level probes, significantly reducing the time spent checking Agents one by one
- In the Chat empty state, Agent picker tiles now center automatically when fewer than four Agents are installed, avoiding left-heavy sparse layouts
- ACP Agent cards now share a common presentation base, move uninstall into the overflow menu, and use top-right badges for installed and selected states
- Agent card external links now prioritize `website` and `repository`, and the "latest version" hint has been removed from installed states

### Fixed

- Fixed cases where the Chat empty-state "More Agents" tile could stretch or appear visually unbalanced when only a small number of Agents were installed
- Fixed stale local install records and capability caches that could remain after a successful uninstall
- Fixed cases where uninstall could be misreported as successful after a silent underlying command failure by rechecking the real installation state after completion

## [0.11.1] - 2026-05-28

This patch release continues the Chat configuration options experience, fixes empty-state styling, and tightens repository quality checks.

### Added

- Chat session creation now carries draft probe config options, avoiding an empty config bar during first-session handoff
- Repository quality constraints spec, documenting type-aware lint and coverage threshold requirements

### Changed

- Strengthened ESLint type-aware checks and expanded generated type file ignore rules
- Adjusted Vitest timeout settings to improve stability for git-subprocess tests in slower environments

### Fixed

- Fixed the `MoreAgentsTile` styling in the Chat empty state
- Fixed a structured clone failure when passing reactive-proxy config options across the IPC boundary

## [0.11.0] - 2026-05-27

This release upgrades the first-run Chat experience and ACP configuration support. Chat can now show and set configuration options exposed by the active Agent at the session level. Agent selection has also moved into the Chat empty state, the desktop release workflow has been added, and several session-title and bundled MCP stability issues have been fixed.

### Added

- End-to-end support for ACP session-level config options, allowing the Chat prompt to show, edit, and submit configuration options exposed by the agent
- Draft session probe support, preloading the current agent's configuration option capabilities before the first message so users do not need to create a full session first
- Agent selection in the Chat empty state, showing installed agents and providing a modal for choosing additional agents
- GitHub Actions desktop release workflow, supporting version-tag-triggered GitHub draft releases and multi-platform installer uploads

### Changed

- Activity Bar default entry now opens Chat first, prioritizing the conversation workflow after entering a project
- Removed the previous Agent dropdown from the Chat prompt footer, consolidating agent selection into the empty state and session state
- Chat config option loading now distinguishes full sessions from draft probes, avoiding stale configuration rendering while data is not ready or has failed
- Release workflow now checks that the tag version matches `package.json`, reducing accidental release risk

### Fixed

- Fixed fallback session title generation so system reminders are not included in title content
- Fixed potentially unstable git subprocess output parsing in `fyllo-specs` under non-English system locales

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

This release extends the built-in MCP workflow layer beyond the initial `0.9.0` stable baseline. It adds the new `fyllo-cortex` bundled server, deepens `fyllo-specs` automation around OpenSpec setup and archive finalization, and fixes a visible chat stop-state issue during the first-message setup path.

### Added

- Bundled `fyllo-cortex` MCP server with a `guidelines` tool for repository guideline authoring workflows
- `fyllo-cortex` `guidelines` read mode, returning scanned `guidelines/**/*.md` metadata so agents can inspect local guideline coverage
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
