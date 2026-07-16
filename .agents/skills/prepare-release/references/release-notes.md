# Release Note Authoring

Use this reference for GitHub Releases and other announcement-style summaries, whether invoked as part of a full release or as a focused release-note request.

## Source of Truth

Read the final changelog entry first. If it does not exist, derive shipped scope from tags, commits, touched files, archived specs, and implementation. Verify every highlighted outcome against the selected release range.

Release notes are shorter than changelogs. Do not dump raw commits, PR titles, issue bookkeeping, or file lists.

## Recommended Shape

Prefer:

1. `FylloCode vX.Y.Z` title;
2. a two-to-four-sentence introductory paragraph;
3. three to five user-visible highlights.

Add Fixed, Breaking Changes, Known Issues, Compatibility, or Notes sections only when needed. Keep the first screen scannable in seconds.

## Writing Rules

- Lead with the most important user-visible outcome.
- State the effect rather than the implementation action.
- Mention internal refactors only when users directly benefit.
- Avoid hype, filler, and unsupported claims.
- Give breaking changes, migrations, compatibility limits, and known issues explicit treatment.
- Keep wording release-ready and consistent with established FylloCode terminology.

## Bilingual Rules

Prepare Chinese and English as first-class outputs. Keep claim scope, highlight order, emphasis, and risk disclosure equivalent. Compress both languages proportionally and write natural prose rather than literal translation.

For Chinese-speaking release work, present Chinese first unless the target publication convention requires another order.

## Verification

Compare the final notes with the changelog, documentation audit, code, and specs. Remove anything unshipped or overstated. Confirm the displayed version and release type are correct before publication.
