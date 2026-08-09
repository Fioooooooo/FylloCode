import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { resolveFolder } from "../../../shared/workspace-resolver";
import { runTool } from "../utils/state";
import {
  archiveChange,
  changeDir,
  OpenspecArchiveMetadataUpdateError,
  OpenspecArchiveNotConfirmedError,
} from "../runtime-openspec";
import { finalizeArchiveWorkspace, resolveProposalTarget } from "../runtime-workspace";
import { readFileSync } from "fs";
import { join } from "path";
import type {
  ArchiveGitOpResult,
  ArchiveGitStep,
  ArchiveWorkspaceRecovery,
} from "../runtime-workspace";

const commitMessageSchema = /^[a-z]+(?:-[a-z]+)*\([a-z0-9-]+\): .+/;

const archiveChangeInputSchema = z.object({
  changeName: z.string().describe("Name of the change to archive."),
  folderId: z.string().min(1).describe("Owner Folder ID from the proposal's ProposalRef."),
  confirm: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Set to true to perform the actual archive move. Omit (or false) to preview conflicts and completion status first."
    ),
  commitMessage: z
    .string()
    .optional()
    .describe(
      'Required when confirm is true. The commit message first line must match "type(scope): summary". The summary must describe the proposal\'s delivered change, based on the current proposal, the modified files in the worktree, and the completed tasks. Do not use an archive/sync-only subject such as "chore(specs): archive ...".'
    ),
  includeInstruction: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      "Defaults to true; keep true on the first call of a run. The instruction text encodes the archive workflow contract (sync → archive → commit ordering, conflict handling, commit-message format, reporting requirements) that cannot be reconstructed from prior knowledge — omitting it risks reordered or partial archive operations. Only pass false for follow-up state-polling calls within the same run, after the instruction has already been read and acted on."
    ),
});

function emptyWorkspace(projectRoot: string): {
  mode: "main";
  path: string;
  ok: boolean;
  gitOps: [];
  failedStep: null;
  recovery: ArchiveWorkspaceRecovery;
} {
  return {
    mode: "main",
    path: projectRoot,
    ok: true,
    gitOps: [],
    failedStep: null,
    recovery: {
      required: "none",
      kind: "none",
      mainPath: projectRoot,
      workspacePath: projectRoot,
      mainBranch: null,
      proposalBranch: "",
      completedSteps: [],
      remainingSteps: [],
      instructions: [],
    },
  };
}

function publicFinalization(
  workspace: Awaited<ReturnType<typeof finalizeArchiveWorkspace>>
): Omit<Awaited<ReturnType<typeof finalizeArchiveWorkspace>>, "mode" | "path"> {
  return {
    ok: workspace.ok,
    gitOps: workspace.gitOps,
    failedStep: workspace.failedStep,
    ...(workspace.recovery ? { recovery: workspace.recovery } : {}),
    ...(workspace.error ? { error: workspace.error } : {}),
  };
}

function invalidCommitMessageState(input: { changeName: string; projectRoot: string }): {
  changeName: string;
  status: "failed";
  archive: {
    ok: false;
    archiveTarget: null;
    archiveRawOutput: null;
    conflicts: [];
    incompleteTasks: number;
    error: {
      code: string;
      message: string;
      retryHint: string;
    };
  };
  finalization: {
    ok: false;
    gitOps: ArchiveGitOpResult[];
    failedStep: ArchiveGitStep | null;
    recovery: ArchiveWorkspaceRecovery;
  };
} {
  return {
    changeName: input.changeName,
    status: "failed",
    archive: {
      ok: false,
      archiveTarget: null,
      archiveRawOutput: null,
      conflicts: [],
      incompleteTasks: 0,
      error: {
        code: "invalid-commit-message",
        message: 'commitMessage is required and first line must match "type(scope): summary".',
        retryHint:
          'Call archive-change again with confirm: true and commitMessage like "feat(scope): summary".',
      },
    },
    finalization: {
      ok: false,
      gitOps: [],
      failedStep: null,
      recovery: emptyWorkspace(input.projectRoot).recovery,
    },
  };
}

export async function archiveChangeTool(
  input: z.input<typeof archiveChangeInputSchema>
): Promise<string> {
  const confirm = input.confirm ?? false;
  const includeInstruction = input.includeInstruction ?? true;

  return runTool("archive-change", { includeInstruction }, async () => {
    const proposalRef = { folderId: input.folderId, changeId: input.changeName };
    const target = await resolveProposalTarget(proposalRef);
    const owner = resolveFolder(input.folderId);
    const projectRoot = target.worktreePath;
    const commitMessage = input.commitMessage?.split(/\r?\n/)[0] ?? "";
    if (confirm && !commitMessageSchema.test(commitMessage)) {
      return {
        target,
        ...invalidCommitMessageState({ changeName: input.changeName, projectRoot }),
      };
    }

    const changeDirPath = changeDir(projectRoot, input.changeName);
    const tasksText = readFileSync(join(changeDirPath, "tasks.md"), "utf8");
    const incompleteTasks = tasksText
      .split("\n")
      .filter((line) => /^- \[ \]/.test(line.trimEnd())).length;

    let result;
    try {
      result = await archiveChange(projectRoot, input.changeName, {
        confirm,
      });
    } catch (error) {
      if (error instanceof OpenspecArchiveMetadataUpdateError) {
        const archived = error.archiveResult;
        const recovery: ArchiveWorkspaceRecovery = {
          required: "agent",
          kind: "archive-metadata-update",
          mainPath: owner.folderPath,
          workspacePath: projectRoot,
          mainBranch: null,
          proposalBranch: `proposal/${input.changeName}`,
          completedSteps: ["openspec-archive", "spec-sync"],
          remainingSteps: [
            "repair-archive-metadata",
            "commit",
            ...(target.worktreeMode === "linked"
              ? ["merge-to-main", "worktree-remove", "branch-delete"]
              : []),
          ],
          instructions: [
            "OpenSpec archive already succeeded; do not rerun archive-change or move archive files.",
            `Repair ${join(archived.archiveTarget, ".openspec.yaml")} so status is archived while preserving the other metadata fields.`,
            "After repairing metadata, continue with commit and the remaining workspace finalization steps listed here.",
          ],
        };
        const metadataError = {
          code: "archive-metadata-update-failed",
          message: error.message,
          retryHint:
            "Repair the archived .openspec.yaml, then continue commit and workspace finalization without rerunning OpenSpec archive.",
        };
        return {
          target,
          changeName: archived.changeName,
          status: "failed",
          archive: {
            ok: true,
            archiveTarget: archived.archiveTarget,
            archiveRawOutput: archived.archiveRawOutput,
            conflicts: archived.conflicts,
            incompleteTasks,
            error: metadataError,
          },
          finalization: {
            ok: false,
            gitOps: [],
            failedStep: null,
            error: metadataError,
            recovery,
          },
        };
      }
      const message = error instanceof Error ? error.message : String(error);
      const notConfirmed =
        error instanceof OpenspecArchiveNotConfirmedError ||
        (error instanceof Error && error.name === "OpenspecArchiveNotConfirmed");
      const code = notConfirmed ? "openspec-archive-not-confirmed" : "openspec-archive-failed";
      const retryHint = notConfirmed
        ? "OpenSpec exited successfully but did not confirm archival. Inspect the captured stdout signal (e.g. validation-failed, spec-update-aborted, success-marker-missing) and resolve the underlying cause before retrying."
        : "Resolve the OpenSpec archive failure, then call archive-change again.";
      return {
        target,
        changeName: input.changeName,
        status: "failed",
        archive: {
          ok: false,
          archiveTarget: null,
          archiveRawOutput: null,
          conflicts: [],
          incompleteTasks,
          error: {
            code,
            message,
            retryHint,
          },
        },
        finalization: {
          ...publicFinalization(emptyWorkspace(projectRoot)),
          gitOps: [],
        },
      };
    }

    const archiveState = {
      ok: result.conflicts.length === 0,
      archiveTarget: result.archiveTarget,
      archiveRawOutput: result.archiveRawOutput,
      conflicts: result.conflicts,
      incompleteTasks,
      ...(result.conflicts.length > 0
        ? {
            error: {
              code: "archive-target-conflict",
              message: `Archive target exists: ${result.conflicts.join(", ")}`,
              retryHint: "Rename or remove the conflicting archive target before retrying.",
            },
          }
        : {}),
    };

    if (!confirm) {
      return {
        target,
        changeName: result.changeName,
        status: archiveState.ok ? "done" : "failed",
        archive: archiveState,
        finalization: publicFinalization(emptyWorkspace(projectRoot)),
      };
    }

    if (!archiveState.ok) {
      return {
        target,
        changeName: result.changeName,
        status: "failed",
        archive: archiveState,
        finalization: publicFinalization(emptyWorkspace(projectRoot)),
      };
    }

    const workspace = await finalizeArchiveWorkspace({
      mainProjectPath: owner.folderPath,
      workspacePath: projectRoot,
      changeName: input.changeName,
      commitMessage: input.commitMessage ?? "",
    });

    return {
      target,
      changeName: result.changeName,
      status: workspace.ok ? "done" : "failed",
      archive: archiveState,
      finalization: publicFinalization(workspace),
    };
  });
}

export function registerArchiveChangeTool(server: McpServer): void {
  server.registerTool(
    "archive-change",
    {
      description:
        "Archive a completed change in the experimental workflow. Use when the user wants to finalize and archive a change after implementation is complete.",
      inputSchema: archiveChangeInputSchema,
    },
    async (input) => {
      return {
        content: [{ type: "text" as const, text: await archiveChangeTool(input) }],
      };
    }
  );
}
