## 1. Project Health Spec

- [x] 1.1 Create `openspec/changes/health-check-establish-project-health-spec/specs/project-health/spec.md` with ADDED requirements for static constraints, test constraints, and process constraints; acceptance criteria: `openspec/specs/project-health/spec.md` will exist after archive and contains scenarios for strict type checking, recommended lint rules, formatter configuration, type-aware linting, real test execution, non-zero coverage thresholds, installed hooks, pre-commit checks, and CI blocking behavior.

## 2. Validation

- [x] 2.1 Verify the spec against current repository evidence in `package.json`, `tsconfig.node.json`, `tsconfig.web.json`, `eslint.config.mjs`, `.prettierrc`, `vitest.config.mts`, `.git/hooks/pre-commit`, and `.github/workflows/ci.yml`; acceptance criteria: every SHALL in the project-health delta can be traced to an existing configuration file and no task modifies `meta.json` or `healthScore`.

## 3. Guidelines

- [x] 3.1 Confirm no additional guideline update is needed beyond the health-check session's direct additions to `guidelines/Architecture.md`, `guidelines/QualityGates.md`, and `guidelines/Testing.md`; acceptance criteria: if those files already describe the project-health quality gates, leave them unchanged and note that guideline maintenance was completed before proposal creation.
