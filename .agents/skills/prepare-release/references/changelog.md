# Changelog Authoring

Use this reference for durable version history in `CHANGELOG.md` and `CHANGELOG.en.md`, whether invoked as part of a full release or as a focused changelog request.

## Evidence and Range

Determine the release range precisely, normally `previous_tag..HEAD`. Read the existing changelog style, git tags, commits, changed files, archived specs, and shipped implementation before drafting.

Convert raw evidence into user-facing changes. Do not paste commit subjects as release bullets and do not include unshipped proposals or future intent.

## Structure

Preserve the repository's established localized headings and use:

1. version heading with explicit date;
2. a short two-to-four-sentence release summary;
3. stable Added, Changed, and Fixed categories;
4. Deprecated, Removed, Security, compatibility, migration, or notes sections only when they are genuinely needed.

Place the latest version first. Prefer flat bullets that each stand on their own.

## Content Rules

- Describe shipped behavior and user or contributor impact.
- Include internal work only when it materially affects reliability, distribution, upgrade safety, architecture constraints, or contributor workflow.
- State where an improvement applies; avoid vague claims such as “optimized performance.”
- Surface breaking changes, migrations, and upgrade caveats explicitly.
- Include bundled MCP server versions and material tool changes when applicable.
- Match the surrounding file's tone and formatting.

## Bilingual Rules

Treat both root changelogs as one deliverable. Keep version, date, category order, bullet scope, compatibility notes, and risk disclosure semantically aligned.

Write natural English and release-quality Chinese rather than literal translation. Do not allow either language to contain shipped claims that the other omits.

## Verification

Re-read every claim against the selected Git range, shipped code, and final documentation audit. Confirm version numbers and dates match all other release artifacts. If the request is file-edit mode, update the files directly rather than returning draft prose only.
