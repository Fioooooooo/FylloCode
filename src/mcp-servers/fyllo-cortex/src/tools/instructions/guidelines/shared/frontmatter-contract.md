## Frontmatter Contract

Every `guidelines/**/*.md` document MUST start with YAML frontmatter:

```yaml
---
name: Topic Name
description: One sentence stating what this document governs
keywords: [topic, area]
---
```

- `name`: human-friendly title, unique across guideline documents.
- `description`: one sentence, concrete enough that a reader can decide whether to open the document from the index alone.
- `keywords`: 2-6 lowercase search terms.

This frontmatter is machine-read to build the guidelines index injected into agent sessions. Broken frontmatter degrades that index silently — keep the YAML valid.
