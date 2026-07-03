## Context

The health check found the repository currently satisfies every scoring dimension:

- TypeScript strictness is inherited from `@electron-toolkit/tsconfig/tsconfig.json` and reinforced with `noImplicitAny: true` in both project tsconfigs.
- ESLint uses `@electron-toolkit/eslint-config-ts` `recommendedTypeChecked`, `eslint-plugin-vue` `flat/recommended`, Prettier compatibility, and project-specific import boundary rules.
- Vitest is configured with separate renderer and main projects, and coverage thresholds are non-zero.
- `simple-git-hooks`, `lint-staged`, and GitHub Actions CI are configured to run real quality commands.

The missing piece is the OpenSpec baseline. Without a `project-health` spec, future tooling changes can weaken these guarantees without an explicit spec-level review.

## Goals / Non-Goals

**Goals:**

- Establish `project-health` as the durable spec for repository-level engineering constraints.
- Express the verified health-check dimensions as normative SHALL requirements.
- Keep the proposal scoped to specification and verification artifacts because the existing configuration already scores 100/100.

**Non-Goals:**

- Do not change `package.json`, TypeScript, ESLint, Prettier, Vitest, hook, or CI configuration in this proposal.
- Do not add new runtime application behavior.
- Do not add tasks for `meta.json` or `healthScore`; the health-check session already updated that project metadata directly.

## Decisions

- Record the capability as a new `project-health` spec.
  - Rationale: There is no existing `openspec/specs/project-health/` directory, so this is a new capability rather than a modification.
  - Alternative considered: leave the result in chat only. Rejected because future Apply and Archive sessions would not have a durable spec to enforce.

- Use requirements that mirror the health-check scoring dimensions.
  - Rationale: The score is based on static, test, and process constraints; each dimension must be independently auditable from configuration.
  - Alternative considered: use one broad "quality gates" requirement. Rejected because it would hide which guarantee was weakened when a future config changes.

- Keep implementation tasks limited to OpenSpec artifacts and validation.
  - Rationale: Current configuration already satisfies the required constraints, so changing tooling would add churn without improving the score.
  - Alternative considered: reformat or tighten config while creating the spec. Rejected because it is outside the agreed purpose of establishing the missing spec baseline.

## Risks / Trade-offs

- Spec may drift from repository tooling if future changes update quality commands without updating `project-health` -> Mitigation: include verification tasks and keep related guidelines in `guidelines/QualityGates.md` and `guidelines/Testing.md`.
- Requirements may be too tied to current tool names -> Mitigation: phrase requirements in capability terms while citing current accepted implementations in scenarios.
