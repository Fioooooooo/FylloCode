import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { changeDir } from "./paths";
import { parseArchiveOutcome } from "./parse-archive-outcome";
import { resolveOpenspecCli } from "./resolve-cli";
import { spawnOpenspec } from "./spawner";
import { OpenspecArchiveNotConfirmedError } from "./types";
import type { ArchiveResult } from "./types";

function archiveTargetPath(projectRoot: string, name: string): string {
  return join(
    projectRoot,
    "openspec",
    "changes",
    "archive",
    `${new Date().toISOString().slice(0, 10)}-${name}`
  );
}

function deltaSummary(changePath: string): { files: string[] } {
  return {
    files: readdirSync(changePath).sort(),
  };
}

export async function archiveChange(
  projectRoot: string,
  name: string,
  opts: { confirm?: boolean } = {}
): Promise<ArchiveResult> {
  const source = changeDir(projectRoot, name);
  if (!existsSync(source)) {
    throw new Error(`Change not found: ${name}`);
  }

  const target = archiveTargetPath(projectRoot, name);
  const conflicts = existsSync(target) ? [target] : [];

  // Preview mode: only compute info, do not modify anything
  if (!opts.confirm) {
    return {
      changeName: name,
      archiveTarget: target,
      conflicts,
      deltaSpecSummary: existsSync(source) ? deltaSummary(source) : null,
      archiveRawOutput: null,
    };
  }

  // Execution mode: delegate to openspec CLI
  if (conflicts.length > 0) {
    return {
      changeName: name,
      archiveTarget: target,
      conflicts,
      deltaSpecSummary: existsSync(source) ? deltaSummary(source) : null,
      archiveRawOutput: null,
    };
  }

  const cliPath = resolveOpenspecCli();
  const archiveRawOutput = (await spawnOpenspec(
    cliPath,
    ["archive", name, "--yes"],
    projectRoot,
    {},
    false // archive command output is plain text, not JSON
  )) as string;

  const outcome = parseArchiveOutcome(archiveRawOutput, name);
  if (outcome.kind !== "success") {
    const signal = outcome.kind === "known-failure" ? outcome.signal : "success-marker-missing";
    throw new OpenspecArchiveNotConfirmedError(signal, archiveRawOutput.slice(0, 800), name);
  }

  return {
    changeName: name,
    archiveTarget: target,
    conflicts: [],
    deltaSpecSummary: null,
    archiveRawOutput,
  };
}
