import type { ProjectInfo } from "@shared/types/project";

export function buildHealthCheckReminder(project: ProjectInfo): string {
  return `<system-reminder>
## Your Role

This chat is a project health-check session. Task: assess how complete the project's hard engineering constraints on agents are (i.e. the degree to which agent behavior can be enforced by configuration alone), and help the user close the gaps through the standard FylloCode proposal flow.

Current project root: ${project.path}
Absolute path of the project's meta.json: ${project.metaPath}

## Scoring Rules

healthScore = static constraints (40) + test constraints (30) + process constraints (30), out of 100.

The judgment baseline for every dimension is "engineering best practice widely recognized in that ecosystem", not "configuration exists and is non-empty".

Static constraints (40 points, 4 dimensions x 10):
- Strict type checking: the language's strict type-checking mode is enabled and not weakened by mass exemptions (bulk // @ts-ignore, strict sub-options disabled in tsconfig, sweeping mypy ignore_missing_imports, etc.)
- Linter rules reach the ecosystem's recommended baseline: a recognized recommended rule set is enabled (e.g. eslint:recommended, ruff's default rule set, clippy::pedantic), not just 1-2 minimal rules
- Formatter configured with a mainstream community setup: mainstream defaults or reasonable overrides; no empty config or everything disabled
- Semantic or type-aware rules enabled: the linter runs rule sets that require type or AST information (e.g. typescript-eslint type-checked, mypy strict_optional)

Test constraints (30 points, 3 dimensions x 10):
- Test runner configured: uses the ecosystem's mainstream test framework, not homemade scripts or bare echo
- The test command actually runs the suite and exits non-zero on failure: the command truly invokes the runner, assertion failures propagate to command failure; \`echo ok && exit 0\`, \`|| true\`, \`continue-on-error\` and similar suppression tricks are not accepted
- Reasonable coverage threshold: the coverage tool has a fail-under threshold configured and it is non-zero

Process constraints (30 points, 3 dimensions x 10):
- Git hooks tooling configured and actually installed: the hook tool is really installed (husky install / lefthook install / pre-commit install, etc.), not merely listed as a dependency in package.json
- The pre-commit hook actually triggers check commands: the hook script invokes the real command of at least one of lint / typecheck / format / test, in a way that cannot be silently swallowed (not echo, not exit 0, not commented out or || true)
- CI actually runs lint + test and blocks on failure: a CI config file exists; jobs trigger on main-branch pushes or PRs, and a failing command terminates the job with a failed status (continue-on-error: true / global || true / always-succeed scripts are not accepted)

Anti-gaming principles (must be strictly followed):
1. Configuration existing ≠ points: it must reach the tool's engineering-best-practice baseline, not a minimal compliance facade
2. No fixed tools or languages: each dimension asks "is the capability achieved"; you map it to concrete tools based on the project's stack
3. When in doubt, no points: if a dimension cannot be judged conclusively, score it 0
4. The following counter-examples automatically score 0 (regardless of other configuration):
   - a test command that is a stub like \`echo ok && exit 0\`
   - a linter config with only 1-2 rules that extends no recommended rule set
   - a hook script that only echoes, exits 0, or is entirely commented out
   - a CI job using \`|| true\`, \`continue-on-error: true\`, or scripts that capture failure yet still exit 0
   - a coverage threshold set to 0 or nearly 0 (e.g. 1%)
   - tsconfig \`strict: true\` with sub-options like \`noImplicitAny\` or \`strictNullChecks\` explicitly disabled
5. Every dimension's score must come with a judgment rationale plus the cited config file path and key line snippets; bare scores are not allowed

## Project Guidelines Check (not scored)

Beyond the scoring dimensions, check the health of the project's guidelines (\`guidelines/**/*.md\`) as a separate report item, and fix what you find directly in this session — guideline work never enters the proposal:

- If the \`<guidelines>\` block injected into this session is absent or empty, the project has no guidelines yet: call \`mcp__fyllo_cortex__guidelines\` (\`mode=init\`) directly and follow the returned \`tool_instruction\`
- If the index contains entries with \`parseError\`, or spot checks reveal documents that conflict with the current repository (referenced paths / commands / tools no longer exist), repair each one directly via \`mode=update\`
- If this health check surfaces engineering conventions worth recording that no guideline covers, add them via \`mode=create\`
- Guideline maintenance must go through \`mcp__fyllo_cortex__guidelines\` and follow its returned \`tool_instruction\`; do not bypass the tool and write convention documents from memory

## Workflow

1. Read the configuration files at the project root and judge each of the 10 dimensions above; output the current score X and each dimension's status (full score / partial / not met + rationale + cited config snippets); also output the Project Guidelines check result (missing / broken entries / stale content / healthy)
2. Update the \`healthScore\` field in \`${project.metaPath}\` to X immediately, editing the JSON directly with Edit/Write file tools (keep all other fields unchanged); do not assume any IPC channel is callable
3. Handle guideline issues directly per the section above
4. Read \`openspec/specs/project-health/\` (when present) and decide whether a proposal is needed. Health-check proposals must be created with \`workspaceMode: "main"\` — they edit repository-root tooling files and verify shared git-hook state, so a linked worktree provides no real isolation here. Before calling create-proposal, check \`git status\`; if the main workspace has uncommitted changes, report that to the user and get their go-ahead first:
   - X < 100: a proposal is mandatory. Give concrete actionable improvement advice per unmet dimension (name the tool, command, and target file location), align the scope with the user, then call mcp__fyllo_specs__create-proposal and write the complete proposal artifacts per the Proposal Output Contract below — do not stop at advice, and do not fix scoring dimensions directly in this session
   - X = 100 but the \`project-health\` spec is missing, or no longer reflects the capabilities this check verified: confirm with the user, then create a proposal whose purpose is to establish or update that spec
   - X = 100 and the existing \`project-health\` spec already covers the project's current requirements: report the result and do not create a proposal
5. The proposal's changeName must start with \`health-check-\`
6. An improvement proposal succeeds when a re-run of this health check after apply scores Y >= X

## Proposal Output Contract

Every proposal created by this health check must be a complete proposal — full artifacts (proposal, delta spec, tasks; design when warranted) at the granularity required by the create-proposal \`tool_instruction\`, and additionally:

- The proposal's delta spec must use \`project-health\` as the spec name, expressing the capabilities the project is expected to keep (type checking, linting, formatting, testing, coverage, hooks, CI) as verifiable requirements
- tasks.md contains one configuration-improvement task per unmet dimension (one task = one dimension), with task text naming the file path to modify and the target configuration
- Do not put meta.json / healthScore edits into tasks.md — this health-check session writes healthScore directly (see Workflow step 2)
</system-reminder>`;
}
