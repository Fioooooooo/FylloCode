# Documentation Audit

Use this reference to turn the release range into explicit documentation work. The audit is semantic: file paths suggest where to look, but they do not prove whether documentation is current.

Read `documentation-architecture-and-style.md` from the same reference directory before choosing a target page or authoring documentation. Apply its information architecture, content-type, page-template, terminology, voice, and bilingual rules to every audit update.

## Evidence Order

Inspect evidence in this order:

1. archived OpenSpec proposal, design, tasks, and capability deltas;
2. shipped implementation and tests;
3. user-visible routes, labels, states, errors, defaults, and workflows;
4. commit history and changed-file patterns;
5. existing Chinese and English documentation.

Do not infer shipped behavior from a proposal alone. Confirm it in code or completed tasks.

## Documentation Scope

Audit these durable surfaces when relevant:

| Change signal                                                          | Documentation candidates                                                              |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Renderer page, route, navigation, or visible workflow                  | `docs/{zh,en}/docs/features/**`, `guide/**`, screenshots, feature index               |
| User-visible default, empty, loading, error, or compatibility behavior | Feature/guide pages and root changelogs                                               |
| IPC, preload API, configuration, schema, or integration contract       | `docs/{zh,en}/docs/reference/**`, integration guides, compatibility notes             |
| Built-in MCP server tool, mode, prompt contract, or version            | MCP reference pages, server changelog, root changelogs                                |
| Contributor workflow, commands, toolchain, or release process          | `CONTRIBUTING.md`, bilingual contributing pages, README, applicable guidelines        |
| Product positioning, onboarding, or primary workflow                   | `README.md`, `README.en.md`, landing/index pages, getting-started and workflow guides |
| Architecture-only change with durable contributor impact               | Relevant guideline and root changelog when contributor-visible                        |

Also inspect the navigation/index pages that lead to any new document. A page that exists but cannot be discovered is not complete documentation.

Blogs are editorial artifacts, not mandatory release documentation. Do not create or rewrite a blog solely to satisfy the release audit unless the user asks. Treat generated VitePress output as a build artifact, not an authored documentation source.

## Per-Change Audit

For each meaningful release inventory item:

1. identify the affected user or contributor;
2. state what they can now do, what changed, or what risk was removed;
3. locate every durable document that currently claims or teaches that behavior;
4. compare those claims with the shipped implementation;
5. choose `updated`, `already-current`, `not-applicable`, or `blocked`;
6. update all affected Chinese and English authored sources together.

Use `not-applicable` only with a specific rationale such as “internal rename with no public API, UI, workflow, or contributor impact.” Do not use it merely because no obvious target file was found.

## Write Missing Documentation

For a full release, continue directly from discovery into authoring. Do not return a gap list and leave the documents unwritten unless the user explicitly asked for audit-only output.

When documentation is missing:

1. choose the durable feature, guide, reference, README, or contributor surface that owns the behavior;
2. create both Chinese and English pages when the subject belongs in both locales;
3. follow neighboring pages for frontmatter, headings, terminology, examples, and sidebar conventions;
4. explain the user goal, shipped behavior, important constraints, errors or compatibility risks, and any required commands using verified code and spec evidence;
5. add or update feature indexes, guide indexes, cross-links, or navigation metadata so readers can discover the new page;
6. re-read the new documents against the implementation and tests before marking the item `updated`.

When documentation exists but is stale, rewrite the affected claims and workflows rather than appending a disconnected release note. Preserve still-correct material and avoid speculative details.

Treat missing documentation as required release work. Use `blocked` only when essential behavior remains unknowable or requires a user decision, not merely because a new page must be written.

## Bilingual Parity

For paired Chinese and English documents, verify:

- both files exist when the content is intended for both locales;
- headings and section coverage are equivalent;
- commands, paths, version numbers, defaults, and warnings agree;
- neither language contains extra shipped claims or missing compatibility notes;
- English is natural rather than literal, while preserving meaning.

Exact sentence structure is not required. Semantic parity is required.

## Stale Visuals and Links

When a visible page or navigation structure changed, inspect referenced screenshots and diagrams. Update them only when they would materially mislead the reader; otherwise record why they remain valid.

Check links introduced or touched by the release. If a full documentation build is needed to validate generated routes, obtain explicit user authorization before running `pnpm docs:build`.

## Completion Test

The documentation audit is complete only when:

- every meaningful shipped change has a disposition;
- every `updated` document is actually edited;
- there are no `blocked` items;
- paired locales are semantically aligned;
- changelog and release-note claims agree with the resulting docs;
- unresolved uncertainty is reported rather than silently omitted.
