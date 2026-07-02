## Quality Rules

Hard requirements (MUST) for guideline content:

- Base every rule on repository evidence: existing code, tests, configuration, scripts, package metadata, schema files, or user-approved decisions. Cite exact paths, commands, and exported names.
- Every rule must be executable by an agent with zero prior context. "Follow best practices" is invalid; "modules MUST import shared constants from the project's shared constants module instead of redeclaring string literals (cite the actual path)" is valid.
- Mark uncertain facts as requiring verification instead of presenting them as rules.
- Do not duplicate long source files, generated output, or external documentation.
- Do not invent future architecture. Describe the repository as it is, plus user-approved near-term conventions.
- Keep each document scannable. If a document mixes constraint rules, structural maps, and operational steps, split it (see archetype selection).
- Sections serve content: delete any skeleton section you have nothing real to put in. Never fill sections with boilerplate to satisfy structure.
