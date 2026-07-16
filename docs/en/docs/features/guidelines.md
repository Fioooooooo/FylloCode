---
sidebar:
  group: Product Features
  order: 66
---

# Guidelines

The Guidelines page lets you browse the current project's guidelines — its own engineering conventions. The page itself is read-only; guidelines are created and updated by the Agent during work, through the `guidelines` tool on `fyllo-cortex`.

<figure class="fc-doc-image">
  <img src="/assets/screenshots/guidelines.png" alt="Guidelines page screenshot" />
</figure>

## What guidelines are

Guidelines are a project's own architecture boundaries, naming conventions, testing requirements, and similar engineering rules, stored under the repository's `guidelines/**/*.md` and committed and versioned along with the code. They are not rules FylloCode ships with — they are conventions specific to this project, captured by the Agent as work happens.

## An Agent-assisted evolution loop

Guidelines stay valuable only if they keep matching the real code, and that depends on a small loop the Agent drives:

- **At the start of Chat / Apply**: FylloCode scans the current workspace's `guidelines/**/*.md`, injects an index built from each file's frontmatter, and the Agent reads the relevant document in full when needed
- **Before creating a Proposal, and after Apply or direct implementation completes**: the Agent is asked to consider whether this change should add or update a guideline
- **Before Archive**: the Agent checks again whether the completed change altered commands, architecture, testing, workflow, or data contracts, and updates the relevant guideline before archiving if so

These checkpoints reduce the need for periodic manual guideline cleanup. When the Agent follows them during each change, project conventions keep pace with real work and are less likely to drift out of date.

## Page layout

The left panel lists every guideline file in the project. The right panel shows the selected document's description and body. If a document is missing valid frontmatter, the page shows a warning icon for the parse error — the Agent can barely tell from the index alone whether it needs to open that document, so it's worth fixing promptly.

## When to use it

Use this page when you want to know what convention a project has for a given area, or want to confirm whether the relevant guideline was updated after the Agent's last change. For how the guideline index gets injected into a session and the exact maintenance mode fields, see the [fyllo-cortex reference](/en/docs/reference/fyllo-cortex).
