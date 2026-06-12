# Contributing

[中文版](./CONTRIBUTING.md)

Thanks for your interest in FylloCode. This document covers how to set up a local development environment, how to submit code, and a few basic conventions.

---

## Development Setup

**Requirements**

- Node.js 22+
- pnpm 10+

**Local setup**

```bash
git clone https://github.com/Fioooooooo/FylloCode.git
cd FylloCode
pnpm install
pnpm run dev
```

---

## Developing FylloCode with FylloCode

FylloCode is built using FylloCode itself. We recommend using the packaged version from [Releases](https://github.com/Fioooooooo/FylloCode/releases) rather than `pnpm run dev` — the reason is straightforward: dev mode uses hot reload, and when Apply starts modifying source files, hot reload will interrupt the active workflow. The packaged version doesn't have this problem.

The workflow: download the latest release, open the FylloCode repository as a project, describe what you want to do in a Task, and walk through Proposal → Apply → Archive rather than writing code directly.

This isn't required, but it has two benefits: you'll understand the project's design intent much faster, and if anything in the workflow blocks you, that's itself a bug worth fixing.

---

## Submitting Changes

**Small changes** (typos, docs, minor bugs): open a PR directly — no need to discuss first.

**Large changes** (new features, architectural shifts, behavior changes): open an Issue first to describe what you have in mind. Wait for rough consensus before starting. This avoids finishing a large PR only to find it's going in the wrong direction.

**PR expectations:**

- Title should clearly describe what changed — no need for an essay
- If the change affects user-visible behavior, describe the scope of impact in the PR description
- Keep each PR focused on one thing

---

## Issues

**Bug reports**: describe the steps to reproduce, the actual behavior, and the expected behavior. Include system info (OS, version) where possible.

**Feature requests**: describe the problem you're running into in a specific scenario — you don't need to propose a solution.

Search before opening — avoid duplicates.

---

## Code Style

The project uses ESLint + Prettier. Run before committing:

```bash
pnpm run lint
pnpm run typecheck
```

Commit message format:

```
type(scope): summary

- Optional details, using bullets for key changes
```

Common types: `feat` · `fix` · `refactor` · `docs` · `chore` · `perf` · `test`

Scope corresponds to the module or feature area — for example: `proposal`, `specs`, `archive`, `worktree`, `chat`, `acp`. Summary should start with a verb and describe what changed in one sentence.

---

## License

Contributions are licensed under the repository's [AGPL-3.0](LICENSE).
