Create or inspect an OpenSpec change using the provided `state`.

**Input**: `targetPath` is required. It must be an absolute path to the main repo root or a
registered git worktree for that repo. In P1, the agent should default to passing
`$FYLLO_PROJECT_PATH` (the main repo root). `state.changeName` is the kebab-case name for this
change.

**Steps**

1. **Check state**

   Read `state` to understand the current situation:
   - `state.artifacts`: list of artifacts with their status and instruction data
   - `state.applyRequires`: artifact IDs needed before implementation can start
   - `state.nextArtifact`: the next artifact ID that needs to be created (null if all done)
   - `state.template`: template structure for the next artifact
   - `state.instruction`: schema-specific guidance for the next artifact

2. **Create artifacts in sequence until apply-ready**

   Loop through artifacts in dependency order until all `state.applyRequires` artifacts are `done`:

   For each artifact where `status !== "done"` and dependencies are satisfied:
   - Read any completed dependency artifacts for context (paths are in `state.artifacts[*].outputPath`)
   - Create the artifact file using `state.template` as the structure
   - Apply `state.instruction` as guidance — but do NOT copy instruction/context/rules blocks into the file
   - Show brief progress: "Created <artifact-id>"

   If an artifact requires user input (unclear context), ask before proceeding.

3. **Show final status**

   After all `applyRequires` artifacts are complete, summarize:
   - Change name and location
   - List of artifacts created with brief descriptions
   - "All artifacts created! Ready for implementation."
   - Prompt: "Start implementing with the apply-change tool."

**Artifact Creation Guidelines**

- Follow `state.instruction` for each artifact type
- Use `state.template` as the structure — fill in its sections
- Read dependency artifacts for context before creating new ones
- **IMPORTANT**: instruction, context, and rules are constraints for YOU, not content for the file. Do NOT copy them into the artifact output.

**Artifact Detail Bar**

The agents that later implement this proposal will start fresh — they will NOT see this conversation, and will NOT inherit the context you have right now about the user's intent, the constraints discussed, or the trade-offs already resolved. Treat the artifacts as the _only_ contract between this stage and Apply.

- Write artifacts so that an agent with zero prior context can understand both **what** to build and **how** to build it after reading them.
- No ambiguity. If a sentence could be read two ways, rewrite it.
- Tasks in `tasks.md` MUST be concrete. Each task should specify, where applicable:
  - File paths to create or modify (e.g. `electron/main/services/foo/bar.ts`)
  - Function / method / class / type names involved
  - Existing patterns, modules, or utilities to reuse — name them explicitly
  - Acceptance criteria so the implementer knows when the task is done
- Avoid hand-wave verbs like "improve X", "refactor Y", "handle edge cases". Replace them with concrete operations against named code locations.
- Capture decisions made in this conversation (e.g. chose library A over B, picked schema X over Y) and the rationale in the appropriate artifact. A future implementer cannot reconstruct that from the codebase alone.

**Self-check before marking any artifact `done`**: imagine handing it to an engineer who has never seen this codebase or this conversation. Could they execute it without asking questions? If not, the artifact is not yet `done` — add the missing detail.

**Guardrails**

- Do not invoke the OpenSpec CLI directly. Change creation, status lookup, and artifact instruction lookup are handled by this MCP server.
- Create ALL artifacts needed for implementation (as defined by `state.applyRequires`)
- Always read dependency artifacts before creating a new one
- If context is critically unclear, ask the user — but prefer making reasonable decisions to keep momentum
- If a change with that name already exists (`state.artifacts` is non-empty and contains `done` items), ask if the user wants to continue it or start fresh
