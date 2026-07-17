/**
 * Parse OpenSpec `archive` CLI stdout to determine whether the change was
 * actually moved to the archive directory.
 *
 * Reference: @fission-ai/openspec@1.3.1, dist/core/archive.js.
 *   - archive.js:268 prints `Change '<name>' archived as '<YYYY-MM-DD>-<name>'.`
 *     after `moveDirectory`. This is the only success marker in the file.
 *   - Several control-flow paths return early with `console.log` messages and
 *     exit code 0 even though no archive happened (validation failure,
 *     spec-update failure, no change selected, archive cancelled).
 *
 * The CLI does not support a `--json` flag, so we treat its plain-text output
 * as the contract. Bumping the openspec version requires re-checking these
 * literals against the new archive.js.
 */

export type ArchiveFailureSignal =
  "validation-failed" | "spec-update-aborted" | "no-change-selected" | "archive-cancelled";

export type ArchiveOutcome =
  | { kind: "success" }
  | { kind: "known-failure"; signal: ArchiveFailureSignal }
  | { kind: "unknown" };

interface FailureSignalEntry {
  signal: ArchiveFailureSignal;
  pattern: string;
}

// archive.js@1.3.1 line numbers in comments locate the originating console.log.
const FAILURE_SIGNALS: FailureSignalEntry[] = [
  // archive.js:137 — delta spec validation failed
  {
    signal: "validation-failed",
    pattern: "Validation failed. Please fix the errors before archiving.",
  },
  // archive.js:219 (buildUpdatedSpec threw) and :236 (rebuilt spec invalid)
  { signal: "spec-update-aborted", pattern: "Aborted. No files were changed." },
  // archive.js:62 — `--yes` invocation without a selectable change
  { signal: "no-change-selected", pattern: "No change selected. Aborting." },
  // archive.js:152 / :175 — defensive; unreachable under `--yes`
  { signal: "archive-cancelled", pattern: "Archive cancelled." },
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSuccessRegex(changeName: string): RegExp {
  const escaped = escapeRegExp(changeName);
  return new RegExp(`Change '${escaped}' archived as '\\d{4}-\\d{2}-\\d{2}-${escaped}'\\.`);
}

export function parseArchiveOutcome(stdout: string, changeName: string): ArchiveOutcome {
  // Failure signals win over an accidental success-marker substring so that
  // the gray-area exit-0 paths cannot masquerade as success.
  for (const entry of FAILURE_SIGNALS) {
    if (stdout.includes(entry.pattern)) {
      return { kind: "known-failure", signal: entry.signal };
    }
  }

  if (buildSuccessRegex(changeName).test(stdout)) {
    return { kind: "success" };
  }

  return { kind: "unknown" };
}
