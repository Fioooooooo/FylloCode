## Why

Packaged application resources currently require Electron/electron-builder specific path handling. A recent built-in workflow initialization bug happened because service code assumed `resources/**` was available directly under `process.resourcesPath`, while the mac packaged app placed it under `app.asar.unpacked/resources/**`.

Centralizing app-shipped resource path resolution in `infra/paths` keeps packaging layout knowledge in one place and prevents services from duplicating fragile path logic.

## What Changes

- Extend `electron/main/infra/paths` with an app resource directory helper for files shipped from the repository root `resources/` directory.
- Keep workflow-specific path composition in `services/workflow/built-in-loader.ts` by joining `workflows/built-in` onto the infra-provided resources directory.
- Document the packaged resource lookup convention in main-process architecture docs.
- Update workflow specs to describe the current `resources/workflows/built-in/` source location instead of the obsolete `electron/main/workflows/built-in/` path.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `main-process-layering`: Add a requirement that app-shipped resource paths are resolved through `infra/paths`.
- `workflow-ipc`: Correct the built-in workflow source requirement to use `resources/workflows/built-in/`.

## Impact

- Affected code: `electron/main/infra/paths/index.ts`, `electron/main/services/workflow/built-in-loader.ts`, related main-process unit tests.
- Affected docs/specs: `docs/Architecture.md`, `docs/MainProcess.md`, `openspec/specs/workflow-ipc/spec.md` via this change.
- No IPC, storage schema, preload API, or renderer behavior changes.
