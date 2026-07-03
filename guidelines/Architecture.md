---
name: Architecture
description: Governs Electron process boundaries, source layout, and enforced import directions.
keywords: [architecture, electron, boundaries, imports]
---

# Architecture

## Overview

FylloCode is an Electron + Vue 3 + TypeScript desktop app. Runtime code is split by process and ownership:

- `src/main/` owns Electron main-process startup, IPC registration, services, infrastructure, and domain helpers.
- `src/preload/` owns contextBridge-facing APIs and preload type declarations.
- `src/renderer/` owns the Vue 3 renderer app.
- `src/shared/` owns cross-process types, schemas, constants, and error contracts.
- `src/mcp-servers/` owns bundled MCP servers.

Evidence: `AGENTS.md`, `electron.vite.config.ts`, `tsconfig.node.json`, `tsconfig.web.json`.

## Areas & Ownership

| Directory / Module    | Owns                                                         | Key entry points                                              |
| --------------------- | ------------------------------------------------------------ | ------------------------------------------------------------- |
| `src/main/bootstrap/` | Electron app lifecycle and window creation                   | `src/main/bootstrap/index.ts`, `src/main/bootstrap/window.ts` |
| `src/main/ipc/`       | IPC handler registration and IPC response wrapping           | `src/main/ipc/index.ts`, `src/main/ipc/_kit/wrap-handler.ts`  |
| `src/main/services/`  | Main-process use-case orchestration                          | `src/main/services/**`                                        |
| `src/main/infra/`     | Filesystem, process, storage, MCP, path, and OS capabilities | `src/main/infra/**`                                           |
| `src/main/domain/`    | Pure domain knowledge and helpers                            | `src/main/domain/**`                                          |
| `src/preload/`        | Renderer-safe API exposure                                   | `src/preload/index.ts`, `src/preload/api/**`                  |
| `src/renderer/src/`   | Vue UI, stores, pages, components, and renderer API wrappers | `src/renderer/src/**`                                         |
| `src/shared/`         | Cross-process channels, schemas, constants, and contracts    | `src/shared/**`                                               |

## Boundaries

- MUST keep Electron/Vite entry points aligned with `electron.vite.config.ts`: main builds from `src/main/index.ts`, preload from `src/preload/index.ts`, renderer from `src/renderer/index.html`.
- MUST use configured aliases instead of deep relative traversal across major areas: `@main`, `@preload`, `@renderer`, `@shared`, and `@test` are declared in `tsconfig.node.json`, `tsconfig.web.json`, `electron.vite.config.ts`, and `vitest.config.mts`.
- MUST route main-process IPC handlers through `_kit` helpers for validation and response normalization. Existing handlers validate shared schemas and return via `wrapHandler` (evidence: `src/main/ipc/settings.ts`, `src/main/ipc/_kit/wrap-handler.ts`).
- MUST respect ESLint import boundary guards in `eslint.config.mjs`: `src/mcp-servers/**` must not depend on Electron or `@main/*`; `src/main/domain/**` must stay free of Electron, filesystem, path, process spawning, services, infra, IPC, and bootstrap imports; `src/main/infra/**` must not depend on services or IPC.
- MUST use `cross-spawn` for process creation instead of value-importing `spawn` or `spawnSync` from `child_process`; this is enforced in `eslint.config.mjs`.

## Staleness Signals

- Re-check this document when `electron.vite.config.ts`, any `tsconfig*.json`, `eslint.config.mjs`, or top-level `src/` ownership changes.
