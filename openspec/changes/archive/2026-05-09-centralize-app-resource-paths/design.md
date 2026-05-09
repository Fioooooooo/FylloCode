## Context

The repository root `resources/` directory contains app-shipped assets such as icons and built-in workflow YAML files. In development these files are read from `<repo>/resources/**`; after `build:mac`, electron-builder places them under the packaged app, with unpacked resources available at `process.resourcesPath/app.asar.unpacked/resources/**`.

`services/workflow/built-in-loader.ts` previously encoded packaging details directly. That creates duplicated infrastructure knowledge in service code and caused production initialization to miss built-in workflows when the packaged layout did not match the service-level assumption.

## Goals / Non-Goals

**Goals:**

- Make `electron/main/infra/paths` the single source for app-shipped `resources/` directory resolution.
- Keep service code responsible only for business-specific subpaths such as `workflows/built-in`.
- Preserve current behavior: built-in workflow files are copied once into `userData/workflows/` and existing user-edited files are not overwritten.
- Document the packaged resource lookup rule for future main-process work.

**Non-Goals:**

- Change electron-builder packaging configuration.
- Change workflow YAML schema, IPC contracts, or renderer behavior.
- Add a generic resource file reader; this change only centralizes directory resolution.

## Decisions

1. Extend `infra/paths/index.ts` instead of creating a new `infra/resources` module.

   Rationale: the project already centralizes environment-dependent path rules in `infra/paths`, including data and logs paths. App-shipped resource directory resolution is the same category of concern.

   Alternative considered: add `electron/main/infra/resources/index.ts`. This would be reasonable if resource loading grew into content parsing or caching, but for directory resolution it adds another infra entry point without enough benefit.

2. Return the repository root `resources/` directory, not a workflow-specific directory.

   Rationale: `infra/paths` should not know workflow business structure. `built-in-loader` can join `workflows/built-in` itself, keeping the helper reusable for other assets.

3. Use ordered candidate directories for production layout.

   Rationale: current mac builds expose unpacked resources at `process.resourcesPath/app.asar.unpacked/resources`. Keeping fallback candidates for `app.getAppPath()/resources` and `process.resourcesPath/resources` makes the helper robust across asar and non-asar layouts without leaking this complexity to services.

## Risks / Trade-offs

- Packaged resources may move if electron-builder configuration changes → Unit tests cover the current mac app layout, and docs/specs describe the expected helper contract.
- Returning only one resolved path requires filesystem probing → The helper should use the first existing candidate and expose candidates only for tests/debugging if needed.
- Service startup remains non-blocking → Workflow initialization keeps warn-and-skip behavior when resources cannot be found, preserving startup resilience.
