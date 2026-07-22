# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, adapted for the current stage of the project.

## [0.14.3] - 2026-07-22

This release improves readability in long Chat sessions and while Agents are working. Chat can now pin important sessions, streaming assistant messages show a runtime indicator, and consecutive Thinking / Tool activity is grouped into expandable Activity groups. Claude Code subagent calls also get a dedicated inspector for parent-child tool relationships, runtime statistics, and final responses, while dependency pinning and release workflow guidance reduce upgrade and release risk.

### Added

- Chat sessions can now be pinned and unpinned; the pinned state is persisted with project session metadata, the sidebar shows Pinned Sessions and Recent Sessions groups, and the pinned group is height-limited so recent sessions remain visible
- Streaming assistant messages now show a message-level runtime indicator with a 4×4 dot matrix animation, generic status text, and natural elapsed-time units; the state exists only in renderer runtime and is not stored in historical messages
- Added a Claude Code subagent call inspector: parent Agent tools render as standalone cards, and details show prompt, status, model, tokens, duration, tool statistics, child tool activity, and final response
- Added OpenSpec capabilities for `assistant-stream-indicator`, `pinned-sessions`, `subagent-call-inspector`, `assistant-activity-display`, and `chat-prompt-timeline` to capture this release's Chat observability and navigation contracts

### Changed

- Chat prompt timeline now uses a compact line index with continuous nearest-prompt hit testing, drag-to-locate, one summary popover, keyboard navigation, and more stable reading-position synchronization
- Consecutive Thinking and normal tool calls in assistant messages are grouped into collapsible Activity groups; tool details use separate `Input` and `Output` sections and show the complete final output returned by Codex MCP calls
- The ACP event mapper is split into an Agent-neutral baseline, Claude / Codex adapters, a tool-call mapper, and update normalizers, preserving multi-Agent mapping boundaries while improving Claude Code and Codex session update compatibility
- The default Settings entry now opens `/settings/preferences`, and the Preferences and About pages are tightened around preference and release-update information
- Dependencies were updated to the current locked set, with `markstream-vue` `1.0.5` and `stream-monaco` `0.0.46` explicitly pinned together with compatibility notes for future upgrades
- `references/` is reorganized into `designs/` and `third-party/`, with added research and designs for ACP subagents, the Claude MCP initialization race, built-in MCP HTTP, and bundled MCP work
- The repository release skill now has tighter versioning, documentation-audit, release-note timing, and MCP server version decision rules

### Fixed

- Fixed a Claude Code MCP initialization race by waiting for MCP startup before treating the session as ready, reducing early tool-unavailable failures
- Fixed Claude Code and Codex ACP session update mapping details so session titles, tool names, MCP call titles, and subagent output remain more stable while streaming
- Fixed prompt timeline summary popovers potentially stealing focus, reopening immediately, or shifting the summary window during hover, click, and focus transitions
- Fixed Chat session item width, config dropdown hover behavior, confirmation dialogs, and local layout/state details in lineage, task, and settings pages
- Removed redundant dynamic imports from the main process so runtime dependency paths stay direct

### Notes

- The application version is now `0.14.3`.
- `fyllo-specs` MCP server is now `0.8.2`, containing only an internal archive outcome parsing type normalization with no changes to tool names, inputs, outputs, instructions, or archive behavior.
- `fyllo-cortex` MCP server remains at `0.5.0`; that server did not change in this release range.
- Pinned sessions add an optional `isPinned` field to existing session metadata. Historical sessions without the field are read as unpinned and require no manual migration.

## [0.14.2] - 2026-07-16

This release adds a project-level Work Lineage browser so tasks, Chat sessions, Plans, Proposals, and Commits can be reviewed by Session on one page. Settings now uses stable child routes with consistent Service Connections terminology, while confirmation actions remain visible when a dialog contains a long description.

### Added

- Added `/lineage`, which lists every project lineage subject by most recent update, supports All, Active, Archived, and Unlinked filters, and shows the Plan, Proposal, and Commit path grouped by Session
- Work Lineage details reuse existing entry points to open Chat sessions and Proposals, go to Task Board, and copy full Commit hashes; missing Session, Plan, or Proposal metadata keeps its stable ID without blocking other subjects
- Added a Work Lineage entry to the Project Overview governance health grid, showing the total project subject count and opening the complete lineage browser
- Added a bilingual durable knowledge design article covering the admission boundary for retained knowledge, the two-stage `knowledge.flag` and capture mechanism, and the roles of knowledge, guidelines, and lineage

### Changed

- Settings now uses independent `/settings/acp-agents`, `/settings/connections`, `/settings/preferences`, and `/settings/about` child routes inside one shared layout; `/settings` remains the stable entry and opens ACP Agents by default
- The Settings sidebar now uses the fixed Preferences, Agents, Service Connections, and About order; the former Integration Providers label is now Service Connections, and project integrations use the `focus` parameter to locate a provider that needs configuration
- Repository Agent release support is consolidated into the `prepare-release` skill, which covers release-range auditing, bilingual documentation, changelogs, version synchronization, release notes, validation, and commit/tag/push/publish approval checkpoints; contributor guides now document the maintainer flow
- Chinese and English documentation now includes Work Lineage and Settings product references, with matching updates to Overview, lineage, ACP Agents, and engineering integrations

### Fixed

- Fixed confirmation dialog actions scrolling out of view when the description is long; the description now scrolls independently while confirm and cancel actions remain visible
- Fixed ACP `session_info_update` overriding the Chat session title established by FylloCode; the mapper now ignores this upstream update so the existing session title remains stable

### Notes

- The application version is now `0.14.2`.
- The `fyllo-specs` MCP server remains at `0.8.1`, and the `fyllo-cortex` MCP server remains at `0.5.0`; neither server changed in this release range.
- The lineage browser is a read-only projection of existing local lineage, Session, Plan, and Proposal data. It does not change storage formats, and existing projects require no migration.
- **Compatibility**: `/settings?tab=integration-providers|preferences|about` no longer selects a Settings section and is not redirected for compatibility. Use `/settings/connections`, `/settings/preferences`, or `/settings/about` instead.

## [0.14.1] - 2026-07-15

This release lets FylloCode keep multiple projects open in independent windows and completes the project-level durable knowledge path from discovery and capture through review, browsing, and cleanup. Fyllo Action persistence, execution idempotency, and Markdown recognition are hardened throughout, while the underlying cross-process structure moves to a domain-first architecture with clearer ownership boundaries for future capabilities.

### Added

- One-project-per-window behavior and a project-free launcher: reopening a project focuses its existing window, opening another project does not replace the current project context, and launcher/project window bounds and maximized state are persisted independently
- Project-level durable knowledge workflow: agents can mark valuable findings with `knowledge.flag`, users can trigger batched capture, and `knowledge.review` opens the app-data knowledge document for review and editing
- New `fyllo-cortex` `knowledge` tool with `capture`, `update`, `retire`, and `audit` modes, plus file, package, and URL anchor checks that classify entries as `active`, `suspect`, or `unknown`
- Overview Knowledge summary and a dedicated `/knowledge` browser for grouped project, reference, and feedback entries, full Markdown reading, status and scan-error visibility, and confirmation-protected single-entry deletion
- Persisted Fyllo Action `ready` state, authoritative registration and command-based transitions, plus per-session attention badges so unresolved Actions remain visible after an app restart
- `.nvmrc` and a worktree environment preparation script that align the Node version and validate or install dependencies from the lockfile

### Changed

- Cross-process and module structure now follows six domains—`platform`, `workspace`, `session`, `proposal`, `insight`, and `automation`: preload APIs use `window.api.<domain>.<area>`, IPC channels use `<domain>:<area>:<action>`, and lint rules enforce main-service, renderer-store, and feature dependency direction
- Fyllo Action shared contracts, main services, and renderer code are split into explicit layers; the main process now validates registration, transitions, and side-effect idempotency so task creation and batched knowledge-flag handling do not repeat business effects during state-sync retries
- Inline Fyllo Action rendering, EventRail projection, and action identity now share one source analyzer; only complete tags in standalone top-level Markdown blocks are executable, while inline code, fenced code, lists, blockquotes, and explanatory examples stay literal Markdown
- Multi-window runtimes isolate Chat probes, Proposal status watchers, and stream cancellation by project, while app-level ACP agent events fan out to every active window
- Renderer feature boundaries are enforced by generic ESLint rules, with expanded project guidance for architecture, comments, testing, and worktree environment setup
- `fyllo-specs archive-change` now requires generated capability specs to receive a substantive `## Purpose` before an archive can be reported as complete

### Fixed

- Fixed unresolved Fyllo Actions disappearing after restart, invalid transitions overwriting authoritative state, and retries potentially creating durable business objects more than once
- Fixed Action tags in inline code, code examples, lists, blockquotes, normal prose, or incomplete streaming fragments being misrecognized and causing swallowed text, incorrect registration, or disagreement between Inline and EventRail state
- Fixed matching `sessionId`, `changeId`, `runId`, or agent keys in concurrent projects potentially overwriting runtime state, leaking events, or cancelling work in another project
- Fixed knowledge review edits potentially being lost after autosave rejection or component unmount, and malformed knowledge files being hidden instead of surfaced explicitly

### Notes

- The application version is now `0.14.1`.
- `fyllo-cortex` MCP server is now `0.5.0`, adding the durable knowledge tool and status-audit workflow.
- `fyllo-specs` MCP server is now `0.8.1`, adding the post-archive capability Purpose placeholder check.
- **Compatibility note**: preload API roots and IPC channels have moved to the domain-first shape. Custom integrations using legacy `window.api.<area>` APIs or channel names must migrate to `window.api.<domain>.<area>` and `<domain>:<area>:<action>`; local storage paths and data formats remain compatible.

## [0.14.0] - 2026-07-07

This stable release consolidates the 0.14 beta cycle around session-scoped planning, project guideline governance, and clearer project governance views. Chat now has a more explicit split between direct implementation, Plan, and Proposal flows, while Overview, Proposal, Task, and the new Guidelines browser form a fuller operating surface for project governance. The bundled MCP servers are updated as well: `fyllo-specs` now handles linked-worktree exploration and archive guidance more accurately, and `fyllo-cortex` focuses its guidelines tool on maintenance workflows.

### Added

- Session-scoped Plan workflow: agents can create lightweight plans, users can review, edit, save, and approve them in-app, approvals are recorded in lineage, and `plan.create` Fyllo actions connect them back to the current Chat session
- Read-only `/guidelines` project guidelines browser, reachable from the Overview Guidelines stat card, showing recursive `guidelines/**/*.md` entries, frontmatter metadata, document bodies, empty states, and error states
- Chat user prompt timeline, message copy actions, sent-time display, and collapsible session sidebar for more stable navigation and reading in long conversations
- Task board entries for linked Chat sessions, allowing users to inspect and reopen conversations related to a task; local tasks also gain a clearer close-task card action
- Unified linked-worktree indicators across Proposal, Overview, and Chat EventRail, with the related worktree path shown on hover or focus
- New OpenSpec capabilities for `project-health`, `guidelines-browser`, `local-task-actions`, `task-linked-conversations`, `proposal-browser`, `fyllo-specs-explore`, and related governance/workflow contracts introduced during the release

### Changed

- Chat system reminders now use a three-lane decision model: direct implementation, Plan, and Proposal. Chat and Apply stages also inject a project `guidelines/**/*.md` index so agents spend less effort rediscovering repository conventions before making changes
- Overview now uses a clearer dynamic/static two-area structure, making active proposals, recent lineage, governance health, spec growth, and guideline evolution easier to scan
- `/proposal` is simplified into a complete proposal-list entry point, removing duplicate stats, status tabs, and local filtering while keeping the detail Slideover
- Local task actions now distinguish routine closing from permanent deletion: task cards close open tasks, and deletion lives inside the task detail edit dialog
- `fyllo-specs` instructions for `create-plan`, `create-proposal`, `apply-change`, and `archive-change` were tightened to report progress in the user's language, reread approved plans, and write concrete guideline-maintenance tasks
- `fyllo-specs explore` now discovers active changes in both the main workspace and registered linked worktrees, returning workspace metadata and non-fatal warnings in state
- `fyllo-specs create-proposal` now writes an accurate ISO `created` timestamp for new OpenSpec changes; `archive-change` guidance now emphasizes the proposal's delivered work instead of archive mechanics in commit subjects
- `fyllo-cortex` guidelines tool changed from `read`/`write` to three maintenance modes: `init`, `create`, and `update`, returning scenario-specific `<tool_instruction>` content and current `<state>`
- FylloCode's own guidelines, OpenSpec baseline, README, and documentation site were refreshed for Overview, Plan/SDD workflows, Loop Engineering, and MCP server references

### Fixed

- Fixed Chat EventRail proposal state not always refreshing after Proposal details close
- Fixed Proposal detail headers failing to distinguish ready-to-archive, archiving, and base states, and fixed stale task counts, statuses, or dates after reopening details
- Fixed Proposal workflow menus escaping the Slideover and Proposal overlays stacking below the task origin banner
- Fixed Proposal archive actions appearing available when run metadata belongs to another proposal or an archive operation is already in progress
- Fixed `fyllo-cortex` guideline scanning fallback behavior for unreadable files, UTF-8 BOM frontmatter, and missing `FYLLO_PROJECT_PATH`
- Fixed shell tooltip hover options applying too broadly, plus several Chat layout, global overlay, prompt timeline, and archive-status display details

### Notes

- The application version is now `0.14.0`.
- `fyllo-specs` MCP server is now `0.8.0`, covering the Plan tool, worktree-aware explore, accurate change creation timestamps, create-proposal guideline task rules, and archive commit guidance.
- `fyllo-cortex` MCP server is now `0.4.0`. This is a breaking change: `guidelines` `read`/`write` modes were removed; callers must use `init`, `create`, or `update`.
- Local lineage session links now include a `plans` field. Existing data is read as an empty plans array and does not require manual migration.

## [0.14.0-beta.2] - 2026-07-02

This beta release tightens Agent workflow prompts and project guideline governance. Chat and Apply reminders now inject an index of project `guidelines/**/*.md` files so agents can read relevant conventions before making changes, while the `fyllo-cortex` guidelines tool is focused on maintaining those documents. The release also refines Plan, Proposal, health-check, and Fyllo action prompt boundaries, and improves several Chat and Proposal details so direct implementation, Plan, Proposal, Apply, and Archive flows connect more clearly.

### Added

- Chat and Apply system reminders now inject a `<guidelines>` project guideline index from the current project or Apply worktree `guidelines/**/*.md` frontmatter, with angle brackets escaped so user-authored documents cannot prematurely close the prompt block
- Shared guideline scanning entry point used by both main-process prompt injection and the `fyllo-cortex` MCP server's guidelines state
- Project guideline checks in the health-check reminder: missing, broken, or stale guidelines are handled directly through the `fyllo-cortex` guidelines tool instead of entering the Proposal flow
- Slash Command menu search over command descriptions and hints, plus hover details; config-option dropdown entries can also show option descriptions on hover
- More precise Proposal detail display states: completed apply runs show "ready to archive", and active archive operations show "archiving" instead of hiding the next action behind the generic applying state

### Changed

- `fyllo-cortex` guidelines tool changed from `read`/`write` to three maintenance modes: `init`, `create`, and `update`, returning scenario-specific `<tool_instruction>` content with the current `<state>`
- `fyllo-cortex` guidelines authoring contract is now modular: frontmatter and quality rules are hard requirements, while document bodies use rules, map, or playbook skeletons as defaults
- Chat and Apply system reminders now use the injected guidelines index, while the Archive reminder directs agents to maintain guidelines through `fyllo-cortex` before final archive; agents no longer need repeated tool calls just to rediscover the index
- MCP instructions for Plan creation, Proposal creation, Apply, and Archive were tightened to report progress in the user's language, reread the latest Plan file after approval, and guide users back to FylloCode's Apply Change entry point
- Health checks now write the current `healthScore` first, then maintain project guidelines as needed; a Proposal is created only when scoring dimensions need engineering configuration changes or the `project-health` spec is missing or stale
- ACP session plan events are now named agenda in shared types and UI code, with Chat event-rail components and tests updated accordingly
- Documentation and README content refreshed for `fyllo-cortex`, Overview, Plan/SDD workflow, and Loop Engineering across Chinese and English pages
- The FylloCode repository's own historical OpenSpec and guidelines material was cleared to validate onboarding behavior for existing projects with no specs or guidelines yet

### Fixed

- Fixed the Proposal archive action appearing available when run metadata belongs to another proposal or an archive operation is already in progress
- Fixed Proposal detail headers showing only the base status instead of distinguishing ready-to-archive and archiving states
- Fixed `fyllo-cortex` guideline scanning so one unreadable file no longer fails the whole scan; the affected entry now reports `parseError`
- Fixed unstable `fyllo-cortex` guideline frontmatter parsing when files include a UTF-8 BOM
- Fixed `fyllo-cortex` lineage and guidelines project-root resolution so both consistently fall back to the current working directory when `FYLLO_PROJECT_PATH` is absent
- Fixed several Chat layout, global overlay styling, prompt timeline visual, and Proposal archive-status display details

### Notes

- `fyllo-cortex` MCP server is now `0.4.0`. This is a breaking change: `guidelines` `read`/`write` modes were removed; callers must use `init`, `create`, or `update`.
- `fyllo-specs` MCP server is now `0.6.1`, updating Agent instructions for Plan, Proposal, Apply, and Archive without adding new tools.

## [0.14.0-beta.1] - 2026-06-30

This beta release introduces a session-scoped Plan workflow for complex work that needs investigation and trade-off review but does not change external contracts. Chat can now create, review, edit, and approve lightweight plans, with approvals recorded in lineage and connected through the new `fyllo-specs` MCP tool and Fyllo action. Chat also gains a prompt timeline, message copy and timestamps, collapsible session sidebar, and fresher Proposal metadata when details are opened.

### Added

- Session-scoped Plan workflow: agents can use the `fyllo-specs` `create-plan` tool to create lightweight plan documents under the current Chat session, then trigger in-app review through a `plan.create` Fyllo action
- Plan Slideover for reading, editing, saving, and approving plans; after approval, the app sends a confirmation message that tells the agent to reread the latest plan before implementation
- Plan read, save, and approve IPC, preload APIs, renderer APIs, shared schemas, and main-process plan service; plan paths are derived by the main process from project, session, and slug instead of being passed through the renderer
- Lineage session links now record plans, and MCP `create-plan` events are consumed and attached to the current session; older lineage data without plans is normalized to an empty array
- Chat user prompt timeline for navigating long conversations, with prompt previews on hover and focus
- Chat message copy actions and sent-time display, excluding system reminder content from copied text and showing in-app feedback when no text can be copied or clipboard writes fail
- Collapsible Chat session sidebar, with the collapsed state kept only in memory for the current `/chat` page
- New `openspec/specs/plan-tool` capability spec, with matching updates to Fyllo action, lineage, system reminder, and bundled MCP server specs

### Changed

- Chat system reminders now use a three-lane decision model: direct implementation for low-risk work, Plan for complex non-contract work, and Proposal for changes that affect external behavior contracts or ownership boundaries
- Chat EventRail and the prompt timeline now share the message scroll container, and the event rail remains mounted while rendering the events available for the current session
- Fyllo action handler results now use `succeeded`, `failed`, `cancelled`, and `dismissed`; closing Plan review without approval no longer writes a successful action state
- The `fyllo-specs` MCP server instruction markdown set expands from four files to five with `create-plan.md`, alongside updated tool registration, prompt loading, and tests
- `fyllo-cortex` lineage session output now includes linked plans, making lightweight session decisions traceable through the lineage tool
- Proposal detail Slideover refreshes proposal metadata in the background every time it opens, shows existing data immediately, and displays a loading state during refresh
- Chat main-area layout adds a top fade mask and related polish to make long sessions easier to scan with the prompt timeline

### Fixed

- Fixed Proposal details showing stale task counts, status, or dates after reopening
- Fixed Proposal detail metadata refresh failures potentially clearing existing header information; the header now keeps the best available pre-refresh metadata
- Fixed the Proposal overlay stacking below the task origin banner, which could cause the detail panel to be covered
- Fixed shell tooltip hover options applying too broadly; the scoped options now affect only shell controls

### Notes

- `fyllo-specs` MCP server is now `0.6.0` with the new `create-plan` tool; `fyllo-cortex` MCP server is now `0.3.1` with plans in lineage session output.
- Local lineage session links now include a `plans` field. Existing data is read as an empty plans array and does not require manual migration.

## [0.13.3] - 2026-06-29

This patch release improves how project governance artifacts are read and traced inside the app. Overview can now drill into a read-only capability specs browser, Proposal details open as an in-context Slideover, and the new Specs tab shows how a proposal changes capability contracts. Chat also reduces tool-call noise, makes session title actions more consistent, and restores proposal associations after app restarts.

### Added

- Read-only `/specs` capability specs browser, reachable from the Overview Capability Specs stat card, showing Purpose, Requirements, Scenarios, source path, update time, and counts from `openspec/specs/*/spec.md`
- Requirement quick navigation and Scenario timeline rendering in specs details, while continuing to use the shared Markdown renderer for body content
- Specs tab in Proposal details, showing capability deltas from `specs/<capability>/spec.md` with added, modified, removed, and renamed badges
- Controlled specs browser and proposal specs delta IPC, preload APIs, renderer stores, and shared DTOs for the read-only specs and proposal delta surfaces
- Expandable tool groups for consecutive assistant tool calls in Chat, with summaries and icons based on `toolMetadata.toolKind` for read, write, edit, search, and execute actions
- Newly generated assistant tool parts now preserve ACP tool-kind metadata; older messages without that metadata still collapse and fall back to a generic tool-run summary

### Changed

- Proposal details now open in a right-side Slideover instead of navigating to a standalone route, preserving context from the proposal list, Overview active changes, and Chat EventRail
- Proposal detail Slideover keeps Proposal/Design/Tasks reading, implementation start, archive, run history, and applying-run recovery, and switches to the archived proposal id after archive
- Proposal list routing is consolidated into the top-level `/proposal` page, removing the previous shell page used only for nested detail routes
- Chat session item menu copy changed from rename to title editing, with title edits handled inline inside the session item
- Chat session deletion now uses the app confirmation dialog instead of a native browser confirmation prompt
- Chat session item overflow buttons no longer reserve permanent title space, so normal browsing shows longer session titles
- Overview's Capability Specs stat card is now clickable; Guidelines and Lineage Coverage stats remain display-only
- Documentation site adds the bilingual "Using Plan and SDD to Triage Agent Workflows" blog post, Google site verification, and gtag configuration

### Fixed

- Fixed historical proposals not being backfilled into Chat EventRail from lineage after restarting or reopening a session
- Fixed archived proposals failing to match lineage change ids when archive directory names include a date prefix, causing the session proposal panel to disappear
- Fixed archived backfilled proposals still starting proposal status watches; only non-terminal proposals are watched now
- Fixed several Chat display details around reasoning content, tool calls, and normal text interleaving, and preserved Fyllo action part indexes after consecutive tool-call grouping

### Notes

- The standalone `/proposal/:id` detail route has been removed. Open Proposal detail Slideover from the `/proposal` list, Overview active changes, or Chat EventRail detail entry points.

## [0.13.2] - 2026-06-24

This patch release continues turning Chat into the operating surface for project governance. The session event rail can now show proposals linked to the current session and update as OpenSpec status changes are detected. Users can also start implementation, open details, or archive completed proposals from Chat. The documentation site now has a bilingual structure, blog entry points, and sitemap support, and the project license has moved to MIT to lower the barrier for external use and contributions.

### Added

- Chat session event rail now includes a Session Proposals panel with linked proposals, status badges, and detail entry points for the current session
- Users can start draft proposal implementation from the Chat event rail by choosing a workflow, then archive the proposal once the apply run is complete
- Main process proposal status watching and `proposal:statusChanged` broadcasts, covering active and archive directory changes in the main worktree and `.worktrees/*`
- Pending Fyllo actions now appear in the Chat event rail, with event items that locate the original action card
- Chat session list now shows a linked-task indicator and hover popover with the task source and lineage snapshot title
- Documentation site now has an English locale, blog index pages, ACP agent layer and lineage design posts, and sitemap configuration
- Shared `UiSurface` component and renderer UI design guidelines for consistent cards, page hierarchy, color usage, and copywriting

### Changed

- Unified the Chat plan panel and session proposal panel headers, collapse behavior, spacing, and Chinese titles
- Improved Chat main-area resizing when the event rail is visible so the message column, error block, and prompt stay aligned
- Activity Bar now uses an icon-first compact navigation with tooltips and consistent active and hover states
- App Header now uses a lighter window-frame style, with a pill-shaped project switcher aligned with macOS title-bar constraints
- Global tooltip behavior is configured through `UApp`, standardizing hover delay and keyboard focus behavior
- Project license changed from AGPL-3.0 to MIT, with matching updates in `package.json`, README, and contribution docs
- Upgraded `@nuxt/ui` to 4.9.0 and configured the Nuxt UI root for the updated `.nuxt-ui` override directory location

### Fixed

- Fixed cases where a new proposal status push arrived before the proposal store was loaded and the Chat event rail could show only the raw change id
- Fixed layout issues where long change ids in Chat proposal cards could squeeze the status badge
- Fixed creating-state proposals showing unavailable action entry points
- Fixed newly task-bound sessions requiring a session-list reload before origin task information appeared

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
