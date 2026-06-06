Repository guidelines are maintained in the user's project. They are the local operating manual for agents working in that repository.

Good guidelines are concrete, scoped, and evidence-based. They tell an agent what to read, where code belongs, which commands verify work, and which conventions must be preserved.

## File Contract

- Root `AGENTS.md` is the agent-facing entry point at the repository root.
- `AGENTS.md` SHOULD stay short enough to read at session start. Put detailed rules in `guidelines/*.md`.
- Agents MUST NOT rewrite, reorganize, or replace unrelated `AGENTS.md` content only to introduce guidelines.
- If root `AGENTS.md` does not link to local guideline documents, add a focused `Project Guidelines Index` section that links to applicable `guidelines/*.md` files.
- `guidelines/*.md` contains repository-owned topic guidance such as architecture, process boundaries, testing, data models, APIs, coding style, and local tooling.

## AGENTS.md Guidelines Index

Do not generate or replace a full `AGENTS.md` document from this instruction. Only add or update a guideline index section when the file has no clear links to the local `guidelines/` documents or when the existing links are stale.

Use this section format by default, adapting labels and file names to the repository:

```markdown
## Project Guidelines Index

For more detailed project guidance, agents may read the topic documents listed below.

- **Architecture** - [Architecture](guidelines/Architecture.md)
- **Backend Layering** - [Backend](guidelines/Backend.md)
- **Frontend Layering** - [Frontend](guidelines/Frontend.md)
- **Data Model** - [DataModel](guidelines/DataModel.md)
- **API and IPC Contracts** - [API](guidelines/API.md)
- **Testing** - [Testing](guidelines/Testing.md)
- **Code Style** - [CodeStyle](guidelines/CodeStyle.md)
- **Developer Workflow** - [DeveloperWorkflow](guidelines/DeveloperWorkflow.md)

Before starting analysis, design, implementation, refactoring, testing, or any other action, agents MUST read the existing documents relevant to the task and understand their rules and constraints before deciding the next step.
```

Keep this section factual. Prefer exact document labels and relative links. Do not add links for guideline files that do not exist unless you are creating those files in the same change.

## Recommended Guideline Files

Create only the files that match the repository. Use these names by default so agents can find guidance predictably:

- `guidelines/Architecture.md`: system shape, module boundaries, layering, dependency direction, ownership of major directories.
- `guidelines/CodeStyle.md`: language conventions, naming, formatting, error handling, logging, comments, local helper patterns.
- `guidelines/Testing.md`: test frameworks, test file locations, fixture and mock patterns, required verification commands.
- `guidelines/DataModel.md`: domain entities, schemas, storage formats, migrations, serialization, compatibility rules.
- `guidelines/API.md`: public APIs, HTTP/RPC contracts, client/server boundaries, external integrations, error response shape.
- `guidelines/IPC.md`: desktop or multi-process message channels, preload boundaries, channel naming, payload validation.
- `guidelines/Frontend.md`: UI framework conventions, routing, state management, component layout, styling, accessibility.
- `guidelines/Backend.md`: service boundaries, persistence access, jobs, queues, dependency injection, runtime configuration.
- `guidelines/CLI.md`: command behavior, flags, output shape, exit codes, configuration discovery.
- `guidelines/Build.md`: build outputs, packaging, environment variables, generated files, release artifacts.
- `guidelines/Security.md`: secrets, permissions, auth, trust boundaries, input validation, safe logging.
- `guidelines/Dependencies.md`: package manager rules, allowed dependency types, version policy, vendored code.
- `guidelines/DeveloperWorkflow.md`: local setup, branch-independent workflow notes, review expectations, repeated manual checks.
- `guidelines/Domain.md`: product vocabulary, business rules, user roles, state transitions, invariants.

## Guideline Document Format

Each `guidelines/*.md` document MUST use this structure:

```markdown
---
name: Topic Name
description: A short summary of what this document covers
keywords: [topic, area]
---

# Topic Name

## Purpose

Define what this document governs and when an agent must read it.

## Applicability

- Paths, packages, commands, generated artifacts, or runtime surfaces covered by this guideline.
- Explicit exclusions if nearby code follows different rules.

## Sources of Truth

- Concrete files, schemas, tests, package metadata, scripts, or docs that prove the rules below.
- Include exact paths and exported names where useful.

## Rules

- MUST: hard constraints agents must follow.
- SHOULD: preferred defaults that can be bypassed with a repository-specific reason.
- MAY: allowed patterns or optional helpers.

## Examples

- Good examples from this repository, with paths.
- Bad or deprecated examples only when they prevent repeated mistakes.

## Verification

- Commands or focused checks that validate changes in this topic.
- Note required environment assumptions such as package manager, runtime version, or generated setup.

## Maintenance

- Events that require this document to be updated.
- Owners or source files to inspect when the guideline looks stale.
```

Frontmatter is recommended, not required. `name` gives the human-friendly title, `description` summarizes the document, and `keywords` provides a small set of search terms. `mode=read` reads these fields to surface a lightweight overview of the project's guideline files.

Rules MUST be specific enough that another agent can apply them without prior conversation context. A rule such as "follow best practices" is invalid. A rule such as "renderer code MUST import shared IPC channel names from `src/shared/types/channels.ts` instead of string literals" is valid.

## Topic-Specific Content Requirements

Use these checklists when creating or updating common guideline files:

### Architecture.md

- MUST describe the top-level runtime or deployment shape.
- MUST list major directories and what each owns.
- MUST define allowed dependency direction between layers.
- MUST call out cross-cutting boundaries such as UI-to-domain, domain-to-storage, server-to-client, or process-to-process boundaries.
- SHOULD include a short flow diagram or bullet flow for the most important request or data path.

### CodeStyle.md

- MUST name the formatter, linter, language mode, and package manager.
- MUST document import conventions, module alias usage, file naming, exported type naming, and error-handling patterns.
- MUST describe when comments are expected and when they are noise.
- SHOULD reference representative files that model the desired style.

### Testing.md

- MUST name test runners and environments.
- MUST list test file locations and naming conventions.
- MUST explain mock, fixture, snapshot, and integration-test patterns used by the repo.
- MUST map common change types to minimum verification commands.
- SHOULD mention known slow, flaky, or environment-sensitive tests.

### DataModel.md

- MUST list core entities, identifiers, persisted fields, and ownership of schema definitions.
- MUST describe serialization, migration, backward-compatibility, and default-value rules.
- MUST identify fixtures or tests that prove data contract behavior.

### API.md

- MUST define API ownership, route or method naming, request and response types, and error shape.
- MUST identify generated clients, schemas, or shared types that must be updated with contract changes.
- SHOULD include authentication, pagination, idempotency, and versioning rules when applicable.

### IPC.md

- MUST define message/channel naming, payload schemas, and process ownership.
- MUST state where channels are declared and where handlers are registered.
- MUST describe preload or bridge exposure rules when a desktop app has isolated processes.
- SHOULD include validation and error-propagation expectations.

### Frontend.md

- MUST document routing, state management, component organization, styling system, and asset conventions.
- MUST identify design-system components or local wrappers agents should reuse.
- MUST describe user-visible loading, empty, and error state conventions when they exist.

### Backend.md

- MUST document service, repository, job, queue, and configuration boundaries.
- MUST describe database or external service access patterns.
- MUST state logging, retry, timeout, and error propagation conventions.

### Build.md

- MUST list generated outputs and whether they are tracked.
- MUST describe build scripts, packaging scripts, environment variables, and platform-specific steps.
- MUST identify files that are generated and should not be edited manually.

### Security.md

- MUST define where secrets live and where they must not appear.
- MUST describe permission, authentication, authorization, input validation, and safe logging rules.
- SHOULD list sensitive paths, tokens, user data, or external trust boundaries.

### DeveloperWorkflow.md

- MUST document local setup commands and recurring manual checks.
- MUST describe repo-specific review expectations that are not obvious from tooling.
- SHOULD record repeated user corrections that reveal durable local conventions.

### Domain.md

- MUST define product vocabulary and domain-specific terms.
- MUST describe key invariants, state transitions, roles, permissions, and lifecycle rules.
- SHOULD link to tests or fixtures that encode business behavior.

## Authoring Rules

- Base every guideline rule on repository evidence: existing code, tests, configuration, scripts, package metadata, schema files, generated artifacts, or user-owned documentation.
- Prefer exact paths, commands, exported names, environment variables, and ownership boundaries over broad advice.
- Mark uncertain facts as requiring verification instead of presenting them as rules.
- Do not duplicate long source files, generated output, dependency documentation, or external manuals.
- Do not invent future architecture. Describe the repository as it is, plus user-approved conventions that should govern near-term changes.
- Keep topic files small enough to scan. Split a file when one document mixes unrelated surfaces.

## Maintenance Triggers

Review and update local guidelines when repository conventions change, including:

- New or changed commands, scripts, package managers, runtime versions, build systems, or test runners.
- New or changed architecture, layering, ownership boundaries, module layout, or dependency rules.
- New or changed testing expectations, fixtures, mocks, environments, or verification commands.
- New or changed data contracts, schemas, storage formats, public APIs, or integration behavior.
- New or changed UI framework, routing, design-system, styling, accessibility, or asset conventions.
- New or changed security, permissions, secrets, auth, validation, or logging conventions.
- Repeated user corrections that reveal an unstated repository convention.

## Conflict Handling

- Higher-priority instructions from the current session override repository guidelines.
- Observed repository facts override stale or contradictory guideline text.
- When guidelines conflict with current facts, update the guideline or report the conflict before relying on it.
- When two local guideline files disagree, follow the file with the narrower applicable scope and repair the inconsistency when it affects the work.
