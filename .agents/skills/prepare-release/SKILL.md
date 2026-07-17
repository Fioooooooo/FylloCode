---
name: prepare-release
description: Prepare, verify, and complete FylloCode releases from the previous tag through documentation audit, bilingual changelogs, version synchronization, release notes, validation, release commit, tagging, push, and publication handoff. Use when the user asks to prepare or publish a release, bump a release version, audit release documentation, update CHANGELOG.md or CHANGELOG.en.md, or draft GitHub Release notes or highlights.
---

# Prepare Release

Prepare one evidence-backed release without losing documentation updates or bypassing repository safeguards. Support both the full workflow and focused changelog, documentation-audit, or release-note requests.

## Read Before Acting

1. Read the repository `AGENTS.md`, relevant `openspec/specs/**`, and applicable `guidelines/**` before editing.
2. Read [documentation-audit.md](references/documentation-audit.md) for every full release or documentation audit.
3. Read [documentation-architecture-and-style.md](references/documentation-architecture-and-style.md) in full before creating, restructuring, or rewriting product documentation.
4. Read [versioning.md](references/versioning.md) before selecting or changing any application or bundled MCP server version.
5. Read [changelog.md](references/changelog.md) before editing either root changelog.
6. Read [release-notes.md](references/release-notes.md) before drafting or publishing release notes.
7. Inspect `git status --short` and preserve unrelated user changes. Never clean, reset, overwrite, or reformat unrelated work.

## Establish the Release Boundary

Determine and report:

- user-provided target application version and release date;
- previous release tag and exact `previous_tag..HEAD` range;
- whether the release is stable or prerelease;
- requested stopping point: artifacts only, release commit, tag, push, or publication;
- bundled MCP server versions derived from their independent change boundaries, with evidence and rationale.

Use the latest relevant semantic-version tag as the default base. Require the user to provide the exact target application version, including any prerelease identifier; never infer the application version from commits, change size, or release contents. If it is missing, ask one concise question for it and stop until answered. Derive bundled MCP server versions yourself by following [versioning.md](references/versioning.md); do not ask the user to choose those versions when the change boundary can be established from repository evidence.

Exclude unshipped proposals, working-tree-only product changes, and future intent from shipped claims. Include a working-tree change only when the user explicitly places it in the release scope.

## Gather Evidence

Inspect at minimum:

```bash
git tag --sort=-version:refname
git log --oneline --decorate <previous_tag>..HEAD
git diff --name-status <previous_tag>..HEAD
git diff --stat <previous_tag>..HEAD
```

Read relevant archived OpenSpec proposals, designs, tasks, capability specs, implementation files, and tests. Treat archived specs and shipped code as stronger evidence than commit subjects. Use commit subjects only as an index into the actual change.

Build a release inventory grouped into user-visible additions, changes, fixes, compatibility notes, contributor changes, and internal-only work. Every release claim must trace to evidence in the selected range.

## Audit and Update Documentation

Follow [documentation-audit.md](references/documentation-audit.md) to find and close gaps, and [documentation-architecture-and-style.md](references/documentation-architecture-and-style.md) to choose the correct document type, location, page structure, terminology, and wording.

Treat the audit as an implementation step, not a report-only checkpoint. Unless the user explicitly requested an audit-only result, do not stop after listing missing or stale documentation. Create the missing documents, rewrite outdated sections, and add any navigation or index entries needed to make new pages discoverable before continuing the release.

For every meaningful shipped change, record one disposition in the working notes:

- `updated`: name the Chinese and English documents changed;
- `already-current`: cite the document that already describes the shipped behavior;
- `not-applicable`: give a concrete reason why no durable documentation changes;
- `blocked`: stop the release until the gap is resolved.

Implement all `updated` items before continuing, including creating documents that do not yet exist. Keep Chinese and English documents equivalent in scope and risk disclosure. Use `blocked` only when the documentation cannot be written without unresolved product evidence or a user decision; missing documentation by itself is work to complete, not a reason to defer it. Do not use a generic “documentation updated” statement as a substitute for the per-change audit.

## Update Changelogs

Follow [changelog.md](references/changelog.md) and update both `CHANGELOG.md` and `CHANGELOG.en.md` for a normal FylloCode release.

Use the target version and explicit date. Keep the category structure, shipped claims, compatibility notes, and bundled MCP version notes semantically aligned. Re-read the result against the release inventory and selected Git range.

## Synchronize Versions

Follow [versioning.md](references/versioning.md). Update `package.json` to the exact application version provided by the user; do not alter or second-guess that version based on the release inventory.

For each bundled MCP server changed in the release range:

1. inspect its commits, implementation, current version constant, and changelog;
2. identify the highest affected external contract boundary;
3. derive the next server version using the project rules in `versioning.md`;
4. record the evidence and versioning rationale in the working notes;
5. update its version constant and changelog together;
6. mention the resulting version in both root changelogs.

Do not bump an unchanged bundled server merely to match the application version. Verify the release tag without its leading `v` will exactly equal `package.json.version`.

## Validate

Before running project commands in a worktree that has not been prepared in the current session, run:

```bash
sh scripts/prepare-worktree-env.sh
```

Run lightweight, relevant checks first. For a normal release, prefer:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Run narrower checks when the request is limited to release text and no source or configuration changed. Validate manually that:

- Chinese and English changelog sections match in version, date, structure, meaning, and risk disclosure;
- changed product surfaces have a documented disposition;
- application and bundled server versions agree with their changelogs;
- the proposed tag matches `package.json.version`.

Never run `pnpm build`, `pnpm docs:build`, Electron/Vite builds, packaging commands, or another command primarily generating build artifacts unless the user explicitly authorizes that build in the current conversation. Prior release intent, generic validation requests, plans, or earlier-session permission do not count. If build authorization is absent, report the skipped build and ask only when its result is necessary.

Do not run global formatting unless formatting changes are necessary. Format only touched files when possible.

## Release Checkpoints

Stop and report before each external or consequential transition:

Use the repository commit convention. Prefer the established release subject:

```text
chore(release): prepare vX.Y.Z
```

1. **Release commit**: summarize artifacts and validation; obtain approval before committing unless the user already explicitly requested the commit.
2. **Tag**: verify the release commit is the intended target and obtain approval before creating an annotated tag.
3. **Push**: obtain approval before pushing the branch or tag.
4. **Release notes**: only after the annotated tag has been successfully pushed to `origin`, present the final release notes.
5. **Publish**: confirm the release workflow succeeded and obtain approval before changing a draft GitHub Release to published.

For a focused release-note-only request outside a full release workflow, provide the requested notes without requiring a tag or push.

Never move or replace an existing tag without explicit user instruction. Never publish when required validation failed, documentation has `blocked` dispositions, version files disagree, or the release notes contain unresolved claims.

## Present Release Notes

After a full release's annotated tag has been pushed to `origin`, follow [release-notes.md](references/release-notes.md). Use the final changelog as the primary source, verify highlights against code and specs, and include only shipped claims.

Prepare Chinese and English release-ready text and keep the first screen concise. Do not create an auxiliary release-note file unless the repository already uses one or the user requests it. Do not present or preview release notes earlier in the full release workflow.

## Complete the Handoff

Report:

- target version, release range, and release type;
- user-visible scope and documentation dispositions;
- files changed for docs, changelogs, versions, and release metadata;
- validation run, passed, failed, or skipped with reasons;
- commit, tag, push, release-note, workflow, and publication status;
- exact next approval or action still required.

Do not describe the release as complete until every user-requested stopping point has actually succeeded.
