---
name: changelog-generator
description: Generate or update durable versioned changelog entries from git history, tags, specs, and shipped code changes. Use when the user asks to create, refine, translate, or synchronize entries in CHANGELOG.md (Chinese, default) or CHANGELOG.en.md (English), especially for Added/Changed/Fixed style release history and bilingual changelog maintenance.
---

# Changelog Generator

Use this skill for repository changelog work. Prefer it when the target artifact is a durable version history file such as `CHANGELOG.md` (Chinese, default) or `CHANGELOG.en.md` (English), not a GitHub release page summary.

## Bilingual Mode

When the user asks for Chinese and English, treat bilingual output as a required deliverable, not an optional refinement.

- If the repo keeps separate changelog files per language, update all requested language files in the same task.
- If the user asks for draft text only, return both language versions in one response with clearly separated sections.
- Keep both language versions equivalent in scope, ordering, meaning, and upgrade risk disclosure.
- Do not let one language contain extra shipped claims that the other omits.

## Workflow

1. Read the project workflow guidance and inspect the existing changelog files before drafting.
2. Determine the release range precisely:
   - usually `previous_tag..HEAD`
   - if the user gives a target version, confirm the intended version header and date
3. Gather evidence from:
   - `git tag`
   - `git log`
   - `git diff --name-only` or `--stat`
   - relevant `openspec/specs/**` or archived changes when behavior needs clarification
4. Convert raw commits into user-facing changes. Do not paste commit subjects directly unless the user explicitly asks for raw history.
5. Organize the entry using stable changelog categories. Prefer:
   - `Added`
   - `Changed`
   - `Fixed`
   - add `Deprecated`, `Removed`, or `Security` only when truly needed
6. Keep each bullet durable and release-history friendly:
   - describe shipped behavior
   - avoid implementation trivia unless it changes user value
   - avoid vague bullets like "optimize performance" without saying where
7. If the repo maintains multiple changelog languages, keep them semantically aligned. Do not let one version contain meaningfully different claims.
8. If the user explicitly requests bilingual output, complete both language versions before finishing the task.

## Changelog Rules

- Changelog entries are fuller than release notes. Include the important shipped changes, not just the top highlights.
- Latest version goes first.
- Every entry should include the released version and explicit date.
- Write from the user or product perspective, but keep enough detail for future readers to understand what changed.
- Internal refactors belong in the changelog only when they affect behavior, reliability, distribution, upgrade safety, or contributor workflow in a meaningful way.
- If there is a breaking change, migration note, or upgrade caveat, call it out explicitly instead of burying it in a general paragraph.
- Do not include unshipped work, draft proposals, or future intent.
- When producing bilingual changelogs, match category structure across languages unless the repo already follows a different localized convention.

## Writing Style

- Prefer concrete nouns and verbs over abstractions.
- Make each bullet stand on its own.
- Avoid raw commit wording, PR noise, issue IDs, and contributor bookkeeping unless the user asks for them.
- Keep the opening paragraph short: summarize the release theme in 2 to 4 sentences.
- Match the surrounding file's tone and formatting.
- English should read naturally, not like a literal translation of Chinese.
- Chinese should read like a release artifact, not like internal work notes translated from English.

## Output Shape

For a normal changelog update, produce:

1. Version heading with date
2. Short overview paragraph
3. Category sections with flat bullets

Example structure:

```md
## [0.12.0] - 2026-06-04

Short release summary.

### Added

- ...

### Changed

- ...

### Fixed

- ...
```

## Output Variants

### File update mode

- Update the existing changelog file or files directly.
- Preserve the repo's established heading and section style.

### Draft text mode

- If the user asks for content without file edits, default to:
  - `Chinese`
  - `English`
- Keep both versions aligned section by section.

## Verification

- Re-read the final text against the actual commit range.
- Check that version numbers and dates are consistent across all changelog files updated in the same task.
- If bilingual changelogs are updated, verify section order and meaning match.
- If the user asked for file edits, write directly into the changelog files instead of returning prose only.
