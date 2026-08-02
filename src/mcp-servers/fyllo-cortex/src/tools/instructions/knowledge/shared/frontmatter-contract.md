## Knowledge Entry Contract

Every persisted knowledge entry is a markdown file with YAML frontmatter and body.

Required frontmatter:

- `name`: kebab-case unique identifier and file stem.
- `description`: short hook explaining when the entry is relevant.
- `type`: one of `project`, `reference`, or `feedback`.
- `createdAt` and `updatedAt`: quoted ISO datetime strings, for example `"2026-07-12T16:43:47.000Z"`.

Optional frontmatter:

- `asOf`: quoted provenance datetime string.
- `anchors`: file, package, or URL evidence anchors.
  - `file` anchors MUST use `kind: file`, an authorized owner `folderId`, repository-relative `file`, and SHA-256 `hash`.
  - `package` anchors MUST use `kind: package`, an authorized owner `folderId`, `package`, `version`, and SHA-256 `resolutionDigest` of the matched owner Folder pnpm lockfile package entry.
  - `url` anchors MUST use `kind: url`, `url`, quoted `verifiedAt`, and optional numeric `maxAgeDays`.
- `source`: required when no anchors exist and always required for feedback entries. Commit sources MUST include their owner `folderId`; lineage proposal evidence MUST use `proposalRef: { folderId, changeId }`, and lineage commit evidence MUST include both `folderId` and `commitHash`. Session sources and URL anchors do not use a Folder owner.

Knowledge files remain under the Workspace-owned `state.knowledgeRoot`. A repository-relative anchor is resolved only against its named Folder from the current Workspace descriptor; never infer primary or retry another Folder when that owner is missing or unavailable.

The body should explain the fact, why it matters, reuse conditions, and what would invalidate it.

Canonical example:

```yaml
---
name: markstream-ai-chat-streaming-lifecycle
description: "Read before changing chat Markdown streaming lifecycle."
type: project
createdAt: "2026-07-12T16:43:47.000Z"
updatedAt: "2026-07-12T16:43:47.000Z"
asOf: "2026-07-13T00:00:00.000Z"
anchors:
  - kind: file
    folderId: folder-markstream
    file: src/renderer/src/components/shared/MarkStream.vue
    hash: bbb86374b6274cf2c34d4c180e01adce978f009a3d07ffdcace1ebc1bb2dd6c8
  - kind: url
    url: https://markstream.simonhe.me/zh/guide/ai-chat-streaming.html
    verifiedAt: "2026-07-12T16:43:47.000Z"
    maxAgeDays: 180
---
```

The scanner tolerates only unambiguous legacy shorthand while reading, such as missing anchor `kind`, YAML timestamps parsed as Date values, date-only strings, and numeric strings for `maxAgeDays`. This tolerance is read-only; agents should still write the canonical frontmatter above and must not rely on scanner normalization as the authored format.
