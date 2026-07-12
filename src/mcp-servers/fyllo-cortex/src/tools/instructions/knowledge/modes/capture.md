## Knowledge Capture

Use this mode only after the user confirms an inline `knowledge.flag` action or explicitly asks to capture durable knowledge.

1. Read `state.index` and compare each candidate from the user's capture message against existing entries.
2. Apply the admission tests below. Drop candidates that are obvious, temporary, secret, personal-sensitive, already covered by specs/guidelines, or not reusable.
3. Verify supporting files or references before writing final entry fields.
4. Write each accepted entry directly to `{state.knowledgeRoot}/<name>.md` as full markdown with YAML frontmatter and body.
5. Output one `knowledge.review` action per written entry using payload `{"name":"<name>","summary":"<concise reason>"}`.
6. Do not emit review actions for rejected candidates; mention rejections in normal chat only when useful.
