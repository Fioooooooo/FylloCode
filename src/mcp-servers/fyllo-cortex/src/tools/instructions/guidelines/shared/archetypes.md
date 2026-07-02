## Archetype Selection

Pick the archetype by what the document's body mainly is:

- **Rules** — constraints agents must obey (code style, interface contracts, security, dependency policy, testing conventions).
- **Map** — structure, ownership, and boundaries (architecture, data model, domain vocabulary).
- **Playbook** — operational sequences (developer workflow, build/release, environment setup).

If one document mixes two archetypes, split it into two documents or narrow the scope.

All archetypes share the frontmatter contract. The body structures below are defaults (SHOULD): keep the sections that carry real content, delete the rest, and restructure when the topic has a more natural shape.

### Rules skeleton

```markdown
# <Topic>

## Scope

- Covered: paths, packages, or surfaces this document governs.
- Not covered: nearby areas that follow different rules (link their documents).

## Rules

Group rules by sub-topic. Each rule cites its evidence inline:

- MUST: <hard constraint> (evidence: <path or command>)
- SHOULD: <preferred default, bypassable with a repository-specific reason>
- MAY: <allowed pattern or optional helper>

## Examples

- ✅ <path> — model example to follow
- ❌ <anti-pattern> — include only when it prevents a repeated mistake

## Verification

- Commands or focused checks that validate compliance.
```

### Map skeleton

```markdown
# <Topic>

## Overview

One paragraph on the overall shape, plus the most important data/request path as a bullet flow.

## Areas & Ownership

| Directory / Module | Owns | Key entry points |
| ------------------ | ---- | ---------------- |

## Boundaries

- MUST: allowed and forbidden dependency directions — these are the map's rules.

## Staleness Signals

- Events that make this document outdated, and the files to inspect to re-verify it.
```

### Playbook skeleton

````markdown
# <Topic>

## Prerequisites

- Tooling, versions, and environment setup done once.

## Scenario: <do something>

When to use: one sentence.

```bash
<commands>
```

Expected result, plus known failure modes and how to react.

(repeat one Scenario block per operation)

## Quick Reference

| I want to… | Command |
| ---------- | ------- |
````
