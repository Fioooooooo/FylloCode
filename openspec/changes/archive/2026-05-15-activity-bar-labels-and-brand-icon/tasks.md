## 1. OpenSpec Artifacts

- [x] 1.1 Finalize proposal, design, and app-shell-routing spec delta for the Activity Bar label and brand icon change

## 2. Activity Bar Implementation

- [x] 2.1 Update `frontend/src/components/layout/ActivityBar.vue` to render the top brand icon, middle menu section, and bottom settings section with always-visible labels
- [x] 2.2 Remove tooltip-based navigation presentation and load the brand icon from `${import.meta.env.BASE_URL}icon.svg`

## 3. Verification

- [x] 3.1 Update `frontend/src/__tests__/components/activity-bar.spec.ts` to cover the new structure, labels, brand icon path, and active-state behavior
- [x] 3.2 Run targeted tests for the Activity Bar component
