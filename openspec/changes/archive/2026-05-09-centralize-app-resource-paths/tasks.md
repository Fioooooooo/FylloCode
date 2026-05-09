## 1. Infrastructure

- [x] 1.1 Extend `electron/main/infra/paths/index.ts` with a reusable helper that resolves the root `resources/` directory for development and packaged production.
- [x] 1.2 Cover the helper with main-process unit tests for development and mac packaged `app.asar.unpacked/resources` layouts.

## 2. Workflow Integration

- [x] 2.1 Refactor `electron/main/services/workflow/built-in-loader.ts` to obtain the `resources/` root from `infra/paths` and join `workflows/built-in` locally.
- [x] 2.2 Update built-in workflow loader tests to assert resource-root based behavior and non-overwrite initialization.

## 3. Documentation And Validation

- [x] 3.1 Update `docs/Architecture.md` and `docs/MainProcess.md` with the app-shipped resource path rule.
- [x] 3.2 Validate the OpenSpec change and run targeted main-process tests plus node typecheck.
