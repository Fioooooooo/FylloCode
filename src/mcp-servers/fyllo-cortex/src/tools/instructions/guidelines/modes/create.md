Create a new guideline document for a convention this repository must keep, using the provided `state`.

**State**: `state.guidelines` is the current index. `state.agentsFile` reports the `AGENTS.md` index status. `state.topic` echoes the requested topic.

**Steps**

1. **Check for overlap.** Compare the topic against `state.guidelines` (name, description, keywords). If an existing document already covers this area, extend that document instead of creating a near-duplicate.
2. **Collect the evidence** that motivated this document: the files, corrections, or decisions that prove the convention. If the convention exists only in this conversation, confirm it with the user before writing it as a rule.
3. **Pick the archetype** (rules / map / playbook) and write the document at `guidelines/<TopicName>.md`, following the frontmatter contract, quality rules, and the matching skeleton below.
4. **Update the `AGENTS.md` index**: add one link line for the new document in the existing guidelines index section. Create the section if missing; do not touch unrelated content.
5. **Verify**: call this tool again with `includeInstruction: false` and confirm the new document appears in `state.guidelines` without `parseError`.

**Guardrails**

- One document, one topic. If the content splits across two archetypes, create two documents or narrow the scope.
- Do not modify files outside `guidelines/` and the `AGENTS.md` index section.
