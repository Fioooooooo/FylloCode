---
name: Testing
description: Governs Vitest projects, test locations, environments, and coverage thresholds.
keywords: [testing, vitest, coverage, renderer, main]
---

# Testing

## Scope

- Covered: unit and integration-style tests under `test/`, Vitest project configuration, test environments, and coverage gates.
- Not covered: manual Electron QA or release packaging validation.

## Rules

- MUST keep tests outside production source and mirror the relevant `src/` area under `test/`. Evidence: `AGENTS.md`, `test/main/AGENTS.md`, `test/renderer/src/AGENTS.md`, and `vitest.config.mts`.
- MUST name tests with `.spec` or `.test` extensions matching the Vitest include patterns in `vitest.config.mts`.
- MUST run the complete suite with `pnpm test`, which maps to `vitest run`. Evidence: `package.json`.
- MUST keep renderer tests in the `renderer` Vitest project with `happy-dom`, globals enabled, `test/renderer/src/setup.ts`, and includes under `test/renderer/src/**/*.{test,spec}.{ts,vue}`. Evidence: `vitest.config.mts`.
- MUST keep main/preload/shared/MCP tests in the `main` Vitest project with Node environment, 30s test and hook timeouts, `test/main/setup.ts`, and includes under `test/main`, `test/preload`, `test/mcp-servers`, and `test/shared`. Evidence: `vitest.config.mts`.
- MUST mock Electron-dependent main-process capabilities through test setup or focused test helpers instead of launching the real app in unit tests. Evidence: `test/main/AGENTS.md`, `test/main/setup.ts`.
- SHOULD test renderer component state and interaction rather than @nuxt/ui internals. Existing renderer tests use `test/renderer/src/setup.ts` stubs for UI components. Evidence: `test/renderer/src/AGENTS.md`.
- MUST keep coverage enforcement non-zero. `vitest.config.mts` requires statements 50, branches 40, functions 50, and lines 50; `pnpm test:coverage` runs `vitest run --coverage`.

## Verification

```bash
pnpm test
pnpm test:coverage
```

## Staleness Signals

- Re-check this document when `vitest.config.mts`, `package.json` test scripts, `test/main/AGENTS.md`, `test/renderer/src/AGENTS.md`, or the test directory layout changes.
