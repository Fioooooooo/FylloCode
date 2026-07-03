## Why

The project health check verified that FylloCode already reaches 100/100 on static, test, and process engineering constraints, but there is no `openspec/specs/project-health/` baseline to make those constraints durable. This change establishes the missing project-health capability so future changes can be judged against the same enforceable contract instead of re-deriving it from ad hoc configuration review.

## What Changes

- Add a new `project-health` OpenSpec capability that records the required static constraints: strict TypeScript checking, recommended ESLint coverage, Prettier formatting, and type-aware linting.
- Add required test constraints for Vitest execution, failure propagation, and non-zero coverage thresholds.
- Add required process constraints for installed git hooks, meaningful pre-commit checks, and CI that blocks on lint, test, and typecheck failures.
- No runtime app behavior changes.
- No direct quality-tooling changes are required because the current configuration already satisfies the health check.

## Capabilities

### New Capabilities

- `project-health`: Defines the repository-level engineering constraints that must remain enforceable by configuration, hooks, and CI.

### Modified Capabilities

- None.

## Impact

- Affected documentation/spec artifacts: `openspec/specs/project-health/spec.md` after archive.
- Affected proposal artifacts: `openspec/changes/health-check-establish-project-health-spec/**`.
- No production code, public API, storage format, or user-visible behavior is changed by this proposal.
