# project-health Specification

## Purpose

Defines the minimum enforceable project-health baseline for static analysis, tests, and repository process controls so agents can audit whether the codebase has meaningful quality gates before reporting or updating health status.

## Requirements

### Requirement: Static constraints remain enforceable

The project SHALL keep static analysis constraints enforceable through repository configuration.

#### Scenario: Strict TypeScript checking is configured

- **WHEN** an agent audits TypeScript configuration
- **THEN** the effective Node and Web TypeScript projects SHALL use strict type checking without disabling strict null checks or implicit any checks

#### Scenario: Recommended lint rules are configured

- **WHEN** an agent audits lint configuration
- **THEN** ESLint SHALL include recognized recommended rule sets for TypeScript and Vue source files, not only a small hand-written rule list

#### Scenario: Formatting is configured

- **WHEN** an agent audits formatting configuration
- **THEN** Prettier SHALL be configured through a repository format command and a non-empty formatter configuration or mainstream defaults

#### Scenario: Type-aware lint rules are configured

- **WHEN** an agent audits lint configuration for TypeScript and Vue files
- **THEN** ESLint SHALL enable type-aware rule execution using TypeScript project information or an equivalent type-aware analysis mechanism

### Requirement: Test constraints remain enforceable

The project SHALL keep automated test constraints enforceable through repository configuration.

#### Scenario: Mainstream test runner is configured

- **WHEN** an agent audits test configuration
- **THEN** the repository SHALL use Vitest or another mainstream ecosystem test runner with explicit project or environment configuration for the tested source areas

#### Scenario: Test command fails on test failure

- **WHEN** an agent audits the primary test command
- **THEN** the command SHALL invoke the real test runner and SHALL NOT mask assertion failures with stubs, `|| true`, unconditional success exits, or equivalent failure suppression

#### Scenario: Coverage threshold is non-zero

- **WHEN** an agent audits coverage configuration
- **THEN** the repository SHALL define non-zero coverage thresholds that cause coverage runs to fail when the thresholds are not met

### Requirement: Process constraints remain enforceable

The project SHALL keep commit-time and CI process constraints enforceable through repository configuration and installed hooks.

#### Scenario: Git hooks are installed

- **WHEN** an agent audits local git-hook state
- **THEN** the repository SHALL have hook tooling configured and installed in `.git/hooks` or an equivalent active hook path

#### Scenario: Pre-commit runs real checks

- **WHEN** an agent audits the pre-commit hook
- **THEN** the hook SHALL invoke at least one real lint, typecheck, format, or test command without masking command failure

#### Scenario: CI blocks on quality failures

- **WHEN** an agent audits CI configuration
- **THEN** CI SHALL run on main-branch pushes or pull requests and SHALL execute lint and test checks in a way that fails the job when those commands fail
