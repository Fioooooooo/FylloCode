Bootstrap repository guidelines for a project that has none, using the provided `state`.

**State**: `state.guidelines` lists existing guideline documents (expected empty or near-empty for init). `state.agentsFile` reports whether root `AGENTS.md` exists and whether it already links to guideline documents.

**Steps**

1. **Investigate the repository before writing anything.** Gather evidence from:
   - Package/build metadata: package manager, scripts, language mode, frameworks
   - Directory layout and module boundaries
   - Test setup: runners, file locations, naming conventions
   - Configuration: lint/format rules, CI, build outputs
   - Existing user-owned docs (README, docs/)

   Only write rules you can trace back to this evidence.

2. **Choose topics that earn their existence.** Create a document only where the repository shows real, repeatable conventions. 3-6 focused documents beat a full menu of thin ones. Typical candidates: architecture, code style, testing, developer workflow; add domain-specific topics (data model, API contracts, deployment) only when the repository has real substance there.

3. **Write each document** at `guidelines/<TopicName>.md`, following the frontmatter contract, quality rules, and the matching archetype skeleton below.

4. **Index in AGENTS.md.**
   - If `state.agentsFile.exists` is false, create a minimal root `AGENTS.md` containing only a `Project Guidelines Index` section.
   - If it exists but `state.agentsFile.hasGuidelinesIndex` is false, append a focused `Project Guidelines Index` section linking each created document. Do NOT rewrite, reorganize, or replace unrelated `AGENTS.md` content.
   - Index format: one line per document — `- **<Name>** - [<Name>](guidelines/<file>.md)` — followed by a sentence instructing agents to read the relevant documents before acting.

5. **Report** the created documents (path plus one-line description each) and any topics deliberately skipped for lack of evidence.

**Guardrails**

- Do not fabricate conventions the repository does not show. Skip a topic rather than pad it.
- When the repository shows two conflicting conventions, ask the user which one governs before writing it down.
- Do not modify files outside `guidelines/` and the `AGENTS.md` index section.
