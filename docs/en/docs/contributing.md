---
sidebar:
  group: Contributing
  groupOrder: 40
  order: 10
---

# Contributing Guide

Thanks for your interest in FylloCode. This page explains how to set up the project locally, how to submit changes, and what conventions contributors should follow. FylloCode is developed with FylloCode itself. See [Developing FylloCode with FylloCode](/en/docs/guide/develop-with-fyllocode) for the full practice.

## Development Environment

Required dependencies:

- Node.js 22+
- pnpm 10+

Start locally:

```bash
git clone https://github.com/Fioooooooo/FylloCode.git
cd FylloCode
pnpm install
pnpm dev
```

## Prefer the Packaged App for Contribution Work

FylloCode also uses FylloCode to develop itself. When contributing, prefer opening the FylloCode repository with the packaged app from Releases instead of driving Apply from a `pnpm dev` instance.

Development mode uses hot reload. After the Apply stage edits source files, hot reload may interrupt the running workflow. The packaged app does not have that problem.

Recommended flow:

1. Download the latest Release.
2. Open the FylloCode repository as a project.
3. Optionally describe the change in a Task.
4. Use Chat to converge on a plan, then run Proposal -> Apply & Archive.
5. Return to the repository to inspect the diff and verification results.

## Contribution Flow

Small changes can go straight to a PR, for example:

- Typos
- Documentation fixes
- Small bugs
- Test coverage

Larger changes should start with an Issue, for example:

- New features
- Architecture changes
- Behavior changes
- IPC, shared type, or storage format changes
- Broad refactors

Keep PRs focused, and make the title clear about what changed. If the change affects user-visible behavior, describe the impact in the PR body.

## Issue Guidelines

When reporting a bug, include:

- Reproduction steps
- Actual behavior
- Expected behavior
- System information and FylloCode version

When requesting a feature, describe the concrete scenario and problem. You do not need to provide a complete solution up front.

## Code Style

Run at least these commands before submitting:

```bash
pnpm lint
pnpm typecheck
```

Commit message format:

```text
type(scope): summary

- Optional details listed as bullet points
```

Common types:

- `feat`
- `fix`
- `refactor`
- `docs`
- `chore`
- `perf`
- `test`

Use a scope that matches the module or feature area, such as `overview`, `chat`, `proposal`, `specs`, `acp`, or `lineage`.

## License

FylloCode is released under the [MIT](https://github.com/Fioooooooo/FylloCode/blob/main/LICENSE) license.
