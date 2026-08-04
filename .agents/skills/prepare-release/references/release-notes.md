# Release Note Authoring

Use this reference for GitHub Releases and other announcement-style summaries, whether invoked as part of a full release or as a focused release-note request.

## Source of Truth

Read the final changelog entry first. If it does not exist, derive shipped scope from tags, commits, touched files, archived specs, and implementation. Verify every highlighted outcome against the selected release range.

Release notes are shorter than changelogs. Do not dump raw commits, PR titles, issue bookkeeping, or file lists.

## Output Format

When outputting release notes, wrap the complete bilingual note in one fenced Markdown code block. The code block language SHALL be `markdown`, and the note body SHALL start with `## 中文`, place the English section after `---`, and use `*` for highlight bullets.

Use this structure, preserving the section order and blank lines:

```markdown
## 中文

summary

### 亮点

- xxx
- xxx

### xxxx

xxxx

---

## English

summary

### Highlights

- xxxx
- xxxx

### xxxx

xxxx
```

Keep release-status commentary outside the code block. Do not add a title before `## 中文` unless the user explicitly requests one.

## Recommended Shape

Within the required bilingual structure, prefer:

1. a two-to-four-sentence introductory paragraph for each language;
2. three to five user-visible highlights in each language;
3. Fixed, Known Issues, or Notes sections only when needed.

Keep the first screen scannable in seconds.

## Writing Rules

- Lead with the most important user-visible outcome.
- State the effect rather than the implementation action.
- Mention internal refactors only when users directly benefit.
- Avoid hype, filler, and unsupported claims.
- Write for end users of a fully local desktop client. Do not include migration, compatibility, storage-format, or upgrade-path messaging in release notes; keep those engineering details in the changelog.
- Do not expose page URLs, route paths, file paths, payload names, or similar implementation details. Refer to visible navigation labels and user outcomes instead.
- Translate changelog entries that use routes or compatibility language for engineering precision into user-visible wording, or omit them when they have no direct user value. Do not edit or simplify the changelog solely to match release-note style.
- Give user-visible known issues explicit treatment when they materially affect the release.
- Keep wording release-ready and consistent with established FylloCode terminology.

## Natural Writing Review

Before presenting the notes, apply the shared [natural-writing.md](natural-writing.md) checklist to both language versions. The same standard applies to changelogs, product documentation, README files, guides, and other release-related prose; this section only identifies the release-note checkpoint.

## Bilingual Rules

Prepare Chinese and English as first-class outputs. Keep claim scope, highlight order, emphasis, and risk disclosure equivalent. Compress both languages proportionally and write natural prose rather than literal translation.

For Chinese-speaking release work, present Chinese first unless the target publication convention requires another order.

## Verification

Compare the final notes with the changelog, documentation audit, code, and specs. Remove anything unshipped or overstated, then scan for internal URLs/routes and migration or compatibility language that belongs only in the changelog. Confirm the displayed version and release type are correct before publication.
