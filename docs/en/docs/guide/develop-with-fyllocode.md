---
sidebar:
  group: Contributing
  order: 20
---

# Developing FylloCode with FylloCode

FylloCode is developed with FylloCode itself. For contributors, the recommended setup is to use the packaged app from Releases instead of launching FylloCode in development mode to modify FylloCode.

The reason is that `electron-vite` [hot reload](https://electron-vite.org/guide/hmr-and-hot-reloading) rebuilds and restarts the Electron app. It is not true hot update. Once the execution stage modifies source files, hot reload may interrupt the running workflow. The packaged app is not affected by the current source changes.

## Recommended Flow

1. Download the latest Release.
2. Open the FylloCode repository as a project.
3. Describe the bug or change in a Task.
4. Use Chat to converge on a plan, then run Proposal -> Apply & Archive.
5. Return to the code repository to inspect the diff, test results, and archived content.

## When to Submit a PR Directly

These changes can usually be submitted directly:

- Documentation typos
- Small UI copy fixes
- Clear, low-risk bugs
- Tests that do not change external behavior

These changes should usually start with an Issue:

- New features
- Architecture changes
- IPC, storage format, or shared type changes
- User-visible behavior changes
- Broad refactors

## Local Development Commands

```bash
pnpm install
pnpm dev
```

Run at least these before submitting:

```bash
pnpm lint
pnpm typecheck
```

See the [Contributing Guide](/en/docs/contributing) for more contribution conventions.
