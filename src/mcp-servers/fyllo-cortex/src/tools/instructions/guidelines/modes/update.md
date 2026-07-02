Update an existing guideline document so it matches current repository facts, using the provided `state`.

**State**: `state.target` is the document to update — its current frontmatter (`name`, `description`, `keywords`), an `exists` flag, and `parseError` when the frontmatter is broken. `state.guidelines` is the full index for cross-checking.

**Steps**

1. **Read the full document** at `state.target.path` before changing anything.
2. **Identify the delta.** Anchor every edit to a concrete trigger: a user correction, a repository fact that contradicts the text, or a change that introduced or retired a convention. Do not rewrite sections that are still accurate.
3. **Apply the smallest edit** that restores accuracy, keeping the document's archetype and the quality rules. If `state.target.parseError` is set, repair the frontmatter to satisfy the contract as part of this edit.
4. **Keep the index consistent**: if `name` or `description` changed, verify the `AGENTS.md` index line still matches.
5. **Verify**: call this tool again with `includeInstruction: false` and confirm the document shows the updated frontmatter without `parseError`.

**Conflict handling**

- Observed repository facts override stale guideline text — update the text, do not bend the facts.
- When two guideline documents disagree, follow the one with the narrower applicable scope and repair the inconsistency when it affects the current work.
- Higher-priority session instructions override repository guidelines; if the user overrides a rule ad hoc, ask whether the guideline itself should change before editing it.

**Guardrails**

- Preserve unrelated content. This mode is a repair, not a rewrite.
- If `state.target.exists` is false, report it and suggest `mode=create` instead of silently creating the file here.
