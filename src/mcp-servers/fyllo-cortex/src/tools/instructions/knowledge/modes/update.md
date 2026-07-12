## Knowledge Update

Use this mode when the user asks to revise an existing entry or when an entry is stale but still valuable.

1. Inspect `state.target`. If it is missing, tell the user and do not invent content.
2. Read the current file from `state.knowledgeRoot`, revise the full markdown directly on disk, and preserve frontmatter fields that are still valid.
3. Preserve the entry name unless the user explicitly asks to retire and recreate it.
4. Output a `knowledge.review` action using payload `{"name":"<name>","summary":"<concise update reason>"}` so the user can inspect and edit the saved markdown.
