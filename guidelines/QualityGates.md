---
name: Quality Gates
description: Governs the project's type checking, linting, formatting, hooks, and CI quality commands.
keywords: [quality, lint, typecheck, format, ci, hooks]
---

# Quality Gates

## Scope

- Covered: root quality scripts, TypeScript strictness, ESLint/Prettier configuration, git hooks, and GitHub Actions CI.
- Not covered: test file placement and Vitest project details; see `guidelines/Testing.md`.

## Rules

- MUST use pnpm 10+ and Node.js 22+ for project commands. Evidence: `package.json` `engines`, `packageManager`, and `CONTRIBUTING.md`.
- MUST run type checking through `pnpm typecheck`, which executes both `typecheck:node` (`tsc --noEmit -p tsconfig.node.json`) and `typecheck:web` (`vue-tsc --noEmit -p tsconfig.web.json`). Evidence: `package.json`.
- MUST preserve strict TypeScript checking. The project inherits `strict: true` from `@electron-toolkit/tsconfig/tsconfig.json`, and both `tsconfig.node.json` and `tsconfig.web.json` override `noImplicitAny: true`; do not disable strict sub-options without a proposal.
- MUST keep linting on the configured ESLint flat config. `pnpm lint` runs `eslint --cache .`, and `eslint.config.mjs` includes `@electron-toolkit/eslint-config-ts` `recommendedTypeChecked`, `eslint-plugin-vue` `flat/recommended`, Prettier compatibility, and local boundary rules.
- MUST keep formatting on Prettier. `pnpm format` runs `prettier --write .`, with formatting options in `.prettierrc` and exclusions in `.prettierignore`.
- MUST keep git hooks installed through `simple-git-hooks`. `package.json` runs `simple-git-hooks` in `postinstall`, and `.git/hooks/pre-commit` invokes `npx lint-staged`.
- MUST keep pre-commit checks meaningful. `lint-staged` runs `eslint --cache --fix` and `prettier --write` for JS/TS/Vue files, and `prettier --write` for JSON/Markdown/HTML/CSS.
- MUST keep CI blocking on quality failures. `.github/workflows/ci.yml` triggers on pushes and pull requests to `main` and runs `pnpm test`, `pnpm lint`, and `pnpm typecheck` without `continue-on-error`.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
```

Use `pnpm format` only when formatting changes are intended.

## Staleness Signals

- Re-check this document when `package.json`, any `tsconfig*.json`, `eslint.config.mjs`, `.prettierrc`, `.prettierignore`, `.github/workflows/*.yml`, or git hook tooling changes.
